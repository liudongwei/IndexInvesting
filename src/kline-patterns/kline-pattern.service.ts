import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { KLinePattern, TrendState, PatternSignal } from './entities/kline-pattern.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';
import { Candle, PatternResult, KLineAnalysisResult } from './dto/kline-pattern.dto';
import { TrendDetectorService } from './patterns/trend-detector.service';
import { SingleCandlePatterns } from './patterns/single-candle.pattern';
import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { ThreeCandlePatterns } from './patterns/three-candle.pattern';
import { HaramiPatterns } from './patterns/harami.pattern';
import { MarketPositionClassifier, PositionAnalysis } from './patterns/market-position.classifier';

/**
 * K线形态分析主服务
 * 整合趋势判断和各类形态识别器，提供完整的K线形态分析功能
 */
@Injectable()
export class KLinePatternService {
  private readonly logger = new Logger(KLinePatternService.name);

  constructor(
    @InjectRepository(KLinePattern)
    private klinePatternRepo: Repository<KLinePattern>,
    @InjectRepository(IndexHistory)
    private indexHistoryRepo: Repository<IndexHistory>,
    @InjectRepository(Index)
    private indexRepo: Repository<Index>,
    
    private trendDetector: TrendDetectorService,
    private singleCandlePatterns: SingleCandlePatterns,
    private twoCandlePatterns: TwoCandlePatterns,
    private threeCandlePatterns: ThreeCandlePatterns,
    private haramiPatterns: HaramiPatterns,
    private marketPositionClassifier: MarketPositionClassifier,
    private httpService: HttpService,
  ) {}

