import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TrendAnalysis } from './entities/trend-analysis.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';

export interface TrendAnalysisResult {
  indexId: string;
  tradeDate: Date;
  closePrice: number;
  ma20: number;
  changePercent: number;
  deviationRate: number | null;
  volumeRatio: number | null;
  trendStatus: 'above' | 'below';
  statusChangeDate: Date | null;
  intervalChangePercent: number | null;
  rank: number;
  rankChange: number;
  totalRankCount: number;
}

@Injectable()
export class TrendAnalysisService {
  private readonly logger = new Logger(TrendAnalysisService.name);

  constructor(
    @InjectRepository(TrendAnalysis)
    private trendRepository: Repository<TrendAnalysis>,
    @InjectRepository(MovingAverage)
    private maRepository: Repository<MovingAverage>,
    @InjectRepository(IndexHistory)
    private historyRepository: Repository<IndexHistory>,
  ) {}

  /**
   * 计算单个指数的趋势分析数据
   * @param index 指数信息
   * @param maData 该指数的MA数据（按日期升序）
   * @param allIndicesMAData 所有指数的最新MA数据（用于排名）
   */
  async calculateTrendForIndex(
    index: Index,
    maData: MovingAverage[],
    allIndicesMAData: Map<string, MovingAverage>,
  ): Promise<TrendAnalysisResult[]> {
    if (maData.length === 0) {
      return [];
    }

    // 按日期升序排列
    const sortedMAData = [...maData].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    const results: TrendAnalysisResult[] = [];
    let previousStatus: 'above' | 'below' | null = null;
    let statusChangeDate: Date | null = null;
    let statusChangePrice: number | null = null;

    for (let i = 0; i < sortedMAData.length; i++) {
      const current = sortedMAData[i];
      const closePrice = Number(current.closePrice);
      const ma20 = Number(current.ma20);
      const tradeDate = current.tradeDate;

      // 判断趋势状态：现价高于MA20为above，低于为below
      const trendStatus: 'above' | 'below' = closePrice >= ma20 ? 'above' : 'below';

      // 检测状态转变
      if (previousStatus !== null && previousStatus !== trendStatus) {
        // 状态发生转变，记录转变日期和价格
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
      }

      // 计算涨幅（相对上一交易日）
      let changePercent = 0;
      if (i > 0) {
        const prevClose = Number(sortedMAData[i - 1].closePrice);
        changePercent = ((closePrice - prevClose) / prevClose) * 100;
      }

      // 计算偏离率
      const deviationRate = ((closePrice - ma20) / ma20) * 100;

      // 计算区间涨幅（从状态转变日到当前）
      let intervalChangePercent: number | null = null;
      if (statusChangeDate !== null && statusChangePrice !== null) {
        intervalChangePercent = ((closePrice - statusChangePrice) / statusChangePrice) * 100;
      }

      // 获取量比（如果有历史数据）
      const volumeRatio = await this.calculateVolumeRatio(index.id, tradeDate);

      results.push({
        indexId: index.id,
        tradeDate,
        closePrice,
        ma20,
        changePercent: Number(changePercent.toFixed(4)),
        deviationRate: Number(deviationRate.toFixed(4)),
        volumeRatio,
        trendStatus,
        statusChangeDate: statusChangeDate ? new Date(statusChangeDate) : null,
        intervalChangePercent: intervalChangePercent !== null 
          ? Number(intervalChangePercent.toFixed(4)) 
          : null,
        rank: 0, // 稍后统一计算排名
        rankChange: 0, // 稍后计算
        totalRankCount: allIndicesMAData.size,
      });

      previousStatus = trendStatus;
    }

    return results;
  }

  /**
   * 计算量比（当日成交量 / 前5日平均成交量）
   */
  private async calculateVolumeRatio(
    indexId: string,
    tradeDate: Date,
  ): Promise<number | null> {
    try {
      // 获取当日成交量
      const currentDay = await this.historyRepository.findOne({
        where: { indexId, tradeDate },
      });

      if (!currentDay || !currentDay.volume) {
        return null;
      }

      // 获取前5个交易日的成交量
      const prev5Days = await this.historyRepository.find({
        where: {
          indexId,
          tradeDate: LessThan(tradeDate),
        },
        order: { tradeDate: 'DESC' },
        take: 5,
      });

      if (prev5Days.length === 0) {
        return null;
      }

      const avgVolume = prev5Days.reduce((sum, h) => sum + (Number(h.volume) || 0), 0) / prev5Days.length;
      
      if (avgVolume === 0) return null;

      const volumeRatio = Number(currentDay.volume) / avgVolume;
      return Number(volumeRatio.toFixed(2));
    } catch (error) {
      return null;
    }
  }

  /**
   * 计算所有指数在某一日期的排名
   */
  calculateRankings(
    allResults: Map<string, TrendAnalysisResult[]>,
    tradeDate: Date,
  ): Map<string, number> {
    const dateStr = this.formatDate(tradeDate);
    
    // 收集该日期所有指数的偏离率
    const deviations: { indexId: string; deviationRate: number }[] = [];
    
    for (const [indexId, results] of allResults.entries()) {
      const result = results.find(
        (r) => this.formatDate(r.tradeDate) === dateStr,
      );
      if (result && result.deviationRate !== null) {
        deviations.push({ indexId, deviationRate: result.deviationRate });
      }
    }

    // 按偏离率降序排序（高的排前面）
    deviations.sort((a, b) => b.deviationRate - a.deviationRate);

    // 生成排名映射
    const rankings = new Map<string, number>();
    deviations.forEach((item, index) => {
      rankings.set(item.indexId, index + 1);
    });

    return rankings;
  }

