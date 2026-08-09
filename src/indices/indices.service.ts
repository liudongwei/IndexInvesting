import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findAll(): Promise<Index[]> {
    return this.indexRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Index> {
    const index = await this.indexRepository.findOne({
      where: { id },
      relations: { histories: true },
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
      updateIndexDto.syncStartDate = new Date(updateIndexDto.syncStartDate) as any;
    }
    Object.assign(index, updateIndexDto);
    return this.indexRepository.save(index);
  }

  async remove(id: string): Promise<void> {
    const index = await this.findOne(id);
    await this.indexRepository.remove(index);
  }

  async updateLastSyncDate(indexId: string, date: Date, count: number): Promise<void> {
    await this.indexRepository.update(indexId, {
      lastSyncDate: date,
      historyCount: () => `historyCount + ${count}`,
    });
  }

  async getHistoryByIndexId(indexId: string, limit: number = 100): Promise<IndexHistory[]> {
    return this.historyRepository.find({
      where: { indexId },
      order: { tradeDate: 'DESC' },
      take: limit,
    });
  }

  async getLatestHistoryDate(indexId: string): Promise<Date | null> {
    const result = await this.historyRepository.findOne({
      where: { indexId },
      order: { tradeDate: 'DESC' },
    });
    return result ? result.tradeDate : null;
  }

  async saveHistoryData(indexId: string, data: Partial<IndexHistory>[]): Promise<number> {
    if (data.length === 0) return 0;

    // 分批处理，每批500条，避免SQL参数过多
    const BATCH_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      const entities = batch.map(item =>
        this.historyRepository.create({
          ...item,
          indexId,
        }),
      );

      // 使用 upsert 避免重复数据
      const result = await this.historyRepository.upsert(entities, ['indexId', 'tradeDate']);
      totalSaved += result.identifiers?.length || batch.length;
    }

    return totalSaved;
  }
}
