import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MovingAverage } from './entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';

export interface MACalculationResult {
  tradeDate: Date;
  closePrice: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  deviationRate: number | null;
  ma5SampleCount: number;
  ma10SampleCount: number;
  ma20SampleCount: number;
  ma60SampleCount: number;
}

@Injectable()
export class MovingAveragesService {
  private readonly logger = new Logger(MovingAveragesService.name);

  constructor(
    @InjectRepository(MovingAverage)
    private maRepository: Repository<MovingAverage>,
    @InjectRepository(IndexHistory)
    private historyRepository: Repository<IndexHistory>,
  ) {}

  /**
   * 计算单个指数的移动平均线
   * @param indexId 指数ID
   * @param histories 历史数据（按日期升序排列）
   */
  calculateMAForIndex(
    indexId: string,
    histories: IndexHistory[],
  ): MACalculationResult[] {
    if (histories.length === 0) {
      return [];
    }

    // 按日期升序排列
    const sortedHistories = [...histories].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    const results: MACalculationResult[] = [];

    for (let i = 0; i < sortedHistories.length; i++) {
      const current = sortedHistories[i];
      const closePrice = Number(current.closePrice);

      // 计算MA5（需要当前及前4天，共5天数据）
      const ma5Data = sortedHistories.slice(Math.max(0, i - 4), i + 1);
      const ma5 = this.calculateAverage(ma5Data.map((h) => Number(h.closePrice)));

      // 计算MA10
      const ma10Data = sortedHistories.slice(Math.max(0, i - 9), i + 1);
      const ma10 = this.calculateAverage(ma10Data.map((h) => Number(h.closePrice)));

      // 计算MA20
      const ma20Data = sortedHistories.slice(Math.max(0, i - 19), i + 1);
      const ma20 = this.calculateAverage(ma20Data.map((h) => Number(h.closePrice)));

      // 计算MA60
      const ma60Data = sortedHistories.slice(Math.max(0, i - 59), i + 1);
      const ma60 = this.calculateAverage(ma60Data.map((h) => Number(h.closePrice)));

      // 计算偏离率（相对MA20）
      let deviationRate: number | null = null;
      if (ma20 !== null) {
        deviationRate = ((closePrice - ma20) / ma20) * 100;
      }

      results.push({
        tradeDate: current.tradeDate,
        closePrice,
        ma5,
        ma10,
        ma20,
        ma60,
        deviationRate,
        ma5SampleCount: ma5Data.length,
        ma10SampleCount: ma10Data.length,
        ma20SampleCount: ma20Data.length,
        ma60SampleCount: ma60Data.length,
      });
    }

    return results;
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number | null {
    if (values.length === 0) return null;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Number((sum / values.length).toFixed(2));
  }

  /**
   * 保存MA计算结果
   */
  async saveMACalculations(
    indexId: string,
    results: MACalculationResult[],
  ): Promise<number> {
    if (results.length === 0) return 0;

    const entities = results.map((result) =>
      this.maRepository.create({
        indexId,
        ...result,
      }),
    );

    // 使用 upsert 避免重复数据
    const result = await this.maRepository.upsert(entities, ['indexId', 'tradeDate']);
    return result.identifiers?.length || results.length;
  }

  /**
   * 为单个指数计算并保存MA数据
   */
  async calculateAndSaveMAForIndex(index: Index): Promise<{
    indexName: string;
    calculatedCount: number;
    dateRange: { from: string; to: string } | null;
  }> {
    this.logger.log(`开始计算 ${index.name} 的移动平均线...`);

    // 获取该指数的所有历史数据
    const histories = await this.historyRepository.find({
      where: { indexId: index.id },
      order: { tradeDate: 'ASC' },
    });

    if (histories.length === 0) {
      this.logger.warn(`${index.name} 没有历史数据`);
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
      };
    }

    // 计算MA
    const results = this.calculateMAForIndex(index.id, histories);

    // 保存结果
    const savedCount = await this.saveMACalculations(index.id, results);

    const fromDate = this.formatDateToString(results[0].tradeDate);
    const toDate = this.formatDateToString(results[results.length - 1].tradeDate);

    this.logger.log(
      `${index.name} MA计算完成，共 ${savedCount} 条数据，日期范围: ${fromDate} 至 ${toDate}`,
    );

    return {
      indexName: index.name,
      calculatedCount: savedCount,
      dateRange: {
        from: fromDate,
        to: toDate,
      },
    };
  }

  /**
   * 批量计算所有指数的MA数据
   */
  async calculateMAForAllIndices(indices: Index[]): Promise<{
    total: number;
    results: { indexName: string; calculatedCount: number }[];
  }> {
    this.logger.log(`开始批量计算 ${indices.length} 个指数的移动平均线...`);

    const results: { indexName: string; calculatedCount: number }[] = [];
    let totalCount = 0;

    for (const index of indices) {
      try {
        const result = await this.calculateAndSaveMAForIndex(index);
        results.push({
          indexName: result.indexName,
          calculatedCount: result.calculatedCount,
        });
        totalCount += result.calculatedCount;
      } catch (error) {
        this.logger.error(`计算 ${index.name} MA失败: ${error.message}`);
        results.push({
          indexName: index.name,
          calculatedCount: 0,
        });
      }
    }

    this.logger.log(`批量MA计算完成，共 ${totalCount} 条数据`);
    return { total: totalCount, results };
  }

  /**
   * 获取指数的MA数据
   */
  async getMADataByIndexId(
    indexId: string,
    limit: number = 100,
  ): Promise<MovingAverage[]> {
    return this.maRepository.find({
      where: { indexId },
      order: { tradeDate: 'DESC' },
      take: limit,
    });
  }

  /**
   * 获取最新MA数据
   */
  async getLatestMAData(indexId: string): Promise<MovingAverage | null> {
    return this.maRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
  }

  /**
   * 获取所有指数的最新MA数据（用于排名）
   */
  async getAllLatestMAData(): Promise<MovingAverage[]> {
    // 使用子查询获取每个指数的最新日期
    const subQuery = this.maRepository
      .createQueryBuilder('ma2')
      .select('ma2.indexId', 'indexId')
      .addSelect('MAX(ma2.tradeDate)', 'maxDate')
      .groupBy('ma2.indexId');

    const latestData = await this.maRepository
      .createQueryBuilder('ma')
      .innerJoin(
        '(' + subQuery.getQuery() + ')',
        'latest',
        'ma.indexId = latest.indexId AND ma.tradeDate = latest.maxDate',
      )
      .leftJoinAndSelect('ma.index', 'index')
      .getMany();

    return latestData;
  }

  /**
   * 格式化日期为字符串（兼容Date和字符串类型）
   */
  private formatDateToString(date: Date | string): string {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    // 如果已经是字符串格式（如 2025-01-01T00:00:00.000Z 或 2025-01-01）
    const dateStr = String(date);
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    return dateStr;
  }
}
