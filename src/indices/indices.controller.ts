import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IndicesService } from './indices.service';
import { IndexSyncService } from './index-sync.service';
import { IndexDataService } from './index-data.service';
import { EastmoneyDataService } from './eastmoney-data.service';
import { CreateIndexDto } from './dto/create-index.dto';
import { UpdateIndexDto } from './dto/update-index.dto';

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

  @Get(':id')
  @ApiOperation({ summary: '获取指数详情' })
  findOne(@Param('id') id: string) {
    return this.indicesService.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: '获取指数历史数据' })
  getHistory(
    @Param('id') id: string,
    @Query('limit') limit: string = '100',
  ) {
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

    if (isNaN(startYearNum) || startYearNum < 1990 || startYearNum > 2100) {
      return {
        success: false,
        message: '开始年份格式错误，请输入 1990-2100 之间的年份',
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
    description: '根据 metadata.sync_mode 判断同步方式，根据 metadata.firstTradingDay 确定起始年份，自动按年递增拉取数据。港股自动识别不加 qfq 参数。'
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
      if (isNaN(forceStartYearNum) || forceStartYearNum < 1990 || forceStartYearNum > 2100) {
        return {
          success: false,
          message: '强制开始年份格式错误，请输入 1990-2100 之间的年份',
        };
      }
    }
    
    let endYearNum: number | undefined;
    if (endYear) {
      endYearNum = parseInt(endYear, 10);
      if (isNaN(endYearNum) || endYearNum < 1990 || endYearNum > 2100) {
        return {
          success: false,
          message: '结束年份格式错误，请输入 1990-2100 之间的年份',
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
    description: '同步所有 sync_mode=api 的指数，根据各自的 metadata.firstTradingDay 自动确定起始年份，按年递增拉取数据。'
  })
  async bulkSyncByMetadata(
    @Query('onlyActive') onlyActive: string = 'true',
    @Query('endYear') endYear?: string,
  ) {
    const onlyActiveBool = onlyActive !== 'false';
    
    let endYearNum: number | undefined;
    if (endYear) {
      endYearNum = parseInt(endYear, 10);
      if (isNaN(endYearNum) || endYearNum < 1990 || endYearNum > 2100) {
        return {
          success: false,
          message: '结束年份格式错误，请输入 1990-2100 之间的年份',
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
    description: '从东财导出的JSON文件解析并导入历史数据。如果不传filePath参数，则使用metadata.data_file配置的文件路径。',
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

  @Post('bulk-import-eastmoney')
  @ApiOperation({
    summary: '批量导入所有sync_mode=json的指数数据',
    description: '自动导入所有metadata.sync_mode为json的指数数据，使用metadata.data_file指定的文件路径。',
  })
  async bulkImportEastmoney() {
    const result = await this.eastmoneyDataService.bulkImport();
    return {
      success: true,
      message: `批量导入完成，成功 ${result.success}/${result.total} 个指数`,
      details: result,
    };
  }

  @Get('preview-eastmoney')
  @ApiOperation({
    summary: '预览东财JSON文件内容',
    description: '预览指定东财JSON文件的前N条数据，不保存到数据库。',
  })
  async previewEastmoney(
    @Query('filePath') filePath: string,
    @Query('limit') limit: string = '10',
  ) {
    if (!filePath) {
      return {
        success: false,
        message: '请提供文件路径参数 filePath',
      };
    }

    const limitNum = parseInt(limit, 10);
    const result = await this.eastmoneyDataService.previewData(
      filePath,
      isNaN(limitNum) ? 10 : limitNum,
    );
    return result;
  }
}
