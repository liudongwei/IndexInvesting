/**
 * 捉腰带形态测试（修正版）
 * 根据正确定义：
 * - 看涨捉腰带线：开盘≈最低，收盘≈最高，阳线，实体很长
 * - 看跌捉腰带线：开盘≈最高，收盘≈最低，阴线，实体很长
 */

import { SingleCandlePatterns } from './patterns/single-candle.pattern';
import { Candle } from './dto/kline-pattern.dto';

// 创建测试K线数据
function createCandle(open: number, high: number, low: number, close: number): Candle {
  return {
    date: new Date(),
    open,
    high,
    low,
    close,
  };
}

// 测试看涨捉腰带线
function testBullishLongLeggedDoji() {
  console.log('\n=== 测试看涨捉腰带线 ===');
  
  const patterns = new SingleCandlePatterns();
  
  // 场景1：标准的看涨捉腰带线
  // 开盘价≈最低价，收盘价≈最高价，阳线，实体很长
  const candle1: Candle = createCandle(100, 120, 100, 119);
  // open=100, high=120, low=100, close=119
  // 实体大小=19, 上影线=1, 下影线=0
  // 实体占比 = 19/20 = 95% > 80% ✓
  // |open-low|/range = 0/20 = 0 < 5% ✓
  // |close-high|/range = 1/20 = 5% < 5% ✗ (刚好等于5%，需要调整)
  
  const candle1Fixed: Candle = createCandle(100, 120, 100.5, 119.5);
  // open=100, high=120, low=100.5, close=119.5
  // 实体大小=19.5, 上影线=0.5, 下影线=0.5
  // 实体占比 = 19.5/19.5 = 100% ✓
  // |open-low|/range = 0.5/19.5 = 2.56% < 5% ✓
  // |close-high|/range = 0.5/19.5 = 2.56% < 5% ✓
  
  const result1 = patterns.detect([candle1Fixed]);
  console.log('场景1 - 标准看涨捉腰带线:');
  console.log('K线数据: open=100, high=120, low=100.5, close=119.5');
  console.log('检测到形态数量:', result1.length);
  if (result1.length > 0) {
    console.log('形态类型:', result1[0].patternType);
    console.log('形态名称:', result1[0].patternName);
    console.log('置信度:', result1[0].confidence);
    console.log('信号:', result1[0].signal);
    console.log('描述:', result1[0].description);
  }
  
  // 场景2：不是捉腰带（实体不够长，有较长上影线）
  const candle2: Candle = createCandle(100, 120, 100, 110);
  // open=100, high=120, low=100, close=110
  // 实体大小=10, 上影线=10, 下影线=0
  // 实体占比 = 10/20 = 50% < 80% ✗
  
  const result2 = patterns.detect([candle2]);
  console.log('\n场景2 - 实体不够长（有长上影线）:');
  console.log('K线数据: open=100, high=120, low=100, close=110');
  console.log('检测到形态数量:', result2.length);
  if (result2.length > 0) {
    console.log('形态类型:', result2[0].patternType);
    console.log('形态名称:', result2[0].patternName);
  } else {
    console.log('未检测到捉腰带形态（正确）');
  }
  
  // 场景3：不是捉腰带（开盘价不接近最低价）
  const candle3: Candle = createCandle(105, 120, 100, 119);
  // open=105, high=120, low=100, close=119
  // |open-low|/range = 5/20 = 25% > 5% ✗
  
  const result3 = patterns.detect([candle3]);
  console.log('\n场景3 - 开盘价不接近最低价:');
  console.log('K线数据: open=105, high=120, low=100, close=119');
  console.log('检测到形态数量:', result3.length);
  if (result3.length > 0) {
    console.log('形态类型:', result3[0].patternType);
    console.log('形态名称:', result3[0].patternName);
  } else {
    console.log('未检测到捉腰带形态（正确）');
  }
}

// 测试看跌捉腰带线
function testBearishLongLeggedDoji() {
  console.log('\n=== 测试看跌捉腰带线 ===');
  
  const patterns = new SingleCandlePatterns();
  
  // 场景1：标准的看跌捉腰带线
  // 开盘价≈最高价，收盘价≈最低价，阴线，实体很长
  const candle1: Candle = createCandle(120, 120, 100, 100.5);
  // open=120, high=120, low=100, close=100.5
  // 实体大小=19.5, 上影线=0, 下影线=0.5
  // 实体占比 = 19.5/20 = 97.5% > 80% ✓
  // |open-high|/range = 0/20 = 0 < 5% ✓
  // |close-low|/range = 0.5/20 = 2.5% < 5% ✓
  
  const result1 = patterns.detect([candle1]);
  console.log('场景1 - 标准看跌捉腰带线:');
  console.log('K线数据: open=120, high=120, low=100, close=100.5');
  console.log('检测到形态数量:', result1.length);
  if (result1.length > 0) {
    console.log('形态类型:', result1[0].patternType);
    console.log('形态名称:', result1[0].patternName);
    console.log('置信度:', result1[0].confidence);
    console.log('信号:', result1[0].signal);
    console.log('描述:', result1[0].description);
  }
  
  // 场景2：不是捉腰带（实体不够长，有较长下影线）
  const candle2: Candle = createCandle(120, 120, 100, 110);
  // open=120, high=120, low=100, close=110
  // 实体大小=10, 上影线=0, 下影线=10
  // 实体占比 = 10/20 = 50% < 80% ✗
  
  const result2 = patterns.detect([candle2]);
  console.log('\n场景2 - 实体不够长（有长下影线）:');
  console.log('K线数据: open=120, high=120, low=100, close=110');
  console.log('检测到形态数量:', result2.length);
  if (result2.length > 0) {
    console.log('形态类型:', result2[0].patternType);
    console.log('形态名称:', result2[0].patternName);
  } else {
    console.log('未检测到捉腰带形态（正确）');
  }
  
  // 场景3：不是捉腰带（开盘价不接近最高价）
  const candle3: Candle = createCandle(115, 120, 100, 101);
  // open=115, high=120, low=100, close=101
  // |open-high|/range = 5/20 = 25% > 5% ✗
  
  const result3 = patterns.detect([candle3]);
  console.log('\n场景3 - 开盘价不接近最高价:');
  console.log('K线数据: open=115, high=120, low=100, close=101');
  console.log('检测到形态数量:', result3.length);
  if (result3.length > 0) {
    console.log('形态类型:', result3[0].patternType);
    console.log('形态名称:', result3[0].patternName);
  } else {
    console.log('未检测到捉腰带形态（正确）');
  }
}

// 运行测试
console.log('========================================');
console.log('捉腰带形态识别测试（修正版）');
console.log('========================================');

testBullishLongLeggedDoji();
testBearishLongLeggedDoji();

console.log('\n========================================');
console.log('测试完成');
console.log('========================================');
