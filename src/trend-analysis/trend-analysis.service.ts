import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { TrendAnalysis } from './entities/trend-analysis.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';
import { IndicesService } from '../indices/indices.service';

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
  indexType: string | null;
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
    @Inject(forwardRef(() => IndicesService))
    private indicesService: IndicesService,
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
      (a, b) =>
        new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
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
      const trendStatus: 'above' | 'below' =
        closePrice >= ma20 ? 'above' : 'below';

      // 保存旧的状态转变价格和日期用于计算区间涨幅
      const oldStatusChangePrice = statusChangePrice;
      const oldStatusChangeDate = statusChangeDate;

      // 检测状态转变或首次计算
      let isStatusChanged = false;
      if (previousStatus === null) {
        // 首次计算，初始化状态转变基准
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
      } else if (previousStatus !== trendStatus) {
        // 状态发生转变，记录转变日期和价格
        // 使用当天的收盘价作为新的基准价格
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
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
      // 如果状态在今天发生转变，使用上一次的基准价格计算区间涨幅
      // 否则使用当前的基准价格（即状态转变日的收盘价）
      let intervalChangePercent: number | null = null;
      if (statusChangeDate !== null && statusChangePrice !== null) {
        const basePrice =
          isStatusChanged && oldStatusChangePrice !== null
            ? oldStatusChangePrice
            : statusChangePrice;
        intervalChangePercent = ((closePrice - basePrice) / basePrice) * 100;
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
        intervalChangePercent:
          intervalChangePercent !== null
            ? Number(intervalChangePercent.toFixed(4))
            : null,
        rank: 0, // 稍后统一计算排名
        rankChange: 0, // 稍后计算
        totalRankCount: allIndicesMAData.size,
        indexType: index.metadata?.type || null,
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

      const avgVolume =
        prev5Days.reduce((sum, h) => sum + (Number(h.volume) || 0), 0) /
        prev5Days.length;

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
   * 填充节假日数据
   * 对于每个日期，如果某个指数没有数据，则复制该指数上一个交易日的数据
   * 确保即使某些市场休市（如日本节假日），该指数仍会出现在排名中
   * @param indices 指数列表
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @returns 填充的数据条数
   */
  async fillHolidayData(
    indices: Index[],
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    let filledCount = 0;

    // 获取日期范围内所有应该有数据的日期（至少有一个指数有数据的日期）
    const allDates = new Set<string>();

    // 从MA数据中获取所有日期
    const maDates = await this.maRepository
      .createQueryBuilder('ma')
      .select('DISTINCT ma.tradeDate', 'date')
      .where('ma.tradeDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawMany();

    maDates.forEach((d) => allDates.add(this.formatDate(d.date)));

    if (allDates.size === 0) {
      return 0;
    }

    this.logger.log(
      `开始填充节假日数据，日期范围: ${this.formatDate(startDate)} 至 ${this.formatDate(endDate)}，共 ${allDates.size} 个日期`,
    );

    // 按日期排序
    const sortedDates = Array.from(allDates).sort();

    // 为每个指数填充缺失的日期数据
    for (const index of indices) {
      // 获取该指数在日期范围内已有的趋势数据
      const existingData = await this.trendRepository.find({
        where: {
          indexId: index.id,
          tradeDate: Between(startDate, endDate),
        },
        order: { tradeDate: 'ASC' },
      });

      const existingDates = new Set(
        existingData.map((d) => this.formatDate(d.tradeDate)),
      );

      // 获取该指数在startDate之前的最新趋势数据（用于填充第一个缺失日期）
      let lastTrendData = await this.trendRepository.findOne({
        where: {
          indexId: index.id,
          tradeDate: LessThan(startDate),
        },
        order: { tradeDate: 'DESC' },
      });

      // 如果没有历史数据，使用已有的第一条数据作为基准
      if (!lastTrendData && existingData.length > 0) {
        lastTrendData = existingData[0];
      }

      if (!lastTrendData) {
        // 该指数完全没有历史数据，跳过
        continue;
      }

      // 检查每个日期，填充缺失的数据
      for (const dateStr of sortedDates) {
        if (existingDates.has(dateStr)) {
          // 该日期已有数据，更新lastTrendData
          const currentData = existingData.find(
            (d) => this.formatDate(d.tradeDate) === dateStr,
          );
          if (currentData) {
            lastTrendData = currentData;
          }
          continue;
        }

        // 确保 lastTrendData 不为 null
        if (!lastTrendData) {
          continue;
        }

        // 跳过周末（周六和周日）
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          continue; // 周日=0，周六=6
        }

        // 该日期没有数据，复制上一个交易日的数据
        const holidayData = {
          indexId: index.id,
          tradeDate: new Date(dateStr),
          closePrice: lastTrendData.closePrice,
          ma20: lastTrendData.ma20,
          changePercent: lastTrendData.changePercent, // 继承上一交易日的涨跌幅
          deviationRate: lastTrendData.deviationRate,
          volumeRatio: null, // 节假日无量比
          trendStatus: lastTrendData.trendStatus,
          statusChangeDate: lastTrendData.statusChangeDate,
          intervalChangePercent: lastTrendData.intervalChangePercent,
          rank: 0, // 稍后统一计算
          rankChange: 0,
          totalRankCount: 0,
          indexType: index.metadata?.type || null,
        };

        this.logger.debug(
          `[${index.name}] 填充 ${dateStr} 数据，changePercent: ${holidayData.changePercent}, 来源日期: ${this.formatDate(lastTrendData.tradeDate)}`,
        );

        // 使用 upsert 避免唯一约束冲突
        await this.trendRepository.upsert(holidayData, [
          'indexId',
          'tradeDate',
        ]);
        filledCount++;

        // 更新 lastTrendData 为当前填充的数据，用于后续连续节假日的填充
        lastTrendData = {
          ...lastTrendData,
          ...holidayData,
          id: lastTrendData.id,
        };
      }
    }

    if (filledCount > 0) {
      this.logger.log(`节假日数据填充完成，共填充 ${filledCount} 条数据`);

      // 重新计算所有受影响的日期的排名
      await this.recalculateRankingsForDates(sortedDates);
    }

    return filledCount;
  }

  /**
   * 重新计算指定日期范围内所有日期的排名
   * @param dates 日期字符串数组（格式：YYYY-MM-DD）
   */
  private async recalculateRankingsForDates(dates: string[]): Promise<void> {
    this.logger.log(`重新计算 ${dates.length} 个日期的排名...`);

    for (const dateStr of dates) {
      const tradeDate = new Date(dateStr);

      // 获取该日期所有指数的趋势数据
      const allTrendData = await this.trendRepository.find({
        where: { tradeDate },
      });

      if (allTrendData.length === 0) {
        continue;
      }

      // 按偏离率降序排序
      const sortedData = [...allTrendData].sort(
        (a, b) => (b.deviationRate || 0) - (a.deviationRate || 0),
      );

      // 获取前一个交易日的排名数据（使用getPreviousTradingDate确保获取到实际有数据的日期）
      const prevDate = await this.getPreviousTradingDate(tradeDate);
      let prevRankMap = new Map<string, number>();
      if (prevDate) {
        const prevDayData = await this.trendRepository.find({
          where: { tradeDate: prevDate },
        });
        prevRankMap = new Map(prevDayData.map((d) => [d.indexId, d.rank]));
      }

      // 更新排名
      for (let i = 0; i < sortedData.length; i++) {
        const item = sortedData[i];
        const newRank = i + 1;
        const prevRank = prevRankMap.get(item.indexId);
        const rankChange = prevRank !== undefined ? prevRank - newRank : 0;

        await this.trendRepository.update(
          { id: item.id },
          {
            rank: newRank,
            rankChange,
            totalRankCount: sortedData.length,
          },
        );
      }
    }

    this.logger.log('排名重新计算完成');
  }

  /**
   * 保存趋势分析结果
   * 使用分批处理避免PostgreSQL参数限制（最大65535个参数）
   */
  async saveTrendAnalysis(results: TrendAnalysisResult[]): Promise<number> {
    if (results.length === 0) return 0;

    // 每批最多500条记录（500 * 14字段 = 7000参数，远小于65535限制）
    const BATCH_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);

      const entities = batch.map((result) =>
        this.trendRepository.create({
          ...result,
        }),
      );

      // 使用 upsert 避免重复数据
      const result = await this.trendRepository.upsert(entities, [
        'indexId',
        'tradeDate',
      ]);
      totalSaved += result.identifiers?.length || batch.length;

      this.logger.debug(
        `趋势分析已保存批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(results.length / BATCH_SIZE)}，共 ${batch.length} 条记录`,
      );
    }

    return totalSaved;
  }

  /**
   * 获取指数最新的趋势分析数据日期
   */
  async getLatestTrendAnalysisDate(indexId: string): Promise<Date | null> {
    const result = await this.trendRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
    return result ? result.tradeDate : null;
  }

  /**
   * 执行完整的趋势分析计算（所有指数）
   * 根据 indices.metadata.calcTrend 筛选，只有 calcTrend=1 的指数才会计算
   * @param indices 指数列表
   * @param startYear 可选，开始年份（如1900）
   * @param endYear 可选，结束年份（如2000）
   */
  async performFullAnalysis(
    indices: Index[],
    startYear?: number,
    endYear?: number,
  ): Promise<{
    total: number;
    skipped: number;
    dateRange: { from: string; to: string } | null;
    results: { indexName: string; count: number }[];
  }> {
    // 筛选出需要计算趋势的指数（calcTrend=1 或未设置时默认计算）
    const indicesToCalculate = indices.filter((index) => {
      const calcTrend = index.metadata?.calcTrend;
      // calcTrend=1 或未设置时计算，calcTrend=0 时跳过
      return calcTrend === 1 || calcTrend === undefined || calcTrend === null;
    });

    const skippedCount = indices.length - indicesToCalculate.length;

    const yearRangeStr =
      startYear || endYear
        ? ` (${startYear || 'all'}-${endYear || 'all'})`
        : '';

    this.logger.log(
      `开始执行趋势分析${yearRangeStr}，共 ${indices.length} 个指数，实际计算 ${indicesToCalculate.length} 个，跳过 ${skippedCount} 个（calcTrend=0）`,
    );

    if (indicesToCalculate.length === 0) {
      this.logger.warn(
        '没有需要计算趋势的指数（请检查 indices.metadata.calcTrend 设置）',
      );
      return { total: 0, skipped: skippedCount, dateRange: null, results: [] };
    }

    // 构建日期范围条件（使用 TypeORM 的 Between）
    const startDate = startYear ? new Date(`${startYear}-01-01`) : undefined;
    const endDate = endYear ? new Date(`${endYear}-12-31`) : undefined;

    // 1. 收集所有指数的MA数据（带日期范围过滤）
    const allMADatas = new Map<string, MovingAverage[]>();
    const latestMAs = new Map<string, MovingAverage>();

    for (const index of indicesToCalculate) {
      const whereCondition: any = { indexId: index.id };
      if (startDate && endDate) {
        whereCondition.tradeDate = Between(startDate, endDate);
      } else if (startDate) {
        whereCondition.tradeDate = Between(startDate, new Date('2100-12-31'));
      } else if (endDate) {
        whereCondition.tradeDate = Between(new Date('1900-01-01'), endDate);
      }

      const maData = await this.maRepository.find({
        where: whereCondition,
        order: { tradeDate: 'ASC' },
      });

      if (maData.length > 0) {
        allMADatas.set(index.id, maData);
        latestMAs.set(index.id, maData[maData.length - 1]);
      }
    }

    if (allMADatas.size === 0) {
      this.logger.warn('没有可用的MA数据');
      return { total: 0, skipped: skippedCount, dateRange: null, results: [] };
    }

    // 2. 计算每个指数的趋势数据
    const allTrendResults = new Map<string, TrendAnalysisResult[]>();

    for (const index of indicesToCalculate) {
      const maData = allMADatas.get(index.id);
      if (maData) {
        const results = await this.calculateTrendForIndex(
          index,
          maData,
          latestMAs,
        );
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
    // 用于存储每个指数前一天的排名（内存中计算，避免查询数据库）
    const previousRanks = new Map<string, number>();

    for (const dateStr of Array.from(allDates).sort()) {
      const date = new Date(dateStr);

      // 计算该日期的排名
      const rankings = this.calculateRankings(allTrendResults, date);

      // 更新每个指数在该日期的排名和排序变化
      for (const [indexId, results] of allTrendResults.entries()) {
        const result = results.find(
          (r) => this.formatDate(r.tradeDate) === dateStr,
        );
        if (result) {
          const rank = rankings.get(indexId) || 0;
          // 从内存中获取前一天的排名计算变化
          const prevRank = previousRanks.get(indexId);
          const rankChange = prevRank !== undefined ? prevRank - rank : 0;

          // 保存当前排名供下一天使用
          previousRanks.set(indexId, rank);

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

    // 7. 填充节假日数据（为休市的指数复制上一交易日数据）
    let filledCount = 0;
    if (minDate && maxDate) {
      filledCount = await this.fillHolidayData(
        indicesToCalculate,
        minDate,
        maxDate,
      );
    }

    this.logger.log(
      `趋势分析完成，共 ${savedCount} 条数据，填充节假日数据 ${filledCount} 条，跳过 ${skippedCount} 个指数`,
    );

    return {
      total: savedCount + filledCount,
      skipped: skippedCount,
      dateRange:
        minDate && maxDate
          ? {
              from: this.formatDate(minDate),
              to: this.formatDate(maxDate),
            }
          : null,
      results: indexResults,
    };
  }

  /**
   * 获取指定指数的趋势分析数据
   */
  async getTrendAnalysisByIndexId(
    indexId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<TrendAnalysis[]> {
    return this.trendRepository.find({
      where: { indexId },
      order: { tradeDate: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * 获取指定指数的趋势分析数据总数
   */
  async getTrendAnalysisCount(indexId: string): Promise<number> {
    return this.trendRepository.count({
      where: { indexId },
    });
  }

  /**
   * 获取最新日期的所有指数趋势分析（用于排名展示）
   * 如果某个指数在最新日期没有数据，则使用其上一个交易日的数据补全
   * 确保排名列表始终包含所有活跃指数的全量数据
   */
  async getLatestTrendRanking(): Promise<
    (TrendAnalysis & {
      isTodayData: boolean;
      actualDataDate: Date;
      prevDeviationRate: number | null;
    })[]
  > {
    // 1. 获取所有活跃的指数
    const indices = await this.indicesService.findAll();
    const activeIndices = indices.filter((i) => i.isActive);

    // 2. 获取趋势数据中最新的日期（基准日期）
    const latestRecords = await this.trendRepository.find({
      order: { tradeDate: 'DESC' },
      take: 1,
    });

    if (latestRecords.length === 0) {
      return [];
    }

    const latestDate = latestRecords[0].tradeDate;

    // 3. 获取基准日期的所有趋势数据
    const latestData = await this.trendRepository.find({
      where: { tradeDate: latestDate },
      relations: { index: true },
    });

    // 4. 获取上一个交易日的日期
    const prevTradingDate = await this.getPreviousTradingDate(latestDate);

    // 5. 获取上一个交易日的趋势数据（用于补全和计算偏离率变化）
    let prevData: TrendAnalysis[] = [];
    if (prevTradingDate) {
      prevData = await this.trendRepository.find({
        where: { tradeDate: prevTradingDate },
        relations: { index: true },
      });
    }

    // 6. 构建指数ID到数据的映射
    const latestDataMap = new Map(latestData.map((d) => [d.indexId, d]));
    const prevDataMap = new Map(prevData.map((d) => [d.indexId, d]));

    // 7. 为每个指数选择数据：优先用基准日期的，没有则用上一个交易日的
    const result: (TrendAnalysis & {
      isTodayData: boolean;
      actualDataDate: Date;
      prevDeviationRate: number | null;
    })[] = [];

    for (const index of activeIndices) {
      const latestRecord = latestDataMap.get(index.id);
      const prevRecord = prevDataMap.get(index.id);

      // 获取昨天的偏离率（用于前端判断正负转换）
      const prevDeviationRate = prevRecord ? prevRecord.deviationRate : null;

      if (latestRecord) {
        // 基准日期有数据，使用基准日期的
        result.push({
          ...latestRecord,
          isTodayData: true,
          actualDataDate: latestRecord.tradeDate,
          prevDeviationRate,
        });
      } else if (prevRecord) {
        // 基准日期没有，使用上一个交易日的，并标记
        // 将 tradeDate 改为基准日期，但保留 actualDataDate 记录实际数据日期
        result.push({
          ...prevRecord,
          tradeDate: latestDate, // 统一显示为基准日期
          isTodayData: false,
          actualDataDate: prevRecord.tradeDate, // 记录实际数据日期
          prevDeviationRate,
        });
      }
      // 如果都没有，说明是新指数或数据缺失，跳过
    }

    // 8. 按偏离率倒序排序（从大到小，10 排在 5 前面）
    result.sort((a, b) => (b.deviationRate || 0) - (a.deviationRate || 0));

    // 9. 重新赋值排名，并重新计算rankChange
    // 构建前一个交易日排名的映射（用于计算排名变化）
    const prevRankMap = new Map<string, number>();
    for (const prevItem of prevData) {
      prevRankMap.set(prevItem.indexId, prevItem.rank);
    }

    result.forEach((item, index) => {
      const newRank = index + 1;
      const prevRank = prevRankMap.get(item.indexId);
      // 重新计算rankChange：正数表示排名上升，负数表示下降
      item.rankChange = prevRank !== undefined ? prevRank - newRank : 0;
      item.rank = newRank;
    });

    return result;
  }

  /**
   * 获取指定日期的上一个交易日
   * @param date 指定日期
   * @returns 上一个交易日的日期，如果没有则返回null
   */
  private async getPreviousTradingDate(date: Date): Promise<Date | null> {
    // 从趋势数据中查找小于指定日期的最大日期
    const prevRecord = await this.trendRepository.find({
      where: {
        tradeDate: LessThan(date),
      },
      order: { tradeDate: 'DESC' },
      take: 1,
    });

    return prevRecord.length > 0 ? prevRecord[0].tradeDate : null;
  }

  /**
   * 获取指定日期的所有指数趋势分析排名
   * @param date 指定日期（格式：YYYY-MM-DD）
   * @returns 包含数据补全信息的趋势分析数组
   */
  async getTrendRankingByDate(
    date: string,
  ): Promise<
    (TrendAnalysis & {
      isTodayData: boolean;
      actualDataDate: Date;
      prevDeviationRate: number | null;
    })[]
  > {
    const tradeDate = new Date(date);

    // 验证日期格式
    if (isNaN(tradeDate.getTime())) {
      throw new Error('无效的日期格式，请使用 YYYY-MM-DD 格式');
    }

    // 获取数据库中最新的日期
    const latestRecords = await this.trendRepository.find({
      order: { tradeDate: 'DESC' },
      take: 1,
    });

    if (latestRecords.length === 0) {
      return [];
    }

    const latestDate = latestRecords[0].tradeDate;
    const latestDateStr = this.formatDate(latestDate);

    // 如果查询的是最新日期，使用 getLatestTrendRanking（包含数据补全逻辑）
    if (date === latestDateStr) {
      return await this.getLatestTrendRanking();
    }

    // 查询历史日期，需要获取前一天的偏离率来判断转换
    const prevDate = await this.getPreviousTradingDate(tradeDate);
    const prevData = prevDate
      ? await this.trendRepository.find({
          where: { tradeDate: prevDate },
          relations: { index: true },
        })
      : [];
    const prevDataMap = new Map(prevData.map((d) => [d.indexId, d]));

    // 查询历史日期的数据
    const data = await this.trendRepository.find({
      where: { tradeDate },
      relations: { index: true },
      order: { rank: 'ASC' },
    });

    // 构建前一个交易日排名的映射（用于重新计算排名变化）
    const prevRankMap = new Map<string, number>();
    for (const prevItem of prevData) {
      prevRankMap.set(prevItem.indexId, prevItem.rank);
    }

    // 历史日期的数据全部标记为 isTodayData: true（因为是历史数据，不需要补全）
    // 但保留 prevDeviationRate 用于判断偏离率转换
    // 同时重新计算rankChange以确保准确性
    return data.map((item) => {
      const prevRank = prevRankMap.get(item.indexId);
      const rankChange = prevRank !== undefined ? prevRank - item.rank : 0;
      return {
        ...item,
        isTodayData: true,
        actualDataDate: item.tradeDate,
        prevDeviationRate: prevDataMap.get(item.indexId)?.deviationRate || null,
        rankChange,
      };
    });
  }

  /**
   * 格式化日期为字符串（兼容Date和字符串类型）
   */
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

  /**
   * 按日期范围重新计算趋势分析
   * 先删除指定范围内的旧数据，然后重新计算
   * @param indices 指数列表
   * @param startDate 开始日期
   * @param endDate 结束日期
   */
  async recalculateTrendAnalysis(
    indices: Index[],
    startDate: Date,
    endDate: Date,
  ): Promise<{
    total: number;
    deleted: number;
    dateRange: { from: string; to: string };
    results: { indexName: string; count: number }[];
  }> {
    this.logger.log(
      `开始重新计算趋势分析，日期范围: ${this.formatDate(startDate)} 至 ${this.formatDate(endDate)}`,
    );

    // 筛选出需要计算趋势的指数（calcTrend=1 或未设置时默认计算）
    const indicesToCalculate = indices.filter((index) => {
      const calcTrend = index.metadata?.calcTrend;
      return calcTrend === 1 || calcTrend === undefined || calcTrend === null;
    });

    const skippedCount = indices.length - indicesToCalculate.length;

    if (indicesToCalculate.length === 0) {
      this.logger.warn('没有需要计算趋势的指数');
      return {
        total: 0,
        deleted: 0,
        dateRange: {
          from: this.formatDate(startDate),
          to: this.formatDate(endDate),
        },
        results: [],
      };
    }

    // 1. 删除指定日期范围内的旧趋势分析数据
    const deleteResult = await this.trendRepository
      .createQueryBuilder()
      .delete()
      .from(TrendAnalysis)
      .where('tradeDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .execute();

    const deletedCount = deleteResult.affected || 0;
    this.logger.log(`已删除 ${deletedCount} 条旧的趋势分析数据`);

    // 2. 获取需要重新计算的指数ID列表
    const indexIds = indicesToCalculate.map((i) => i.id);

    // 3. 获取这些指数在日期范围内的MA数据（扩展范围，包含startDate前一天用于计算changePercent）
    const allMADatas = new Map<string, MovingAverage[]>();
    const latestMAs = new Map<string, MovingAverage>();

    // 计算扩展的开始日期（前一天）
    const extendedStartDate = new Date(startDate);
    extendedStartDate.setDate(extendedStartDate.getDate() - 1);

    for (const index of indicesToCalculate) {
      const maData = await this.maRepository.find({
        where: {
          indexId: index.id,
          tradeDate: Between(extendedStartDate, endDate),
        },
        order: { tradeDate: 'ASC' },
      });

      if (maData.length > 0) {
        allMADatas.set(index.id, maData);
        latestMAs.set(index.id, maData[maData.length - 1]);
      }
    }

    if (allMADatas.size === 0) {
      this.logger.warn('指定日期范围内没有可用的MA数据');
      return {
        total: 0,
        deleted: deletedCount,
        dateRange: {
          from: this.formatDate(startDate),
          to: this.formatDate(endDate),
        },
        results: [],
      };
    }

    // 4. 获取startDate前一个交易日的趋势分析数据（用于计算rankChange和继承状态）
    const prevDayTrendData = new Map<string, TrendAnalysis>();
    const prevDate = await this.getPreviousTradingDate(startDate);

    if (prevDate) {
      for (const index of indicesToCalculate) {
        const prevTrend = await this.trendRepository.findOne({
          where: {
            indexId: index.id,
            tradeDate: prevDate,
          },
        });
        if (prevTrend) {
          prevDayTrendData.set(index.id, prevTrend);
        }
      }
    }

    // 5. 计算每个指数的趋势数据（使用扩展的MA数据）
    const allTrendResults = new Map<string, TrendAnalysisResult[]>();

    for (const index of indicesToCalculate) {
      const maData = allMADatas.get(index.id);
      if (maData) {
        // 获取该指数在startDate之前的最新趋势记录（用于继承状态）
        const prevTrend = await this.trendRepository.findOne({
          where: {
            indexId: index.id,
            tradeDate: LessThan(startDate),
          },
          order: { tradeDate: 'DESC' },
        });

        const results = await this.calculateTrendForIndexWithHistory(
          index,
          maData,
          latestMAs,
          prevTrend,
          startDate,
        );
        allTrendResults.set(index.id, results);
      }
    }

    // 6. 获取所有日期，按日期计算排名
    const allDates = new Set<string>();
    for (const results of allTrendResults.values()) {
      results.forEach((r) => allDates.add(this.formatDate(r.tradeDate)));
    }

    // 7. 对每个日期计算排名和排序变化
    const finalResults: TrendAnalysisResult[] = [];
    // 用于存储每个指数前一天的排名（内存中计算，避免查询数据库）
    const previousRanks = new Map<string, number>();

    // 初始化前一天的排名（从数据库获取）
    for (const [indexId, prevTrend] of prevDayTrendData.entries()) {
      previousRanks.set(indexId, prevTrend.rank);
    }

    for (const dateStr of Array.from(allDates).sort()) {
      const date = new Date(dateStr);

      // 计算该日期的排名
      const rankings = this.calculateRankings(allTrendResults, date);

      // 更新每个指数在该日期的排名和排序变化
      for (const [indexId, results] of allTrendResults.entries()) {
        const result = results.find(
          (r) => this.formatDate(r.tradeDate) === dateStr,
        );
        if (result) {
          const rank = rankings.get(indexId) || 0;
          // 从内存中获取前一天的排名计算变化
          const prevRank = previousRanks.get(indexId);
          const rankChange = prevRank !== undefined ? prevRank - rank : 0;

          // 保存当前排名供下一天使用
          previousRanks.set(indexId, rank);

          finalResults.push({
            ...result,
            rank,
            rankChange,
          });
        }
      }
    }

    // 8. 保存结果
    const savedCount = await this.saveTrendAnalysis(finalResults);

    // 9. 填充节假日数据（为休市的指数复制上一交易日数据）
    const filledCount = await this.fillHolidayData(
      indicesToCalculate,
      startDate,
      endDate,
    );

    // 10. 统计结果
    const indexResults: { indexName: string; count: number }[] = [];

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
    }

    this.logger.log(
      `趋势分析重新计算完成，删除 ${deletedCount} 条，新增 ${savedCount} 条，填充节假日数据 ${filledCount} 条，跳过 ${skippedCount} 个指数`,
    );

    return {
      total: savedCount + filledCount,
      deleted: deletedCount,
      dateRange: {
        from: this.formatDate(startDate),
        to: this.formatDate(endDate),
      },
      results: indexResults,
    };
  }

  /**
   * 计算单个指数的趋势分析数据（支持历史状态继承）
   * @param index 指数信息
   * @param maData 该指数的MA数据（按日期升序，可能包含startDate前一天的数据）
   * @param allIndicesMAData 所有指数的最新MA数据（用于排名）
   * @param prevTrendRecord 最新的历史趋势记录（用于继承状态）
   * @param actualStartDate 实际开始日期（用于过滤结果）
   */
  private async calculateTrendForIndexWithHistory(
    index: Index,
    maData: MovingAverage[],
    allIndicesMAData: Map<string, MovingAverage>,
    prevTrendRecord: TrendAnalysis | null,
    actualStartDate: Date,
  ): Promise<TrendAnalysisResult[]> {
    if (maData.length === 0) {
      return [];
    }

    // 按日期升序排列
    const sortedMAData = [...maData].sort(
      (a, b) =>
        new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    const results: TrendAnalysisResult[] = [];

    // 继承之前的状态
    let previousStatus: 'above' | 'below' | null = null;
    let statusChangeDate: Date | null = null;
    let statusChangePrice: number | null = null;

    if (prevTrendRecord) {
      // 从历史记录继承状态
      previousStatus = prevTrendRecord.trendStatus;
      statusChangeDate = prevTrendRecord.statusChangeDate;
      // 从MA数据中查找状态转变日的收盘价，而不是通过区间涨幅反推
      // 这样可以避免精度误差
      if (statusChangeDate) {
        const statusChangeDateStr = this.formatDate(statusChangeDate);
        const statusChangeMA = sortedMAData.find(
          (ma) => this.formatDate(ma.tradeDate) === statusChangeDateStr,
        );
        if (statusChangeMA) {
          statusChangePrice = Number(statusChangeMA.closePrice);
        } else {
          // 如果sortedMAData中没有状态转变日的数据，从数据库查询
          const statusChangeMAFromDb = await this.maRepository.findOne({
            where: {
              indexId: index.id,
              tradeDate: statusChangeDate,
            },
          });
          if (statusChangeMAFromDb) {
            statusChangePrice = Number(statusChangeMAFromDb.closePrice);
          } else {
            // 如果数据库中也没有，则通过公式反推
            statusChangePrice =
              prevTrendRecord.closePrice /
              (1 + (prevTrendRecord.intervalChangePercent || 0) / 100);
          }
        }
      }

      // 调试日志：输出继承的状态信息
      this.logger.debug(
        `[${index.name}] 继承状态: previousStatus=${previousStatus}, ` +
          `statusChangeDate=${statusChangeDate ? this.formatDate(statusChangeDate) : 'null'}, ` +
          `statusChangePrice=${statusChangePrice}, ` +
          `prevTrendRecord.closePrice=${prevTrendRecord.closePrice}, ` +
          `prevTrendRecord.intervalChangePercent=${prevTrendRecord.intervalChangePercent}`,
      );
    }

    for (let i = 0; i < sortedMAData.length; i++) {
      const current = sortedMAData[i];
      const closePrice = Number(current.closePrice);
      const ma20 = Number(current.ma20);
      const tradeDate = current.tradeDate;

      // 只处理 >= actualStartDate 的数据
      if (new Date(tradeDate) < new Date(actualStartDate)) {
        // 更新状态，但不保存结果
        const trendStatus: 'above' | 'below' =
          closePrice >= ma20 ? 'above' : 'below';

        if (previousStatus === null) {
          statusChangeDate = tradeDate;
          statusChangePrice = closePrice;
        } else if (previousStatus !== trendStatus) {
          statusChangeDate = tradeDate;
          statusChangePrice = closePrice;
        }

        previousStatus = trendStatus;
        continue;
      }

      // 判断趋势状态：现价高于MA20为above，低于为below
      const trendStatus: 'above' | 'below' =
        closePrice >= ma20 ? 'above' : 'below';

      // 保存旧的状态转变价格和日期用于计算区间涨幅
      const oldStatusChangePrice = statusChangePrice;
      const oldStatusChangeDate = statusChangeDate;

      // 检测状态转变或首次计算
      let isStatusChanged = false;
      if (previousStatus === null) {
        // 首次计算，初始化状态转变基准
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
      } else if (previousStatus !== trendStatus) {
        // 状态发生转变，记录转变日期和价格
        // 使用当天的收盘价作为新的基准价格
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
      }

      // 计算涨幅（相对上一交易日）- 使用MA数据中的前一条
      let changePercent = 0;
      if (i > 0) {
        const prevClose = Number(sortedMAData[i - 1].closePrice);
        changePercent = ((closePrice - prevClose) / prevClose) * 100;
      }

      // 计算偏离率
      const deviationRate = ((closePrice - ma20) / ma20) * 100;

      // 计算区间涨幅（从状态转变日到当前）
      // 如果状态在今天发生转变，使用上一次的基准价格计算区间涨幅
      // 否则使用当前的基准价格（即状态转变日的收盘价）
      let intervalChangePercent: number | null = null;
      if (statusChangeDate !== null && statusChangePrice !== null) {
        const basePrice =
          isStatusChanged && oldStatusChangePrice !== null
            ? oldStatusChangePrice
            : statusChangePrice;
        intervalChangePercent = ((closePrice - basePrice) / basePrice) * 100;

        // 调试日志：输出区间涨幅计算详情
        this.logger.debug(
          `[${index.name}] ${this.formatDate(tradeDate)} 区间涨幅计算: ` +
            `closePrice=${closePrice}, basePrice=${basePrice}, ` +
            `isStatusChanged=${isStatusChanged}, ` +
            `oldStatusChangePrice=${oldStatusChangePrice}, ` +
            `statusChangePrice=${statusChangePrice}, ` +
            `intervalChangePercent=${intervalChangePercent}`,
        );
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
        intervalChangePercent:
          intervalChangePercent !== null
            ? Number(intervalChangePercent.toFixed(4))
            : null,
        rank: 0, // 稍后统一计算排名
        rankChange: 0, // 稍后计算
        totalRankCount: allIndicesMAData.size,
        indexType: index.metadata?.type || null,
      });

      previousStatus = trendStatus;
    }

    return results;
  }

  /**
   * 增量趋势分析：只计算最新趋势日期之后的数据
   * 适用于每日定时任务，避免重复计算历史数据
   * @param indices 指数列表
   */
  async performIncrementalAnalysis(indices: Index[]): Promise<{
    total: number;
    skipped: number;
    incrementalCalculated: number;
    fullCalculated: number;
    results: { indexName: string; count: number }[];
  }> {
    // 筛选出需要计算趋势的指数（calcTrend=1 或未设置时默认计算）
    const indicesToCalculate = indices.filter((index) => {
      const calcTrend = index.metadata?.calcTrend;
      return calcTrend === 1 || calcTrend === undefined || calcTrend === null;
    });

    const skippedCount = indices.length - indicesToCalculate.length;

    this.logger.log(
      `开始执行增量趋势分析，共 ${indices.length} 个指数，实际计算 ${indicesToCalculate.length} 个，跳过 ${skippedCount} 个（calcTrend=0）`,
    );

    if (indicesToCalculate.length === 0) {
      this.logger.warn(
        '没有需要计算趋势的指数（请检查 indices.metadata.calcTrend 设置）',
      );
      return {
        total: 0,
        skipped: skippedCount,
        incrementalCalculated: 0,
        fullCalculated: 0,
        results: [],
      };
    }

    let incrementalCalculated = 0;
    let fullCalculated = 0;
    const allNewResults = new Map<string, TrendAnalysisResult[]>();
    const indexResults: { indexName: string; count: number }[] = [];

    // 第一步：收集所有指数的新趋势数据（不计算排名）
    for (const index of indicesToCalculate) {
      try {
        const newResults = await this.calculateIncrementalTrendForIndex(index);

        if (newResults.length === 0) {
          this.logger.debug(`${index.name} 没有新的趋势数据需要计算，跳过`);
          continue;
        }

        allNewResults.set(index.id, newResults);

        if (
          new Date(newResults[0].tradeDate).getTime() ===
          new Date(newResults[newResults.length - 1].tradeDate).getTime()
        ) {
          // 检查是否是全量计算（通过查询是否有历史趋势数据）
          const hasHistory = await this.trendRepository.count({
            where: { indexId: index.id },
            take: 1,
          });
          if (hasHistory === 0) {
            fullCalculated++;
          } else {
            incrementalCalculated++;
          }
        } else {
          incrementalCalculated++;
        }
      } catch (error) {
        this.logger.error(
          `计算 ${index.name} 趋势分析失败: ${error.message}`,
          error.stack,
        );
      }
    }

    if (allNewResults.size === 0) {
      this.logger.log('所有指数的趋势数据都已是最新，无需计算');
      return {
        total: 0,
        skipped: skippedCount,
        incrementalCalculated,
        fullCalculated,
        results: [],
      };
    }

    // 第二步：统一计算所有日期的排名
    const allDates = new Set<string>();
    for (const results of allNewResults.values()) {
      results.forEach((r) => allDates.add(this.formatDate(r.tradeDate)));
    }

    // 第三步：对每个日期计算排名和排序变化
    const finalResults: TrendAnalysisResult[] = [];

    for (const dateStr of Array.from(allDates).sort()) {
      const date = new Date(dateStr);

      // 计算该日期的排名（包含数据库中已有数据和新计算的数据）
      const rankings = await this.calculateRankingsForDateIncremental(
        date,
        allNewResults,
      );

      // 更新每个指数在该日期的排名和排序变化
      for (const [indexId, results] of allNewResults.entries()) {
        const result = results.find(
          (r) => this.formatDate(r.tradeDate) === dateStr,
        );
        if (result) {
          const rank = rankings.get(indexId) || 0;
          // 计算排名变化（查询前一天的排名）
          const rankChange = await this.calculateRankChange(
            indexId,
            rank,
            date,
          );

          finalResults.push({
            ...result,
            rank,
            rankChange,
            totalRankCount: rankings.size,
          });
        }
      }
    }

    // 第四步：保存所有结果
    const savedCount = await this.saveTrendAnalysis(finalResults);

    // 统计结果
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

    // 第五步：填充节假日数据（为休市的指数复制上一交易日数据）
    let filledCount = 0;
    if (minDate && maxDate) {
      filledCount = await this.fillHolidayData(
        indicesToCalculate,
        minDate,
        maxDate,
      );
    }

    this.logger.log(
      `增量趋势分析完成，共 ${savedCount} 条数据，填充节假日数据 ${filledCount} 条，增量: ${incrementalCalculated} 个，全量: ${fullCalculated} 个，跳过: ${skippedCount} 个`,
    );

    return {
      total: savedCount + filledCount,
      skipped: skippedCount,
      incrementalCalculated,
      fullCalculated,
      results: indexResults,
    };
  }

  /**
   * 为指定指数列表执行趋势分析（市场同步后调用）
   * 只计算有新增MA数据的指数，实时更新趋势
   * @param indices 指数列表
   * @param marketName 市场名称（用于日志）
   */
  async performTrendAnalysisForIndices(
    indices: Index[],
    marketName: string = '指定市场',
  ): Promise<{
    total: number;
    calculatedCount: number;
    skippedCount: number;
    results: { indexName: string; count: number }[];
  }> {
    // 筛选出需要计算趋势的指数（calcTrend=1 或未设置时默认计算）
    const indicesToCalculate = indices.filter((index) => {
      const calcTrend = index.metadata?.calcTrend;
      return calcTrend === 1 || calcTrend === undefined || calcTrend === null;
    });

    const skippedCount = indices.length - indicesToCalculate.length;

    this.logger.log(
      `[${marketName}] 开始执行趋势分析，共 ${indices.length} 个指数，实际计算 ${indicesToCalculate.length} 个，跳过 ${skippedCount} 个`,
    );

    if (indicesToCalculate.length === 0) {
      this.logger.log(`[${marketName}] 没有需要计算趋势的指数`);
      return {
        total: 0,
        calculatedCount: 0,
        skippedCount,
        results: [],
      };
    }

    const allNewResults = new Map<string, TrendAnalysisResult[]>();
    const indexResults: { indexName: string; count: number }[] = [];
    let totalNewCount = 0;

    // 第一步：收集所有指数的新趋势数据
    for (const index of indicesToCalculate) {
      try {
        const newResults = await this.calculateIncrementalTrendForIndex(index);

        if (newResults.length === 0) {
          this.logger.debug(
            `[${marketName}] ${index.name} 没有新的趋势数据，跳过`,
          );
          continue;
        }

        allNewResults.set(index.id, newResults);
        totalNewCount += newResults.length;
        this.logger.log(
          `[${marketName}] ${index.name} 新增 ${newResults.length} 条趋势数据`,
        );
      } catch (error) {
        this.logger.error(
          `[${marketName}] 计算 ${index.name} 趋势失败: ${error.message}`,
        );
      }
    }

    if (allNewResults.size === 0) {
      this.logger.log(`[${marketName}] 所有指数趋势数据都已是最新`);
      return {
        total: 0,
        calculatedCount: 0,
        skippedCount,
        results: [],
      };
    }

    // 第二步：统一计算所有日期的排名
    const allDates = new Set<string>();
    for (const results of allNewResults.values()) {
      results.forEach((r) => allDates.add(this.formatDate(r.tradeDate)));
    }

    // 第三步：对每个日期计算排名和排序变化
    const finalResults: TrendAnalysisResult[] = [];

    for (const dateStr of Array.from(allDates).sort()) {
      const date = new Date(dateStr);

      // 计算该日期的排名（包含数据库中已有数据和新计算的数据）
      const rankings = await this.calculateRankingsForDateIncremental(
        date,
        allNewResults,
      );

      // 更新每个指数在该日期的排名和排序变化
      for (const [indexId, results] of allNewResults.entries()) {
        const result = results.find(
          (r) => this.formatDate(r.tradeDate) === dateStr,
        );
        if (result) {
          const rank = rankings.get(indexId) || 0;
          const rankChange = await this.calculateRankChange(
            indexId,
            rank,
            date,
          );

          finalResults.push({
            ...result,
            rank,
            rankChange,
            totalRankCount: rankings.size,
          });
        }
      }
    }

    // 第四步：保存所有结果
    const savedCount = await this.saveTrendAnalysis(finalResults);

    // 统计结果
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
    }

    this.logger.log(
      `[${marketName}] 趋势分析完成，共 ${savedCount} 条数据，涉及 ${allNewResults.size} 个指数`,
    );

    return {
      total: savedCount,
      calculatedCount: allNewResults.size,
      skippedCount:
        indicesToCalculate.length - allNewResults.size + skippedCount,
      results: indexResults,
    };
  }

  /**
   * 为单个指数计算增量趋势数据
   * @returns 新增的趋势数据（未计算排名）
   */
  private async calculateIncrementalTrendForIndex(
    index: Index,
  ): Promise<TrendAnalysisResult[]> {
    // 获取该指数最新的趋势分析日期和最后一条记录（用于状态继承）
    const latestTrendRecord = await this.trendRepository.findOne({
      where: { indexId: index.id },
      order: { tradeDate: 'DESC' },
    });
    const latestTrendDate = latestTrendRecord?.tradeDate;

    // 获取MA数据
    const whereCondition: any = { indexId: index.id };
    if (latestTrendDate) {
      // 从最新趋势日期前1天开始（确保能正确继承状态）
      const startDate = new Date(latestTrendDate);
      startDate.setDate(startDate.getDate() - 1);
      whereCondition.tradeDate = Between(startDate, new Date('2100-12-31'));
    }

    const maData = await this.maRepository.find({
      where: whereCondition,
      order: { tradeDate: 'ASC' },
    });

    if (maData.length === 0) {
      return [];
    }

    // 计算趋势数据
    const results = await this.calculateTrendForIndexIncremental(
      index,
      maData,
      latestTrendRecord,
    );

    if (results.length === 0) {
      return [];
    }

    // 过滤掉已经计算过的日期
    let newResults = results;
    if (latestTrendDate) {
      const latestTrendDateTime = new Date(latestTrendDate).getTime();
      newResults = results.filter(
        (r) => new Date(r.tradeDate).getTime() > latestTrendDateTime,
      );
    }

    return newResults;
  }

  /**
   * 计算单个指数的趋势分析数据（支持增量计算）
   * @param index 指数信息
   * @param maData 该指数的MA数据（按日期升序）
   * @param latestTrendRecord 最新的趋势分析记录（用于继承状态）
   */
  private async calculateTrendForIndexIncremental(
    index: Index,
    maData: MovingAverage[],
    latestTrendRecord: TrendAnalysis | null,
  ): Promise<TrendAnalysisResult[]> {
    if (maData.length === 0) {
      return [];
    }

    // 按日期升序排列
    const sortedMAData = [...maData].sort(
      (a, b) =>
        new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    const results: TrendAnalysisResult[] = [];

    // 继承之前的状态
    let previousStatus: 'above' | 'below' | null = null;
    let statusChangeDate: Date | null = null;
    let statusChangePrice: number | null = null;

    if (latestTrendRecord) {
      // 从最后一条记录继承状态
      previousStatus = latestTrendRecord.trendStatus;
      statusChangeDate = latestTrendRecord.statusChangeDate;
      // 从MA数据中查找状态转变日的收盘价，而不是使用最新记录的收盘价
      if (statusChangeDate) {
        const statusChangeDateStr = this.formatDate(statusChangeDate);
        const statusChangeMA = sortedMAData.find(
          (ma) => this.formatDate(ma.tradeDate) === statusChangeDateStr,
        );
        if (statusChangeMA) {
          statusChangePrice = Number(statusChangeMA.closePrice);
        } else {
          // 如果sortedMAData中没有状态转变日的数据，从数据库查询
          const statusChangeMAFromDb = await this.maRepository.findOne({
            where: {
              indexId: index.id,
              tradeDate: statusChangeDate,
            },
          });
          if (statusChangeMAFromDb) {
            statusChangePrice = Number(statusChangeMAFromDb.closePrice);
          } else {
            // 如果数据库中也没有，则通过公式反推
            statusChangePrice =
              latestTrendRecord.closePrice /
              (1 + (latestTrendRecord.intervalChangePercent || 0) / 100);
          }
        }
      }
    }

    for (let i = 0; i < sortedMAData.length; i++) {
      const current = sortedMAData[i];
      const closePrice = Number(current.closePrice);
      const ma20 = Number(current.ma20);
      const tradeDate = current.tradeDate;

      // 判断趋势状态：现价高于MA20为above，低于为below
      const trendStatus: 'above' | 'below' =
        closePrice >= ma20 ? 'above' : 'below';

      // 保存旧的状态转变价格和日期用于计算区间涨幅
      const oldStatusChangePrice = statusChangePrice;
      const oldStatusChangeDate = statusChangeDate;

      // 检测状态转变或首次计算
      let isStatusChanged = false;
      if (previousStatus === null) {
        // 首次计算，初始化状态转变基准
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
      } else if (previousStatus !== trendStatus) {
        // 状态发生转变，记录转变日期和价格
        // 使用当天的收盘价作为新的基准价格
        statusChangeDate = tradeDate;
        statusChangePrice = closePrice;
        isStatusChanged = true;
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
      // 如果状态在今天发生转变，使用上一次的基准价格计算区间涨幅
      // 否则使用当前的基准价格（即状态转变日的收盘价）
      let intervalChangePercent: number | null = null;
      if (statusChangeDate !== null && statusChangePrice !== null) {
        const basePrice =
          isStatusChanged && oldStatusChangePrice !== null
            ? oldStatusChangePrice
            : statusChangePrice;
        intervalChangePercent = ((closePrice - basePrice) / basePrice) * 100;
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
        intervalChangePercent:
          intervalChangePercent !== null
            ? Number(intervalChangePercent.toFixed(4))
            : null,
        rank: 0, // 稍后统一计算排名
        rankChange: 0, // 稍后计算
        totalRankCount: 0, // 稍后计算
        indexType: index.metadata?.type || null,
      });

      previousStatus = trendStatus;
    }

    return results;
  }

  /**
   * 计算指定日期的所有指数排名（增量计算版本）
   * 合并数据库中已有数据和新计算的数据
   */
  private async calculateRankingsForDateIncremental(
    tradeDate: Date,
    newResults: Map<string, TrendAnalysisResult[]>,
  ): Promise<Map<string, number>> {
    // 收集该日期所有指数的偏离率
    const deviations: { indexId: string; deviationRate: number }[] = [];

    // 1. 从数据库中查询该日期的所有趋势数据
    const trendData = await this.trendRepository.find({
      where: { tradeDate },
    });

    for (const item of trendData) {
      // 如果该指数在新计算结果中，使用新数据；否则使用数据库数据
      const newResult = newResults
        .get(item.indexId)
        ?.find(
          (r) => this.formatDate(r.tradeDate) === this.formatDate(tradeDate),
        );
      if (newResult) {
        if (newResult.deviationRate !== null) {
          deviations.push({
            indexId: item.indexId,
            deviationRate: newResult.deviationRate,
          });
        }
      } else {
        if (item.deviationRate !== null) {
          deviations.push({
            indexId: item.indexId,
            deviationRate: item.deviationRate,
          });
        }
      }
    }

    // 2. 添加新计算但不在数据库中的数据
    for (const [indexId, results] of newResults.entries()) {
      const existingInDb = trendData.some((t) => t.indexId === indexId);
      if (!existingInDb) {
        const result = results.find(
          (r) => this.formatDate(r.tradeDate) === this.formatDate(tradeDate),
        );
        if (result && result.deviationRate !== null) {
          deviations.push({
            indexId,
            deviationRate: result.deviationRate,
          });
        }
      }
    }

    // 按偏离率降序排序
    deviations.sort((a, b) => b.deviationRate - a.deviationRate);

    // 生成排名映射
    const rankings = new Map<string, number>();
    deviations.forEach((item, index) => {
      rankings.set(item.indexId, index + 1);
    });

    return rankings;
  }
}