  /**
   * 分析指定指数的K线形态
   * @param indexId 指数ID
   * @param tradeDate 交易日期
   * @param isRealtime 是否实时计算
   * @returns 分析结果
   */
  async analyzeKLinePattern(
    indexId: string,
    tradeDate: Date,
    isRealtime: boolean = false
  ): Promise<KLineAnalysisResult | null> {
    try {
      // 获取历史K线数据：400根用于阶段位置（regime 最长 MA200 + 120根通道），
      // 最近100根用于趋势判断与形态识别（保持原有行为不变）
      let candles = await this.getHistoricalCandles(indexId, tradeDate, 400);

      if (!candles || candles.length < 3) {
        this.logger.warn(`指数 ${indexId} 在 ${tradeDate} 的数据不足`);
        return null;
      }

      // ===== 日期语义（2026-11-16）：结果与落库一律使用“实际用于计算的K线交易日” =====
      const requestedDate = new Date(tradeDate);
      requestedDate.setHours(0, 0, 0, 0);
      const now = new Date();
      const latestBarDate = new Date(candles[0].date);
      latestBarDate.setHours(0, 0, 0, 0);
      let isIntraday = false;

      // 库里还没有“请求日”的K线、且请求日就是今天 → 拉腾讯实时报价构造今日盘中K线前插。
      // 报价时间戳≠今天（周末/盘前无成交）或取数失败 → 取不到，自动回退最后交易日。
      if (latestBarDate.getTime() < requestedDate.getTime() && this.isSameDay(requestedDate, now)) {
        const idx = await this.indexRepo.findOne({ where: { id: indexId } });
        const liveBar = idx ? await this.fetchIntradayBar(idx.code) : null;
        if (liveBar) {
          candles = [liveBar, ...candles];
          isIntraday = true;
        }
      }

      // pg/TypeORM 的 date 列读出可能是 Date 也可能是 'YYYY-MM-DD' 字符串，统一归一为本地零点 Date
      const actualTradeDate: Date = this.toLocalDate(candles[0].date);

      const trendCandles = candles.slice(0, 100);

      // 1. 趋势分析（基于最近100根，行为与旧版一致）
      const trendAnalysis = this.trendDetector.analyzeTrend(trendCandles);

      // 1.5 市场阶段位置分析（基于最近400根，识别顶部/底部/上涨/下跌/横盘）
      const position = this.marketPositionClassifier.classify(candles);

      // 2. 形态识别
      const patterns: PatternResult[] = [];

      // 单根 K 线形态
      let singlePatterns = this.singleCandlePatterns.detect(trendCandles);
      // 根据趋势状态解析形态名称
      singlePatterns = singlePatterns.map(pattern => 
        this.resolvePatternByTrend(pattern, trendAnalysis.trendState)
      ).filter(p => p !== null) as PatternResult[];
      patterns.push(...singlePatterns);
      
      // 双根 K 线形态
      const doublePatterns = this.twoCandlePatterns.detect(trendCandles);
      patterns.push(...doublePatterns);
      
      // 三根 K 线形态
      const triplePatterns = this.threeCandlePatterns.detect(trendCandles);
      patterns.push(...triplePatterns);
      
      // 孕线形态
      const haramiPatterns = this.haramiPatterns.detect(trendCandles);
      patterns.push(...haramiPatterns);

      // 2.5 按所处市场阶段位置对形态置信度做降权/保留（不删除、不翻转信号）
      const reweighted = patterns.map(p => this.applyPositionWeighting(p, position));

      // 按置信度排序，取最高置信度的形态作为主要形态
      reweighted.sort((a, b) => b.confidence - a.confidence);
      const primaryPattern = reweighted.length > 0 ? reweighted[0] : undefined;

      const actualStr = this.fmtDate(actualTradeDate);
      const requestedStr = this.fmtDate(requestedDate);
      let infoMessage: string;
      if (isIntraday) {
        infoMessage = `计算成功，交易日${actualStr}（盘中实时数据，未收盘，形态可能变化）`;
      } else if (actualStr === requestedStr) {
        infoMessage = `计算成功，交易日${actualStr}`;
      } else if (requestedDate.getTime() > now.getTime()) {
        infoMessage = `所选日期${requestedStr}尚未到来，已按最后交易日${actualStr}计算`;
      } else if (this.isSameDay(requestedDate, now)) {
        infoMessage = `今日尚未产生交易数据，已按最后交易日${actualStr}计算`;
      } else {
        infoMessage = `所选日期${requestedStr}非交易日，已按最后交易日${actualStr}计算`;
      }

      const result: KLineAnalysisResult = {
        tradeDate: actualTradeDate,
        isIntraday,
        infoMessage,
        trendState: trendAnalysis.trendState, // 保持原始趋势状态，可能在savePatternResult中被转换
        trendScore: trendAnalysis.score,
        trendConfidence: trendAnalysis.confidence,
        marketPosition: position.position,
        positionDescription: position.description,
        channelPosition: position.channelPosition,
        patterns: reweighted,
        primaryPattern
      };

      // 如果是静态计算，保存到数据库（tradeDate=实际K线交易日）
      if (!isRealtime && primaryPattern) {
        await this.savePatternResult(indexId, result.tradeDate, result, false);
      }
      
      // 如果是实时计算，也保存到数据库（标记为实时）
      if (isRealtime && primaryPattern) {
        await this.savePatternResult(indexId, result.tradeDate, result, true);
      }

      return result;
    } catch (error) {
      this.logger.error(`分析K线形态失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 批量分析多个指数的K线形态（收盘后使用）
   * @param indexIds 指数ID列表
   * @param tradeDate 交易日期
   */
  async batchAnalyzePatterns(indexIds: string[], tradeDate: Date): Promise<void> {
    this.logger.log(`开始批量分析 ${indexIds.length} 个指数的K线形态，日期: ${tradeDate}`);

    for (const indexId of indexIds) {
      try {
        await this.analyzeKLinePattern(indexId, tradeDate, false);
      } catch (error) {
        this.logger.error(`分析指数 ${indexId} 失败: ${error.message}`);
      }
    }

    this.logger.log('批量分析完成');
  }

  /**
   * 实时分析所有活跃指数的K线形态（盘中使用）
   */
  async realtimeAnalyzeAll(): Promise<void> {
    this.logger.log('开始实时分析所有活跃指数的K线形态');

    // 获取所有启用自动同步且标记了参与K线形态计算的指数
    const indices = await this.indexRepo.find({
      where: { 
        isActive: true
      }
    });

    // 过滤出 metadata.participateInKlinePattern 为 true 的指数
    const participatingIndices = indices.filter(index => 
      index.metadata?.participateInKlinePattern === true
    );

    const today = new Date();
    // 设置为当天0点
    today.setHours(0, 0, 0, 0);

    for (const index of participatingIndices) {
      try {
        const result = await this.analyzeKLinePattern(index.id, today, true);
        
        // TODO: 检测买卖信号并触发通知
        if (result?.primaryPattern) {
          const pattern = result.primaryPattern;
          if ((pattern.signal === 'buy' || pattern.signal === 'sell') && pattern.confidence > 0.8) {
            this.logger.warn(`发现重要信号: 指数 ${index.name}-${index.officialCode}, 形态: ${pattern.patternName}, 信号: ${pattern.signal}, 置信度: ${pattern.confidence}`);
            // TODO: 发送邮件/短信通知
          }
        }
      } catch (error) {
        this.logger.error(
          `实时分析指数 ${index.name}-${index.officialCode} 失败: ${error.message}`,
        );
      }
    }

    this.logger.log('实时分析完成');
  }

  /**
   * 获取参与K线形态计算的指数列表
   */
  async getParticipatingIndices(): Promise<Index[]> {
    const indices = await this.indexRepo.find({
      where: { 
        isActive: true
      }
    });

    // 过滤出 metadata.participateInKlinePattern 为 true 的指数
    return indices.filter(index => 
      index.metadata?.participateInKlinePattern === true
    );
  }

  /**
   * 批量计算K线形态（用于验证）
   * @param indexIds 指数ID列表
   * @param tradeDate 交易日期
   * @returns 计算结果数组
   */
  async batchCalculateForVerification(
    indexIds: string[],
    tradeDate: Date
  ): Promise<any[]> {
    this.logger.log(`开始批量计算 ${indexIds.length} 个指数的K线形态，日期: ${tradeDate}`);

    const results: any[] = [];

    for (const indexId of indexIds) {
      try {
        // 获取指数信息
        const index = await this.indexRepo.findOne({ where: { id: indexId } });
        if (!index) {
          results.push({
            indexId,
            indexName: '未知',
            success: false,
            error: '指数不存在'
          });
          continue;
        }

        // 分析K线形态
        const analysisResult = await this.analyzeKLinePattern(indexId, tradeDate, false);

        if (analysisResult) {
          results.push({
            indexId,
            indexName: index.name,
            indexCode: index.code,
            officialCode: index.officialCode,
            tradeDate: analysisResult.tradeDate,
            success: true,
            trendState: analysisResult.trendState,
            marketPosition: analysisResult.marketPosition,
            positionDescription: analysisResult.positionDescription,
            primaryPattern: analysisResult.primaryPattern ? {
              patternType: analysisResult.primaryPattern.patternType,
              patternName: analysisResult.primaryPattern.patternName,
              confidence: analysisResult.primaryPattern.confidence,
              signal: analysisResult.primaryPattern.signal
            } : null,
            allPatterns: analysisResult.patterns.map(p => ({
              patternType: p.patternType,
              patternName: p.patternName,
              confidence: p.confidence,
              signal: p.signal,
              description: p.description,
              metadata: p.metadata
            })),
            message: analysisResult.infoMessage || '计算成功'
          });
        } else {
          results.push({
            indexId,
            indexName: index.name,
            success: false,
            error: '数据不足或计算失败'
          });
        }
      } catch (error) {
        this.logger.error(`计算指数 ${indexId} 失败: ${error.message}`);
        results.push({
          indexId,
          success: false,
          error: error.message
        });
      }
    }

    this.logger.log('批量计算完成');
    return results;
  }

  /**
   * 获取指定日期的K线形态分析结果
   */
  async getPatternByDate(indexId: string, tradeDate: Date, isRealtime: boolean = false): Promise<KLinePattern | null> {
    return this.klinePatternRepo.findOne({
      where: {
        indexId,
        tradeDate,
        isRealtime
      }
    });
  }

  /**
   * 获取指数最近的K线形态分析结果
   */
  async getRecentPatterns(indexId: string, limit: number = 10, isRealtime: boolean = false): Promise<KLinePattern[]> {
    return this.klinePatternRepo.find({
      where: {
        indexId,
        isRealtime
      },
      order: {
        tradeDate: 'DESC'
      },
      take: limit
    });
  }

  /**
   * 按条件查询K线形态数据（支持分页）
   * @param indexId 可选，指数ID
   * @param startDate 可选，开始日期
   * @param endDate 可选，结束日期
   * @param isRealtime 可选，是否实时数据
   * @param trendState 可选，趋势状态
   * @param patternName 可选，形态名称（模糊匹配）
   * @param signal 可选，信号类型
   * @param page 页码（从1开始）
   * @param pageSize 每页条数
   */
  async queryPatterns(
    indexId?: string,
    startDate?: string,
    endDate?: string,
    isRealtime?: boolean,
    trendState?: string,
    patternName?: string,
    signal?: string,
    marketPosition?: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ data: KLinePattern[]; total: number; count: number }> {
    const queryBuilder = this.klinePatternRepo.createQueryBuilder('pattern');

    // 添加筛选条件
    if (indexId) {
      queryBuilder.andWhere('pattern.indexId = :indexId', { indexId });
    }

    if (startDate) {
      queryBuilder.andWhere('pattern.tradeDate >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('pattern.tradeDate <= :endDate', { endDate });
    }

    if (isRealtime !== undefined) {
      queryBuilder.andWhere('pattern.isRealtime = :isRealtime', { isRealtime });
    }

    if (trendState) {
      queryBuilder.andWhere('pattern.trendState = :trendState', { trendState });
    }

    if (patternName) {
      queryBuilder.andWhere('pattern.patternName ILIKE :patternName', { patternName: `%${patternName}%` });
    }

    if (signal) {
      queryBuilder.andWhere('pattern.signal = :signal', { signal });
    }

    if (marketPosition) {
      queryBuilder.andWhere('pattern.marketPosition = :marketPosition', { marketPosition });
    }

    // 获取总数
    const total = await queryBuilder.getCount();

    // 添加排序和分页
    queryBuilder
      .orderBy('pattern.tradeDate', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      count: data.length
    };
  }

  /**
   * 清理指定日期之前的实时K线形态数据
   * @param beforeDate 清理此日期之前的实时数据
   * @returns 删除的记录数
   */
  async cleanRealtimeDataBefore(beforeDate: Date): Promise<number> {
    this.logger.log(`开始清理 ${beforeDate} 之前的实时K线形态数据...`);
    
    try {
      const result = await this.klinePatternRepo
        .createQueryBuilder()
        .delete()
        .from(KLinePattern)
        .where('isRealtime = :isRealtime', { isRealtime: true })
        .andWhere('tradeDate < :beforeDate', { beforeDate })
        .execute();

      const deletedCount = result.affected || 0;
      this.logger.log(`清理完成，删除了 ${deletedCount} 条实时K线形态数据`);
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`清理实时K线形态数据失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理当天的所有实时K线形态数据（用于交易日结束后清理）
   * @returns 删除的记录数
   */
  async cleanTodayRealtimeData(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.logger.log(`开始清理当天(${today})的实时K线形态数据...`);
    
    try {
      const result = await this.klinePatternRepo
        .createQueryBuilder()
        .delete()
        .from(KLinePattern)
        .where('isRealtime = :isRealtime', { isRealtime: true })
        .andWhere('tradeDate = :today', { today })
        .execute();

      const deletedCount = result.affected || 0;
      this.logger.log(`清理完成，删除了 ${deletedCount} 条当天实时K线形态数据`);
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`清理当天实时K线形态数据失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 保存形态分析结果到数据库
   * @param indexId 指数ID
   * @param tradeDate 交易日期
   * @param result 分析结果
   * @param isRealtime 是否实时计算
   */
  private async savePatternResult(
    indexId: string,
    tradeDate: Date,
    result: KLineAnalysisResult,
    isRealtime: boolean = false
  ): Promise<void> {
    if (!result.primaryPattern) {
      return;
    }

    const existing = await this.getPatternByDate(indexId, tradeDate, isRealtime);

    // 确保trendState是有效的枚举值，将'unknown'转换为'sideways'
    let validTrendState: TrendState;
    if (result.trendState === 'uptrend') {
      validTrendState = TrendState.UPTREND;
    } else if (result.trendState === 'downtrend') {
      validTrendState = TrendState.DOWNTREND;
    } else if (result.trendState === 'sideways') {
      validTrendState = TrendState.SIDEWAYS;
    } else {
      // 对于'unknown'或其他无效值，默认使用'sideways'
      validTrendState = TrendState.SIDEWAYS;
    }

    const patternData: Partial<KLinePattern> = {
      indexId,
      tradeDate,
      trendState: validTrendState,
      marketPosition: result.marketPosition ?? 'unknown',
      patternType: result.primaryPattern.patternType,
      patternName: result.primaryPattern.patternName,
      confidence: result.primaryPattern.confidence,
      signal: result.primaryPattern.signal as PatternSignal,
      candleData: result.patterns.map(p => ({
        type: p.patternType,
        name: p.patternName,
        confidence: p.confidence,
        signal: p.signal
      })),
      metadata: {
        allPatterns: result.patterns,
        trendDescription: result.trendState,
        marketPosition: result.marketPosition ?? 'unknown',
        positionDescription: result.positionDescription,
        channelPosition: result.channelPosition ?? null
      },
      isRealtime
    };

    if (existing) {
      await this.klinePatternRepo.update(existing.id, patternData);
      this.logger.debug(`更新${isRealtime ? '实时' : '静态'}K线形态: 指数${indexId}, 日期${tradeDate}`);
    } else {
      await this.klinePatternRepo.insert(patternData);
      this.logger.debug(`插入${isRealtime ? '实时' : '静态'}K线形态: 指数${indexId}, 日期${tradeDate}`);
    }
  }

  /**
   * 获取历史 K 线数据
   * @param indexId 指数 ID
   * @param endDate 结束日期
   * @param count 需要的 K 线数量
   * @returns K 线数据数组（按时间倒序）
   */
  private async getHistoricalCandles(
    indexId: string,
    endDate: Date,
    count: number
  ): Promise<Candle[]> {
    const histories = await this.indexHistoryRepo
      .createQueryBuilder('history')
      .where('history.indexId = :indexId', { indexId })
      .andWhere('history.tradeDate <= :endDate', { endDate })
      .orderBy('history.tradeDate', 'DESC')
      .take(count)
      .getMany();

    // 转换为 Candle 格式（按时间倒序）
    return histories.map(h => ({
      date: h.tradeDate,
      open: Number(h.openPrice),
      high: Number(h.highPrice),
      low: Number(h.lowPrice),
      close: Number(h.closePrice),
      volume: h.volume ? Number(h.volume) : null
    }));
  }

  /**
   * 拉取今日盘中实时K线（腾讯行情，两个数据源）。
   * 主源 qt.gtimg.cn 字段下标经 2026-11-16 实测：3现价/5今开/6成交量/30时间戳/33最高/34最低
   * （注意：index-data.service 里 getTencentRealTimeQuote 注释的30/31为最高/最低是错的）。
   * 校验：报价时间戳必须=今天 且 今开>0（排除周末沿用旧报价、盘前无成交）。
   * @returns 今日K线；取不到返回 null（调用方回退最后交易日）
   */
  private async fetchIntradayBar(symbol: string): Promise<Candle | null> {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ymdCompact = ymd.replace(/-/g, '');
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const valid = (o: number, h: number, l: number, c: number) =>
      o > 0 && h > 0 && l > 0 && c > 0 &&
      h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9;

    // 主源：实时报价
    try {
      const res: any = await firstValueFrom(
        this.httpService.get(`https://qt.gtimg.cn/q=${symbol}`, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Referer: 'https://gu.qq.com/',
          },
        }),
      );
      const m = String(res.data).match(/="([^"]+)"/);
      if (m) {
        const f = m[1].split('~');
        const ts = f[30] || '';
        const close = parseFloat(f[3]);
        const open = parseFloat(f[5]);
        const volume = parseFloat(f[6]);
        const high = parseFloat(f[33]);
        const low = parseFloat(f[34]);
        if (ts.startsWith(ymdCompact) && valid(open, high, low, close)) {
          return { date: startOfToday, open, high, low, close, volume: volume > 0 ? volume : null };
        }
      }
    } catch (error) {
      this.logger.warn(`实时报价获取失败(${symbol}): ${error.message}`);
    }

    // 备源：腾讯日K的“今日行” [date, open, close, high, low, volume]
    try {
      const res: any = await firstValueFrom(
        this.httpService.get(
          `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,1,qfq`,
          { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } },
        ),
      );
      const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const node = body?.data?.[symbol];
      const bars = node?.qfqday || node?.day;
      const last = Array.isArray(bars) ? bars[bars.length - 1] : null;
      if (last && last[0] === ymd) {
        const open = Number(last[1]);
        const close = Number(last[2]);
        const high = Number(last[3]);
        const low = Number(last[4]);
        const volume = last[5] !== undefined && last[5] !== '' ? Number(last[5]) : null;
        if (valid(open, high, low, close)) {
          return { date: startOfToday, open, high, low, close, volume };
        }
      }
    } catch (error) {
      this.logger.warn(`日K今日行获取失败(${symbol}): ${error.message}`);
    }

    return null;
  }

  /** 是否同一天（本地时区） */
  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** 格式化为 YYYY-MM-DD（本地时区） */
  private fmtDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** pg/TypeORM 的 date 列读出可能是 Date 或 'YYYY-MM-DD' 字符串 → 统一为本地零点 Date */
  private toLocalDate(v: Date | string): Date {
    if (v instanceof Date) {
      const d = new Date(v);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const [y, m, d] = String(v).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  /**
   * 按市场阶段位置对形态置信度做降权/保留（不删除、不翻转信号）
   * @param pattern 形态结果
   * @param position 阶段位置分析结果
   * @returns 降权后的形态结果（位置因子为1时原样返回）
   */
  private applyPositionWeighting(
    pattern: PatternResult,
    position: PositionAnalysis
  ): PatternResult {
    const factor = this.marketPositionClassifier.confidenceFactor(pattern.signal, position.position);
    if (factor >= 1 || pattern.signal === 'neutral') {
      // 保留原置信度，但在 metadata 中记录所处位置
      return {
        ...pattern,
        metadata: {
          ...pattern.metadata,
          marketPosition: position.position,
          positionDescription: position.description,
        },
      };
    }

    const newConfidence = Math.round(pattern.confidence * factor * 10000) / 10000;
    return {
      ...pattern,
      confidence: newConfidence,
      description: pattern.description
        ? `${pattern.description}；所处${position.description}`
        : `所处${position.description}`,
      metadata: {
        ...pattern.metadata,
        marketPosition: position.position,
        positionDescription: position.description,
        positionFactor: factor,
      },
    };
  }

  /**
   * 根据趋势状态解析形态的最终名称和信号
   * @param pattern 原始形态结果
   * @param trendState 趋势状态
   * @returns 解析后的形态结果，如果横盘趋势则返回 null
   */
  private resolvePatternByTrend(pattern: PatternResult, trendState: string): PatternResult | null {
    // 只有需要趋势上下文的形态才处理
    if (!pattern.metadata?.needsTrendContext) {
      return pattern;
    }

    // 横盘趋势不显示锤子线/上吊线等形态
    if (trendState === 'sideways') {
      return null;
    }

    const isUptrend = trendState === 'uptrend';
    
    // 根据趋势状态选择对应的名称和描述
    const finalName = isUptrend ? pattern.metadata.bearishName : pattern.metadata.bullishName;
    const finalDescription = isUptrend ? pattern.metadata.bearishDescription : pattern.metadata.bullishDescription;
    const finalSignal = isUptrend ? 'sell' : 'buy';

    return {
      ...pattern,
      patternName: finalName,
      description: finalDescription,
      signal: finalSignal
    };
  }
}
