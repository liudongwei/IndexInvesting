import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IndicesService } from './indices.service';
import { IndexDataService, KlineData } from './index-data.service';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';

@Injectable()
export class IndexSyncService {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(
    private readonly indicesService: IndicesService,
    private readonly indexDataService: IndexDataService,
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

        this.logger.log(`${index.name} ${year} 年同步完成: ${savedCount} 条数据`);

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
    const targetIndices = onlyActive ? indices.filter((i) => i.isActive) : indices;

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
        const result = await this.syncIndexDataByMetadata(index, undefined, endYear);
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

        this.logger.log(`${index.name} ${year} 年同步完成: ${savedCount} 条数据`);

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

    this.logger.log(
      `${index.name} 按年同步完成，共 ${totalCount} 条数据`,
    );

    return { total: totalCount, years };
  }

  /**
   * 同步单个指数数据
   * 首次全量同步，后续增量同步
   */
  async syncIndexData(index: Index): Promise<number> {
    this.logger.log(`开始同步指数: ${index.name} (${index.code})`);

    try {
      // 获取最新数据日期
      const latestDate = await this.indicesService.getLatestHistoryDate(index.id);
      
      // 计算需要获取的数据条数
      let limit: number;
      if (!latestDate) {
        // 首次同步，获取所有历史数据（约5年）
        limit = 1200;
        this.logger.log(`首次同步，获取最近 ${limit} 条数据`);
      } else {
        // 增量同步，获取最近30条（覆盖可能缺失的数据）
        limit = 30;
        const dateStr = latestDate instanceof Date 
          ? latestDate.toISOString().split('T')[0]
          : String(latestDate).split('T')[0];
        this.logger.log(`增量同步，上次同步日期: ${dateStr}`);
      }

      // 从API获取数据
      const { data, source } = await this.indexDataService.getIndexData(index.code, limit);

      if (data.length === 0) {
        this.logger.warn(`未获取到数据: ${index.code}`);
        return 0;
      }

      // 过滤新数据（如果是增量同步）
      let newData = data;
      if (latestDate) {
        const latestDateStr = latestDate instanceof Date
          ? latestDate.toISOString().split('T')[0]
          : String(latestDate).split('T')[0];
        newData = data.filter(item => item.date > latestDateStr);
      }

      if (newData.length === 0) {
        this.logger.log(`没有新数据需要同步`);
        return 0;
      }

      // 转换并保存数据
      const historyData = this.convertToHistoryData(newData, source);
      const savedCount = await this.indicesService.saveHistoryData(index.id, historyData);

      // 更新最后同步日期
      const lastTradeDate = new Date(data[data.length - 1].date);
      await this.indicesService.updateLastSyncDate(index.id, lastTradeDate, savedCount);

      this.logger.log(`同步完成: ${index.name}, 新增/更新 ${savedCount} 条数据, 数据源: ${source}`);
      return savedCount;
    } catch (error) {
      this.logger.error(`同步失败: ${index.name} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 转换K线数据为历史数据实体
   */
  private convertToHistoryData(data: KlineData[], source: string): Partial<IndexHistory>[] {
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
  async syncAllActiveIndices(): Promise<{ total: number; results: { name: string; count: number }[] }> {
    const indices = await this.indicesService.findAll();
    const activeIndices = indices.filter(i => i.isActive);

    this.logger.log(`开始批量同步，共 ${activeIndices.length} 个指数`);

    const results: { name: string; count: number }[] = [];
    let totalCount = 0;

    for (const index of activeIndices) {
      try {
        const count = await this.syncIndexData(index);
        results.push({ name: index.name, count });
        totalCount += count;
        
        // 添加延迟，避免请求过快
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        this.logger.error(`同步 ${index.name} 失败: ${error.message}`);
        results.push({ name: index.name, count: 0 });
      }
    }

    this.logger.log(`批量同步完成，共新增 ${totalCount} 条数据`);
    return { total: totalCount, results };
  }

  /**
   * 定时任务：每天下午4点同步数据（收盘后）
   */
  @Cron(CronExpression.EVERY_DAY_AT_4PM)
  async handleDailySync() {
    this.logger.log('执行定时同步任务...');
    try {
      const result = await this.syncAllActiveIndices();
      this.logger.log(`定时同步完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`定时同步失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：每小时检查一次（用于补数据）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCheck() {
    const now = new Date();
    const hour = now.getHours();
    
    // 只在交易时间后执行（9:30-15:00 是交易时间）
    if (hour >= 15 && hour < 16) {
      this.logger.log('交易时间结束，执行数据同步...');
      await this.handleDailySync();
    }
  }
}
