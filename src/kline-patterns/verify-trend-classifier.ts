/**
 * 趋势分类算法验证脚本
 * 用于测试优化后的趋势判断逻辑
 */

import { TrendDetectorService } from './patterns/trend-detector.service';
import { Candle } from './dto/kline-pattern.dto';

// 生成模拟K线数据
function generateCandles(type: 'uptrend' | 'downtrend' | 'sideways', count: number = 100): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (count - 1 - i)); // 修正：从旧到新
    
    let open = price;
    let close: number;
    let high: number;
    let low: number;

    if (type === 'uptrend') {
      // 上升趋势：价格逐步上涨，回调有限
      const change = (Math.random() - 0.25) * 3; // 更强的正向偏向
      close = open + change;
      high = Math.max(open, close) + Math.random() * 0.8;
      low = Math.min(open, close) - Math.random() * 0.3;
    } else if (type === 'downtrend') {
      // 下降趋势：价格逐步下跌，反弹有限
      const change = (Math.random() - 0.75) * 3; // 更强的负向偏向
      close = open + change;
      high = Math.max(open, close) + Math.random() * 0.3;
      low = Math.min(open, close) - Math.random() * 0.8;
    } else {
      // 横盘趋势：价格在区间内波动
      const change = (Math.random() - 0.5) * 2;
      close = open + change;
      high = Math.max(open, close) + Math.random() * 1;
      low = Math.min(open, close) - Math.random() * 1;
    }

    price = close;

    candles.push({
      date,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
    });
  }

  // 反转数组，使[0]为最新（与系统其他部分一致）
  return candles.reverse();
}

// 测试函数
async function testTrendClassifier() {
  const service = new TrendDetectorService();

  console.log('='.repeat(80));
  console.log('趋势分类算法验证');
  console.log('='.repeat(80));

  // 测试1：上升趋势
  console.log('\n【测试1】上升趋势检测');
  console.log('-'.repeat(80));
  const uptrendCandles = generateCandles('uptrend', 100);
  const uptrendResult = service.analyzeTrend(uptrendCandles);
  console.log(`趋势状态: ${uptrendResult.trendState}`);
  console.log(`描述: ${uptrendResult.description}`);
  console.log(`趋势强度(score): ${uptrendResult.score?.toFixed(4) || 'N/A'}`);
  console.log(`置信度: ${uptrendResult.confidence?.toFixed(4) || 'N/A'}`);
  
  if (uptrendResult.components) {
    console.log('\n因子详情:');
    console.log(`  - Kaufman效率系数: ${uptrendResult.components.efficiency.toFixed(4)}`);
    console.log(`  - 回归斜率: ${uptrendResult.components.slope.toFixed(6)}`);
    console.log(`  - R²线性度: ${uptrendResult.components.r2.toFixed(4)}`);
    console.log(`  - 均线排列(ATR归一): ${uptrendResult.components.maSpread.toFixed(4)}`);
    console.log(`  - 摆动结构: ${uptrendResult.components.structure.toFixed(4)}`);
  }

  // 测试2：下降趋势
  console.log('\n【测试2】下降趋势检测');
  console.log('-'.repeat(80));
  const downtrendCandles = generateCandles('downtrend', 100);
  const downtrendResult = service.analyzeTrend(downtrendCandles);
  console.log(`趋势状态: ${downtrendResult.trendState}`);
  console.log(`描述: ${downtrendResult.description}`);
  console.log(`趋势强度(score): ${downtrendResult.score?.toFixed(4) || 'N/A'}`);
  console.log(`置信度: ${downtrendResult.confidence?.toFixed(4) || 'N/A'}`);
  
  if (downtrendResult.components) {
    console.log('\n因子详情:');
    console.log(`  - Kaufman效率系数: ${downtrendResult.components.efficiency.toFixed(4)}`);
    console.log(`  - 回归斜率: ${downtrendResult.components.slope.toFixed(6)}`);
    console.log(`  - R²线性度: ${downtrendResult.components.r2.toFixed(4)}`);
    console.log(`  - 均线排列(ATR归一): ${downtrendResult.components.maSpread.toFixed(4)}`);
    console.log(`  - 摆动结构: ${downtrendResult.components.structure.toFixed(4)}`);
  }

  // 测试3：横盘趋势
  console.log('\n【测试3】横盘趋势检测');
  console.log('-'.repeat(80));
  const sidewaysCandles = generateCandles('sideways', 100);
  const sidewaysResult = service.analyzeTrend(sidewaysCandles);
  console.log(`趋势状态: ${sidewaysResult.trendState}`);
  console.log(`描述: ${sidewaysResult.description}`);
  console.log(`趋势强度(score): ${sidewaysResult.score?.toFixed(4) || 'N/A'}`);
  console.log(`置信度: ${sidewaysResult.confidence?.toFixed(4) || 'N/A'}`);
  
  if (sidewaysResult.components) {
    console.log('\n因子详情:');
    console.log(`  - Kaufman效率系数: ${sidewaysResult.components.efficiency.toFixed(4)}`);
    console.log(`  - 回归斜率: ${sidewaysResult.components.slope.toFixed(6)}`);
    console.log(`  - R²线性度: ${sidewaysResult.components.r2.toFixed(4)}`);
    console.log(`  - 均线排列(ATR归一): ${sidewaysResult.components.maSpread.toFixed(4)}`);
    console.log(`  - 摆动结构: ${sidewaysResult.components.structure.toFixed(4)}`);
  }

  // 测试4：迟滞状态机验证
  console.log('\n【测试4】迟滞状态机验证（序列分类）');
  console.log('-'.repeat(80));
  const mixedCandles = [
    ...generateCandles('uptrend', 30),
    ...generateCandles('sideways', 20),
    ...generateCandles('downtrend', 30),
  ];
  
  const sortedCandles = [...mixedCandles].reverse(); // 转为正序
  const seriesResults = service.classifySeries(sortedCandles);
  
  console.log('前10根K线的趋势状态变化:');
  for (let i = sortedCandles.length - 10; i < sortedCandles.length; i++) {
    const result = seriesResults[i];
    console.log(`  索引${i}: state=${result.state}, score=${result.score.toFixed(3)}, confidence=${result.confidence.toFixed(3)}`);
  }

  // 测试5：边界情况
  console.log('\n【测试5】边界情况测试');
  console.log('-'.repeat(80));
  
  // 数据不足
  const insufficientCandles = generateCandles('uptrend', 5);
  const insufficientResult = service.analyzeTrend(insufficientCandles);
  console.log(`数据不足(5根): ${insufficientResult.trendState}`);
  
  // 刚好够最小样本
  const minimalCandles = generateCandles('uptrend', 40);
  const minimalResult = service.analyzeTrend(minimalCandles);
  console.log(`最小样本(40根): ${minimalResult.trendState}, score=${minimalResult.score?.toFixed(3)}`);

  console.log('\n' + '='.repeat(80));
  console.log('验证完成！');
  console.log('='.repeat(80));
}

// 运行测试
if (require.main === module) {
  testTrendClassifier().catch(console.error);
}

export { testTrendClassifier };
