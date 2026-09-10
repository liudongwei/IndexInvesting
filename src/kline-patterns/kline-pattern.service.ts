import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KLinePattern, TrendState, PatternSignal } from './entities/kline-pattern.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';
import { Candle, PatternResult, KLineAnalysisResult } from './dto/kline-pattern.dto';
import { TrendDetectorService } from './patterns/trend-detector.service';
import { SingleCandlePatterns } from './patterns/single-candle.pattern';
import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { ThreeCandlePatterns } from './patterns/three-candle.pattern';

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
      // 获取历史K线数据（至少需要30根用于趋势判断）
      const candles = await this.getHistoricalCandles(indexId, tradeDate, 30);
      
      if (!candles || candles.length < 3) {
        this.logger.warn(`指数 ${indexId} 在 ${tradeDate} 的数据不足`);
        return null;
      }

      // 1. 趋势分析
      const trendAnalysis = this.trendDetector.analyzeTrend(candles);

      // 2. 形态识别
      const patterns: PatternResult[] = [];

      // 单根K线形态
      const singlePatterns = this.singleCandlePatterns.detect(candles);
      patterns.push(...singlePatterns);

      // 双根K线形态
      const doublePatterns = this.twoCandlePatterns.detect(candles);
      patterns.push(...doublePatterns);

      // 三根K线形态
      const triplePatterns = this.threeCandlePatterns.detect(candles);
      patterns.push(...triplePatterns);

      // 按置信度排序，取最高置信度的形态作为主要形态
      patterns.sort((a, b) => b.confidence - a.confidence);
      const primaryPattern = patterns.length > 0 ? patterns[0] : undefined;

      const result: KLineAnalysisResult = {
        tradeDate,
        trendState: trendAnalysis.trendState as any,
        patterns,
        primaryPattern
      };

      // 如果是静态计算，保存到数据库
      if (!isRealtime && primaryPattern) {
        await this.savePatternResult(indexId, tradeDate, result);
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
            this.logger.warn(`发现重要信号: 指数 ${index.id}, 形态: ${pattern.patternName}, 信号: ${pattern.signal}, 置信度: ${pattern.confidence}`);
            // TODO: 发送邮件/短信通知
          }
        }
      } catch (error) {
        this.logger.error(`实时分析指数 ${index.id} 失败: ${error.message}`);
      }
    }

    this.logger.log('实时分析完成');
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
   * 保存形态分析结果到数据库
   */
  private async savePatternResult(
    indexId: string,
    tradeDate: Date,
    result: KLineAnalysisResult
  ): Promise<void> {
    if (!result.primaryPattern) {
      return;
    }

    const existing = await this.getPatternByDate(indexId, tradeDate, false);

    const patternData: Partial<KLinePattern> = {
      indexId,
      tradeDate,
      trendState: result.trendState as TrendState,
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
        trendDescription: result.trendState
      },
      isRealtime: false
    };

    if (existing) {
      await this.klinePatternRepo.update(existing.id, patternData);
    } else {
      await this.klinePatternRepo.insert(patternData);
    }
  }

  /**
   * 获取历史K线数据
   * @param indexId 指数ID
   * @param endDate 结束日期
   * @param count 需要的K线数量
   * @returns K线数据数组（按时间倒序）
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

    // 转换为Candle格式（按时间倒序）
    return histories.map(h => ({
      date: h.tradeDate,
      open: Number(h.openPrice),
      high: Number(h.highPrice),
      low: Number(h.lowPrice),
      close: Number(h.closePrice),
      volume: h.volume ? Number(h.volume) : null
    }));
  }
}
