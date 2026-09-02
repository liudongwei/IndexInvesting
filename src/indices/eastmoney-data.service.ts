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
import * as http from 'http';
import * as https from 'https';




/**
 * 全局请求时间控制 - 确保所有东财请求间隔至少3秒
 */
let globalLastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3500; // 最小请求间隔3.5秒

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
   * 添加动态请求头以模拟真实浏览器行为
   */
  private getEastmoneyHeaders(): Record<string, string> {
    const baseHeaders = {
      ...this.eastmoneyConfig.headers,
      Cookie: this.eastmoneyConfig.cookie,
    };

    // 添加动态请求头，模拟真实浏览器行为
    return {
      ...baseHeaders,
      // 添加随机性，避免请求模式过于固定
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
  }

  /**
   * 随机延迟，用于反爬防护
   * @param minMs 最小延迟毫秒数
   * @param maxMs 最大延迟毫秒数
   */
  private async randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 全局请求间隔控制 - 确保两次请求间隔至少3.5秒
   */
  private async enforceGlobalRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - globalLastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.log(`全局限流：等待 ${waitTime}ms 以满足最小请求间隔...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    
    globalLastRequestTime = Date.now();
  }

  /**
   * 生成随机的东财push2his域名
   * 东财提供多个节点：1.push2his.eastmoney.com, 99.push2his.eastmoney.com等
   * @param useRandom 是否使用随机数，默认false（优先使用基础域名）
   * @returns 生成的完整域名，如 "push2his.eastmoney.com" 或 "99.push2his.eastmoney.com"
   */
  private generateRandomPush2HisDomain(useRandom: boolean = false): string {
    // 如果不使用随机数，返回基础域名
    if (!useRandom) {
      return 'push2his.eastmoney.com';
    }
    // 随机生成1-99之间的数字
    const randomNum = Math.floor(Math.random() * 99) + 1;
    return `${randomNum}.push2his.eastmoney.com`;
  }

  /**
   * 构建带随机节点的东财API URL
   * @param basePath API路径部分（不含域名）
   * @param queryParams 查询参数字符串
   * @param useRandom 是否使用随机数域名，默认false
   * @returns 完整的URL
   */
  private buildEastmoneyUrl(basePath: string, queryParams: string, useRandom: boolean = false): string {
    const domain = this.generateRandomPush2HisDomain(useRandom);
    return `http://${domain}${basePath}?${queryParams}`;
  }

  /**
   * 带重试机制的HTTP请求（支持域名故障转移）
   * @param url 请求URL
   * @param maxRetries 最大重试次数
   * @param retryDelay 重试延迟基数（毫秒）
   */
  private async requestWithRetry(
    url: string,
    maxRetries: number = 3,
    retryDelay: number = 2000,
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 全局限流检查
        await this.enforceGlobalRateLimit();

        // 每次请求前添加随机延迟（第一次除外）
        if (attempt > 1) {
          const delay = retryDelay * (attempt - 1) + Math.floor(Math.random() * 1000);
          this.logger.log(`第 ${attempt} 次尝试，等待 ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // 如果是第一次尝试，使用基础域名；后续重试使用随机域名
        let requestUrl = url;
        if (attempt > 1 && url.includes('push2his.eastmoney.com')) {
          // 解析原URL，提取路径和参数
          const urlObj = new URL(url);
          const basePath = urlObj.pathname;
          const queryParams = urlObj.search.substring(1); // 去掉开头的 '?'
          requestUrl = this.buildEastmoneyUrl(basePath, queryParams, true); // 重试时使用随机域名
          this.logger.log(`域名故障转移：从 ${urlObj.hostname} 切换到随机节点...`);
        } else if (attempt === 1 && url.includes('push2his.eastmoney.com')) {
          // 第一次尝试时确保使用基础域名
          const urlObj = new URL(url);
          const basePath = urlObj.pathname;
          const queryParams = urlObj.search.substring(1);
          requestUrl = this.buildEastmoneyUrl(basePath, queryParams, false); // 首次使用基础域名
          this.logger.log(`首次请求使用基础域名: ${requestUrl}`);
        }

        // 使用普通HTTP请求
        this.logger.log(`使用普通HTTP请求 (第 ${attempt}/${maxRetries} 次)，URL: ${requestUrl}`);
        
        // 创建新的agent，禁用keep-alive，每次请求使用新连接
        const httpAgent = new http.Agent({ 
          keepAlive: false,
          maxSockets: 1, // 限制并发连接数
        });

        const response = await firstValueFrom(
          this.httpService.get(requestUrl, {
            timeout: 30000,
            headers: this.getEastmoneyHeaders(),
            httpAgent: httpAgent,
            // 确保不使用缓存响应
            validateStatus: () => true,
          }),
        );

        // 检查是否被拦截（返回HTML而不是JSON）
        if (typeof response.data === 'string' && response.data.includes('<html')) {
          throw new Error('请求被拦截：返回了HTML页面而非JSON数据');
        }

        return response.data;
      } catch (error) {
        lastError = error as Error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`第 ${attempt}/${maxRetries} 次请求失败: ${errorMsg}`);

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 针对 socket hang up 或连接重置错误，增加额外延迟
        if (errorMsg.includes('socket hang up') || 
            errorMsg.includes('ECONNRESET') || 
            errorMsg.includes('被拦截')) {
          const extraDelay = 3000 + Math.floor(Math.random() * 3000);
          this.logger.log(`检测到连接问题，额外等待 ${extraDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, extraDelay));
        }
      }
    }

    throw lastError || new Error('请求失败，已达到最大重试次数');
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

    return code;
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

      // 东财API URL - 使用随机节点域名避免IP被封
      // fields1: f1,f2,f3,f4,f5,f6 基础字段
      // fields2: f51=日期,f52=开盘,f53=收盘,f54=最高,f55=最低,f56=成交量,f57=成交额,f58=涨跌幅
      // klt=101 日线, fqt=0 不复权
      const basePath = '/api/qt/stock/kline/get';
      const queryParams = `secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&end=${end}&lmt=${limit}`;
      const url = this.buildEastmoneyUrl(basePath, queryParams);

      this.logger.log(`从东财API获取 ${symbol} 数据，secid: ${secid}`);

      // 请求前添加随机延迟，避免请求过于规律
      await this.randomDelay(1500, 2500);

      // 使用带重试机制的请求
      const json = await this.requestWithRetry(url, 3, 3000);

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
   * @param eastmoneyCode 东财格式的code，如 0.399001, 1.000300, 2.931994
   * @returns 指数实体或null
   */
  private async findIndexByEastmoneyCode(
    eastmoneyCode: string,
  ): Promise<Index | null> {
    // 首先尝试精确匹配metadata.eastmoneyCode
    const indices = await this.indexRepository.find();

    for (const index of indices) {
      // 检查metadata中是否配置了东财代码（优先精确匹配）
      if (index.metadata?.eastmoneyCode === eastmoneyCode) {
        return index;
      }
      // 直接匹配code字段
      if (index.code === eastmoneyCode) {
        return index;
      }
    }

    return null;
  }

  /**
   * 判断指数是否属于贵金属
   * 贵金属：24小时交易（实际23小时，每天1小时结算休市），周末也交易
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
   * 判断指数是否属于日本或韩国市场
   * 日本：14:30收盘（北京时间）
   * 韩国：14:30收盘（北京时间）
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
      name.includes('N225') ||
      code.includes('N225') ||
      code.includes('KS11')
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
   * 生成导入结果消息
   * @param index 指数实体
   * @param imported 导入条数
   * @param total 总条数
   * @param skippedToday 跳过的当天数据条数
   * @returns 格式化后的消息
   */
  private generateImportMessage(
    index: Index,
    imported: number,
    total: number,
    skippedToday: number,
  ): string {
    const skippedTotal = total - imported;
    
    if (skippedToday > 0) {
      // 根据市场类型给出不同的提示
      if (this.isPreciousMetal(index)) {
        return `成功导入 ${imported} 条数据，跳过 ${skippedTotal} 条（其中 ${skippedToday} 条为贵金属当天数据，因23小时连续交易尚未完整）`;
      } else if (this.isTaiwanStock(index)) {
        return `成功导入 ${imported} 条数据，跳过 ${skippedTotal} 条（其中 ${skippedToday} 条为台湾市场当天交易未结束，13:30收盘）`;
      } else if (this.isJapanKoreaStock(index)) {
        return `成功导入 ${imported} 条数据，跳过 ${skippedTotal} 条（其中 ${skippedToday} 条为日本/韩国市场当天交易未结束，14:30收盘）`;
      } else {
        return `成功导入 ${imported} 条数据，跳过 ${skippedTotal} 条（其中 ${skippedToday} 条为A股当天交易未结束，15:00收盘）`;
      }
    }
    
    return `成功导入 ${imported} 条数据，跳过 ${skippedTotal} 条（已存在）`;
  }

  /**
   * 检查指定日期是否是当天且交易未结束
   * 根据不同市场类型采用不同规则：
   * - 贵金属：23小时连续交易，当天数据始终不完整（需等到次日）
   * - 台湾：13:30收盘（北京时间），当天13:30前数据不完整
   * - 日本/韩国：14:30收盘（北京时间），当天14:30前数据不完整
   * - A股：15:00收盘（北京时间），当天15:00前数据不完整
   * @param tradeDate 交易日期
   * @param index 指数实体
   * @returns 如果是当天且交易未结束返回true
   */
  private isTodayAndTradingNotEnded(tradeDate: Date, index: Index): boolean {
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

    // 贵金属特殊处理：23小时连续交易，当天数据始终不完整
    if (this.isPreciousMetal(index)) {
      this.logger.log(
        `贵金属指数 ${index.name}：跳过当天数据（23小时连续交易，当天数据尚未完整）`,
      );
      return true;
    }

    // 获取当前时间（小时和分钟）
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // 转换为分钟数

    // 台湾市场：13:30收盘
    if (this.isTaiwanStock(index)) {
      const tradingEndTime = 13 * 60 + 30; // 13:30 = 810 分钟
      if (currentTime < tradingEndTime) {
        this.logger.log(
          `台湾指数 ${index.name}：当前时间 ${currentHour}:${String(currentMinute).padStart(2, '0')} 早于收盘时间 13:30，跳过当天数据`,
        );
        return true;
      }
      return false;
    }

    // 日本/韩国市场：14:30收盘
    if (this.isJapanKoreaStock(index)) {
      const tradingEndTime = 14 * 60 + 30; // 14:30 = 870 分钟
      if (currentTime < tradingEndTime) {
        this.logger.log(
          `日本/韩国指数 ${index.name}：当前时间 ${currentHour}:${String(currentMinute).padStart(2, '0')} 早于收盘时间 14:30，跳过当天数据`,
        );
        return true;
      }
      return false;
    }

    // A股市场：15:00收盘
    const tradingEndTime = 15 * 60; // 15:00 = 900 分钟
    if (currentTime < tradingEndTime) {
      this.logger.log(
        `A股指数 ${index.name}：当前时间 ${currentHour}:${String(currentMinute).padStart(2, '0')} 早于收盘时间 15:00，跳过当天数据`,
      );
      return true;
    }

    return false;
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
          // 检查是否是当天且交易未结束（根据指数类型判断）
          if (this.isTodayAndTradingNotEnded(parsed.tradeDate, index)) {
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
        let message: string;
        if (skippedTodayCount > 0) {
          // 根据指数类型给出不同的提示
          if (this.isPreciousMetal(index)) {
            message = `贵金属指数 ${index.name}：JSON数据中包含 ${skippedTodayCount} 条当天数据，因贵金属23小时连续交易（当天数据尚未完整）已跳过。无有效数据可导入。`;
          } else if (this.isTaiwanStock(index)) {
            message = `台湾指数 ${index.name}：JSON数据中包含 ${skippedTodayCount} 条当天交易未结束的数据（13:30收盘），已跳过。无有效数据可导入。`;
          } else if (this.isJapanKoreaStock(index)) {
            message = `日本/韩国指数 ${index.name}：JSON数据中包含 ${skippedTodayCount} 条当天交易未结束的数据（14:30收盘），已跳过。无有效数据可导入。`;
          } else {
            message = `A股指数 ${index.name}：JSON数据中包含 ${skippedTodayCount} 条当天交易未结束的数据（15:00收盘），已跳过。无有效数据可导入。`;
          }
        } else {
          message = '东财JSON数据中没有有效的K线数据';
        }
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
        message: this.generateImportMessage(
          index,
          savedCount,
          klines.length,
          skippedTodayCount,
        ),
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

        // 构建东财网页URL - 使用随机节点域名
        const basePath = '/api/qt/stock/kline/get';
        const queryParams = `secid=${eastmoneyCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=10`;
        const eastmoneyUrl = this.buildEastmoneyUrl(basePath, queryParams);

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
      // 调用东财API - 使用随机节点域名避免IP被封
      const basePath = '/api/qt/stock/kline/get';
      const queryParams = `secid=${eastmoneyCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&end=20500101&lmt=${limit}`;
      const url = this.buildEastmoneyUrl(basePath, queryParams);

      // 请求前添加随机延迟
      await this.randomDelay(1500, 3000);

      // 使用带重试机制的请求
      const jsonData = await this.requestWithRetry(url, 3, 3000);

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