  /**
   * 计算排序变化（相对上一交易日）
   */
  async calculateRankChange(
    indexId: string,
    currentRank: number,
    tradeDate: Date,
  ): Promise<number> {
    // 获取上一交易日的排名
    const prevAnalysis = await this.trendRepository.findOne({
      where: {
        indexId,
        tradeDate: LessThan(tradeDate),
      },
      order: { tradeDate: 'DESC' },
    });

    if (!prevAnalysis) {
      return 0; // 没有历史数据，变化为0
    }

    return prevAnalysis.rank - currentRank; // 正数表示排名上升，负数表示下降
  }

  /**
   * 保存趋势分析结果
   */
  async saveTrendAnalysis(results: TrendAnalysisResult[]): Promise<number> {
    if (results.length === 0) return 0;

    const entities = results.map((result) =>
      this.trendRepository.create({
        ...result,
      }),
    );

    // 使用 upsert 避免重复数据
    const result = await this.trendRepository.upsert(entities, ['indexId', 'tradeDate']);
    return result.identifiers?.length || results.length;
  }

  /**
   * 执行完整的趋势分析计算（所有指数）
   */
  async performFullAnalysis(indices: Index[]): Promise<{
    total: number;
    dateRange: { from: string; to: string } | null;
    results: { indexName: string; count: number }[];
  }> {
    this.logger.log(`开始执行趋势分析，共 ${indices.length} 个指数...`);

    // 1. 收集所有指数的MA数据
    const allMADatas = new Map<string, MovingAverage[]>();
    const latestMAs = new Map<string, MovingAverage>();

    for (const index of indices) {
      const maData = await this.maRepository.find({
        where: { indexId: index.id },
        order: { tradeDate: 'ASC' },
      });
      
      if (maData.length > 0) {
        allMADatas.set(index.id, maData);
        latestMAs.set(index.id, maData[maData.length - 1]);
      }
    }

    if (allMADatas.size === 0) {
      this.logger.warn('没有可用的MA数据');
      return { total: 0, dateRange: null, results: [] };
    }

    // 2. 计算每个指数的趋势数据
    const allTrendResults = new Map<string, TrendAnalysisResult[]>();
    
    for (const index of indices) {
      const maData = allMADatas.get(index.id);
      if (maData) {
        const results = await this.calculateTrendForIndex(index, maData, latestMAs);
        allTrendResults.set(index.id, results);
      }
    }

    // 3. 获取所有日期，按日期计算排名
    const allDates = new Set<string>();
    for (const results of allTrendResults.values()) {
      results.forEach((r) => allDates.add(this.formatDate(r.tradeDate)));
    }

    // 4. 对每个日期计算排名和排序变化
    const finalResults: TrendAnalysisResult[] = [];
    
    for (const dateStr of Array.from(allDates).sort()) {
      const date = new Date(dateStr);
      
      // 计算该日期的排名
      const rankings = this.calculateRankings(allTrendResults, date);

      // 更新每个指数在该日期的排名和排序变化
      for (const [indexId, results] of allTrendResults.entries()) {
        const result = results.find((r) => this.formatDate(r.tradeDate) === dateStr);
        if (result) {
          const rank = rankings.get(indexId) || 0;
          const rankChange = await this.calculateRankChange(indexId, rank, date);
          
          finalResults.push({
            ...result,
            rank,
            rankChange,
          });
        }
      }
    }

    // 5. 保存结果
    const savedCount = await this.saveTrendAnalysis(finalResults);

    // 6. 统计结果
    const indexResults: { indexName: string; count: number }[] = [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const result of finalResults) {
      const index = indices.find((i) => i.id === result.indexId);
      if (index) {
        const existing = indexResults.find((r) => r.indexName === index.name);
        if (existing) {
          existing.count++;
        } else {
          indexResults.push({ indexName: index.name, count: 1 });
        }
      }

      if (!minDate || result.tradeDate < minDate) minDate = result.tradeDate;
      if (!maxDate || result.tradeDate > maxDate) maxDate = result.tradeDate;
    }

    this.logger.log(`趋势分析完成，共 ${savedCount} 条数据`);

    return {
      total: savedCount,
      dateRange: minDate && maxDate ? {
        from: this.formatDate(minDate),
        to: this.formatDate(maxDate),
      } : null,
      results: indexResults,
    };
  }

  /**
   * 获取指定指数的趋势分析数据
   */
  async getTrendAnalysisByIndexId(
    indexId: string,
    limit: number = 100,
  ): Promise<TrendAnalysis[]> {
    return this.trendRepository.find({
      where: { indexId },
      order: { tradeDate: 'DESC' },
      take: limit,
    });
  }

  /**
   * 获取最新日期的所有指数趋势分析（用于排名展示）
   */
  async getLatestTrendRanking(): Promise<TrendAnalysis[]> {
    // 获取最新日期
    const latestRecord = await this.trendRepository.findOne({
      order: { tradeDate: 'DESC' },
    });

    if (!latestRecord) {
      return [];
    }

    // 获取该日期的所有数据
    const data = await this.trendRepository.find({
      where: { tradeDate: latestRecord.tradeDate },
      relations: { index: true },
      order: { rank: 'ASC' },
    });

    return data;
  }

  private formatDate(date: Date | string): string {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    const dateStr = String(date);
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    return dateStr;
  }
}
