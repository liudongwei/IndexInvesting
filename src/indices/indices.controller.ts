import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IndicesService } from './indices.service';
import { IndexSyncService } from './index-sync.service';
import { IndexDataService } from './index-data.service';
import { EastmoneyDataService } from './eastmoney-data.service';
import { CreateIndexDto } from './dto/create-index.dto';
import { UpdateIndexDto } from './dto/update-index.dto';
import {
  UpdateMetadataDto,
  BulkUpdateMetadataDto,
} from './dto/update-metadata.dto';
import { ResyncDto, BulkResyncDto } from './dto/resync.dto';
import { ImportEastmoneyJsonDto } from './dto/import-eastmoney-json.dto';
import { UpdateEastmoneyCookieDto } from './dto/update-eastmoney-cookie.dto';

@ApiTags('大盘指数管理')
@Controller('indices')
export class IndicesController {
  constructor(
    private readonly indicesService: IndicesService,
    private readonly indexSyncService: IndexSyncService,
    private readonly indexDataService: IndexDataService,
    private readonly eastmoneyDataService: EastmoneyDataService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建指数' })
  create(@Body() createIndexDto: CreateIndexDto) {
    return this.indicesService.create(createIndexDto);
  }

  @Get()
  @ApiOperation({ summary: '获取所有指数' })
  findAll() {
    return this.indicesService.findAll();
  }

  @Get('by-code/:code')
  @ApiOperation({ summary: '根据指数代码查询' })
  async findByCode(@Param('code') code: string) {
    const index = await this.indicesService.findByCode(code);
    if (!index) {
      return { success: false, message: '指数不存在' };
    }
    return index;
  }

  @Get('by-official-code/:officialCode')
  @ApiOperation({ summary: '根据官方标准代码查询' })
  async findByOfficialCode(@Param('officialCode') officialCode: string) {
    const index = await this.indicesService.findByOfficialCode(officialCode);
    if (!index) {
      return { success: false, message: '指数不存在' };
    }
    return index;
  }

  @Get('eastmoney-indices')
  @ApiOperation({
    summary: '获取所有配置了东财数据源的指数',
    description:
      '返回所有metadata.data_source为eastmoney/easymoney或配置了eastmoneyCode的指数列表，包含东财网页链接。',
  })
  async getEastmoneyIndices() {
    try {
      const indices = await this.eastmoneyDataService.getEastmoneyIndices();
      return {
        success: true,
        count: indices.length,
        data: indices,
      };
    } catch (error) {
      return {
        success: false,
        message: `获取失败: ${error.message}`,
        data: [],
      };
    }
  }

  @Post('import-eastmoney-json')
  @UsePipes()
  @ApiOperation({
    summary: '人工导入东财JSON数据',
    description: `直接提交东财JSON数据对象进行导入。系统会根据market.code自动匹配指数，或可通过indexId手动指定。

匹配规则：
- 优先匹配metadata.eastmoneyCode字段
- 其次根据code自动匹配：1.xxx→shxxx, 0.xxx→szxxx, 2.xxx→bjxxx

示例数据格式：
{
  "rc": 0,
  "rt": 17,
  "svr": 181669690,
  "lt": 1,
  "full": 0,
  "dlmkts": "",
  "dsc": "0",
  "data": {
    "code": "932000",
    "market": 2,
    "name": "中证2000",
    "decimal": 2,
    "dktotal": 3066,
    "preKPrice": 2920.82,
    "klines": [
      "2026-08-05,2917.80,3000.29,3006.64,2917.50,294193994,406909826043.00,3.05"
    ]
  }
}`,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importEastmoneyJson(@Body() body: any) {
    try {
      const result = await this.eastmoneyDataService.importFromJson(body);
      return result;
    } catch (error) {
      return {
        success: false,
        message: `导入失败: ${error.message}`,
        total: 0,
        imported: 0,
        skipped: 0,
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: '获取指数详情' })
  findOne(@Param('id') id: string) {
    return this.indicesService.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '获取指数历史数据' })
  getHistory(@Param('id') id: string, @Query('limit') limit: string = '100') {
    return this.indicesService.getHistoryByIndexId(id, parseInt(limit, 10));
  }

  @Post(':id/sync')
  @ApiOperation({ summary: '手动同步指数数据' })
  async syncData(@Param('id') id: string) {
    const index = await this.indicesService.findOne(id);
    const result = await this.indexSyncService.syncIndexData(index);
    return {
      success: true,
      message: `同步完成，新增/更新 ${result} 条数据`,
    };
  }

  @Post(':id/sync-with-retry')
  @ApiOperation({
    summary: '带重试机制的手动同步',
    description:
      '同步失败会自动重试，默认重试3次，每次间隔2秒。支持数据校验（检查收盘价是否为0）。',
  })
  async syncDataWithRetry(
    @Param('id') id: string,
    @Query('maxRetries') maxRetries?: string,
    @Query('retryDelay') retryDelay?: string,
  ) {
    const index = await this.indicesService.findOne(id);

    const maxRetriesNum = maxRetries ? parseInt(maxRetries, 10) : 3;
    const retryDelayNum = retryDelay ? parseInt(retryDelay, 10) : 2000;

    if (isNaN(maxRetriesNum) || maxRetriesNum < 1 || maxRetriesNum > 10) {
      return {
        success: false,
        message: 'maxRetries 参数错误，请输入 1-10 之间的整数',
      };
    }

    if (isNaN(retryDelayNum) || retryDelayNum < 500 || retryDelayNum > 30000) {
      return {
        success: false,
        message: 'retryDelay 参数错误，请输入 500-30000 之间的整数（毫秒）',
      };
    }

    const result = await this.indexSyncService.syncIndexDataWithRetry(
      index,
      maxRetriesNum,
      retryDelayNum,
    );

    if (result.success) {
      return {
        success: true,
        message: `同步成功，共 ${result.count} 条数据，尝试 ${result.attempts} 次`,
        data: result,
      };
    } else {
      return {
        success: false,
        message: `同步失败，已尝试 ${result.attempts} 次，最后错误: ${result.error}`,
        data: result,
      };
    }
  }

  @Post(':id/resync')
  @ApiOperation({
    summary: '按日期范围重新同步数据',
    description:
      '重新同步指定日期范围内的数据。会先删除该范围内的旧数据，然后从API获取新数据并保存。用于修复数据不准确的情况。',
  })
  async resyncByDateRange(@Param('id') id: string, @Body() dto: ResyncDto) {
    const index = await this.indicesService.findOne(id);

    const result = await this.indexSyncService.resyncByDateRange(
      index,
      dto.startDate,
      dto.endDate,
    );

    return result;
  }

  @Post('resync')
  @ApiOperation({
    summary: '批量重新同步所有指数数据',
    description:
      '按日期范围重新同步所有指数的数据。不指定指数ID，会自动同步所有符合条件的指数。默认只同步 isActive=true 的指数。',
  })
  async bulkResync(@Body() dto: BulkResyncDto) {
    const onlyActive = dto.onlyActive !== 'false';

    const result = await this.indexSyncService.bulkResyncByDateRange(
      dto.startDate,
      dto.endDate,
      onlyActive,
    );

    return {
      success: true,
      message: `批量重新同步完成，成功: ${result.success}，失败: ${result.failed}，共更新: ${result.total} 条数据`,
      data: result,
    };
  }

  @Post(':id/sync-by-year')
  @ApiOperation({ summary: '按年递增同步历史数据（首次全量同步使用）' })
  async syncDataByYear(
    @Param('id') id: string,
    @Query('startYear') startYear: string,
    @Query('endYear') endYear?: string,
  ) {
    const index = await this.indicesService.findOne(id);
    const startYearNum = parseInt(startYear, 10);
    const endYearNum = endYear ? parseInt(endYear, 10) : undefined;

    if (isNaN(startYearNum) || startYearNum < 1900 || startYearNum > 2100) {
      return {
        success: false,
        message: '开始年份格式错误，请输入 1900-2100 之间的年份',
      };
    }

    const result = await this.indexSyncService.syncIndexDataByYear(
      index,
      startYearNum,
      endYearNum,
    );

    return {
      success: true,
      message: `按年同步完成，共 ${result.total} 条数据`,
      details: result,
    };
  }

  @Post(':id/sync-by-metadata')
  @ApiOperation({
    summary: '根据 metadata 智能同步历史数据',
    description:
      '根据 metadata.sync_mode 判断同步方式，根据 metadata.firstTradingDay 确定起始年份，自动按年递增拉取数据。港股自动识别不加 qfq 参数。',
  })
  async syncDataByMetadata(
    @Param('id') id: string,
    @Query('forceStartYear') forceStartYear?: string,
    @Query('endYear') endYear?: string,
  ) {
    const index = await this.indicesService.findOne(id);

    let forceStartYearNum: number | undefined;
    if (forceStartYear) {
      forceStartYearNum = parseInt(forceStartYear, 10);
      if (
        isNaN(forceStartYearNum) ||
        forceStartYearNum < 1900 ||
        forceStartYearNum > 2100
      ) {
        return {
          success: false,
          message: '强制开始年份格式错误，请输入 1900-2100 之间的年份',
        };
      }
    }

    let endYearNum: number | undefined;
    if (endYear) {
      endYearNum = parseInt(endYear, 10);
      if (isNaN(endYearNum) || endYearNum < 1900 || endYearNum > 2100) {
        return {
          success: false,
          message: '结束年份格式错误，请输入 1900-2100 之间的年份',
        };
      }
    }

    const result = await this.indexSyncService.syncIndexDataByMetadata(
      index,
      forceStartYearNum,
      endYearNum,
    );

    return result;
  }

  @Post('bulk-sync-by-metadata')
  @ApiOperation({
    summary: '批量智能同步所有符合条件的指数',
    description:
      '同步所有 sync_mode=api 的指数，根据各自的 metadata.firstTradingDay 自动确定起始年份，按年递增拉取数据。',
  })
  async bulkSyncByMetadata(
    @Query('onlyActive') onlyActive: string = 'true',
    @Query('endYear') endYear?: string,
  ) {
    const onlyActiveBool = onlyActive !== 'false';

    let endYearNum: number | undefined;
    if (endYear) {
      endYearNum = parseInt(endYear, 10);
      if (isNaN(endYearNum) || endYearNum < 1900 || endYearNum > 2100) {
        return {
          success: false,
          message: '结束年份格式错误，请输入 1900-2100 之间的年份',
        };
      }
    }

    const result = await this.indexSyncService.bulkSyncByMetadata(
      onlyActiveBool,
      endYearNum,
    );

    return {
      success: true,
      message: `批量智能同步完成，共 ${result.total} 条数据`,
      details: result,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新指数信息' })
  update(@Param('id') id: string, @Body() updateIndexDto: UpdateIndexDto) {
    return this.indicesService.update(id, updateIndexDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除指数' })
  remove(@Param('id') id: string) {
    return this.indicesService.remove(id);
  }

  @Post(':id/import-eastmoney')
  @ApiOperation({
    summary: '从东财JSON文件导入数据',
    description:
      '从东财导出的JSON文件解析并导入历史数据。如果不传filePath参数，则使用metadata.data_file配置的文件路径。',
  })
  async importFromEastmoney(
    @Param('id') id: string,
    @Query('filePath') filePath?: string,
  ) {
    try {
      const result = await this.eastmoneyDataService.importData(id, filePath);
      return result;
    } catch (error) {
      return {
        success: false,
        message: `导入失败: ${error.message}`,
      };
    }
  }

  @Post(':id/sync-eastmoney-api')
  @ApiOperation({
    summary: '从东财API同步数据',
    description:
      '直接调用东财API获取数据并同步到数据库，无需手动下载JSON文件。支持A股(sh/sz)和港股(hk)。',
  })
  async syncFromEastmoneyApi(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        return {
          success: false,
          message: 'limit 参数错误，请输入 1-1000 之间的整数',
        };
      }

      // 验证日期格式
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return {
          success: false,
          message: 'endDate 格式错误，请使用 YYYY-MM-DD 格式',
        };
      }

      const result = await this.eastmoneyDataService.syncFromApi(
        id,
        limitNum,
        endDate,
      );
      return result;
    } catch (error) {
      return {
        success: false,
        message: `同步失败: ${error.message}`,
      };
    }
  }

  @Post('bulk-import-eastmoney')
  @ApiOperation({
    summary: '批量导入所有sync_mode=json的指数数据',
    description:
      '自动导入所有metadata.sync_mode为json的指数数据，使用metadata.data_file指定的文件路径。',
  })
  async bulkImportEastmoney() {
    const result = await this.eastmoneyDataService.bulkImport();
    return {
      success: true,
      message: `批量导入完成，成功 ${result.success}/${result.total} 个指数`,
      details: result,
    };
  }

  @Post(':id/metadata')
  @ApiOperation({
    summary: '更新单个指数的metadata',
    description:
      '更新指定指数的metadata字段。默认合并模式会将新数据与现有metadata合并，replace=true时会完全替换。',
  })
  async updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateMetadataDto,
  ) {
    try {
      const result = await this.indicesService.updateMetadata(
        id,
        dto.metadata,
        dto.replace,
      );
      return {
        success: true,
        message: 'metadata更新成功',
        data: {
          id: result.id,
          name: result.name,
          metadata: result.metadata,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `更新失败: ${error.message}`,
      };
    }
  }

  @Post('bulk-metadata')
  @ApiOperation({
    summary: '批量更新多个指数的metadata',
    description:
      '批量更新多个指数的metadata字段。默认合并模式，replace=true时完全替换。',
  })
  async bulkUpdateMetadata(@Body() dto: BulkUpdateMetadataDto) {
    const result = await this.indicesService.bulkUpdateMetadata(
      dto.indexIds,
      dto.metadata,
      dto.replace,
    );
    return {
      success: true,
      message: `批量更新完成，成功 ${result.success}/${result.total} 个指数`,
      data: result,
    };
  }

  @Post('eastmoney/cookie')
  @ApiOperation({ summary: '更新东财 Cookie' })
  @UsePipes(new ValidationPipe())
  updateEastmoneyCookie(@Body() dto: UpdateEastmoneyCookieDto) {
    return this.eastmoneyDataService.updateCookie(dto.cookie);
  }

  @Get('eastmoney/cookie-status')
  @ApiOperation({ summary: '获取东财 Cookie 状态' })
  getEastmoneyCookieStatus() {
    return this.eastmoneyDataService.getConfigStatus();
  }
}
