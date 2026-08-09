import { Injectable, Logger } from '@nestjs/common';
import { KlineData } from '../indices/index-data.service';

// Tushare SDK 类型定义
interface TushareApi {
  query: (apiName: string, params?: any, fields?: string) => Promise<any>;
}

@Injectable()
export class TushareService {
  private readonly logger = new Logger(TushareService.name);
  private tushare: TushareApi | null = null;

  constructor() {
    this.initTushare();
  }

  private initTushare() {
    try {
      // 需要用户设置 TUSHARE_TOKEN 环境变量
      const token = process.env.TUSHARE_TOKEN;
      if (!token) {
        this.logger.warn('TUSHARE_TOKEN 未设置，Tushare 服务不可用');
        return;
      }

      // 动态导入 tushare
      const Tushare = require('tushare');
      this.tushare = new Tushare(token);
      this.logger.log('Tushare 服务初始化成功');
    } catch (error) {
      this.logger.error(`Tushare 初始化失败: ${error.message}`);
    }
  }

  /**
   * 检查 Tushare 是否可用
   */
  isAvailable(): boolean {
    return this.tushare !== null;
  }

  /**
   * 获取指数日线数据
   * @param tsCode Tushare指数代码，如 000300.SH
   * @param startDate 开始日期，格式 YYYYMMDD
   * @param endDate 结束日期，格式 YYYYMMDD
   */
  async getIndexDaily(
    tsCode: string,
    startDate?: string,
    endDate?: string,
  ): Promise<KlineData[]> {
    if (!this.tushare) {
      throw new Error('Tushare 未初始化，请设置 TUSHARE_TOKEN 环境变量');
    }

    try {
      const params: any = {
        ts_code: tsCode,
      };

      if (startDate) {
        params.start_date = startDate;
      }
      if (endDate) {
        params.end_date = endDate;
      }

      this.logger.log(`从 Tushare 获取 ${tsCode} 数据...`);

      const result = await this.tushare.query('index_daily', params);

      if (!result || !result.data || !Array.isArray(result.data.items)) {
        this.logger.warn('Tushare 返回数据格式异常');
        return [];
      }

      // 转换 Tushare 数据为标准 KlineData 格式
      // 字段顺序: ts_code, trade_date, close, open, high, low, pre_close, change, pct_chg, vol, amount
      const fields = result.data.fields;
      const items = result.data.items;

      return items.map((item: any[]) => {
        const data: any = {};
        fields.forEach((field: string, index: number) => {
          data[field] = item[index];
        });

        return {
          date: this.formatDate(data.trade_date),
          open: this.toNumber(data.open),
          high: this.toNumber(data.high),
          low: this.toNumber(data.low),
          close: this.toNumber(data.close),
          volume: this.toNumber(data.vol),
          amount: this.toNumber(data.amount),
        };
      });
    } catch (error) {
      this.logger.error(`Tushare 获取数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取指数基本信息
   */
  async getIndexBasic(): Promise<any[]> {
    if (!this.tushare) {
      throw new Error('Tushare 未初始化');
    }

    try {
      const result = await this.tushare.query('index_basic', {
        market: 'CSI', // 中证指数
      });

      if (!result || !result.data || !Array.isArray(result.data.items)) {
        return [];
      }

      const fields = result.data.fields;
      return result.data.items.map((item: any[]) => {
        const data: any = {};
        fields.forEach((field: string, index: number) => {
          data[field] = item[index];
        });
        return data;
      });
    } catch (error) {
      this.logger.error(`获取指数基本信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 转换官方代码为 Tushare 格式
   * @param officialCode 如 000300.SH
   * @returns Tushare ts_code
   */
  convertToTsCode(officialCode: string): string {
    // Tushare 格式已经是 000300.SH，直接返回
    return officialCode;
  }

  /**
   * 转换自定义代码为 Tushare 格式
   * @param code 如 sh000300
   * @returns Tushare ts_code 如 000300.SH
   */
  convertCustomCodeToTsCode(code: string): string {
    // sh000300 -> 000300.SH
    // sz399001 -> 399001.SZ
    if (code.startsWith('sh')) {
      return `${code.slice(2)}.SH`;
    } else if (code.startsWith('sz')) {
      return `${code.slice(2)}.SZ`;
    }
    return code;
  }

  private formatDate(dateStr: string): string {
    // 20250101 -> 2025-01-01
    if (dateStr && dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
  }

  private toNumber(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
