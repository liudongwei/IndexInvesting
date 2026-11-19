import { useEffect, useState } from 'react';
import { getNotificationConfig, saveNotificationConfig, sendNotificationTest } from '../services/api';

/** 通知配置页（/admin/notification-config）：飞书群机器人 webhook + 发送测试 */
export function NotificationConfig() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [signSecret, setSignSecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { config } = await getNotificationConfig();
        if (config) {
          setWebhookUrl(config.webhookUrl);
          setSignSecret(config.signSecret || '');
          setEnabled(config.enabled);
          setHasConfig(true);
        }
      } catch {
        /* 未配置时静默 */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setMsg(null);
    if (!/^https?:\/\//.test(webhookUrl.trim())) {
      setMsg({ type: 'err', text: 'webhook URL 必须是 http(s) 地址' });
      return;
    }
    setBusy('save');
    try {
      await saveNotificationConfig(webhookUrl.trim(), signSecret.trim() || null, enabled);
      setHasConfig(true);
      setMsg({ type: 'ok', text: '配置已保存' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || '保存失败' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setMsg(null);
    setBusy('test');
    try {
      // 先保存再测试，确保测试用的是表单里的最新值
      await saveNotificationConfig(webhookUrl.trim(), signSecret.trim() || null, enabled);
      setHasConfig(true);
      const res = await sendNotificationTest();
      setMsg({ type: 'ok', text: res.message });
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || '测试失败' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">通知配置</h1>
        <p className="text-sm text-gray-500 mt-1">
          飞书群自定义机器人：飞书建群 → 群设置 → 群机器人 → 添加「自定义机器人」→ 复制 webhook 地址填到下面
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-sm text-gray-500">加载中…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          {msg && (
            <div
              className={`px-3 py-2 text-sm rounded-lg border ${
                msg.type === 'ok'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-600'
              }`}
            >
              {msg.text}
            </div>
          )}

          <label className="block">
            <div className="text-xs text-gray-500 mb-1">飞书群机器人 Webhook URL *</div>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"
            />
          </label>

          <label className="block">
            <div className="text-xs text-gray-500 mb-1">签名校验密钥（可选，添加机器人时若开启了签名校验才填）</div>
            <input
              value={signSecret}
              onChange={(e) => setSignSecret(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="留空表示未开启签名校验"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-gray-700">启用通知（禁用后定时推送跳过，配置保留）</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              onClick={save}
              disabled={busy !== null}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {busy === 'save' ? '保存中…' : '保存配置'}
            </button>
            <button
              onClick={test}
              disabled={busy !== null || !webhookUrl.trim()}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {busy === 'test' ? '发送中…' : '发送测试消息'}
            </button>
          </div>

          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            当前状态：{hasConfig ? '已配置' : '未配置'} · 定时任务「宏观数据日报推送」每天 9:00 推送（可在
            定时任务页启停/改时间/手动执行）
          </div>
        </div>
      )}
    </div>
  );
}
