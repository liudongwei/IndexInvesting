import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrendAnalysisService } from './trend-analysis.service';
import { IndicesService } from '../indices/indices.service';
import { RecalculateTrendDto } from './dto/recalculate-trend.dto';

@ApiTags('趋势分析')
@Controller('trend-analysis')
export class TrendAnalysisController {
  constructor(
    private readonly trendService: TrendAnalysisService,
    private readonly indicesService: IndicesService,
  ) {}

  @Post('analyze-incremental')
  @ApiOperation({
    summary: '执行增量趋势分析',
    description: '只计算最新趋势日期之后的新增数据，适用于每日定时任务场景',
  })
  async analyzeIncremental() {
    const indices = await this.indicesService.findAll();
    const activeIndices = indices.filter((i) => i.isActive);

    const result =
      await this.trendService.performIncrementalAnalysis(activeIndices);
    return {
      success: true,
      ...result,
    };
  }

  @Post('analyze-all')
  @ApiOperation({
    summary: '执行全量趋势分析',
    description:
      '可指定年份范围进行分段计算，如startYear=1900&endYear=2000计算1900-2000年的数据',
  })
  async analyzeAll(
    @Query('startYear') startYear?: string,
    @Query('endYear') endYear?: string,
  ) {
    const indices = await this.indicesService.findAll();

    const startYearNum = startYear ? parseInt(startYear, 10) : undefined;
    const endYearNum = endYear ? parseInt(endYear, 10) : undefined;

    // 验证年份参数（支持从1900年开始，兼容日经225、标普等早期指数）
    if (
      startYear &&
      (isNaN(startYearNum!) || startYearNum! < 1900 || startYearNum! > 2100)
    ) {
      return {
        success: false,
        message: '开始年份格式错误，请输入 1900-2100 之间的年份',
      };
    }
    if (
      endYear &&
      (isNaN(endYearNum!) || endYearNum! < 1900 || endYearNum! > 2100)
    ) {
      return {
        success: false,
        message: '结束年份格式错误，请输入 1900-2100 之间的年份',
      };
    }

    const result = await this.trendService.performFullAnalysis(
      indices,
      startYearNum,
      endYearNum,
    );
    return {
      success: true,
      ...result,
    };
  }

  @Get('market-status')
  @ApiOperation({
    summary: '获取各市场实时状态',
    description: '返回各市场的收盘状态，用于Web端显示动态圆环标识',
  })
  async getMarketStatus() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute; // 转换为分钟数
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 判断是否为周末

    // 定义各市场的收盘时间（北京时间，分钟数表示）
    const marketStatus = {
      // A股/台湾/日韩: 15:00收盘，15:05后视为已收盘（周末休市）
      asia: {
        name: 'A股/台湾/日韩',
        closeTime: '15:00',
        isWeekend, // 是否周末
        isTradingDay: !isWeekend, // 是否交易日
        isClosed: !isWeekend && currentTime >= 15 * 60 + 5, // 15:05后且非周末
        nextUpdate: isWeekend
          ? '下周一15:05'
          : currentTime < 15 * 60 + 5
            ? '15:05'
            : '次日15:05',
      },
      // 港股: 16:00收盘，16:05后视为已收盘（周末休市）
      hk: {
        name: '港股',
        closeTime: '16:00',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed: !isWeekend && currentTime >= 16 * 60 + 5, // 16:05后且非周末
        nextUpdate: isWeekend
          ? '下周一16:05'
          : currentTime < 16 * 60 + 5
            ? '16:05'
            : '次日16:05',
      },
      // 欧洲: 夏令时23:30/冬令时00:30收盘，统一按00:35处理（周末休市）
      europe: {
        name: '欧洲',
        closeTime: '00:30',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed:
          !isWeekend && currentTime >= 0 * 60 + 35 && currentTime < 5 * 60 + 5,
        nextUpdate: isWeekend
          ? '下周一00:35'
          : currentTime >= 0 * 60 + 35 && currentTime < 5 * 60 + 5
            ? '次日00:35'
            : '00:35',
      },
      // 美股: 夏令时04:00/冬令时05:00收盘，统一按05:05处理（周末休市）
      us: {
        name: '美股',
        closeTime: '05:00',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed:
          !isWeekend && currentTime >= 5 * 60 + 5 && currentTime < 6 * 60,
        nextUpdate: isWeekend
          ? '下周一05:05'
          : currentTime >= 5 * 60 + 5 && currentTime < 6 * 60
            ? '次日05:05'
            : '05:05',
      },
      // 贵金属: 24小时交易，06:00最后同步（周末也交易）
      metal: {
        name: '贵金属',
        closeTime: '06:00',
        isWeekend: false, // 贵金属周末也交易
        isTradingDay: true,
        isClosed: currentTime >= 6 * 60, // 06:00后
        nextUpdate: currentTime >= 6 * 60 ? '次日06:00' : '06:00',
      },
    };

