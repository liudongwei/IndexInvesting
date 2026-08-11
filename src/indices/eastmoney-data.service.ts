import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';
import { IndicesService } from './indices.service';
import {
  ImportEastmoneyJsonDto,
  ImportJsonResult,
} from './dto/import-eastmoney-json.dto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 东财K线数据项
 * 格式: "日期,开盘价,收盘价,最高价,最低价,成交量,成交额,涨跌幅"
 */
export interface EastmoneyKlineItem {
  tradeDate: Date;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
  changePercent: number;
}

/**
 * 东财JSON数据结构
 */
export interface EastmoneyData {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  dsc: string;
  data: {
    code: string;
    market: number;
    name: string;
    decimal: number;
    dktotal: number;
    preKPrice: number;
    klines: string[];
  };
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  message: string;
  total: number;
  imported: number;
  skipped: number;
  filePath?: string;
  indexName?: string;
  indexCode?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

@Injectable()
export class EastmoneyDataService {
  private readonly logger = new Logger(EastmoneyDataService.name);
  private readonly dataDir: string;
  private readonly eastmoneyConfig: {
    cookie: string;
    headers: Record<string, string>;
  };

  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(IndexHistory)
    private historyRepository: Repository<IndexHistory>,
    private readonly indicesService: IndicesService,
    private readonly httpService: HttpService,
  ) {
    // 默认数据目录：项目根目录下的 index_data
    this.dataDir = path.resolve(process.cwd(), 'index_data');
    // 加载东财配置
    this.eastmoneyConfig = this.loadEastmoneyConfig();
  }

