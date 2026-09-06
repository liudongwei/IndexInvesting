import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { DynamicTrendData } from './entities/dynamic-trend-data.entity';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { CreateDynamicDeviationDto } from './dto/create-dynamic-deviation.dto';

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
  ) {}

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
    // 检查是否已存在相同计算时间的记录，如果存在则更新，否则创建
    const existing = await this.dynamicTrendRepository.findOne({
      where: {
        indexId: data.indexId,
        calculationTime: data.calculationTime,
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

      // 使用当天的日期作为计算时间（精确到分钟），这样同一天内的多次计算会覆盖之前的数据
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
      
      // 【关键】先删除当天的所有数据，确保手动计算时是覆盖而非新增
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      // 使用 QueryBuilder 删除当天范围的数据
      const deleteResult = await this.dynamicTrendRepository
        .createQueryBuilder()
        .delete()
        .from(DynamicTrendData)
        .where('calculationTime >= :start', { start: startOfDay })
        .andWhere('calculationTime < :next', { next: nextDay })
        .execute();
      
      this.logger.log(`已删除当天旧数据 ${deleteResult.affected || 0} 条`);
      
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

      // 遍历每个指数，计算相关指标
      for (const index of indices) {
        try {
          // 获取最新的移动平均线数据
          const latestMA = await this.movingAverageRepository.findOne({
            where: { indexId: index.id },
            order: { tradeDate: 'DESC' },
          });

          if (!latestMA || !latestMA.ma20) {
            this.logger.warn(`指数 ${index.name} (${index.code}) 没有可用的MA20数据`);
            continue;
          }

          // 获取最新的历史数据（现价）
          const latestHistory = await this.indexHistoryRepository.findOne({
            where: { indexId: index.id },
            order: { tradeDate: 'DESC' },
          });

          if (!latestHistory) {
            this.logger.warn(`指数 ${index.name} (${index.code}) 没有历史数据`);
            continue;
          }

          const currentPrice = latestHistory.closePrice;
          const ma20 = latestMA.ma20;
          
          // 计算偏离率
          const deviationRate = ma20 ? ((currentPrice - ma20) / ma20) * 100 : null;
          
          // 获取趋势分析数据以获取状态转变日和区间涨幅
          const trendAnalysis = await this.dynamicTrendRepository.findOne({
            where: { 
              indexId: index.id,
              tradeDate: latestHistory.tradeDate,
            },
            order: { calculationTime: 'DESC' },
          });

          results.push({
            index,
            tradeDate: latestHistory.tradeDate,
            currentPrice,
            ma20,
            changePercent: latestHistory.changePercent || 0,
            deviationRate,
            statusChangeDate: trendAnalysis?.statusChangeDate || null,
            intervalChangePercent: trendAnalysis?.intervalChangePercent || null,
          });
        } catch (error) {
          this.logger.error(`计算指数 ${index.name} 失败:`, error);
        }
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

        // 获取上一次计算的排名用于计算排名变化
        const previousRank = await this.getLastRank(result.index.id);
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
          indexType: result.index.metadata?.type || null,
        });
      }

      this.logger.log(`动态趋势计算完成，共处理 ${results.length} 个指数`);
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
   * 获取最新动态趋势数据
   */
  async getLatestData(indexType?: string): Promise<DynamicTrendData[]> {
    const query = this.dynamicTrendRepository.createQueryBuilder('data')
      .innerJoinAndSelect('data.index', 'index')
      .orderBy('data.rank', 'ASC');

    if (indexType) {
      query.where('data.indexType = :indexType', { indexType });
    }

    return query.getMany();
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
   * 清理旧数据（保留最近N次计算的数据）
   */
  async cleanOldData(keepCount: number = 10): Promise<void> {
    this.logger.log(`开始清理旧的动态趋势数据，保留最近 ${keepCount} 次计算...`);
    
    try {
      // 获取所有不同的计算时间，按时间倒序排列
      const calculationTimes = await this.dynamicTrendRepository
        .createQueryBuilder('data')
        .select('DISTINCT data.calculationTime', 'calculationTime')
        .orderBy('data.calculationTime', 'DESC')
        .getRawMany();

      if (calculationTimes.length <= keepCount) {
        this.logger.log('无需清理数据');
        return;
      }

      // 找到要保留的最早计算时间
      const keepThreshold = calculationTimes[keepCount - 1].calculationTime;

      // 删除早于阈值的数据
      const result = await this.dynamicTrendRepository.delete({
        calculationTime: LessThan(new Date(keepThreshold)),
      });

      this.logger.log(`清理完成，删除了 ${result.affected} 条旧数据`);
    } catch (error) {
      this.logger.error('清理旧数据失败:', error);
      throw error;
    }
  }
}
