import { Injectable, Logger } from '@nestjs/common';
import { IndicatorsService, BatchName } from './indicators.service';

/**
 * 指标三批次 cron —— 时间覆盖各市场收盘(北京时间),注册进 cron-config 面板(可改时间/启停)。
 * 周末照跑无害:非交易日无新数据 → 跳过守卫直接 no-op。
 * 与既有任务时段错开:15:10 A股同步 / 22:10 宏观 / 09:00 通知。
 */
@Injectable()
export class IndicatorsCronService {
  private readonly logger = new Logger(IndicatorsCronService.name);

  constructor(private readonly indicatorsService: IndicatorsService) {}

  /** 15:25 A股批次(15:10 同步后;台湾 13:30 / 日韩 14:30 已收,一并覆盖) */
  async runAStockBatch() {
    this.logger.log('执行指标计算:A股批次...');
    return this.indicatorsService.runBatch('aStock');
  }

  /** 16:25 港股批次(16:00 收盘后) */
  async runHkStockBatch() {
    this.logger.log('执行指标计算:港股批次...');
    return this.indicatorsService.runBatch('hkStock');
  }

  /** 06:30 美股+贵金属批次(美股收盘=北京 04:00 夏令/05:00 冬令,贵金属隔夜结算约 05~06 点,06:30 双覆盖;欧洲等其余市场兜底) */
  async runUsPreciousBatch() {
    this.logger.log('执行指标计算:美股+贵金属批次...');
    return this.indicatorsService.runBatch('usPrecious');
  }

  async runBatch(batch: BatchName) {
    return this.indicatorsService.runBatch(batch);
  }
}