  /**
   * 加载东财配置文件
   * 配置文件路径: config/eastmoney.config.json
   */
  private loadEastmoneyConfig(): {
    cookie: string;
    headers: Record<string, string>;
  } {
    const configPath = path.resolve(
      process.cwd(),
      'config',
      'eastmoney.config.json',
    );
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.logger.log('已加载东财配置文件');
        return {
          cookie: config.cookie || '',
          headers: config.headers || {},
        };
      }
    } catch (error) {
      this.logger.warn(`加载东财配置文件失败: ${error.message}`);
    }
    // 默认配置
    return {
      cookie: '',
      headers: {},
    };
  }

  /**
   * 获取东财请求头
   */
  private getEastmoneyHeaders(): Record<string, string> {
    return {
      ...this.eastmoneyConfig.headers,
      Cookie: this.eastmoneyConfig.cookie,
    };
  }

  /**
   * 更新东财 Cookie
   * @param cookie 新的 Cookie 字符串
   * @returns 更新结果
   */
  updateCookie(cookie: string): { success: boolean; message: string } {
    try {
      const configPath = path.resolve(
        process.cwd(),
        'config',
        'eastmoney.config.json',
      );

      // 读取现有配置
      let config: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      // 更新 Cookie
      config.cookie = cookie;
      config.lastUpdated = new Date().toISOString();

      // 确保目录存在
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      // 更新内存中的配置
      this.eastmoneyConfig.cookie = cookie;

      this.logger.log('东财 Cookie 已更新');
      return {
        success: true,
        message: 'Cookie 更新成功',
      };
    } catch (error) {
      this.logger.error(`更新 Cookie 失败: ${error.message}`);
      return {
        success: false,
        message: `更新失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取当前东财配置状态
   */
  getConfigStatus(): {
    hasCookie: boolean;
    cookieLength: number;
    lastUpdated?: string;
  } {
    return {
      hasCookie: !!this.eastmoneyConfig.cookie,
      cookieLength: this.eastmoneyConfig.cookie.length,
      lastUpdated: this.eastmoneyConfig.headers?.['lastUpdated'] as string,
    };
  }

  /**
   * 获取完整的文件路径
   * 如果传入的是相对路径（不含目录分隔符），则自动拼接 index_data 目录
   * @param fileName 文件名或路径
   * @returns 完整的文件路径
   */
  private resolveFilePath(fileName: string): string {
    // 如果已经是绝对路径，直接返回
    if (path.isAbsolute(fileName)) {
      return fileName;
    }
    // 如果包含目录分隔符，视为相对路径，从项目根目录解析
    if (fileName.includes('/') || fileName.includes('\\')) {
      return path.resolve(process.cwd(), fileName);
    }
    // 只有文件名，自动拼接 index_data 目录
    return path.join(this.dataDir, fileName);
  }

  /**
   * 解析东财K线数据字符串
   * @param klineStr 格式: "日期,开盘价,收盘价,最高价,最低价,成交量,成交额,涨跌幅"
   * @returns 解析后的数据对象
   */
  parseKlineString(klineStr: string): EastmoneyKlineItem | null {
    try {
      const parts = klineStr.split(',');
      if (parts.length < 8) {
        this.logger.warn(`K线数据格式不正确: ${klineStr}`);
        return null;
      }

      const [
        dateStr,
        openStr,
        closeStr,
        highStr,
        lowStr,
        volumeStr,
        turnoverStr,
        changePercentStr,
      ] = parts;

      return {
        tradeDate: new Date(dateStr),
        openPrice: parseFloat(openStr),
        closePrice: parseFloat(closeStr),
        highPrice: parseFloat(highStr),
        lowPrice: parseFloat(lowStr),
        volume: parseFloat(volumeStr),
        turnover: parseFloat(turnoverStr),
        changePercent: parseFloat(changePercentStr),
      };
    } catch (error) {
      this.logger.error(`解析K线数据失败: ${klineStr}`, error.message);
      return null;
    }
  }

  /**
   * 读取并解析东财JSON文件
   * @param filePath JSON文件路径
   * @returns 解析后的数据
   */
  async readEastmoneyFile(filePath: string): Promise<EastmoneyData> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException(`文件不存在: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data: EastmoneyData = JSON.parse(fileContent);

      if (!data.data || !data.data.klines || !Array.isArray(data.data.klines)) {
        throw new Error('东财JSON数据格式不正确，缺少klines数组');
      }

      return data;
    } catch (error) {
      this.logger.error(`读取东财文件失败: ${filePath}`, error.message);
      throw error;
    }
  }

  /**
   * 将东财数据转换为IndexHistory格式
   * @param klines K线数据字符串数组
   * @returns IndexHistory部分数据数组
   */
  convertToHistoryData(klines: string[]): Partial<IndexHistory>[] {
    const result: Partial<IndexHistory>[] = [];

    for (const klineStr of klines) {
      const parsed = this.parseKlineString(klineStr);
      if (parsed) {
        result.push({
          tradeDate: parsed.tradeDate,
          openPrice: parsed.openPrice,
          highPrice: parsed.highPrice,
          lowPrice: parsed.lowPrice,
          closePrice: parsed.closePrice,
          volume: parsed.volume,
          turnover: parsed.turnover,
          changePercent: parsed.changePercent,
          changeAmount: null,
          dataSource: 'eastmoney',
        });
      }
    }

    return result;
  }

  /**
   * 导入指定指数的东财数据
   * @param indexId 指数ID
   * @param filePath JSON文件路径（可选，如果不传则从metadata.data_file读取）
   * @returns 导入结果
   */
  async importData(indexId: string, filePath?: string): Promise<ImportResult> {
    // 获取指数信息
    const index = await this.indexRepository.findOne({
      where: { id: indexId },
    });

    if (!index) {
      throw new NotFoundException(`指数不存在: ${indexId}`);
    }

    // 确定文件路径
    let targetFilePath: string;
    if (filePath) {
      targetFilePath = this.resolveFilePath(filePath);
    } else {
      const dataFile = index.metadata?.data_file;
      if (!dataFile) {
        return {
          success: false,
          message: `指数 ${index.name} 未配置 data_file，请在 metadata 中设置 data_file 字段`,
          total: 0,
          imported: 0,
          skipped: 0,
        };
      }
      targetFilePath = this.resolveFilePath(dataFile);
    }

    this.logger.log(
      `开始导入 ${index.name} 的东财数据，文件: ${targetFilePath}`,
    );

    try {
      // 读取东财数据文件
      const eastmoneyData = await this.readEastmoneyFile(targetFilePath);
      const klines = eastmoneyData.data.klines;

      if (klines.length === 0) {
        return {
          success: true,
          message: '东财数据文件为空',
          total: 0,
          imported: 0,
          skipped: 0,
          filePath: targetFilePath,
          indexName: index.name,
          indexCode: index.code,
        };
      }

      // 转换数据
      const historyData = this.convertToHistoryData(klines);

      // 获取日期范围
      const firstParsed = this.parseKlineString(klines[0]);
      const lastParsed = this.parseKlineString(klines[klines.length - 1]);

      // 保存数据
      const savedCount = await this.indicesService.saveHistoryData(
        indexId,
        historyData,
      );

      // 更新最后同步日期
      if (savedCount > 0 && lastParsed) {
        await this.indicesService.updateLastSyncDate(
          indexId,
          lastParsed.tradeDate,
          savedCount,
        );
      }

      const result: ImportResult = {
        success: true,
        message: `成功导入 ${savedCount} 条数据`,
        total: klines.length,
        imported: savedCount,
        skipped: klines.length - savedCount,
        filePath: targetFilePath,
        indexName: index.name,
        indexCode: index.code,
        dateRange: {
          start: firstParsed?.tradeDate.toISOString().split('T')[0] || '',
          end: lastParsed?.tradeDate.toISOString().split('T')[0] || '',
        },
      };

      this.logger.log(
        `${index.name} 东财数据导入完成: ${result.imported}/${result.total} 条`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `导入 ${index.name} 东财数据失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: `导入失败: ${error.message}`,
        total: 0,
        imported: 0,
        skipped: 0,
        filePath: targetFilePath,
        indexName: index.name,
        indexCode: index.code,
      };
    }
  }

  /**
   * 批量导入所有 sync_mode=json 的指数数据
   * @returns 批量导入结果
   */
  async bulkImport(): Promise<{
    total: number;
    success: number;
    failed: number;
    results: ImportResult[];
  }> {
    // 获取所有 sync_mode=json 的指数
    const indices = await this.indexRepository.find({
      order: { createdAt: 'ASC' },
    });
    const jsonIndices = indices.filter(
      (index) => index.metadata?.sync_mode === 'json',
    );

    if (jsonIndices.length === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        results: [],
      };
    }

    this.logger.log(`开始批量导入东财数据，共 ${jsonIndices.length} 个指数`);

    const results: ImportResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const index of jsonIndices) {
      try {
        const result = await this.importData(index.id);
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        this.logger.error(`导入 ${index.name} 失败: ${error.message}`);
        results.push({
          success: false,
          message: `导入失败: ${error.message}`,
          total: 0,
          imported: 0,
          skipped: 0,
          indexName: index.name,
          indexCode: index.code,
        });
        failedCount++;
      }
    }

    this.logger.log(
      `批量导入完成: 成功 ${successCount}/${jsonIndices.length}, 失败 ${failedCount}`,
    );

    return {
      total: jsonIndices.length,
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  /**
   * 预览东财数据文件内容
   * @param filePath JSON文件路径
   * @param limit 预览条数
   * @returns 预览数据
   */
  async previewData(
    filePath: string,
    limit: number = 10,
  ): Promise<{
    success: boolean;
    message: string;
    code?: string;
    name?: string;
    total?: number;
    preview?: EastmoneyKlineItem[];
  }> {
    try {
      const resolvedPath = this.resolveFilePath(filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          message: `文件不存在: ${resolvedPath}`,
        };
      }

      const data = await this.readEastmoneyFile(resolvedPath);
      const klines = data.data.klines.slice(0, limit);
      const preview = klines
        .map((kline) => this.parseKlineString(kline))
        .filter((item): item is EastmoneyKlineItem => item !== null);

      return {
        success: true,
        message: '预览数据获取成功',
        code: data.data.code,
        name: data.data.name,
        total: data.data.klines.length,
        preview,
      };
    } catch (error) {
      return {
        success: false,
        message: `预览失败: ${error.message}`,
      };
    }
  }

  /**
   * 将通用代码转换为东财secid格式
   * @param code 通用代码，如 sh000300, sz399001, hk00700
   * @returns 东财secid格式，如 1.000300, 0.399001, 116.00700
   */
  private convertToEastmoneySecid(code: string): string {
    const lowerCode = code.toLowerCase();

    // 上交所 (sh) → 1.xxxxxx
    if (lowerCode.startsWith('sh')) {
      return `1.${lowerCode.substring(2)}`;
    }

    // 深交所 (sz) → 0.xxxxxx
    if (lowerCode.startsWith('sz')) {
      return `0.${lowerCode.substring(2)}`;
    }

    // 港股 (hk) → 116.xxxxxx
    if (lowerCode.startsWith('hk')) {
      return `116.${lowerCode.substring(2)}`;
    }

    return lowerCode;
  }

  /**
   * 从东财API获取K线数据
   * @param symbol 股票代码，如 sh000300
   * @param limit 获取条数，默认100
   * @param endDate 结束日期，格式 YYYY-MM-DD，默认2050-01-01表示获取最新数据
   */
  async getKlineFromApi(
    symbol: string,
    limit: number = 100,
    endDate?: string,
  ): Promise<{
    success: boolean;
    data: EastmoneyKlineItem[];
    code: string;
    name: string;
    total: number;
    message?: string;
  }> {
    try {
      const secid = this.convertToEastmoneySecid(symbol);
      const end = endDate ? endDate.replace(/-/g, '') : '20500101';

      // 东财API URL - 使用http协议避免SSL问题
      // fields1: f1,f2,f3,f4,f5,f6 基础字段
      // fields2: f51=日期,f52=开盘,f53=收盘,f54=最高,f55=最低,f56=成交量,f57=成交额,f58=涨跌幅
      // klt=101 日线, fqt=0 不复权
      const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&end=${end}&lmt=${limit}`;

      this.logger.log(`从东财API获取 ${symbol} 数据，secid: ${secid}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 15000,
          headers: this.getEastmoneyHeaders(),
        }),
      );
      console.log(response.data);
      const json = response.data;

      // 检查返回数据
      if (!json.data || !json.data.klines || !Array.isArray(json.data.klines)) {
        return {
          success: false,
          data: [],
          code: symbol,
          name: json.data?.name || symbol,
          total: 0,
          message: '东财API返回数据格式不正确',
        };
      }

      const klines: string[] = json.data.klines;

      if (klines.length === 0) {
        return {
          success: true,
          data: [],
          code: json.data.code || symbol,
          name: json.data.name || symbol,
          total: 0,
          message: '该日期范围内无数据',
        };
      }

      // 解析K线数据
      const parsedData: EastmoneyKlineItem[] = [];
      for (const klineStr of klines) {
        const parsed = this.parseKlineString(klineStr);
        if (parsed) {
          parsedData.push(parsed);
        }
      }

      this.logger.log(
        `从东财API获取 ${symbol} 数据成功: ${parsedData.length} 条`,
      );

      return {
        success: true,
        data: parsedData,
        code: json.data.code || symbol,
        name: json.data.name || symbol,
        total: parsedData.length,
      };
    } catch (error) {
      this.logger.error(`从东财API获取 ${symbol} 数据失败: ${error.message}`);
      return {
        success: false,
        data: [],
        code: symbol,
        name: symbol,
        total: 0,
        message: `请求失败: ${error.message}`,
      };
    }
  }

  /**
   * 从东财API同步数据到数据库
   * @param indexId 指数ID
   * @param limit 获取条数
   * @param endDate 结束日期
   */
  async syncFromApi(
    indexId: string,
    limit: number = 100,
    endDate?: string,
  ): Promise<ImportResult> {
    // 获取指数信息
    const index = await this.indexRepository.findOne({
      where: { id: indexId },
    });

    if (!index) {
      throw new NotFoundException(`指数不存在: ${indexId}`);
    }

    this.logger.log(`开始从东财API同步 ${index.name} 数据`);

    try {
      // 从API获取数据
      const apiResult = await this.getKlineFromApi(index.code, limit, endDate);

      if (!apiResult.success) {
        return {
          success: false,
          message: apiResult.message || '从东财API获取数据失败',
          total: 0,
          imported: 0,
          skipped: 0,
          indexName: index.name,
          indexCode: index.code,
        };
      }

      if (apiResult.data.length === 0) {
        return {
          success: true,
          message: '东财API返回数据为空',
          total: 0,
          imported: 0,
          skipped: 0,
          indexName: index.name,
          indexCode: index.code,
        };
      }

      // 转换为IndexHistory格式
      const historyData: Partial<IndexHistory>[] = apiResult.data.map(
        (item) => ({
          tradeDate: item.tradeDate,
          openPrice: item.openPrice,
          highPrice: item.highPrice,
          lowPrice: item.lowPrice,
          closePrice: item.closePrice,
          volume: item.volume,
          turnover: item.turnover,
          changePercent: item.changePercent,
          changeAmount: null,
          dataSource: 'eastmoney_api',
        }),
      );

      // 保存数据
      const savedCount = await this.indicesService.saveHistoryData(
        indexId,
        historyData,
      );

      // 更新最后同步日期
      const lastData = apiResult.data[apiResult.data.length - 1];
      if (savedCount > 0) {
        await this.indicesService.updateLastSyncDate(
          indexId,
          lastData.tradeDate,
          savedCount,
        );
      }

      const firstData = apiResult.data[0];

      return {
        success: true,
        message: `从东财API成功导入 ${savedCount} 条数据`,
        total: apiResult.data.length,
        imported: savedCount,
        skipped: apiResult.data.length - savedCount,
        indexName: index.name,
        indexCode: index.code,
        dateRange: {
          start: firstData.tradeDate.toISOString().split('T')[0],
          end: lastData.tradeDate.toISOString().split('T')[0],
        },
      };
    } catch (error) {
      this.logger.error(
        `从东财API同步 ${index.name} 数据失败: ${error.message}`,
      );
      return {
        success: false,
        message: `同步失败: ${error.message}`,
        total: 0,
        imported: 0,
        skipped: 0,
        indexName: index.name,
        indexCode: index.code,
      };
    }
  }

  /**
   * 将东财market和code组合成查询用的code格式
   * @param market 市场代码 (0=深交所, 1=上交所, 2=北交所等)
   * @param code 指数代码
   * @returns 组合后的code，如 0.399001, 1.000300, 2.932000
   */
  private composeEastmoneyCode(market: number, code: string): string {
    return `${market}.${code}`;
  }

  /**
   * 根据东财code查找对应的指数
   * @param eastmoneyCode 东财格式的code，如 0.399001, 1.000300
   * @returns 指数实体或null
   */
  private async findIndexByEastmoneyCode(
    eastmoneyCode: string,
  ): Promise<Index | null> {
    // 首先尝试精确匹配metadata.eastmoneyCode
    const indices = await this.indexRepository.find();

    for (const index of indices) {
      // 检查metadata中是否配置了东财代码
      if (index.metadata?.eastmoneyCode === eastmoneyCode) {
        return index;
      }
      // 检查code字段是否匹配（去掉前缀后）
      const indexCodeLower = index.code.toLowerCase();
      const [marketStr, codeStr] = eastmoneyCode.split('.');

      // 上交所 1.xxx -> shxxx
      if (marketStr === '1' && indexCodeLower === `sh${codeStr}`) {
        return index;
      }
      // 深交所 0.xxx -> szxxx
      if (marketStr === '0' && indexCodeLower === `sz${codeStr}`) {
        return index;
      }
      // 北交所 2.xxx -> bjxxx
      if (marketStr === '2' && indexCodeLower === `bj${codeStr}`) {
        return index;
      }
      if (index.code === eastmoneyCode) {
        return index;
      }
    }

    return null;
  }

  /**
   * 检查指定日期是否是当天且交易未结束
   * A股交易时间：9:30-11:30, 13:00-15:00
   * @param tradeDate 交易日期
   * @returns 如果是当天且交易未结束返回true
   */
  private isTodayAndTradingNotEnded(tradeDate: Date): boolean {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tradeDay = new Date(
      tradeDate.getFullYear(),
      tradeDate.getMonth(),
      tradeDate.getDate(),
    );

    // 如果不是当天，直接返回false
    if (tradeDay.getTime() !== today.getTime()) {
      return false;
    }

    // 获取当前时间（小时和分钟）
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // 转换为分钟数

    // A股交易结束时间：15:00 = 15 * 60 = 900 分钟
    const tradingEndTime = 15 * 60;

    // 如果当前时间早于15:00，说明交易未结束
    return currentTime < tradingEndTime;
  }

  /**
   * 人工导入东财JSON数据
   * @param dto 包含东财JSON数据的DTO
   * @returns 导入结果
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importFromJson(body: any): Promise<ImportJsonResult> {
    // 支持两种格式：
    // 1. { data: 东财JSON, indexId?: string }
    // 2. 东财JSON 直接作为 body

    let eastmoneyData: any;
    let indexId: string | undefined;

    // 判断格式
    if (body.data && body.data.data && Array.isArray(body.data.data.klines)) {
      // 格式1：嵌套在 data 字段中
      eastmoneyData = body.data;
      indexId = body.indexId;
    } else if (body.data && Array.isArray(body.data.klines)) {
      // 格式2：直接是东财JSON
      eastmoneyData = body;
      indexId = undefined;
    } else {
      return {
        success: false,
        message: '东财JSON数据格式不正确，缺少klines数组',
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }

    // 验证数据格式
    if (
      !eastmoneyData?.data?.klines ||
      !Array.isArray(eastmoneyData.data.klines)
    ) {
      return {
        success: false,
        message: '东财JSON数据格式不正确，缺少klines数组',
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }

    const { market, code, name, klines } = eastmoneyData.data;
    const eastmoneyCode = this.composeEastmoneyCode(market, code);

    this.logger.log(`开始处理东财JSON数据: ${eastmoneyCode} (${name})`);

    try {
      // 查找对应的指数
      let index: Index | null = null;

      if (indexId) {
        // 如果指定了indexId，直接查找
        index = await this.indexRepository.findOne({ where: { id: indexId } });
        if (!index) {
          return {
            success: false,
            message: `指定的指数ID不存在: ${indexId}`,
            total: 0,
            imported: 0,
            skipped: 0,
          };
        }
      } else {
        // 自动根据code查找
        index = await this.findIndexByEastmoneyCode(eastmoneyCode);
        if (!index) {
          return {
            success: false,
            message: `未找到匹配的指数: ${eastmoneyCode} (${name})，请在metadata中配置eastmoneyCode或通过indexId指定`,
            total: 0,
            imported: 0,
            skipped: 0,
          };
        }
      }

      this.logger.log(`匹配到指数: ${index.name} (${index.code})`);

      // 转换数据并过滤掉当天交易未结束的数据
      const historyData: Partial<IndexHistory>[] = [];
      let skippedTodayCount = 0;

      for (const klineStr of klines) {
        const parsed = this.parseKlineString(klineStr);
        if (parsed) {
          // 检查是否是当天且交易未结束
          if (this.isTodayAndTradingNotEnded(parsed.tradeDate)) {
            this.logger.log(
              `跳过当天交易未结束的数据: ${parsed.tradeDate.toISOString().split('T')[0]}`,
            );
            skippedTodayCount++;
            continue;
          }
          historyData.push({
            tradeDate: parsed.tradeDate,
            openPrice: parsed.openPrice,
            highPrice: parsed.highPrice,
            lowPrice: parsed.lowPrice,
            closePrice: parsed.closePrice,
            volume: parsed.volume,
            turnover: parsed.turnover,
            changePercent: parsed.changePercent,
            changeAmount: null,
            dataSource: 'eastmoney',
          });
        }
      }

      if (historyData.length === 0) {
        const message =
          skippedTodayCount > 0
            ? `东财JSON数据中包含 ${skippedTodayCount} 条当天交易未结束的数据，已跳过。无有效数据可导入。`
            : '东财JSON数据中没有有效的K线数据';
        return {
          success: true,
          message,
          indexId: index.id,
          indexName: index.name,
          indexCode: index.code,
          total: klines.length,
          imported: 0,
          skipped: klines.length,
        };
      }

      // 获取日期范围
      const firstParsed = historyData[0]?.tradeDate;
      const lastParsed = historyData[historyData.length - 1]?.tradeDate;

      // 保存数据（只新增增量数据）
      const savedCount = await this.indicesService.saveHistoryData(
        index.id,
        historyData,
      );

      // 更新最后同步日期
      if (savedCount > 0 && lastParsed) {
        await this.indicesService.updateLastSyncDate(
          index.id,
          lastParsed,
          savedCount,
        );
      }

      const result: ImportJsonResult = {
        success: true,
        message: `成功导入 ${savedCount} 条数据，跳过 ${klines.length - savedCount} 条（其中 ${skippedTodayCount} 条为当天交易未结束）`,
        indexId: index.id,
        indexName: index.name,
        indexCode: index.code,
        total: klines.length,
        imported: savedCount,
        skipped: klines.length - savedCount,
        dateRange: {
          start: firstParsed?.toISOString().split('T')[0] || '',
          end: lastParsed?.toISOString().split('T')[0] || '',
        },
      };

      this.logger.log(
        `${index.name} 东财JSON数据导入完成: ${result.imported}/${result.total} 条`,
      );

      return result;
    } catch (error) {
      this.logger.error(`导入东财JSON数据失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: `导入失败: ${error.message}`,
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }
  }

  /**
   * 获取所有配置了东财数据源的指数
   * @returns 东财数据源指数列表
   */
  async getEastmoneyIndices(): Promise<
    {
      id: string;
      code: string;
      name: string;
      officialCode?: string;
      eastmoneyCode: string;
      eastmoneyUrl: string;
      lastSyncDate?: Date;
    }[]
  > {
    const indices = await this.indexRepository.find({
      order: { createdAt: 'ASC' },
    });

    return indices
      .filter((index) => index.metadata?.data_source === 'easymoney')
      .map((index) => {
        // 构建东财代码
        let eastmoneyCode = index.code;

        // 构建东财网页URL - 使用http协议
        const eastmoneyUrl = eastmoneyCode
          ? `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${eastmoneyCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=10`
          : '';

        https: return {
          id: index.id,
          code: index.code,
          name: index.name,
          officialCode: index.officialCode,
          eastmoneyCode: eastmoneyCode || '',
          eastmoneyUrl,
          lastSyncDate: index.lastSyncDate || undefined,
        };
      })
      .filter((item) => item.eastmoneyCode); // 过滤掉无法转换的
  }

  /**
   * 从东财API获取数据并直接导入（一键同步）
   * @param indexId 指数ID
   * @param limit 获取条数，默认500
   * @returns 导入结果
   */
  async fetchAndImportFromEastmoney(
    indexId: string,
    limit: number = 500,
  ): Promise<ImportJsonResult> {
    // 获取指数信息
    const index = await this.indexRepository.findOne({
      where: { id: indexId },
    });

    if (!index) {
      return {
        success: false,
        message: `指数不存在: ${indexId}`,
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }

    // 获取东财代码
    let eastmoneyCode = index.metadata?.eastmoneyCode;
    if (!eastmoneyCode) {
      const codeLower = index.code.toLowerCase();
      if (codeLower.startsWith('sh')) {
        eastmoneyCode = `1.${codeLower.substring(2)}`;
      } else if (codeLower.startsWith('sz')) {
        eastmoneyCode = `0.${codeLower.substring(2)}`;
      } else if (codeLower.startsWith('bj')) {
        eastmoneyCode = `2.${codeLower.substring(2)}`;
      }
    }

    if (!eastmoneyCode) {
      return {
        success: false,
        message: `无法确定东财代码: ${index.code}，请在metadata中配置eastmoneyCode`,
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }

    this.logger.log(
      `开始从东财API获取 ${index.name} 数据，code: ${eastmoneyCode}`,
    );

    try {
      // 调用东财API - 使用http协议避免SSL问题
      const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${eastmoneyCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&end=20500101&lmt=${limit}`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 30000,
          headers: this.getEastmoneyHeaders(),
        }),
      );

      const jsonData = response.data;

      // 验证数据
      if (!jsonData?.data?.klines || !Array.isArray(jsonData.data.klines)) {
        return {
          success: false,
          message: '东财API返回数据格式不正确',
          total: 0,
          imported: 0,
          skipped: 0,
        };
      }

      // 使用现有的importFromJson方法导入数据
      return await this.importFromJson({
        data: jsonData as any,
        indexId: index.id,
      });
    } catch (error) {
      this.logger.error(`从东财API获取数据失败: ${error.message}`);
      return {
        success: false,
        message: `从东财API获取数据失败: ${error.message}`,
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }
  }
}
