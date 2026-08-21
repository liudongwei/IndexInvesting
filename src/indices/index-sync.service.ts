import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IndicesService } from './indices.service';
import { IndexDataService, KlineData } from './index-data.service';
import { EastmoneyDataService } from './eastmoney-data.service';
import { MovingAveragesService } from '../moving-averages/moving-averages.service';
import { TrendAnalysisService } from '../trend-analysis/trend-analysis.service';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';

@Injectable()
export class IndexSyncService {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(
    private readonly indicesService: IndicesService,
    private readonly indexDataService: IndexDataService,
    private readonly eastmoneyDataService: EastmoneyDataService,
    @Inject(forwardRef(() => MovingAveragesService))
    private readonly maService: MovingAveragesService,
    @Inject(forwardRef(() => TrendAnalysisService))
    private readonly trendService: TrendAnalysisService,
  ) {}

  /**
   * 根据 metadata 智能同步历史数据
   * 根据 sync_mode 判断同步方式，根据 firstTradingDay 确定起始年份
   * @param index 指数对象
   * @param forceStartYear 强制指定开始年份（可选，优先于 metadata 中的 firstTradingDay）
   * @param endYear 结束年份，默认为当前年份
   */
  async syncIndexDataByMetadata(
    index: Index,
    forceStartYear?: number,
    endYear?: number,
  ): Promise<{
    success: boolean;
    message: string;
    total: number;
    years: { year: number; count: number; status: string }[];
  }> {
    const metadata = index.metadata || {};
    const syncMode = metadata.sync_mode;

    // 检查同步模式
    if (syncMode === 'json') {
      return {
        success: false,
        message: `指数 ${index.name} 的 sync_mode 为 json，暂不支持自动同步（请手动导入 JSON 文件）`,
        total: 0,
        years: [],
      };
    }

    if (syncMode !== 'api') {
      return {
        success: false,
        message: `指数 ${index.name} 的 sync_mode 为 ${syncMode || '未设置'}，无法自动同步`,
        total: 0,
        years: [],
      };
    }

    // 确定起始年份
    let startYear: number;
    if (forceStartYear !== undefined) {
      startYear = forceStartYear;
    } else if (metadata.firstTradingDay) {
      startYear = new Date(metadata.firstTradingDay).getFullYear();
    } else {
      // 默认从 2005 年开始
      startYear = 2005;
    }

    const targetEndYear = endYear || new Date().getFullYear();
    const years: { year: number; count: number; status: string }[] = [];
    let totalCount = 0;

    this.logger.log(
      `开始智能同步 ${index.name} (${index.code}) 数据: ${startYear} 至 ${targetEndYear} (sync_mode: ${syncMode})`,
    );

    for (let year = startYear; year <= targetEndYear; year++) {
      try {
        // 获取该年数据
        const yearData = await this.indexDataService.getTencentKlineByDateRange(
          index.code,
          `${year}-01-01`,
          `${year}-12-31`,
          1000,
        );

        if (yearData.length === 0) {
          this.logger.warn(`${year} 年无数据`);
          years.push({ year, count: 0, status: 'no_data' });
          continue;
        }

        // 转换并保存数据
        const historyData = this.convertToHistoryData(yearData, 'tencent');
        const savedCount = await this.indicesService.saveHistoryData(
          index.id,
          historyData,
        );

        years.push({ year, count: savedCount, status: 'success' });
        totalCount += savedCount;

        this.logger.log(
          `${index.name} ${year} 年同步完成: ${savedCount} 条数据`,
        );

        // 添加延迟，避免请求过快
        if (year < targetEndYear) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (error) {
        this.logger.error(`同步 ${year} 年数据失败: ${error.message}`);
        years.push({ year, count: 0, status: `error: ${error.message}` });
      }
    }

    // 更新最后同步日期
    if (totalCount > 0) {
      const lastYear = years.filter((y) => y.count > 0).pop();
      if (lastYear) {
        await this.indicesService.updateLastSyncDate(
          index.id,
          new Date(`${lastYear.year}-12-31`),
          totalCount,
        );
      }
    }

    const successCount = years.filter((y) => y.status === 'success').length;
    const message = `${index.name} 智能同步完成，成功 ${successCount}/${years.length} 年，共 ${totalCount} 条数据`;
    this.logger.log(message);

    return {
      success: successCount > 0,
      message,
      total: totalCount,
      years,
    };
  }

  /**
   * 批量智能同步所有符合条件的指数
   * @param onlyActive 是否只同步 isActive=true 的指数
   * @param endYear 结束年份
   */
  async bulkSyncByMetadata(
    onlyActive: boolean = true,
    endYear?: number,
  ): Promise<{
    total: number;
    results: {
      name: string;
      officialCode: string;
      success: boolean;
      total: number;
      years: { year: number; count: number; status: string }[];
    }[];
  }> {
    const indices = await this.indicesService.findAll();
    const targetIndices = onlyActive
      ? indices.filter((i) => i.isActive)
      : indices;

    // 筛选出 sync_mode=api 的指数，并按 createdAt 正序排序（先创建的优先）
    const apiIndices = targetIndices
      .filter((i) => i.metadata?.sync_mode === 'api')
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateA - dateB; // 正序：先创建的先同步
      });

