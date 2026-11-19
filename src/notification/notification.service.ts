import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationConfig } from './entities/notification-config.entity';
import { MacroService, METRIC_META, MetricLatest } from '../macro/macro.service';

/** 日报分组（指标标签/单位/小数位取自 METRIC_META，与看板一致） */
const NOTIFY_GROUPS: { title: string; metrics: string[] }[] = [
  { title: '汇率', metrics: ['usdcnh', 'usd_jpy', 'eurusd', 'dxy'] },
  { title: '国债收益率', metrics: ['cn_30y_yield', 'us_10y_yield'] },
  { title: '黄金/股市', metrics: ['gold_usd', 'nikkei225', 'sensex'] },
  { title: '可转债ETF', metrics: ['etf_511380'] },
];

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationConfig)
    private readonly configRepo: Repository<NotificationConfig>,
    private readonly macroService: MacroService,
  ) {}

  async getConfig(): Promise<NotificationConfig | null> {
    return this.configRepo.find({ order: { createdAt: 'ASC' } }).then((rows) => rows[0] ?? null);
  }

  /** 单行配置 upsert：已有则覆盖，没有则创建 */
  async saveConfig(dto: { webhookUrl: string; signSecret?: string | null; enabled?: boolean }): Promise<NotificationConfig> {
    if (!/^https?:\/\//.test(dto.webhookUrl)) {
      throw new Error('webhookUrl 必须是 http(s) 地址');
    }
    const existing = await this.getConfig();
    if (existing) {
      await this.configRepo.update(existing.id, {
        webhookUrl: dto.webhookUrl.trim(),
        signSecret: dto.signSecret?.trim() || null,
        enabled: dto.enabled ?? existing.enabled,
      });
      return (await this.getConfig())!;
    }
    return this.configRepo.save(
      this.configRepo.create({
        channel: 'feishu_bot',
        webhookUrl: dto.webhookUrl.trim(),
        signSecret: dto.signSecret?.trim() || null,
        enabled: dto.enabled ?? true,
      }),
    );
  }

  /**
   * 飞书群自定义机器人：interactive 卡片 + lark_md（支持 markdown）。
   * 带签名密钥时按官方算法签名：sign = base64(HMAC-SHA256(key = `${ts}\n${secret}`))。
   */
  async sendMarkdown(title: string, markdown: string): Promise<{ code: number }> {
    const cfg = await this.getConfig();
    if (!cfg) throw new Error('未配置通知渠道（请到 通知配置 页填写飞书 webhook）');
    if (!cfg.enabled) throw new Error('通知渠道已禁用（通知配置 页可启用）');
    if (cfg.channel !== 'feishu_bot') throw new Error(`暂不支持的渠道: ${cfg.channel}`);

    const payload: Record<string, unknown> = {
      msg_type: 'interactive',
      card: {
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**${title}**\n\n${markdown}` } },
        ],
      },
    };
    if (cfg.signSecret) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = createHmac('sha256', `${ts}\n${cfg.signSecret}`).update('').digest('base64');
      payload.timestamp = String(ts);
      payload.sign = sign;
    }

    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, any>;
    const code = typeof body.code === 'number' ? body.code : typeof body.StatusCode === 'number' ? body.StatusCode : -1;
    if (!res.ok || code !== 0) {
      const msg = body.msg || body.StatusMessage || `HTTP ${res.status}`;
      throw new Error(`飞书机器人返回错误 code=${code} ${msg}`);
    }
    return { code };
  }

  /** 发送测试消息（配置页按钮，验证全链路） */
  async sendTest(): Promise<string> {
    await this.sendMarkdown(
      '通知渠道测试',
      '如果你在飞书群里看到这条消息，说明 webhook 配置成功。\n后续「宏观数据日报推送」每天 9:00 会推送到本群。',
    );
    return '测试消息已发送，请到飞书群确认';
  }

  /** 格式化单个指标行：值 + 日变化（收益率用 bp，其余用 %） */
  private formatMetricLine(meta: (typeof METRIC_META)[number], m: MetricLatest): string {
    if (!m.hasData) return `- ${meta.label}：⏳ 暂无数据`;
    const val = m.value.toFixed(meta.decimals);
    let change = '';
    if (m.prevValue !== null && m.prevValue !== 0) {
      if (meta.metric.endsWith('_yield')) {
        const bp = (m.value - m.prevValue) * 100;
        change = `（${bp >= 0 ? '+' : ''}${bp.toFixed(1)}bp）`;
      } else {
        const pct = (m.value / m.prevValue - 1) * 100;
        change = `（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%）`;
      }
    }
    return `- ${meta.label}：${val}${meta.unit ?? ''}${change}`;
  }

  /**
   * 宏观数据日报（cron 任务 macroDailyNotify，每天 9:00 / 面板手动触发）。
   * 只读 macro_series，不拉网：数据由前一晚 22:10 采集任务负责。
   */
  async notifyMacroDaily(): Promise<string> {
    const { metrics } = await this.macroService.getOverview();
    const metaMap = new Map(METRIC_META.map((m) => [m.metric, m]));

    const sections: string[] = [];
    for (const g of NOTIFY_GROUPS) {
      const lines = g.metrics
        .map((metric) => metaMap.get(metric))
        .filter((meta): meta is (typeof METRIC_META)[number] => !!meta)
        .map((meta) => {
          const m = metrics.find((x) => x.metric === meta.metric);
          if (!m) return `- ${meta.label}：⏳ 暂无数据`;
          return this.formatMetricLine(meta, m);
        });
      sections.push(`**【${g.title}】**\n${lines.join('\n')}`);
    }

    const withData = metrics.filter((m) => m.hasData);
    const dataDate = withData.length
      ? withData.map((m) => m.date).sort().slice(-1)[0]
      : '无';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

    const markdown = [
      ...sections,
      `数据截至 ${dataDate} · 每日 22:10 采集 · 9:00 推送`,
    ].join('\n\n');
    const title = `📊 宏观看板日报｜${today}`;

    await this.sendMarkdown(title, markdown);
    const ok = withData.length;
    this.logger.log(`宏观数据日报已推送（${ok}/${metrics.length} 指标有数据）`);
    return `日报已推送到飞书（${ok}/${metrics.length} 指标有数据）`;
  }
}
