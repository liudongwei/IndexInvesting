import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface KlineData {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  amount: number | null;
}

export type DataSourceType = 'tencent' | 'sina';

@Injectable()
export class IndexDataService {
  private readonly logger = new Logger(IndexDataService.name);

  constructor(
    private readonly httpService: HttpService,
  ) {}

  private async fetchWithRetry<T>(
    url: string,
    config?: AxiosRequestConfig,
    retries = 3,
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              Accept: 'application/json,text/plain,*/*',
              'Accept-Language': 'zh-CN,zh;q=0.9',
              ...config?.headers,
            },
            ...config,
          }),
        );
        return response.data;
      } catch (err) {
        if (i === retries - 1) throw err;
        this.logger.warn(`请求失败，重试 ${i + 1}/${retries}...`);
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error('请求失败，已重试3次');
  }

  private toNumber(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeKlines(rows: Partial<KlineData>[]): KlineData[] {
    const map = new Map<string, KlineData>();
    for (const row of rows) {
      if (!row || !row.date) continue;
      map.set(row.date, {
        date: row.date,
        open: this.toNumber(row.open),
        high: this.toNumber(row.high),
        low: this.toNumber(row.low),
        close: this.toNumber(row.close),
        volume: this.toNumber(row.volume),
        amount: this.toNumber(row.amount),
      });
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 从腾讯获取K线数据（按条数限制）
   */
  async getTencentKline(symbol: string, limit: number = 100): Promise<KlineData[]> {
    try {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`;

      const json = await this.fetchWithRetry<any>(url, {
        headers: { Referer: 'https://gu.qq.com/' },
      });

      return this.parseTencentKlineData(json, symbol);
    } catch (error) {
      this.logger.error(`腾讯数据源获取失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 判断是否为港股代码
   * 港股代码格式：hkXXXXX
   */
  private isHongKongStock(symbol: string): boolean {
    return symbol.toLowerCase().startsWith('hk');
  }

  /**
   * 从腾讯获取K线数据（按日期范围）
   * @param symbol 股票代码，如 sh000001
   * @param startDate 开始日期，格式 YYYY-MM-DD
   * @param endDate 结束日期，格式 YYYY-MM-DD
   * @param limit 最大返回条数，默认1000
   */
  async getTencentKlineByDateRange(
    symbol: string,
    startDate: string,
    endDate: string,
    limit: number = 1000,
  ): Promise<KlineData[]> {
    try {
      const isHK = this.isHongKongStock(symbol);
      
      // 港股和非港股使用不同的API路径
      // 港股: app/kline/kline (无qfq参数)
      // A股: app/fqkline/get (有qfq参数)
      let url: string;
      if (isHK) {
        url = `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${symbol},day,${startDate},${endDate},${limit}`;
      } else {
        url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${startDate},${endDate},${limit},qfq`;
      }

      this.logger.log(`从腾讯获取 ${symbol} 数据: ${startDate} 至 ${endDate}${isHK ? ' (港股)' : ''}`);

      const json = await this.fetchWithRetry<any>(url, {
        headers: { Referer: 'https://gu.qq.com/' },
      });

      return this.parseTencentKlineData(json, symbol);
    } catch (error) {
      this.logger.error(`腾讯数据源获取失败 (${startDate} 至 ${endDate}): ${error.message}`);
      throw error;
    }
  }

  /**
   * 按年批量获取腾讯K线数据
   * @param symbol 股票代码
   * @param startYear 开始年份，如 2005
   * @param endYear 结束年份，如 2024
   */
  async getTencentKlineByYearRange(
    symbol: string,
    startYear: number,
    endYear: number,
  ): Promise<KlineData[]> {
    const allData: KlineData[] = [];
    const yearDataMap = new Map<number, KlineData[]>();

    for (let year = startYear; year <= endYear; year++) {
      try {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        this.logger.log(`正在获取 ${symbol} ${year} 年数据...`);

        const yearData = await this.getTencentKlineByDateRange(
          symbol,
          startDate,
          endDate,
          1000, // 一年交易日约250天，1000足够
        );

        if (yearData.length > 0) {
          yearDataMap.set(year, yearData);
          allData.push(...yearData);
          this.logger.log(`${year} 年数据获取成功: ${yearData.length} 条`);
        } else {
          this.logger.warn(`${year} 年无数据`);
        }

        // 添加延迟，避免请求过快
        if (year < endYear) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (error) {
        this.logger.error(`获取 ${year} 年数据失败: ${error.message}`);
        // 继续下一年
      }
    }

    // 去重并排序
    return this.normalizeKlines(allData);
  }

  /**
   * 解析腾讯K线数据
   */
  private parseTencentKlineData(json: any, symbol: string): KlineData[] {
    const klines = json?.data?.[symbol]?.day || json?.data?.[symbol]?.qfqday || [];

    if (!Array.isArray(klines)) {
      throw new Error('返回格式异常');
    }

    const rows = klines
      .map((item: any[]) => {
        if (!Array.isArray(item)) return null;
        const [date, open, close, high, low, volume] = item;
        return { date, open, high, low, close, volume, amount: null };
      })
      .filter(Boolean) as KlineData[];

    return rows;
  }

  /**
   * 从新浪获取K线数据
   */
  async getSinaKline(symbol: string, limit: number = 100): Promise<KlineData[]> {
    try {
      const datalen = Math.min(limit, 1023);
      // 转换 symbol 格式：sh000300 -> sh000300
      const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${datalen}`;

      const json = await this.fetchWithRetry<any[]>(url, {
        headers: { Referer: 'https://finance.sina.com.cn/' },
      });

      if (!Array.isArray(json)) {
        throw new Error('返回格式异常');
      }

      const rows = json.map((item: any) => ({
        date: item.day,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        amount: null,
      })) as KlineData[];

      return this.normalizeKlines(rows);
    } catch (error) {
      this.logger.error(`新浪数据源获取失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取指数数据（支持多数据源）
   * @param symbol 指数代码
   * @param limit 获取条数
   * @param source 数据源，默认优先腾讯
   */
  async getIndexData(
    symbol: string,
    limit: number = 100,
    source?: DataSourceType,
  ): Promise<{
    data: KlineData[];
    source: string;
  }> {
    // 默认：优先腾讯，失败则尝试新浪
    try {
      const data = await this.getTencentKline(symbol, limit);
      return { data, source: 'tencent' };
    } catch (error) {
      this.logger.warn('腾讯数据源失败，尝试新浪...');
      const data = await this.getSinaKline(symbol, limit);
      return { data, source: 'sina' };
    }
  }
}
