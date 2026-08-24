import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MovingAverage } from './entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';
import { INDEX_TYPE, type IndexType } from '../common/constants/index-type.constants';

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
      (a, b) =>
        new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    const results: MACalculationResult[] = [];

    for (let i = 0; i < sortedHistories.length; i++) {
      const current = sortedHistories[i];
      const closePrice = Number(current.closePrice);

      // 计算MA5（需要当前及前4天，共5天数据）
      const ma5Data = sortedHistories.slice(Math.max(0, i - 4), i + 1);
      const ma5 = this.calculateAverage(
        ma5Data.map((h) => Number(h.closePrice)),
      );

      // 计算MA10
      const ma10Data = sortedHistories.slice(Math.max(0, i - 9), i + 1);
      const ma10 = this.calculateAverage(
        ma10Data.map((h) => Number(h.closePrice)),
      );

      // 计算MA20
      const ma20Data = sortedHistories.slice(Math.max(0, i - 19), i + 1);
      const ma20 = this.calculateAverage(
        ma20Data.map((h) => Number(h.closePrice)),
      );

      // 计算MA60
      const ma60Data = sortedHistories.slice(Math.max(0, i - 59), i + 1);
      const ma60 = this.calculateAverage(
        ma60Data.map((h) => Number(h.closePrice)),
      );

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
   * 使用分批处理避免PostgreSQL参数限制（最大65535个参数）
   */
  async saveMACalculations(
    indexId: string,
    results: MACalculationResult[],
  ): Promise<number> {
    if (results.length === 0) return 0;

    // 每批最多500条记录（500 * 12字段 = 6000参数，远小于65535限制）
    const BATCH_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);

      const entities = batch.map((result) =>
        this.maRepository.create({
          indexId,
          ...result,
        }),
      );

      // 使用 upsert 避免重复数据
      const result = await this.maRepository.upsert(entities, [
        'indexId',
        'tradeDate',
      ]);
      totalSaved += result.identifiers?.length || batch.length;

      this.logger.debug(
        `已保存批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(results.length / BATCH_SIZE)}，共 ${batch.length} 条记录`,
      );
    }

    return totalSaved;
  }

  /**
   * 为单个指数计算并保存MA数据（全量计算）
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
    const toDate = this.formatDateToString(
      results[results.length - 1].tradeDate,
    );

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
   * 为单个指数增量计算MA数据（只计算新增部分）
   * 适用于历史数据已计算过，只需计算最新数据的情况
   */
  async calculateAndSaveMAIncrementally(index: Index): Promise<{
    indexName: string;
    calculatedCount: number;
    dateRange: { from: string; to: string } | null;
    isIncremental: boolean;
  }> {
    this.logger.log(`开始增量计算 ${index.name} 的移动平均线...`);

    // 获取该指数最新的MA日期
    const latestMADate = await this.getLatestMADate(index.id);

    if (!latestMADate) {
      // 从未计算过，执行全量计算
      this.logger.log(`${index.name} 从未计算过MA，执行全量计算`);
      const result = await this.calculateAndSaveMAForIndex(index);
      return {
        ...result,
        isIncremental: false,
      };
    }

    // 获取历史数据的最新日期
    const latestHistory = await this.historyRepository.findOne({
      where: { indexId: index.id },
      order: { tradeDate: 'DESC' },
    });

    if (!latestHistory) {
      this.logger.warn(`${index.name} 没有历史数据`);
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
        isIncremental: true,
      };
    }

    // 检查是否有新增数据
    const latestMADateStr = this.formatDateToString(latestMADate);
    const latestHistoryDateStr = this.formatDateToString(
      latestHistory.tradeDate,
    );

    if (latestMADateStr >= latestHistoryDateStr) {
      this.logger.log(
        `${index.name} 的MA数据已是最新 (${latestMADateStr})，跳过计算`,
      );
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
        isIncremental: true,
      };
    }

    // 获取需要计算的历史数据（从MA最新日期前59天开始，确保MA60能正确计算）
    const startDate = new Date(latestMADate);
    startDate.setDate(startDate.getDate() - 59); // MA60需要前59天数据

    const histories = await this.historyRepository.find({
      where: {
        indexId: index.id,
        tradeDate: Between(startDate, latestHistory.tradeDate),
      },
      order: { tradeDate: 'ASC' },
    });

    if (histories.length === 0) {
      this.logger.warn(`${index.name} 没有新的历史数据需要计算`);
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
        isIncremental: true,
      };
    }

    // 计算MA（包含历史数据以确保MA值正确）
    const results = this.calculateMAForIndex(index.id, histories);

    // 只保存新增日期的数据（大于最新MA日期的）
    const newResults = results.filter(
      (r) => this.formatDateToString(r.tradeDate) > latestMADateStr,
    );

    if (newResults.length === 0) {
      this.logger.log(`${index.name} 没有新的MA数据需要保存`);
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
        isIncremental: true,
      };
    }

    // 保存新增结果
    const savedCount = await this.saveMACalculations(index.id, newResults);

    const fromDate = this.formatDateToString(newResults[0].tradeDate);
    const toDate = this.formatDateToString(
      newResults[newResults.length - 1].tradeDate,
    );

    this.logger.log(
      `${index.name} 增量MA计算完成，新增 ${savedCount} 条数据，日期范围: ${fromDate} 至 ${toDate}`,
    );

    return {
      indexName: index.name,
      calculatedCount: savedCount,
      dateRange: { from: fromDate, to: toDate },
      isIncremental: true,
    };
  }

  /**
   * 获取指数最新的MA数据日期
   */
  async getLatestMADate(indexId: string): Promise<Date | null> {
    const result = await this.maRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
    return result ? result.tradeDate : null;
  }

  /**
   * 检查指数是否需要计算MA（有新增历史数据或从未计算过）
   */
  async shouldCalculateMA(index: Index): Promise<boolean> {
    const latestHistory = await this.historyRepository.findOne({
      where: { indexId: index.id },
      order: { tradeDate: 'DESC' },
    });

    if (!latestHistory) {
      return false; // 没有历史数据，不需要计算
    }

    const latestMADate = await this.getLatestMADate(index.id);

    if (!latestMADate) {
      return true; // 从未计算过MA
    }

    // 如果历史数据最新日期 > MA最新日期，说明有新增数据需要计算
    return new Date(latestHistory.tradeDate) > new Date(latestMADate);
  }

  /**
   * 获取需要计算MA的指数列表
   */
  async getIndicesNeedingMACalculation(indices: Index[]): Promise<Index[]> {
    const results: Index[] = [];

    for (const index of indices) {
      const shouldCalculate = await this.shouldCalculateMA(index);
      if (shouldCalculate) {
        results.push(index);
      } else {
        this.logger.debug(`${index.name} 的MA数据已是最新，跳过计算`);
      }
    }

    return results;
  }

  /**
   * 为指定指数列表计算MA数据（市场同步后调用）
   * 只计算有新增数据的指数，使用增量模式
   * @param indices 指数列表
   * @param marketName 市场名称（用于日志）
   */
  async calculateMAForIndices(
    indices: Index[],
    marketName: string = '指定市场',
  ): Promise<{
    total: number;
    calculatedCount: number;
    skippedCount: number;
    results: { indexName: string; count: number }[];
  }> {
    this.logger.log(
      `[${marketName}] 开始计算移动平均线，共 ${indices.length} 个指数...`,
    );

    // 筛选出需要计算的指数
    const indicesToCalculate =
      await this.getIndicesNeedingMACalculation(indices);
    const skippedCount = indices.length - indicesToCalculate.length;

    if (skippedCount > 0) {
      this.logger.log(`[${marketName}] ${skippedCount} 个指数已是最新，跳过`);
    }

    if (indicesToCalculate.length === 0) {
      this.logger.log(`[${marketName}] 所有指数MA数据都已是最新`);
      return {
        total: 0,
        calculatedCount: 0,
        skippedCount,
        results: [],
      };
    }

    this.logger.log(
      `[${marketName}] 实际计算 ${indicesToCalculate.length} 个指数`,
    );

    const results: { indexName: string; count: number }[] = [];
    let totalCount = 0;

    for (const index of indicesToCalculate) {
      try {
        const result = await this.calculateAndSaveMAIncrementally(index);
        results.push({
          indexName: result.indexName,
          count: result.calculatedCount,
        });
        totalCount += result.calculatedCount;
      } catch (error) {
        this.logger.error(
          `[${marketName}] 计算 ${index.name} MA失败: ${error.message}`,
        );
        results.push({
          indexName: index.name,
          count: 0,
        });
      }
    }

    this.logger.log(
      `[${marketName}] MA计算完成，共 ${totalCount} 条数据，跳过 ${skippedCount} 个`,
    );

    return {
      total: totalCount,
      calculatedCount: indicesToCalculate.length,
      skippedCount,
      results,
    };
  }

  /**
   * 批量计算所有指数的MA数据（只计算需要更新的）
   * 默认使用增量计算模式，只计算新增的数据
   */
  async calculateMAForAllIndices(
    indices: Index[],
    incremental: boolean = true,
  ): Promise<{
    total: number;
    skipped: number;
    fullCalculated: number;
    incrementalCalculated: number;
    results: {
      indexName: string;
      calculatedCount: number;
      isIncremental: boolean;
    }[];
  }> {
    this.logger.log(
      `开始批量计算移动平均线，共 ${indices.length} 个指数，模式: ${incremental ? '增量' : '全量'}...`,
    );

    // 筛选出需要计算的指数
    const indicesToCalculate =
      await this.getIndicesNeedingMACalculation(indices);
    const skippedCount = indices.length - indicesToCalculate.length;

    if (skippedCount > 0) {
      this.logger.log(`${skippedCount} 个指数已是最新数据，跳过计算`);
    }

    if (indicesToCalculate.length === 0) {
      this.logger.log('所有指数的MA数据都已是最新，无需计算');
      return {
        total: 0,
        skipped: skippedCount,
        fullCalculated: 0,
        incrementalCalculated: 0,
        results: [],
      };
    }

    this.logger.log(`实际需要计算 ${indicesToCalculate.length} 个指数`);

    const results: {
      indexName: string;
      calculatedCount: number;
      isIncremental: boolean;
    }[] = [];
    let totalCount = 0;
    let fullCount = 0;
    let incrementalCount = 0;

    for (const index of indicesToCalculate) {
      try {
        let result;
        if (incremental) {
          // 使用增量计算
          result = await this.calculateAndSaveMAIncrementally(index);
        } else {
          // 使用全量计算
          const fullResult = await this.calculateAndSaveMAForIndex(index);
          result = { ...fullResult, isIncremental: false };
        }

        results.push({
          indexName: result.indexName,
          calculatedCount: result.calculatedCount,
          isIncremental: result.isIncremental,
        });
        totalCount += result.calculatedCount;

        if (result.isIncremental) {
          incrementalCount++;
        } else {
          fullCount++;
        }
      } catch (error) {
        this.logger.error(`计算 ${index.name} MA失败: ${error.message}`);
        results.push({
          indexName: index.name,
          calculatedCount: 0,
          isIncremental: false,
        });
      }
    }

    this.logger.log(
      `批量MA计算完成，共 ${totalCount} 条数据，全量: ${fullCount} 个，增量: ${incrementalCount} 个，跳过: ${skippedCount} 个`,
    );
    return {
      total: totalCount,
      skipped: skippedCount,
      fullCalculated: fullCount,
      incrementalCalculated: incrementalCount,
      results,
    };
  }

  /**
   * 根据最近N个交易日重新计算移动均线（单个指数）
   * @param index 指数对象
   * @param tradingDays 最近N个交易日（默认5天）
   * @returns 计算结果
   */
  async recalculateMAForRecentTradingDays(
    index: Index,
    tradingDays: number = 5,
  ): Promise<{
    indexName: string;
    calculatedCount: number;
    dateRange: { from: string; to: string } | null;
  }> {
    this.logger.log(`[${index.name}] 开始重新计算最近 ${tradingDays} 个交易日的移动平均线...`);

    // 1. 获取最近N+60个交易日的历史数据（确保MA60能正确计算）
    const totalDaysNeeded = tradingDays + 60;
    const histories = await this.historyRepository.find({
      where: { indexId: index.id },
      order: { tradeDate: 'DESC' },
      take: totalDaysNeeded,
    });

    if (histories.length === 0) {
      this.logger.warn(`${index.name} 没有历史数据`);
      return {
        indexName: index.name,
        calculatedCount: 0,
        dateRange: null,
      };
    }

    // 2. 按日期升序排列用于计算
    const sortedHistories = [...histories].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    // 3. 计算MA（使用全部数据确保准确性）
    const allResults = this.calculateMAForIndex(index.id, sortedHistories);

    // 4. 只取最近N个交易日的结果
    const recentResults = allResults.slice(-tradingDays);

    // 5. 删除这些日期的旧MA数据（使用 In 操作符）
    const tradeDates = recentResults.map((r) =>
      this.formatDateToString(r.tradeDate),
    );
    await this.maRepository
      .createQueryBuilder()
      .delete()
      .from(MovingAverage)
      .where('indexId = :indexId', { indexId: index.id })
      .andWhere('tradeDate IN (:...tradeDates)', { tradeDates })
      .execute();

    // 6. 保存新的MA数据
    const savedCount = await this.saveMACalculations(index.id, recentResults);

    const fromDate = this.formatDateToString(recentResults[0].tradeDate);
    const toDate = this.formatDateToString(
      recentResults[recentResults.length - 1].tradeDate,
    );

    this.logger.log(
      `[${index.name}] 重新计算完成，共 ${savedCount} 条数据，日期范围: ${fromDate} 至 ${toDate}`,
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
   * 批量重新计算所有指数的最近N个交易日移动均线
   * @param indices 指数列表
   * @param tradingDays 最近N个交易日（默认5天）
   * @returns 批量计算结果
   */
  async recalculateMAForAllIndices(
    indices: Index[],
    tradingDays: number = 5,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: {
      indexName: string;
      calculatedCount: number;
      success: boolean;
      error?: string;
    }[];
  }> {
    this.logger.log(`开始批量重新计算 ${indices.length} 个指数的最近 ${tradingDays} 个交易日MA...`);

    const results: {
      indexName: string;
      calculatedCount: number;
      success: boolean;
      error?: string;
    }[] = [];
    let totalCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const index of indices) {
      try {
        const result = await this.recalculateMAForRecentTradingDays(
          index,
          tradingDays,
        );
        results.push({
          indexName: result.indexName,
          calculatedCount: result.calculatedCount,
          success: true,
        });
        totalCount += result.calculatedCount;
        successCount++;
      } catch (error) {
        this.logger.error(`[${index.name}] 重新计算MA失败: ${error.message}`);
        results.push({
          indexName: index.name,
          calculatedCount: 0,
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    this.logger.log(
      `批量重新计算完成，成功: ${successCount}，失败: ${failedCount}，共 ${totalCount} 条数据`,
    );

    return {
      total: totalCount,
      success: successCount,
      failed: failedCount,
      results,
    };
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
  async getAllLatestMAData(indexType?: IndexType): Promise<MovingAverage[]> {
    // 使用 DISTINCT ON 获取每个指数的最新记录（PostgreSQL 特性）
    const query = this.maRepository
      .createQueryBuilder('ma')
      .distinctOn(['ma.indexId'])
      .orderBy('ma.indexId', 'ASC')
      .addOrderBy('ma.tradeDate', 'DESC')
      .leftJoinAndSelect('ma.index', 'index');
    
    // 如果指定了类型，添加过滤条件
    // 注意：indices 类型在数据库中存储为 'indices' 或 null/undefined
    // sectors 类型在数据库中存储为 'sectors'
    if (indexType) {
      if (indexType === INDEX_TYPE.INDICES) {
        // indices 类型包括：明确标记为 'indices' 或未设置 type 的
        query.andWhere(
          `(index.metadata->>'type' = :type OR index.metadata->>'type' IS NULL)`,
          { type: INDEX_TYPE.INDICES },
        );
      } else if (indexType === INDEX_TYPE.SECTORS) {
        // sectors 类型：明确标记为 'sectors'
        query.andWhere(
          `index.metadata->>'type' = :type`,
          { type: INDEX_TYPE.SECTORS },
        );
      }
    }
    
    const latestData = await query.getMany();
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
