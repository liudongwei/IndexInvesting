import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';
import { CreateIndexDto } from './dto/create-index.dto';
import { UpdateIndexDto } from './dto/update-index.dto';

@Injectable()
export class IndicesService {
  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(IndexHistory)
    private historyRepository: Repository<IndexHistory>,
  ) {}

  async create(createIndexDto: CreateIndexDto): Promise<Index> {
    const indexData: any = {
      ...createIndexDto,
    };
    if (createIndexDto.syncStartDate) {
      indexData.syncStartDate = new Date(createIndexDto.syncStartDate);
    }
    const index = this.indexRepository.create(indexData as Index);
    const saved = await this.indexRepository.save(index);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async bulkCreate(createIndexDtos: CreateIndexDto[]): Promise<{
    total: number;
    success: number;
    failed: number;
    results: { index: Index | null; error?: string; dto: CreateIndexDto }[];
  }> {
    const results: { index: Index | null; error?: string; dto: CreateIndexDto }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const dto of createIndexDtos) {
      try {
        // 检查 code 是否已存在
        const existing = await this.findByCode(dto.code);
        if (existing) {
          results.push({
            index: null,
            error: `指数代码 ${dto.code} 已存在`,
            dto,
          });
          failedCount++;
          continue;
        }

        const index = await this.create(dto);
        results.push({ index, dto });
        successCount++;
      } catch (error) {
        results.push({
          index: null,
          error: error.message,
          dto,
        });
        failedCount++;
      }
    }

    return {
      total: createIndexDtos.length,
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  async findAll(): Promise<Index[]> {
    return this.indexRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Index> {
    const index = await this.indexRepository.findOne({
      where: { id },
    });
    if (!index) {
      throw new NotFoundException(`Index with ID ${id} not found`);
    }
    return index;
  }

  async findByCode(code: string): Promise<Index | null> {
    return this.indexRepository.findOne({ where: { code } });
  }

  async findByOfficialCode(officialCode: string): Promise<Index | null> {
    return this.indexRepository.findOne({ where: { officialCode } });
  }

  async update(id: string, updateIndexDto: UpdateIndexDto): Promise<Index> {
    const index = await this.findOne(id);
    if (updateIndexDto.syncStartDate) {
      updateIndexDto.syncStartDate = new Date(
        updateIndexDto.syncStartDate,
      ) as any;
    }
    Object.assign(index, updateIndexDto);
    return this.indexRepository.save(index);
  }

  async remove(id: string): Promise<void> {
    const index = await this.findOne(id);
    await this.indexRepository.remove(index);
  }

  async updateLastSyncDate(
    indexId: string,
    date: Date,
    count: number,
  ): Promise<void> {
    await this.indexRepository.update(indexId, {
      lastSyncDate: date,
      historyCount: () => `historyCount + ${count}`,
    });
  }

  async getHistoryByIndexId(
    indexId: string,
    limit?: number,
  ): Promise<IndexHistory[]> {
    // 验证 UUID 格式 (8-4-4-4-12)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(indexId)) {
      throw new NotFoundException(`无效的指数ID格式: ${indexId}`);
    }
    const findOptions: any = {
      where: { indexId },
      order: { tradeDate: 'DESC' },
    };
    // 只有当 limit 有值且大于 0 时才限制条数
    if (limit && limit > 0) {
      findOptions.take = limit;
    }
    return this.historyRepository.find(findOptions);
  }

  async getLatestHistoryDate(indexId: string): Promise<Date | null> {
    const result = await this.historyRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
    return result ? result.tradeDate : null;
  }

  async getLatestHistory(indexId: string): Promise<IndexHistory | null> {
    return await this.historyRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
  }

  async saveHistoryData(
    indexId: string,
    data: Partial<IndexHistory>[],
  ): Promise<number> {
    if (data.length === 0) return 0;

    // 分批处理，每批500条，避免SQL参数过多
    const BATCH_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);

      const entities = batch.map((item) =>
        this.historyRepository.create({
          ...item,
          indexId,
        }),
      );

      // 使用 upsert 避免重复数据
      const result = await this.historyRepository.upsert(entities, [
        'indexId',
        'tradeDate',
      ]);
      totalSaved += result.identifiers?.length || batch.length;
    }

    return totalSaved;
  }

  /**
   * 按日期范围删除历史数据
   * @param indexId 指数ID
   * @param startDate 开始日期
   * @param endDate 结束日期
   */
  async deleteHistoryByDateRange(
    indexId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this.historyRepository.delete({
      indexId,
      tradeDate: Between(startDate, endDate),
    });
    return result.affected || 0;
  }

  /**
   * 删除单条历史数据
   * @param historyId 历史数据ID
   * @param indexId 指数ID（用于验证）
   * @returns 是否删除成功
   */
  async deleteHistoryById(historyId: string, indexId: string): Promise<boolean> {
    const result = await this.historyRepository.delete({
      id: historyId,
      indexId,
    });
    return (result.affected || 0) > 0;
  }

  /**
   * 更新单个指数的metadata
   * @param id 指数ID
   * @param metadata 要更新的元数据
   * @param replace 是否完全替换（默认false为合并）
   */
  async updateMetadata(
    id: string,
    metadata: Record<string, any>,
    replace: boolean = false,
  ): Promise<Index> {
    const index = await this.findOne(id);

    if (replace) {
      // 完全替换模式
      index.metadata = metadata;
    } else {
      // 合并模式
      index.metadata = {
        ...index.metadata,
        ...metadata,
      };
    }

    return this.indexRepository.save(index);
  }

  /**
   * 批量更新多个指数的metadata
   * @param indexIds 指数ID列表
   * @param metadata 要更新的元数据
   * @param replace 是否完全替换（默认false为合并）
   */
  async bulkUpdateMetadata(
    indexIds: string[],
    metadata: Record<string, any>,
    replace: boolean = false,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: { id: string; name: string; success: boolean; error?: string }[];
  }> {
    const results: {
      id: string;
      name: string;
      success: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;

    // 1. 批量查询所有指数（避免N+1查询）
    const indices = await this.indexRepository.find({
      where: { id: In(indexIds) },
    });
    const indexMap = new Map(indices.map((i) => [i.id, i]));

    // 2. 准备更新的实体
    const indicesToUpdate: Index[] = [];

    for (const id of indexIds) {
      const index = indexMap.get(id);

      if (!index) {
        results.push({
          id,
          name: '未知',
          success: false,
          error: '指数不存在',
        });
        failedCount++;
        continue;
      }

      try {
        if (replace) {
          index.metadata = metadata;
        } else {
          index.metadata = {
            ...index.metadata,
            ...metadata,
          };
        }

        indicesToUpdate.push(index);

        results.push({
          id,
          name: index.name,
          success: true,
        });
        successCount++;
      } catch (error) {
        results.push({
          id,
          name: index.name,
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    // 3. 批量保存（一次SQL操作）
    if (indicesToUpdate.length > 0) {
      await this.indexRepository.save(indicesToUpdate);
    }

    return {
      total: indexIds.length,
      success: successCount,
      failed: failedCount,
      results,
    };
  }
}
