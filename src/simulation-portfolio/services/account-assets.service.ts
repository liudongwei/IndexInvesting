import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { EntityManager, MoreThan } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { SimulationAccount } from '../entities/simulation-account.entity';
import { SimulationPosition } from '../entities/simulation-position.entity';
import { SimulationTrade, TradeType } from '../entities/simulation-trade.entity';

/**
 * 腾讯行情（qt.gtimg.cn）解析后的行情结构
 * 字段映射（实测 v_sh510330 返回 88 段，以 ~ 分隔）：
 *   3=现价  4=昨收  5=今开  30=行情时间  31=涨跌额  32=涨跌幅%  33=最高  34=最低
 */
export interface Quote {
  tencentCode: string;
  name: string;
  /** 现价 */
  price: number;
  /** 昨收（今日盈亏的基准价） */
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changeAmount: number;
  changePercent: number;
  quoteTime: string;
}

/** 账户资产核算结果 */
export interface AccountAssetStats {
  positionValue: number;
  totalAssets: number;
  totalProfit: number;
  totalProfitRate: number;
  /** 今日盈亏（含当日交易费用） */
  todayProfit: number;
  todayProfitRate: number;
  /** 今日开盘前总资产（今日盈亏率分母） */
  startAssets: number;
  quotes: Map<string, Quote>;
}

/** 单个标的的今日资金流水汇总 */
interface CodeFlows {
  /** 当前持仓数量 */
  qtyHeld: number;
  boughtQty: number;
  boughtAmount: number;
  soldQty: number;
  soldAmount: number;
}

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const round4 = (v: number): number => Math.round((v + Number.EPSILON) * 10000) / 10000;

/**
 * 账户资产核算服务
 *
 * 统一「账户资产 / 今日盈亏」的唯一计算口径，供买入、卖出、5分钟更新、日终结算复用。
 *
 * 今日盈亏 = Σ 各标的今日盈亏 − 当日交易费用
 * 单标的今日盈亏 = (现价 − 昨收) × 昨仓剩余
 *                + (现价 − 今日买入均价) × 今日买入数量
 *                + (今日卖出均价 − 昨收) × 今日卖出数量
 *
 * 这与「当前总资产 − 今日开盘前总资产」在数学上完全等价（无出入金的前提下），
 * 因此不再依赖 simulation_daily_snapshots 是否存在，也不会把持仓市值误当成盈亏。
 */
@Injectable()
export class AccountAssetsService {
  private readonly logger = new Logger(AccountAssetsService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * 批量获取腾讯实时行情（含昨收）
   * @param tencentCodes 例如 sh510330、sz159915
   */
  async fetchQuotes(tencentCodes: string[]): Promise<Map<string, Quote>> {
    const result = new Map<string, Quote>();
    const codes = [...new Set(tencentCodes.filter((c) => !!c))];
    if (codes.length === 0) {
      return result;
    }

    // 腾讯接口单次请求代码数量有限，分批拉取
    const BATCH_SIZE = 50;
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      const batch = codes.slice(i, i + BATCH_SIZE);
      try {
        const url = `https://qt.gtimg.cn/q=${batch.join(',')}`;
        const response = await firstValueFrom(
          this.httpService.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              Referer: 'https://gu.qq.com/',
            },
          }),
        );

