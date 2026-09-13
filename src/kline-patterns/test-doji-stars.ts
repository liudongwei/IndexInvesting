/**
 * 十字启明星和十字黄昏之星测试
 * 用于验证新形态识别逻辑是否正确
 */

import { ThreeCandlePatterns } from './patterns/three-candle.pattern';
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

// 测试十字启明星
function testDojiMorningStar() {
  console.log('\n=== 测试十字启明星 ===');
  
  const patterns = new ThreeCandlePatterns();
  
  // 场景1：标准的十字启明星
  // 第一日：阴线
  // 第二日：十字星（开盘价和收盘价非常接近，实体不超过总范围的10%）
  // 第三日：阳线
  const candles1: Candle[] = [
    createCandle(100, 110, 95, 108),  // 第三日：阳线
    createCandle(95, 98, 92, 95.2),   // 第二日：十字星（实体0.2，范围6，占比3.3% < 10%）
    createCandle(105, 108, 93, 98),   // 第一日：阴线
  ];
  
  const result1 = patterns.detect(candles1);
  console.log('场景1 - 标准十字启明星:');
  console.log('检测到形态数量:', result1.length);
  if (result1.length > 0) {
    console.log('形态类型:', result1[0].patternType);
    console.log('形态名称:', result1[0].patternName);
    console.log('置信度:', result1[0].confidence);
    console.log('信号:', result1[0].signal);
  }
  
  // 场景2：普通启明星（第二日不是真正的十字星）
  const candles2: Candle[] = [
    createCandle(100, 110, 95, 108),  // 第三日：阳线
    createCandle(95, 100, 92, 97),    // 第二日：小实体但不是十字星
    createCandle(105, 108, 93, 98),   // 第一日：阴线
  ];
  
  const result2 = patterns.detect(candles2);
  console.log('\n场景2 - 普通启明星:');
  console.log('检测到形态数量:', result2.length);
  if (result2.length > 0) {
    console.log('形态类型:', result2[0].patternType);
    console.log('形态名称:', result2[0].patternName);
    console.log('置信度:', result2[0].confidence);
    console.log('信号:', result2[0].signal);
  }
}

// 测试十字黄昏之星
function testDojiEveningStar() {
  console.log('\n=== 测试十字黄昏之星 ===');
  
  const patterns = new ThreeCandlePatterns();
  
  // 场景1：标准的十字黄昏之星
  // 第一日：阳线
  // 第二日：十字星（实体不超过总范围的10%）
  // 第三日：阴线
  const candles1: Candle[] = [
    createCandle(100, 105, 90, 92),   // 第三日：阴线
    createCandle(105, 108, 102, 105.3), // 第二日：十字星（实体0.3，范围6，占比5% < 10%）
    createCandle(98, 108, 97, 105),   // 第一日：阳线
  ];
  
  const result1 = patterns.detect(candles1);
  console.log('场景1 - 标准十字黄昏之星:');
  console.log('检测到形态数量:', result1.length);
  if (result1.length > 0) {
    console.log('形态类型:', result1[0].patternType);
    console.log('形态名称:', result1[0].patternName);
    console.log('置信度:', result1[0].confidence);
    console.log('信号:', result1[0].signal);
  }
  
  // 场景2：普通黄昏之星（第二日不是真正的十字星）
  const candles2: Candle[] = [
    createCandle(100, 105, 90, 92),   // 第三日：阴线
    createCandle(105, 109, 102, 107), // 第二日：小实体但不是十字星
    createCandle(98, 108, 97, 105),   // 第一日：阳线
  ];
  
  const result2 = patterns.detect(candles2);
  console.log('\n场景2 - 普通黄昏之星:');
  console.log('检测到形态数量:', result2.length);
  if (result2.length > 0) {
    console.log('形态类型:', result2[0].patternType);
    console.log('形态名称:', result2[0].patternName);
    console.log('置信度:', result2[0].confidence);
    console.log('信号:', result2[0].signal);
  }
}

// 运行测试
console.log('========================================');
console.log('十字启明星和十字黄昏之星形态识别测试');
console.log('========================================');

testDojiMorningStar();
testDojiEveningStar();

console.log('\n========================================');
console.log('测试完成');
console.log('========================================');
