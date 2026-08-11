import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IndicesService } from './indices.service';
import { IndexDataService, KlineData } from './index-data.service';
import { EastmoneyDataService } from './eastmoney-data.service';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';

@Injectable()
export class IndexSyncService {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(
    private readonly indicesService: IndicesService,
    private readonly indexDataService: IndexDataService,
    private readonly eastmoneyDataService: EastmoneyDataService,
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
      // 1. 从API获取指定日期范围的数据
      const data = await this.indexDataService.getTencentKlineByDateRange(
        index.code,
        startDate,
        endDate,
        1000,
      );

      if (data.length === 0) {
        return {
          success: true,
          message: '指定日期范围内无数据',
          count: 0,
          dateRange: { start: startDate, end: endDate },
        };
      }

      this.logger.log(`[${index.name}] 从API获取到 ${data.length} 条数据`);

      // 2. 转换数据
      const historyData = this.convertToHistoryData(data, 'tencent');

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
      if (latestDate) {
        const latestDateStr =
          latestDate instanceof Date
            ? latestDate.toISOString().split('T')[0]
            : String(latestDate).split('T')[0];
        newData = data.filter((item) => item.date > latestDateStr);
      }

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

      // 更新最后同步日期
      const lastTradeDate = new Date(data[data.length - 1].date);
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
   * 定时任务：每天下午2点30分同步早盘收盘市场数据
   * 只同步收盘时间早于A股的市场（台湾、日韩），避免与个股同步重复
   * A股和港股由各自的独立Cron任务处理
   */
  @Cron('30 14 * * *')
  async handleDailySync() {
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
   * 判断指数是否属于A股
   */
  private isChinaAStock(index: Index): boolean {
    const exchange = index.exchange || '';
    const code = index.code || '';
    // A股：上交所、深交所，或代码以 sh/sz 开头
    return (
      exchange.includes('上交所') ||
      exchange.includes('深交所') ||
      code.startsWith('sh') ||
      code.startsWith('sz')
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
    return { total: totalCount, results };
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
  @Cron('5 16 * * *')
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
  @Cron('5 15 * * *')
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
  @Cron('5 15 * * *')
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
   * 定时任务：贵金属同步（06:00）
   * 贵金属24小时交易，在美股收盘后1小时同步，确保数据完整
   */
  @Cron('0 6 * * *')
  async handlePreciousMetalSync() {
    this.logger.log('执行贵金属数据同步（24小时交易，美股收盘后1小时）...');
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