        // 腾讯返回 GBK，这里按 latin1 解码只为安全切分字段，数值字段均为 ASCII
        const text = Buffer.from(response.data as ArrayBuffer).toString('latin1');
        const re = /v_([A-Za-z0-9]+)="([^"]*)"/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
          const tencentCode = match[1];
          const fields = match[2].split('~');
          const price = parseFloat(fields[3]);
          const prevClose = parseFloat(fields[4]);

          // 停牌/无报价时跳过，交由调用方回退到持仓现存价格
          if (!Number.isFinite(price) || price <= 0) {
            this.logger.warn(`行情无有效现价，已跳过: ${tencentCode}`);
            continue;
          }

          result.set(tencentCode, {
            tencentCode,
            name: fields[1] || '',
            price,
            prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price,
            open: parseFloat(fields[5]) || 0,
            high: parseFloat(fields[33]) || 0,
            low: parseFloat(fields[34]) || 0,
            changeAmount: parseFloat(fields[31]) || 0,
            changePercent: parseFloat(fields[32]) || 0,
            quoteTime: fields[30] || '',
          });
        }
      } catch (error) {
        this.logger.error(
          `获取腾讯行情失败 [${batch.join(',')}]: ${(error as Error).message}`,
        );
      }
    }

    return result;
  }

  /**
   * 重算账户资产统计并落库（持仓 + 账户）
   *
   * @param manager    EntityManager（事务内请传 queryRunner.manager，保证一致性）
   * @param account    账户实体（currentBalance 需为最新值）
   * @param quotes     可选：已获取的行情，避免重复请求
   */
  async recalcAccount(
    manager: EntityManager,
    account: SimulationAccount,
    quotes?: Map<string, Quote>,
  ): Promise<AccountAssetStats> {
    const accountId = account.id;

    // 1. 当前持仓
    const positions = await manager.find(SimulationPosition, {
      where: { accountId, quantity: MoreThan(0) },
      relations: { instrument: true },
    });

    // 2. 今日成交（用于区分「昨仓」与「今日买入」，并统计当日费用）
    const todayTrades = await manager
      .createQueryBuilder(SimulationTrade, 't')
      .leftJoinAndSelect('t.instrument', 'i')
      .where('t.accountId = :accountId', { accountId })
      .andWhere('t.tradeDate = CURRENT_DATE')
      .getMany();

    // 3. 按标的汇总今日流水
    const flows = new Map<string, CodeFlows>();
    const ensureFlows = (code: string): CodeFlows => {
      let f = flows.get(code);
      if (!f) {
        f = { qtyHeld: 0, boughtQty: 0, boughtAmount: 0, soldQty: 0, soldAmount: 0 };
        flows.set(code, f);
      }
      return f;
    };

    for (const pos of positions) {
      const code = pos.instrument?.tencentCode;
      if (code) {
        ensureFlows(code).qtyHeld += Number(pos.quantity);
      }
    }

    let todayCommission = 0;
    for (const trade of todayTrades) {
      const code = trade.instrument?.tencentCode;
      if (!code) continue;
      const f = ensureFlows(code);
      const qty = Number(trade.quantity);
      const amount = Number(trade.amount);
      todayCommission += Number(trade.commission) || 0;

      if (trade.tradeType === TradeType.BUY) {
        f.boughtQty += qty;
        f.boughtAmount += amount;
      } else {
        f.soldQty += qty;
        f.soldAmount += amount;
      }
    }

    // 4. 补齐缺失行情（今日已清仓的标的也需要昨收）
    const quoteMap = new Map<string, Quote>(quotes ?? []);
    const missing = [...flows.keys()].filter((code) => !quoteMap.has(code));
    if (missing.length > 0) {
      const fetched = await this.fetchQuotes(missing);
      for (const [code, quote] of fetched) {
        quoteMap.set(code, quote);
      }
    }

    // 5. 更新持仓快照字段 + 汇总持仓市值
    let positionValue = 0;
    for (const pos of positions) {
      const qty = Number(pos.quantity);
      const avgCost = Number(pos.avgCost);
      const quote = pos.instrument?.tencentCode
        ? quoteMap.get(pos.instrument.tencentCode)
        : undefined;
      const price = quote?.price ?? Number(pos.currentPrice);
      const marketValue = round2(price * qty);

      positionValue += marketValue;
      pos.currentPrice = price;
      pos.marketValue = marketValue;
      pos.floatProfit = round2((price - avgCost) * qty);
      pos.floatProfitRate = avgCost > 0 ? round4(((price - avgCost) / avgCost) * 100) : 0;
      pos.lastUpdateTime = new Date();

      // T+1 可用数量：总持仓 − 今日买入（T+0 全部可用），保持库存值随口径正确
      const isT1 = pos.instrument?.tradingRule === 'T+1';
      const boughtTodayQty = isT1 && pos.instrument?.tencentCode
        ? (flows.get(pos.instrument.tencentCode)?.boughtQty ?? 0)
        : 0;
      pos.availableQuantity = Math.max(0, qty - boughtTodayQty);
      pos.frozenQuantity = isT1 ? boughtTodayQty : 0;

      // 持仓维度今日盈亏（不含费用）
      const prevClose = quote?.prevClose ?? price;
      const f = pos.instrument?.tencentCode
        ? flows.get(pos.instrument.tencentCode)
        : undefined;
      let posToday = (price - prevClose) * (qty - (f?.boughtQty ?? 0));
      if (f && f.boughtQty > 0) {
        const avgBuyPrice = f.boughtAmount / f.boughtQty;
        posToday += (price - avgBuyPrice) * f.boughtQty;
      }
      if (f && f.soldQty > 0) {
        const avgSellPrice = f.soldAmount / f.soldQty;
        posToday += (avgSellPrice - prevClose) * f.soldQty;
      }
      pos.todayProfit = round2(posToday);
    }
    positionValue = round2(positionValue);

    // 6. 逐标的统计今日盈亏（含今日已清仓的标的）
    let todayProfit = 0;
    for (const [code, f] of flows) {
      const quote = quoteMap.get(code);
      const avgSellPrice = f.soldQty > 0 ? f.soldAmount / f.soldQty : 0;
      // 无行情时降级：卖出成交价即现价；持仓部分按昨收=现价处理（不虚增盈亏）
      const price = quote?.price ?? avgSellPrice;
      const prevClose = quote?.prevClose ?? price;

      let codeProfit = (price - prevClose) * (f.qtyHeld - f.boughtQty);
      if (f.boughtQty > 0) {
        const avgBuyPrice = f.boughtAmount / f.boughtQty;
        codeProfit += (price - avgBuyPrice) * f.boughtQty;
      }
      if (f.soldQty > 0) {
        codeProfit += (avgSellPrice - prevClose) * f.soldQty;
      }
      todayProfit += codeProfit;
    }
    todayProfit = round2(todayProfit - todayCommission);

    // 7. 账户汇总
    const currentBalance = Number(account.currentBalance);
    const initialCapital = Number(account.initialCapital);
    const totalAssets = round2(currentBalance + positionValue);
    const startAssets = round2(totalAssets - todayProfit);

    account.positionValue = positionValue;
    account.totalAssets = totalAssets;
    account.totalProfit = round2(totalAssets - initialCapital);
    account.totalProfitRate = initialCapital > 0 ? round4((account.totalProfit / initialCapital) * 100) : 0;
    account.todayProfit = todayProfit;
    account.todayProfitRate = startAssets > 0 ? round4((todayProfit / startAssets) * 100) : 0;

    if (positions.length > 0) {
      await manager.save(SimulationPosition, positions);
    }
    await manager.save(SimulationAccount, account);

    return {
      positionValue,
      totalAssets,
      totalProfit: account.totalProfit,
      totalProfitRate: account.totalProfitRate,
      todayProfit,
      todayProfitRate: account.todayProfitRate,
      startAssets,
      quotes: quoteMap,
    };
  }
}