    return {
      success: true,
      currentTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      dayOfWeek: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
        dayOfWeek
      ],
      isWeekend,
      markets: marketStatus,
    };
  }

  @Get('market-status-test')
  @ApiOperation({
    summary: '测试市场状态（可模拟时间）',
    description: '用于测试不同时间点的市场状态，支持模拟指定时间和星期几',
  })
  async getMarketStatusTest(
    @Query('hour') hour?: string,
    @Query('minute') minute?: string,
    @Query('dayOfWeek') dayOfWeek?: string, // 0=周日, 1=周一, ..., 6=周六
  ) {
    // 使用传入的参数或当前时间
    const h = hour !== undefined ? parseInt(hour, 10) : new Date().getHours();
    const m =
      minute !== undefined ? parseInt(minute, 10) : new Date().getMinutes();
    const dow =
      dayOfWeek !== undefined ? parseInt(dayOfWeek, 10) : new Date().getDay();

    const currentTime = h * 60 + m;
    const isWeekend = dow === 0 || dow === 6;

    const marketStatus = {
      asia: {
        name: 'A股/台湾/日韩',
        closeTime: '15:00',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed: !isWeekend && currentTime >= 15 * 60 + 5,
        nextUpdate: isWeekend
          ? '下周一15:05'
          : currentTime < 15 * 60 + 5
            ? '15:05'
            : '次日15:05',
      },
      hk: {
        name: '港股',
        closeTime: '16:00',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed: !isWeekend && currentTime >= 16 * 60 + 5,
        nextUpdate: isWeekend
          ? '下周一16:05'
          : currentTime < 16 * 60 + 5
            ? '16:05'
            : '次日16:05',
      },
      europe: {
        name: '欧洲',
        closeTime: '00:30',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed:
          !isWeekend && currentTime >= 0 * 60 + 35 && currentTime < 5 * 60 + 5,
        nextUpdate: isWeekend
          ? '下周一00:35'
          : currentTime >= 0 * 60 + 35 && currentTime < 5 * 60 + 5
            ? '次日00:35'
            : '00:35',
      },
      us: {
        name: '美股',
        closeTime: '05:00',
        isWeekend,
        isTradingDay: !isWeekend,
        isClosed:
          !isWeekend && currentTime >= 5 * 60 + 5 && currentTime < 6 * 60,
        nextUpdate: isWeekend
          ? '下周一05:05'
          : currentTime >= 5 * 60 + 5 && currentTime < 6 * 60
            ? '次日05:05'
            : '05:05',
      },
      metal: {
        name: '贵金属',
        closeTime: '06:00',
        isWeekend: false,
        isTradingDay: true,
        isClosed: currentTime >= 6 * 60,
        nextUpdate: currentTime >= 6 * 60 ? '次日06:00' : '06:00',
      },
    };

    return {
      success: true,
      simulated:
        hour !== undefined || minute !== undefined || dayOfWeek !== undefined,
      currentTime: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      dayOfWeek: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dow],
      isWeekend,
      markets: marketStatus,
    };
  }

  @Get('ranking/latest')
  @ApiOperation({ summary: '获取最新趋势排名（类似图中表格）' })
  async getLatestRanking() {
    const data = await this.trendService.getLatestTrendRanking();

    // 获取市场状态
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;
    const dayOfWeek = now.getDay(); // 0=周日, 6=周六
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 格式化为表格形式，添加市场状态标识
    const formatted = data.map((item) => {
      // 判断指数所属市场
      const indexType = item.indexType || '';
      const exchange = item.index?.exchange || '';
      const code = item.index?.code || '';

      let marketStatus: 'closed' | 'updating' | 'open' = 'closed';

      // 判断市场状态
      if (
        exchange.includes('上交所') ||
        exchange.includes('深交所') ||
        exchange.includes('台湾') ||
        exchange.includes('日本') ||
        exchange.includes('韩国') ||
        code.startsWith('sh') ||
        code.startsWith('sz')
      ) {
        // A股/台湾/日韩: 周末休市，15:05后 closed，否则 updating
        marketStatus = isWeekend
          ? 'closed'
          : currentTime >= 15 * 60 + 5
            ? 'closed'
            : 'updating';
      } else if (
        exchange.includes('香港') ||
        exchange.includes('港交所') ||
        code.startsWith('hk')
      ) {
        // 港股: 周末休市，16:05后 closed
        marketStatus = isWeekend
          ? 'closed'
          : currentTime >= 16 * 60 + 5
            ? 'closed'
            : 'updating';
      } else if (
        exchange.includes('美国') ||
        exchange.includes('纽约') ||
        exchange.includes('纳斯达克')
      ) {
        // 美股: 周末休市，05:05-06:00之间 closed
        marketStatus = isWeekend
          ? 'closed'
          : currentTime >= 5 * 60 + 5 && currentTime < 6 * 60
            ? 'closed'
            : 'open';
      } else if (
        exchange.includes('欧洲') ||
        exchange.includes('英国') ||
        exchange.includes('德国')
      ) {
        // 欧洲: 周末休市，00:35-05:05之间 closed
        marketStatus = isWeekend
          ? 'closed'
          : currentTime >= 0 * 60 + 35 && currentTime < 5 * 60 + 5
            ? 'closed'
            : 'open';
      } else if (
        exchange.includes('贵金属') ||
        exchange.includes('黄金') ||
        exchange.includes('白银')
      ) {
        // 贵金属: 24小时交易，06:00后 closed（周末也交易）
        marketStatus = currentTime >= 6 * 60 ? 'closed' : 'open';
      }

      return {
        rank: item.rank,
        code: item.index?.officialCode,
        name: item.index?.name,
        changePercent: item.changePercent,
        closePrice: item.closePrice,
        ma20: item.ma20,
        deviationRate: item.deviationRate,
        volumeRatio: item.volumeRatio,
        statusChangeDate: item.statusChangeDate,
        intervalChangePercent: item.intervalChangePercent,
        rankChange: item.rankChange,
        marketStatus, // 添加市场状态：closed-已收盘, updating-更新中, open-未收盘
        isTodayData: item.isTodayData, // 是否为当天数据（true-当天，false-补全的上个交易日数据）
        dataDate: item.actualDataDate, // 数据实际来源日期
        tradeDate: item.tradeDate, // 统一为基准日期（最新日期）
        prevDeviationRate: item.prevDeviationRate, // 昨天的偏离率，用于判断正负转换
      };
    });

    // 统计数据情况
    const todayDataCount = formatted.filter((item) => item.isTodayData).length;
    const prevDataCount = formatted.filter((item) => !item.isTodayData).length;

    return {
      success: true,
      tradeDate: data[0]?.tradeDate,
      totalCount: formatted.length,
      todayDataCount,
      prevDataCount,
      data: formatted,
    };
  }

  @Get('ranking/by-date')
  @ApiOperation({ summary: '获取指定日期的趋势排名' })
  async getRankingByDate(@Query('date') date: string) {
    if (!date) {
      return {
        success: false,
        message: '请提供日期参数（格式：YYYY-MM-DD）',
      };
    }

    try {
      const data = await this.trendService.getTrendRankingByDate(date);

      if (data.length === 0) {
        return {
          success: false,
          message: `未找到 ${date} 的趋势数据`,
        };
      }

      // 格式化为表格形式，包含数据时效性标识
      const formatted = data.map((item) => ({
        rank: item.rank,
        code: item.index?.officialCode || item.index?.code,
        name: item.index?.name,
        changePercent: item.changePercent,
        closePrice: item.closePrice,
        ma20: item.ma20,
        deviationRate: item.deviationRate,
        volumeRatio: item.volumeRatio,
        statusChangeDate: item.statusChangeDate,
        intervalChangePercent: item.intervalChangePercent,
        rankChange: item.rankChange,
        isTodayData: item.isTodayData, // 是否为当天数据
        dataDate: item.actualDataDate, // 数据实际来源日期
        tradeDate: item.tradeDate, // 统一为基准日期
        prevDeviationRate: item.prevDeviationRate, // 昨天的偏离率，用于判断正负转换
      }));

      // 统计数据情况
      const todayDataCount = formatted.filter(
        (item) => item.isTodayData,
      ).length;
      const prevDataCount = formatted.filter(
        (item) => !item.isTodayData,
      ).length;

      return {
        success: true,
        tradeDate: data[0]?.tradeDate || date,
        totalCount: formatted.length,
        todayDataCount,
        prevDataCount,
        data: formatted,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Get(':indexId')
  @ApiOperation({ summary: '获取指定指数的趋势分析历史' })
  async getTrendHistory(
    @Param('indexId') indexId: string,
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
  ) {
    const [data, total] = await Promise.all([
      this.trendService.getTrendAnalysisByIndexId(
        indexId,
        parseInt(limit, 10),
        parseInt(offset, 10),
      ),
      this.trendService.getTrendAnalysisCount(indexId),
    ]);
    return {
      success: true,
      count: data.length,
      total,
      data,
    };
  }

  @Post('recalculate')
  @ApiOperation({
    summary: '按日期范围重新计算趋势分析',
    description:
      '删除指定日期范围内的旧数据，然后重新计算趋势分析。用于补数据后重新计算。请求体：{ startDate: "2024-01-01", endDate: "2024-12-31" }',
  })
  async recalculateTrendAnalysis(@Body() dto: RecalculateTrendDto) {
    // 验证日期参数
    if (!dto.startDate || !dto.endDate) {
      return {
        success: false,
        message: '请提供 startDate 和 endDate 参数（格式：YYYY-MM-DD）',
      };
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        success: false,
        message: '日期格式错误，请使用 YYYY-MM-DD 格式',
      };
    }

    if (startDate > endDate) {
      return {
        success: false,
        message: '开始日期不能大于结束日期',
      };
    }

    const indices = await this.indicesService.findAll();

    const result = await this.trendService.recalculateTrendAnalysis(
      indices,
      startDate,
      endDate,
    );

    return {
      success: true,
      ...result,
    };
  }
}
