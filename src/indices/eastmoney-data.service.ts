import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';
import { IndicesService } from './indices.service';
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

  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(IndexHistory)
    private historyRepository: Repository<IndexHistory>,
    private readonly indicesService: IndicesService,
  ) {
    // 默认数据目录：项目根目录下的 index_data
    this.dataDir = path.resolve(process.cwd(), 'index_data');
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
  async importData(
    indexId: string,
    filePath?: string,
  ): Promise<ImportResult> {
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

    this.logger.log(`开始导入 ${index.name} 的东财数据，文件: ${targetFilePath}`);

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
    const indices = await this.indexRepository.find();
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
}
