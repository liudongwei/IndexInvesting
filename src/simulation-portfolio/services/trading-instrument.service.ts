import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingInstrument } from '../entities/trading-instrument.entity';
import { CreateInstrumentDto } from '../dto/create-instrument.dto';
import { UpdateInstrumentDto } from '../dto/update-instrument.dto';

@Injectable()
export class TradingInstrumentService {
  constructor(
    @InjectRepository(TradingInstrument)
    private instrumentRepository: Repository<TradingInstrument>,
  ) {}

  /**
   * 创建交易标的
   */
  async create(dto: CreateInstrumentDto): Promise<TradingInstrument> {
    const instrument = this.instrumentRepository.create(dto);
    return await this.instrumentRepository.save(instrument);
  }

  /**
   * 查询所有交易标的（支持分页）
   */
  async findAll(page: number = 1, limit: number = 20, type?: string, status?: string) {
    const queryBuilder = this.instrumentRepository.createQueryBuilder('instrument');

    if (type) {
      queryBuilder.andWhere('instrument.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('instrument.status = :status', { status });
    }

    queryBuilder.orderBy('instrument.code', 'ASC');

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 根据ID查询
   */
  async findOne(id: string): Promise<TradingInstrument> {
    const instrument = await this.instrumentRepository.findOne({ where: { id } });
    if (!instrument) {
      throw new NotFoundException(`交易标的 ${id} 不存在`);
    }
    return instrument;
  }

  /**
   * 根据代码查询
   */
  async findByCode(code: string): Promise<TradingInstrument> {
    const instrument = await this.instrumentRepository.findOne({
      where: { code },
    });
    if (!instrument) {
      throw new NotFoundException(`交易标的 ${code} 不存在`);
    }
    return instrument;
  }

  /**
   * 更新交易标的
   */
  async update(id: string, dto: UpdateInstrumentDto): Promise<TradingInstrument> {
    const instrument = await this.findOne(id);
    Object.assign(instrument, dto);
    return await this.instrumentRepository.save(instrument);
  }

  /**
   * 删除交易标的
   */
  async remove(id: string): Promise<void> {
    const instrument = await this.findOne(id);
    await this.instrumentRepository.remove(instrument);
  }

  /**
   * 批量导入交易标的
   */
  async importBulk(instruments: CreateInstrumentDto[]): Promise<TradingInstrument[]> {
    const entities = this.instrumentRepository.create(instruments);
    return await this.instrumentRepository.save(entities);
  }

  /**
   * 搜索交易标的（根据代码或名称）
   */
  async search(keyword: string): Promise<TradingInstrument[]> {
    return await this.instrumentRepository
      .createQueryBuilder('instrument')
      .where('instrument.code LIKE :keyword OR instrument.name LIKE :keyword', {
        keyword: `%${keyword}%`,
      })
      .orderBy('instrument.code', 'ASC')
      .getMany();
  }
}