    this.logger.log(
      `开始批量智能同步，共 ${apiIndices.length} 个指数 (sync_mode=api)，按创建时间正序执行`,
    );

    const results: {
      name: string;
      officialCode: string;
      success: boolean;
      total: number;
      years: { year: number; count: number; status: string }[];
    }[] = [];
    let totalCount = 0;

    for (const index of apiIndices) {
      try {
        const result = await this.syncIndexDataByMetadata(
          index,
          undefined,
          endYear,
        );
        results.push({
          name: index.name,
          officialCode: index.officialCode || index.code,
          success: result.success,
          total: result.total,
          years: result.years,
        });
        totalCount += result.total;

        // 添加延迟，避免请求过快
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        this.logger.error(`同步 ${index.name} 失败: ${error.message}`);
        results.push({
          name: index.name,
          officialCode: index.officialCode || index.code,
          success: false,
          total: 0,
          years: [],
        });
      }
    }

    this.logger.log(`批量智能同步完成，共新增 ${totalCount} 条数据`);
    return { total: totalCount, results };
  }

  /**
   * 按年递增同步历史数据（首次全量同步使用）
   * @param index 指数对象
   * @param startYear 开始年份，如 2005
   * @param endYear 结束年份，默认为当前年份
   */
  async syncIndexDataByYear(
    index: Index,
    startYear: number,
    endYear?: number,
  ): Promise<{ total: number; years: { year: number; count: number }[] }> {
    const targetEndYear = endYear || new Date().getFullYear();
    const years: { year: number; count: number }[] = [];
    let totalCount = 0;

    this.logger.log(
      `开始按年同步 ${index.name} (${index.code}) 数据: ${startYear} 至 ${targetEndYear}`,
    );

    for (let year = startYear; year <= targetEndYear; year++) {
      try {
        // 获取该年数据
        const yearData = await this.indexDataService.getTencentKlineByDateRange(
          index.code,
          `${year}-01-01`,
          `${year}-12-31`,
          1000,
        );

        if (yearData.length === 0) {
          this.logger.warn(`${year} 年无数据`);
          years.push({ year, count: 0 });
          continue;
        }

        // 转换并保存数据
        const historyData = this.convertToHistoryData(yearData, 'tencent');
        const savedCount = await this.indicesService.saveHistoryData(
          index.id,
          historyData,
        );

        years.push({ year, count: savedCount });
        totalCount += savedCount;

        this.logger.log(
          `${index.name} ${year} 年同步完成: ${savedCount} 条数据`,
        );

        // 添加延迟，避免请求过快
        if (year < targetEndYear) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (error) {
        this.logger.error(`同步 ${year} 年数据失败: ${error.message}`);
        years.push({ year, count: 0 });
      }
    }

    // 更新最后同步日期
    if (totalCount > 0) {
      const lastYear = years.filter((y) => y.count > 0).pop();
      if (lastYear) {
        await this.indicesService.updateLastSyncDate(
          index.id,
          new Date(`${lastYear.year}-12-31`),
          totalCount,
        );
      }
    }

    this.logger.log(`${index.name} 按年同步完成，共 ${totalCount} 条数据`);

    return { total: totalCount, years };
  }

  /**
   * 带重试机制的同步
   * @param index 指数对象
   * @param maxRetries 最大重试次数，默认3次
   * @param retryDelay 重试间隔（毫秒），默认2000ms
   */
  async syncIndexDataWithRetry(
    index: Index,
    maxRetries: number = 3,
    retryDelay: number = 2000,
  ): Promise<{
    success: boolean;
    count: number;
    attempts: number;
    error?: string;
  }> {
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `[${index.name}] 第 ${attempt}/${maxRetries} 次同步尝试...`,
        );
        const count = await this.syncIndexData(index);

        // 数据校验：检查最后一条数据是否有效
        const latestHistory = await this.indicesService.getLatestHistory(
          index.id,
        );
        if (latestHistory && latestHistory.closePrice === 0) {
          throw new Error('同步数据异常：收盘价为0');
        }

        return {
          success: true,
          count,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error.message;
        this.logger.warn(
          `[${index.name}] 第 ${attempt} 次同步失败: ${error.message}`,
        );

        if (attempt < maxRetries) {
          this.logger.log(`[${index.name}] ${retryDelay}ms 后重试...`);
          await new Promise((r) => setTimeout(r, retryDelay));
        }
      }
    }

    return {
      success: false,
      count: 0,
      attempts: maxRetries,
      error: lastError,
    };
  }

  /**
   * 按日期范围重新同步数据
   * 用于修复指定日期范围内的数据
   * 根据 metadata.data_source 选择数据源：
   * - 'tencent': 腾讯API（默认）
   * - 'sina': 新浪API
   * - 'easymoney': 东财API
   * - 其他/未设置: 腾讯API
   * @param index 指数对象
   * @param startDate 开始日期，格式 YYYY-MM-DD
   * @param endDate 结束日期，格式 YYYY-MM-DD
   */
  async resyncByDateRange(
    index: Index,
    startDate: string,
    endDate: string,
  ): Promise<{
    success: boolean;
    message: string;
    count: number;
    dateRange: { start: string; end: string };
  }> {
    this.logger.log(
      `[${index.name}] 开始重新同步数据: ${startDate} 至 ${endDate}`,
    );

    try {
      // 获取数据源配置
      const dataSource = index.metadata?.data_source || 'tencent';
      let data: KlineData[];
      let source: string;

      // 根据日期范围计算合理的limit（考虑交易日约250天/年，加20%缓冲）
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      const tradingDays = Math.max(Math.ceil(daysDiff * 0.7), 10); // 按70%交易日估算，最少10条
      const limit = Math.ceil(tradingDays * 1.2); // 加20%缓冲

      if (dataSource === 'easymoney') {
        // 东财API - 获取足够多的数据，然后过滤日期范围
        this.logger.log(
          `[${index.name}] 使用东财API重新同步，计算limit: ${limit}`,
        );
        const result = await this.eastmoneyDataService.getKlineFromApi(
          index.code,
          limit,
          endDate.replace(/-/g, ''), // 转换为YYYYMMDD格式
        );
        if (!result.success) {
          throw new Error(`东财API获取失败: ${result.message}`);
        }
        // 过滤日期范围
        data = result.data
          .map((item) => ({
            date: item.tradeDate.toISOString().split('T')[0],
            open: item.openPrice,
            high: item.highPrice,
            low: item.lowPrice,
            close: item.closePrice,
            volume: item.volume,
            amount: item.turnover,
          }))
          .filter((item) => item.date >= startDate && item.date <= endDate);
        source = 'easymoney';
      } else if (dataSource === 'sina') {
        // 新浪API - 获取数据后过滤日期范围
        this.logger.log(
          `[${index.name}] 使用新浪API重新同步，计算limit: ${limit}`,
        );
        const sinaData = await this.indexDataService.getSinaKline(
          index.code,
          limit,
        );
        data = sinaData.filter(
          (item) => item.date >= startDate && item.date <= endDate,
        );
        source = 'sina';
      } else {
        // 腾讯API（默认）
        this.logger.log(
          `[${index.name}] 使用腾讯API重新同步，计算limit: ${limit}`,
        );
        data = await this.indexDataService.getTencentKlineByDateRange(
          index.code,
          startDate,
          endDate,
          limit,
        );
        source = 'tencent';
      }

      if (data.length === 0) {
        return {
          success: true,
          message: '指定日期范围内无数据',
          count: 0,
          dateRange: { start: startDate, end: endDate },
        };
      }

      this.logger.log(
        `[${index.name}] 从${source} API获取到 ${data.length} 条数据`,
      );

      // 2. 转换数据
      const historyData = this.convertToHistoryData(data, source);

      // 3. 删除该日期范围内的旧数据
      const deletedCount = await this.indicesService.deleteHistoryByDateRange(
        index.id,
        new Date(startDate),
        new Date(endDate),
      );
      this.logger.log(`[${index.name}] 删除旧数据: ${deletedCount} 条`);

      // 4. 保存新数据
      const savedCount = await this.indicesService.saveHistoryData(
        index.id,
        historyData,
      );

      this.logger.log(
        `[${index.name}] 重新同步完成，更新 ${savedCount} 条数据`,
      );

      return {
        success: true,
        message: `重新同步完成，删除 ${deletedCount} 条旧数据，新增 ${savedCount} 条数据`,
        count: savedCount,
        dateRange: { start: startDate, end: endDate },
      };
    } catch (error) {
      this.logger.error(`[${index.name}] 重新同步失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量按日期范围重新同步所有指数
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @param onlyActive 是否只同步启用的指数
   */
  async bulkResyncByDateRange(
    startDate: string,
    endDate: string,
    onlyActive: boolean = true,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: {
      name: string;
      code: string;
      success: boolean;
      count: number;
      message: string;
    }[];
  }> {
    const indices = await this.indicesService.findAll();
    const targetIndices = onlyActive
      ? indices.filter((i) => i.isActive)
      : indices;

    this.logger.log(
      `开始批量重新同步，日期范围: ${startDate} 至 ${endDate}，共 ${targetIndices.length} 个指数`,
    );

    const results: {
      name: string;
      code: string;
      success: boolean;
      count: number;
      message: string;
    }[] = [];
    let totalCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const index of targetIndices) {
      try {
        const result = await this.resyncByDateRange(index, startDate, endDate);
        results.push({
          name: index.name,
          code: index.code,
          success: result.success,
          count: result.count,
          message: result.message,
        });
        totalCount += result.count;
        successCount++;

        // 添加延迟，避免请求过快
        await new Promise((r) => setTimeout(r, 500));
      } catch (error) {
        this.logger.error(`[${index.name}] 重新同步失败: ${error.message}`);
        results.push({
          name: index.name,
          code: index.code,
          success: false,
          count: 0,
          message: error.message,
        });
        failedCount++;
      }
    }

    this.logger.log(
      `批量重新同步完成，成功: ${successCount}，失败: ${failedCount}，共更新: ${totalCount} 条数据`,
    );

    return {
      total: totalCount,
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  /**
   * 同步单个指数数据
   * 首次全量同步，后续增量同步
   * 根据 index.metadata.data_source 选择数据源：
   * - 'tencent': 腾讯API（默认）
   * - 'sina': 新浪API
   * - 'easymoney': 东财API
   * - 其他/未设置: 腾讯API优先，失败则尝试新浪
   */
  async syncIndexData(index: Index): Promise<number> {
    this.logger.log(`开始同步指数: ${index.name} (${index.code})`);

    try {
      // 获取数据源配置
      const dataSource = index.metadata?.data_source || 'tencent';

      // 获取最新数据日期
      const latestDate = await this.indicesService.getLatestHistoryDate(
        index.id,
      );

      // 计算需要获取的数据条数
      let limit: number;
      if (!latestDate) {
        // 首次同步，获取所有历史数据（约5年）
        limit = 1200;
        this.logger.log(`首次同步，获取最近 ${limit} 条数据`);
      } else {
        // 增量同步，获取最近30条（覆盖可能缺失的数据）
        limit = 30;
        const dateStr =
          latestDate instanceof Date
            ? latestDate.toISOString().split('T')[0]
            : String(latestDate).split('T')[0];
        this.logger.log(`增量同步，上次同步日期: ${dateStr}`);
      }

      // 根据数据源获取数据
      let data: KlineData[];
      let source: string;

      if (dataSource === 'easymoney') {
        // 东财API
        this.logger.log(`使用东财API同步: ${index.name}`);
        const result = await this.eastmoneyDataService.getKlineFromApi(
          index.code,
          limit,
        );
        if (!result.success) {
          throw new Error(`东财API获取失败: ${result.message}`);
        }
        // 转换东财数据格式为KlineData
        data = result.data.map((item) => ({
          date: item.tradeDate.toISOString().split('T')[0],
          open: item.openPrice,
          high: item.highPrice,
          low: item.lowPrice,
          close: item.closePrice,
          volume: item.volume,
          amount: item.turnover,
        }));
        source = 'easymoney';
      } else if (dataSource === 'sina') {
        // 新浪API
        this.logger.log(`使用新浪API同步: ${index.name}`);
        data = await this.indexDataService.getSinaKline(index.code, limit);
        source = 'sina';
      } else {
        // 腾讯API（默认），失败则尝试新浪
        this.logger.log(`使用腾讯API同步: ${index.name}`);
        const result = await this.indexDataService.getIndexData(
          index.code,
          limit,
        );
        data = result.data;
        source = result.source;
      }

      if (data.length === 0) {
        this.logger.warn(`未获取到数据: ${index.code}`);
        return 0;
      }

      // 过滤新数据（如果是增量同步）
      let newData = data;
      this.logger.log(
        `[${index.name}] 原始数据条数: ${data.length}, 最后同步日期: ${latestDate ? (latestDate instanceof Date ? latestDate.toISOString().split('T')[0] : String(latestDate).split('T')[0]) : 'null'}`,
      );
      this.logger.debug(
        `[${index.name}] 原始数据日期列表: ${data.map((item) => item.date).join(', ')}`,
      );

      if (latestDate) {
        const latestDateStr =
          latestDate instanceof Date
            ? latestDate.toISOString().split('T')[0]
            : String(latestDate).split('T')[0];
        newData = data.filter((item) => item.date > latestDateStr);
        this.logger.log(
          `[${index.name}] 增量同步过滤后数据条数: ${newData.length} (>${latestDateStr})`,
        );
      }

      // 贵金属特殊处理：如果在结算休市后不久获取数据，过滤掉当天的不完整数据
      if (this.isPreciousMetal(index)) {
        const dateToFilter = this.getPreciousMetalDateToFilter();
        this.logger.log(
          `[${index.name}] 贵金属日期过滤标记: ${dateToFilter || 'null'}`,
        );
        if (dateToFilter) {
          const beforeFilterCount = newData.length;
          newData = newData.filter((item) => item.date !== dateToFilter);
          const filteredCount = beforeFilterCount - newData.length;
          if (filteredCount > 0) {
            this.logger.log(
              `[${index.name}] 贵金属数据过滤：跳过 ${dateToFilter} 的 ${filteredCount} 条不完整数据（结算休市后刚开盘）`,
            );
          }
        }
      }

      this.logger.log(`[${index.name}] 最终新数据条数: ${newData.length}`);
      this.logger.debug(
        `[${index.name}] 最终新数据日期列表: ${newData.map((item) => item.date).join(', ')}`,
      );

      if (newData.length === 0) {
        this.logger.log(`没有新数据需要同步`);
        return 0;
      }

      // 转换并保存数据
      const historyData = this.convertToHistoryData(newData, source);
      const savedCount = await this.indicesService.saveHistoryData(
        index.id,
        historyData,
      );

      // 更新最后同步日期（使用实际保存的数据的最后日期）
      const lastTradeDate = new Date(newData[newData.length - 1].date);
      await this.indicesService.updateLastSyncDate(
        index.id,
        lastTradeDate,
        savedCount,
      );

      this.logger.log(
        `同步完成: ${index.name}, 新增/更新 ${savedCount} 条数据, 数据源: ${source}`,
      );
      return savedCount;
    } catch (error) {
      this.logger.error(`同步失败: ${index.name} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 转换K线数据为历史数据实体
   */
  private convertToHistoryData(
    data: KlineData[],
    source: string,
  ): Partial<IndexHistory>[] {
    return data.map((item, index, arr) => {
      // 计算涨跌幅
      let changePercent: number | null = null;
      let changeAmount: number | null = null;

      if (index > 0 && item.close !== null && arr[index - 1].close !== null) {
        const prevClose = arr[index - 1].close!;
        changeAmount = item.close! - prevClose;
        changePercent = (changeAmount / prevClose) * 100;
      }

      return {
        tradeDate: new Date(item.date),
        openPrice: item.open ?? 0,
        highPrice: item.high ?? 0,
        lowPrice: item.low ?? 0,
        closePrice: item.close ?? 0,
        volume: item.volume,
        turnover: item.amount,
        changePercent,
        changeAmount,
        dataSource: source,
      };
    });
  }

  /**
   * 同步所有启用的指数
   */
  async syncAllActiveIndices(): Promise<{
    total: number;
    results: { name: string; count: number }[];
  }> {
    const indices = await this.indicesService.findAll();
    const activeIndices = indices.filter((i) => i.isActive);

    this.logger.log(`开始批量同步，共 ${activeIndices.length} 个指数`);

    const results: { name: string; count: number }[] = [];
    let totalCount = 0;

    for (const index of activeIndices) {
      try {
        const count = await this.syncIndexData(index);
        results.push({ name: index.name, count });
        totalCount += count;

        // 添加延迟，避免请求过快
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        this.logger.error(`同步 ${index.name} 失败: ${error.message}`);
        results.push({ name: index.name, count: 0 });
      }
    }

    this.logger.log(`批量同步完成，共新增 ${totalCount} 条数据`);
    return { total: totalCount, results };
  }

  /**
   * 判断指数是否属于A股
   */
  private isChinaAStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const officialCode = index.officialCode || '';
    // A股：上交所、深交所，或代码以 sh/sz 开头
    // 也包括中证2000(932000)和北证50(899050)等特殊指数
    return (
      exchange.includes('上交所') ||
      exchange.includes('深交所') ||
      code.startsWith('sh') ||
      code.startsWith('sz') ||
      officialCode.includes('.SH') ||
      officialCode.includes('.SZ') ||
      officialCode === '932000' || // 中证2000
      officialCode === '899050' // 北证50
    );
  }

  /**
   * 判断指数是否属于港股
   */
  private isHongKongStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    // 港股：港交所、香港，或代码以 hk 开头
    return (
      exchange.includes('港交所') ||
      exchange.includes('香港') ||
      code.startsWith('hk')
    );
  }

  /**
   * 判断指数是否属于日韩市场
   * 日本：14:30收盘（北京时间），韩国：14:30收盘（北京时间）
   */
  private isJapanKoreaStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const name = index.name || '';
    return (
      exchange.includes('日本') ||
      exchange.includes('东京') ||
      exchange.includes('韩国') ||
      exchange.includes('首尔') ||
      name.includes('日经') ||
      name.includes('韩国') ||
      name.includes('KOSPI') ||
      name.includes('N225')
    );
  }

  /**
   * 判断指数是否属于台湾市场
   * 台湾：13:30收盘（北京时间）
   */
  private isTaiwanStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const name = index.name || '';
    return (
      exchange.includes('台湾') ||
      exchange.includes('台股') ||
      name.includes('台湾') ||
      name.includes('台股') ||
      name.includes('加权') ||
      code.includes('TWII')
    );
  }

  /**
   * 判断指数是否属于美股
   * 美股：夏令时04:00/冬令时05:00收盘（北京时间）
   */
  private isUSStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const name = index.name || '';
    return (
      exchange.includes('美国') ||
      exchange.includes('纽约') ||
      exchange.includes('纳斯达克') ||
      name.includes('标普') ||
      name.includes('纳指') ||
      name.includes('道琼斯') ||
      name.includes('SPX') ||
      name.includes('NDX') ||
      name.includes('DJI') ||
      code.includes('SPX') ||
      code.includes('NDX')
    );
  }

  /**
   * 判断指数是否属于贵金属
   * 贵金属：24小时交易，单独处理
   */
  private isPreciousMetal(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const name = index.name || '';
    return (
      exchange.includes('贵金属') ||
      exchange.includes('黄金') ||
      exchange.includes('白银') ||
      name.includes('黄金') ||
      name.includes('白银') ||
      name.includes('XAU') ||
      name.includes('XAG') ||
      code.includes('XAU') ||
      code.includes('XAG')
    );
  }

  /**
   * 判断指定日期是否为夏令时
   * 夏令时：每年3月第二个星期日至11月第一个星期日
   * @param date 要判断的日期，默认为当前日期
   * @returns 是否为夏令时
   */
  private isDaylightSavingTime(date: Date = new Date()): boolean {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    const dayOfWeek = date.getDay(); // 0=周日, 1=周一...

    // 3月第二个星期日开始
    const marchSecondSunday = this.getNthWeekdayOfMonth(year, 3, 0, 2);
    // 11月第一个星期日结束
    const novemberFirstSunday = this.getNthWeekdayOfMonth(year, 11, 0, 1);

    const currentDate = new Date(year, month - 1, day);

    return (
      currentDate >= marchSecondSunday && currentDate < novemberFirstSunday
    );
  }

  /**
   * 获取某月第N个星期几的日期
   * @param year 年份
   * @param month 月份 (1-12)
   * @param dayOfWeek 星期几 (0=周日, 1=周一...)
   * @param n 第几个 (1, 2, 3...)
   * @returns 日期对象
   */
  private getNthWeekdayOfMonth(
    year: number,
    month: number,
    dayOfWeek: number,
    n: number,
  ): Date {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const firstDayOfWeek = firstDayOfMonth.getDay();

    // 计算第一个目标星期几的日期
    let daysUntilTarget = (dayOfWeek - firstDayOfWeek + 7) % 7;
    const firstTargetDate = 1 + daysUntilTarget;

    // 计算第N个目标星期几的日期
    const targetDate = firstTargetDate + (n - 1) * 7;

    return new Date(year, month - 1, targetDate);
  }

  /**
   * 判断当前时间是否在贵金属结算休市期间
   * 夏令时：每天05:00-06:00休市
   * 冬令时：每天06:00-07:00休市
   * @returns 是否在休市期间
   */
  private isInPreciousMetalSettlementTime(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const isDST = this.isDaylightSavingTime(now);

    if (isDST) {
      // 夏令时：05:00-06:00休市
      return hour === 5;
    } else {
      // 冬令时：06:00-07:00休市
      return hour === 6;
    }
  }

  /**
   * 获取贵金属数据应该过滤的日期
   * 贵金属是23小时连续交易（每天1小时结算休市），当天数据始终不完整
   * 无论什么时间获取数据，都应该过滤掉当天的数据，只保存到前一交易日
   * @returns 需要过滤掉的日期字符串 (YYYY-MM-DD)，如果没有则返回null
   */
  private getPreciousMetalDateToFilter(): string | null {
    const now = new Date();

    // 贵金属23小时连续交易，当天数据始终还在交易中，不完整
    // 应该等到明天再获取今天的完整数据
    // 所以无论何时获取数据，都过滤掉当天的数据
    // 使用本地时区格式化日期，避免UTC转换导致的问题
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 判断指数是否属于欧洲市场
   * 欧洲：夏令时23:30/冬令时00:30收盘（北京时间）
   */
  private isEuropeStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    const name = index.name || '';
    return (
      exchange.includes('欧洲') ||
      exchange.includes('英国') ||
      exchange.includes('伦敦') ||
      exchange.includes('德国') ||
      exchange.includes('法国') ||
      name.includes('欧洲') ||
      name.includes('富时') ||
      name.includes('DAX') ||
      name.includes('CAC')
    );
  }

  /**
   * 同步指定市场的指数
   * @param marketFilter 市场过滤函数
   * @param marketName 市场名称（用于日志）
   * @param excludeFilter 排除其他市场的过滤函数（可选，用于避免市场分类重叠）
   */
  async syncIndicesByMarket(
    marketFilter: (index: Index) => boolean,
    marketName: string,
    excludeFilter?: (index: Index) => boolean,
  ): Promise<{ total: number; results: { name: string; count: number }[] }> {
    const indices = await this.indicesService.findAll();
    const targetIndices = indices.filter(
      (i) =>
        i.isActive && marketFilter(i) && (!excludeFilter || !excludeFilter(i)),
    );

    this.logger.log(`开始同步${marketName}，共 ${targetIndices.length} 个指数`);

    const results: { name: string; count: number }[] = [];
    let totalCount = 0;

    for (const index of targetIndices) {
      try {
        const count = await this.syncIndexData(index);
        results.push({ name: index.name, count });
        totalCount += count;

        // 添加延迟，避免请求过快
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        this.logger.error(`同步 ${index.name} 失败: ${error.message}`);
        results.push({ name: index.name, count: 0 });
      }
    }

    this.logger.log(`${marketName}同步完成，共新增 ${totalCount} 条数据`);

    // 同步完成后，计算该市场的MA和趋势数据
    if (totalCount > 0 && targetIndices.length > 0) {
      try {
        // 1. 计算MA
        this.logger.log(`[${marketName}] 开始计算移动平均线...`);
        const maResult = await this.maService.calculateMAForIndices(
          targetIndices,
          marketName,
        );
        this.logger.log(`[${marketName}] MA计算完成: ${maResult.total} 条数据`);

        // 2. 计算趋势分析
        this.logger.log(`[${marketName}] 开始计算趋势分析...`);
        const trendResult =
          await this.trendService.performTrendAnalysisForIndices(
            targetIndices,
            marketName,
          );
        this.logger.log(
          `[${marketName}] 趋势分析完成: ${trendResult.total} 条数据`,
        );
      } catch (error) {
        this.logger.error(`[${marketName}] MA或趋势计算失败: ${error.message}`);
      }
    }

    return { total: totalCount, results };
  }

  /**
   * 定时任务：每天下午2点30分同步早盘收盘市场数据
   * 只同步收盘时间早于A股的市场（台湾、日韩），避免与个股同步重复
   * A股和港股由各自的独立Cron任务处理
   */
  // @Cron('35 14 * * *')
  async handleTWandJapanKoreaSync() {
    this.logger.log('执行早盘市场定时同步任务（台湾、日韩）...');
    const results: { market: string; total: number }[] = [];

    try {
      // 1. 台湾市场（13:30收盘）- 排除日韩市场（避免名称重叠）
      const taiwanResult = await this.syncIndicesByMarket(
        (index) => this.isTaiwanStock(index),
        '台湾指数',
        (index) => this.isJapanKoreaStock(index), // 排除日韩
      );
      results.push({ market: '台湾', total: taiwanResult.total });
      await new Promise((r) => setTimeout(r, 1000));

      // 2. 日韩市场（14:30收盘）- 排除台湾市场（避免名称重叠）
      const japanKoreaResult = await this.syncIndicesByMarket(
        (index) => this.isJapanKoreaStock(index),
        '日韩指数',
        (index) => this.isTaiwanStock(index), // 排除台湾
      );
      results.push({ market: '日韩', total: japanKoreaResult.total });

      // 计算总同步数量
      const totalCount = results.reduce((sum, r) => sum + r.total, 0);
      this.logger.log(
        `早盘市场定时同步完成: ${totalCount} 条数据。详情: ${results.map((r) => `${r.market}:${r.total}`).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(`早盘市场定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：A股收盘后同步（15:05）
   * A股交易时间 9:30-15:00，延迟5分钟后同步
   */
  @Cron('5 15 * * *')
  async handleAStockSync() {
    this.logger.log('A股交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isChinaAStock(index),
        'A股指数',
      );
      this.logger.log(`A股定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`A股定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：港股收盘后同步（16:05）
   * 港股交易时间 9:30-16:00，延迟5分钟后同步
   */
  @Cron('15 16 * * *')
  async handleHKStockSync() {
    this.logger.log('港股交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isHongKongStock(index),
        '港股指数',
      );
      this.logger.log(`港股定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`港股定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：台湾市场收盘后同步（13:35）
   * 台湾交易时间 9:00-13:30，延迟5分钟后同步
   * 收盘时间早于A股，按A股时间统一处理
   */
  @Cron('35 13 * * *')
  async handleTaiwanStockSync() {
    this.logger.log('台湾市场交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isTaiwanStock(index),
        '台湾指数',
      );
      this.logger.log(`台湾定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`台湾定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：日韩市场收盘后同步（14:35）
   * 日本交易时间 8:00-14:30，韩国交易时间 8:00-14:30（北京时间）
   * 收盘时间早于A股，按A股时间统一处理
   */
  @Cron('35 14 * * *')
  async handleJapanKoreaStockSync() {
    this.logger.log('日韩市场交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isJapanKoreaStock(index),
        '日韩指数',
      );
      this.logger.log(`日韩定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`日韩定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：欧洲市场收盘后同步（夏令时23:35，冬令时00:35）
   * 欧洲夏令时 15:30-23:30，冬令时 16:30-00:30（北京时间）
   * 统一在00:35执行，覆盖冬夏令时
   */
  @Cron('35 0 * * *')
  async handleEuropeStockSync() {
    this.logger.log('欧洲市场交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isEuropeStock(index),
        '欧洲指数',
      );
      this.logger.log(`欧洲定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`欧洲定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：美股收盘后同步（夏令时04:05，冬令时05:05）
   * 美股夏令时 21:30-04:00，冬令时 22:30-05:00（北京时间）
   * 统一在05:05执行，覆盖冬夏令时
   */
  @Cron('5 5 * * *')
  async handleUSStockSync() {
    this.logger.log('美股交易时间结束（延迟5分钟），执行数据同步...');
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isUSStock(index),
        '美股指数',
      );
      this.logger.log(`美股定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`美股定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：贵金属同步（07:05）
   * 贵金属24小时交易，但有每日结算休市时间：
   * - 夏令时（3月-11月）：每天05:00-06:00休市
   * - 冬令时（11月-3月）：每天06:00-07:00休市
   * 统一在07:05执行，确保冬夏令时数据都完整
   * 注意：夏令时06:05获取的数据会过滤掉当天的不完整数据
   */
  @Cron('5 7 * * *')
  async handlePreciousMetalSync() {
    const isDST = this.isDaylightSavingTime();
    const dstStatus = isDST ? '夏令时' : '冬令时';
    this.logger.log(
      `执行贵金属数据同步（${dstStatus}，结算休市后获取数据）...`,
    );
    try {
      const result = await this.syncIndicesByMarket(
        (index) => this.isPreciousMetal(index),
        '贵金属',
      );
      this.logger.log(`贵金属定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`贵金属定时同步失败: ${error.message}`);
    }
  }
}
