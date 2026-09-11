import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';
import { DynamicTrendData } from './entities/dynamic-trend-data.entity';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { TrendAnalysis } from '../trend-analysis/entities/trend-analysis.entity';
import { CreateDynamicDeviationDto } from './dto/create-dynamic-deviation.dto';
import { IndexDataService } from '../indices/index-data.service';

@Injectable()
export class DynamicTrendService {
  private readonly logger = new Logger(DynamicTrendService.name);

  constructor(
    @InjectRepository(DynamicTrendData)
    private readonly dynamicTrendRepository: Repository<DynamicTrendData>,
    @InjectRepository(Index)
    private readonly indexRepository: Repository<Index>,
    @InjectRepository(IndexHistory)
    private readonly indexHistoryRepository: Repository<IndexHistory>,
    @InjectRepository(MovingAverage)
    private readonly movingAverageRepository: Repository<MovingAverage>,
    @InjectRepository(TrendAnalysis)
    private readonly trendAnalysisRepository: Repository<TrendAnalysis>,
    private readonly indexDataService: IndexDataService,
  ) {}

  /**
   * 生成随机延迟（1-2秒）
   */
  private async randomDelay(): Promise<void> {
    const delaySeconds = Math.floor(Math.random() * 2) + 1; // 1-3秒随机
    const delayMs = delaySeconds * 1000;
    this.logger.debug(`等待 ${delaySeconds} 秒后继续...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * 获取参与动态趋势计算的指数列表
   */
  async getParticipatingIndices(indexType?: string): Promise<Index[]> {
    const query = this.indexRepository.createQueryBuilder('index')
      .where("index.metadata->>'participateInDynamicTrend' = :participate", { participate: 'true' });
    
    if (indexType) {
      query.andWhere("index.metadata->>'type' = :type", { type: indexType });
    }
    
    return query.getMany();
  }

  /**
   * 计算并保存动态趋势数据
   */
  async calculateAndSave(data: CreateDynamicDeviationDto): Promise<DynamicTrendData> {
    // 检查是否已存在相同计算时间和版本的记录，如果存在则更新，否则创建
    const existing = await this.dynamicTrendRepository.findOne({
      where: {
        indexId: data.indexId,
        calculationTime: data.calculationTime,
        version: data.version || 1,
      },
    });

    if (existing) {
      // 更新现有记录
      Object.assign(existing, data);
      return this.dynamicTrendRepository.save(existing);
    } else {
      // 创建新记录
      const entity = this.dynamicTrendRepository.create(data);
      return this.dynamicTrendRepository.save(entity);
    }
  }

  /**
   * 获取 Version 1（基准版本）的排名
   */
  async getVersion1Rank(
    indexId: string,
    startOfDay: Date,
    nextDay: Date,
  ): Promise<number | null> {
    const version1Record = await this.dynamicTrendRepository.findOne({
      where: {
        indexId,
        calculationTime: Between(startOfDay, nextDay),
        version: 1,
      },
    });
    return version1Record?.rank || null;
  }

  /**
   * 批量计算并排名
   */
  async calculateAndRank(): Promise<void> {
    this.logger.log('开始执行动态趋势计算和排名...');
    
    try {
      // 获取所有参与动态趋势计算的指数
      const indices = await this.getParticipatingIndices();
      
      if (indices.length === 0) {
        this.logger.warn('没有参与动态趋势计算的指数');
        return;
      }

      // 使用当天的日期作为计算时间（精确到分钟）
      const now = new Date();
      const calculationTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        0, // 秒数设为0
        0, // 毫秒数设为0
      );
      
      this.logger.log(`使用计算时间: ${calculationTime.toISOString()}`);
      
      // 【版本管理】检查是否已有 Version 1（当日首次拉取）
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      // 查询是否已存在 Version 1
      const version1Exists = await this.dynamicTrendRepository.findOne({
        where: {
          calculationTime: Between(startOfDay, nextDay),
          version: 1,
        },
      });
      
      let currentVersion = 1;
      
      if (version1Exists) {
        // 如果 Version 1 已存在，则计算下一个版本号
        const latestRecords = await this.dynamicTrendRepository.find({
          where: {
            calculationTime: Between(startOfDay, nextDay),
          },
          order: { version: 'DESC' },
          take: 1,
        });
        const latestRecord = latestRecords[0];
        currentVersion = latestRecord ? latestRecord.version + 1 : 2;
        this.logger.log(`检测到 Version 1 已存在，当前版本号: ${currentVersion}`);
      } else {
        this.logger.log('未检测到 Version 1，将创建新版本 1（基准版本）');
      }
      
      // 【清理策略】删除非 Version 1 的旧数据（保留 Version 1 作为基准）
      const deleteResult = await this.dynamicTrendRepository
        .createQueryBuilder()
        .delete()
        .from(DynamicTrendData)
        .where('calculationTime >= :start', { start: startOfDay })
        .andWhere('calculationTime < :next', { next: nextDay })
        .andWhere('version != :version', { version: 1 }) // 保留 Version 1
        .execute();
      
      this.logger.log(`已删除非基准版本旧数据 ${deleteResult.affected || 0} 条（保留 Version 1）`);

      // 按指数类型分组
      const indicesByType: Record<string, typeof indices> = {};
      for (const index of indices) {
        const type = index.metadata?.type || 'indices'; // 默认为大盘指数
        if (!indicesByType[type]) {
          indicesByType[type] = [];
        }
        indicesByType[type].push(index);
      }

      this.logger.log(`检测到 ${Object.keys(indicesByType).length} 种指数类型: ${Object.keys(indicesByType).join(', ')}`);

      // 对每种类型的指数分别计算和排名
      for (const [indexType, typeIndices] of Object.entries(indicesByType)) {
        this.logger.log(`开始处理 ${indexType} 类型，共 ${typeIndices.length} 个指数`);
        
        const results: Array<{
          index: Index;
          tradeDate: Date;
          currentPrice: number;
          ma20: number;
          changePercent: number;
          deviationRate: number | null;
          statusChangeDate: Date | null;
          intervalChangePercent: number | null;
        }> = [];

        // 遍历该类型下的每个指数，计算相关指标
        for (const index of typeIndices) {
          this.logger.log(`[${index.name}] 开始计算动态趋势...`);
          
          // 在请求API前添加随机延迟，避免频繁请求
          await this.randomDelay();
          
          // 1. 从 metadata.dataSources 中获取启用的数据源
          const dataSources = index.metadata?.dataSources || {};
          let selectedSource: 'tencent' | 'sina' = 'tencent'; // 默认腾讯
          let selectedCode: string = index.code; // 默认使用 index.code
          
          // 按优先级检查启用的数据源: eastmoney -> sina -> tencent
          if (dataSources.eastmoney?.enabled) {
            selectedSource = 'tencent'; // 东财也使用腾讯API获取实时行情
            selectedCode = dataSources.eastmoney.code || index.code;
          } else if (dataSources.sina?.enabled) {
            selectedSource = 'sina';
            selectedCode = dataSources.sina.code || index.code;
          } else if (dataSources.tencent?.enabled) {
            selectedSource = 'tencent';
            selectedCode = dataSources.tencent.code || index.code;
          }
          
          const dataSource = selectedSource;
          let realTimeQuote;
          
          try {
            this.logger.log(`[${index.name}] 正在获取实时行情数据 (数据源: ${dataSource}, 代码: ${selectedCode})...`);
            realTimeQuote = await this.indexDataService.getRealTimeQuote(
              selectedCode,
              dataSource as 'tencent' | 'sina',
            );
            this.logger.log(
              `[${index.name}] 获取实时价格成功: ${realTimeQuote.currentPrice}`,
            );
          } catch (error) {
            this.logger.warn(
              `[${index.name}] 实时数据获取失败: ${error.message}，跳过`,
            );
            continue;
          }

          const currentPrice = realTimeQuote.currentPrice;
          
          // 2. 重新计算MA20：取前19个交易日 + 当天实时数据，共20个数据点
          this.logger.log(`[${index.name}] 正在查询最近19个交易日历史数据...`);
          const recentHistories = await this.indexHistoryRepository.find({
            where: { indexId: index.id },
            order: { tradeDate: 'DESC' },
            take: 19, // 取最近19个交易日
          });

          this.logger.log(
            `[${index.name}] 查询到 ${recentHistories.length} 条历史记录`,
          );

          if (recentHistories.length < 19) {
            this.logger.warn(
              `[${index.name}] 历史数据不足19天，只有 ${recentHistories.length} 天，跳过`,
            );
            continue;
          }

          // 打印最近几个交易日的收盘价用于调试
          this.logger.log(
            `[${index.name}] 最近3个交易日收盘价: [${recentHistories.slice(0, 3).map(h => `${h.tradeDate}:${h.closePrice}(${typeof h.closePrice})`).join(', ')}]`,
          );

          // 计算20日均线的平均值（19天历史 + 当天实时）
          // 【修复】确保使用数值类型进行计算
          const sumClosePrice = parseFloat(
            (recentHistories.reduce((sum, h) => sum + Number(h.closePrice), 0) +
            Number(currentPrice)).toFixed(2)
          ); // 加上当天的实时价格，保留两位小数
          const ma20 = sumClosePrice / 20;

          this.logger.log(
            `[${index.name}] MA20计算完成: 19日总和=${sumClosePrice}, 当前价格=${currentPrice}, MA20=${ma20.toFixed(2)}`,
          );

          // 3. 计算涨幅：与上一个交易日比较
          const latestHistory = recentHistories[0]; // 最新的交易日
          let changePercent = 0;
          if (latestHistory && latestHistory.closePrice > 0) {
            changePercent =
              ((currentPrice - latestHistory.closePrice) /
                latestHistory.closePrice) *
              100;
          }

          // 4. 计算偏离率：(当前价格 - MA20) / MA20 * 100
          const deviationRate =
            ma20 !== 0 ? ((currentPrice - ma20) / ma20) * 100 : null;

          // 5. 确定状态转变日
          // 从趋势分析表中获取小于今天且按交易日期倒序取第一条趋势数据（上一个交易日）
          this.logger.log(`[${index.name}] 正在查询上一交易日趋势数据...`);
          const today = new Date();
          const yesterdayTrends = await this.trendAnalysisRepository.find({
            where: {
              indexId: index.id,
              tradeDate: LessThan(today),
            },
            order: { tradeDate: 'DESC' },
            take: 1,
          });
          const yesterdayTrend = yesterdayTrends[0];
          
          if (yesterdayTrend) {
            this.logger.log(
              `[${index.name}] 上一交易日(${yesterdayTrend.tradeDate})偏离率: ${yesterdayTrend.deviationRate}`,
            );
          } else {
            this.logger.warn(`[${index.name}] 未找到上一交易日趋势数据`);
          }

          const yesterdayDeviationRate = yesterdayTrend?.deviationRate;
          let statusChangeDate: Date | null = null;

          // 判断今天是否发生正负转换
          if (
            deviationRate !== null &&
            yesterdayDeviationRate !== undefined &&
            yesterdayDeviationRate !== null
          ) {
            const wasPositive = yesterdayDeviationRate >= 0;
            const isPositive = deviationRate >= 0;

            // 如果正负发生变化，标记为今天
            if (wasPositive !== isPositive) {
              statusChangeDate = new Date(); // 今天
            } else {
              // 否则继承昨天的状态转变日
              statusChangeDate = yesterdayTrend?.statusChangeDate || null;
            }
          } else if (deviationRate !== null) {
            // 如果没有昨天数据，但有今天的偏离率
            // 如果是正的，且没有状态转变日，标记为今天
            if (deviationRate >= 0 && !yesterdayTrend?.statusChangeDate) {
              statusChangeDate = new Date(); // 今天
            } else {
              statusChangeDate = yesterdayTrend?.statusChangeDate || null;
            }
          }

          // 6. 计算区间涨幅：从状态转变日到今天的涨幅
          let intervalChangePercent: number | null = null;
          if (statusChangeDate) {
            // 获取状态转变日那天的收盘价
            const statusDayHistory = await this.indexHistoryRepository.findOne({
              where: {
                indexId: index.id,
                tradeDate: statusChangeDate,
              },
            });

            if (statusDayHistory && statusDayHistory.closePrice > 0) {
              intervalChangePercent =
                ((currentPrice - statusDayHistory.closePrice) /
                  statusDayHistory.closePrice) *
                100;
            }
          }

          results.push({
            index,
            tradeDate: new Date(), // 使用当前时间
            currentPrice,
            ma20,
            changePercent,
            deviationRate,
            statusChangeDate,
            intervalChangePercent,
          });
      }

      // 按偏离率降序排序
      results.sort((a, b) => {
        if (a.deviationRate === null && b.deviationRate === null) return 0;
        if (a.deviationRate === null) return 1;
        if (b.deviationRate === null) return -1;
        return b.deviationRate - a.deviationRate;
      });

      // 保存排名结果
      const totalRankCount = results.length;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const rank = i + 1;

        // 获取上一次计算的排名用于计算排名变化（从 Version 1 获取基准）
        const previousRank = await this.getVersion1Rank(result.index.id, startOfDay, nextDay);
        const rankChange = previousRank ? previousRank - rank : 0;

        // 保存动态趋势数据
        await this.calculateAndSave({
          indexId: result.index.id,
          calculationTime, // 使用统一的计算时间（当天）
          tradeDate: result.tradeDate, // 使用历史数据的交易日期
          currentPrice: result.currentPrice,
          ma20: result.ma20,
          changePercent: result.changePercent,
          deviationRate: result.deviationRate,
          statusChangeDate: result.statusChangeDate,
          intervalChangePercent: result.intervalChangePercent,
          rank,
          rankChange,
          totalRankCount,
          version: currentVersion, // 添加版本号
          indexType: result.index.metadata?.type || null,
        });
      }

      this.logger.log(`${indexType} 类型动态趋势计算完成，共处理 ${results.length} 个指数`);
    }

    this.logger.log('所有类型指数的动态趋势计算完成');
    } catch (error) {
      this.logger.error('动态趋势计算失败:', error);
      throw error;
    }
  }

  /**
   * 获取最后一次计算的排名
   */
  async getLastRank(indexId: string): Promise<number | null> {
    const latest = await this.dynamicTrendRepository.findOne({
      where: { indexId },
      order: { calculationTime: 'DESC' },
    });
    return latest ? latest.rank : null;
  }

  /**
   * 获取最新动态趋势数据（只显示每个指数的最新版本）
   */
  async getLatestData(indexType?: string): Promise<DynamicTrendData[]> {
    // 首先获取所有不同的指数ID
    const indexIdsQuery = this.dynamicTrendRepository.createQueryBuilder('data')
      .select('DISTINCT data."indexId"', 'indexId');
    
    if (indexType) {
      indexIdsQuery.where('data.indexType = :indexType', { indexType });
    }
    
    const indexIds = await indexIdsQuery.getRawMany();
    
    const results: DynamicTrendData[] = [];
    
    // 对每个指数，获取其最新版本的记录
    for (const { indexId } of indexIds) {
      const latestRecords = await this.dynamicTrendRepository.find({
        where: { indexId },
        order: { version: 'DESC' },
        take: 1,
      });
      
      if (latestRecords.length > 0) {
        // 加载关联的 index 数据
        const record = await this.dynamicTrendRepository.findOne({
          where: { id: latestRecords[0].id },
          relations: { index: true },
        });
        if (record) {
          results.push(record);
        }
      }
    }
    
    // 按排名排序
    results.sort((a, b) => a.rank - b.rank);
    
    return results;
  }

  /**
   * 获取指定计算时间的数据
   */
  async getDataByCalculationTime(calculationTime: Date, indexType?: string): Promise<DynamicTrendData[]> {
    const query = this.dynamicTrendRepository.createQueryBuilder('data')
      .innerJoinAndSelect('data.index', 'index')
      .where('data.calculationTime = :calculationTime', { calculationTime })
      .orderBy('data.rank', 'ASC');

    if (indexType) {
      query.andWhere('data.indexType = :indexType', { indexType });
    }

    return query.getMany();
  }

  /**
   * 清理旧数据（删除所有非 Version 1 的数据，保留基准版本）
   */
  async cleanOldData(keepCount: number = 10): Promise<void> {
    this.logger.log('开始清理旧的动态趋势数据（删除非基准版本）...');
    
    try {
      // 删除所有 version != 1 的数据
      const result = await this.dynamicTrendRepository
        .createQueryBuilder()
        .delete()
        .from(DynamicTrendData)
        // .where('version != :version', { version: 1 })
        .execute();

      this.logger.log(`清理完成，删除了 ${result.affected} 条非基准版本数据`);
    } catch (error) {
      this.logger.error('清理旧数据失败:', error);
      throw error;
    }
  }
}
