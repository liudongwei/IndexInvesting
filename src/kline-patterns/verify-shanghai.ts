/**
 * 验证上证 2026-06-23 的孕线形态
 */

import { HaramiPatterns } from './patterns/harami.pattern';
import { Candle } from './dto/kline-pattern.dto';

// 创建测试实例
const haramiDetector = new HaramiPatterns();

// 根据用户提供的数据创建 K 线
// 格式：开盘，收盘，最高，最低
const candles: Candle[] = [
  {
    date: new Date('2026-06-23'),
    open: 4153.59,   // 开盘
    close: 4106.25,  // 收盘
    high: 4175.35,   // 最高
    low: 4085.59,    // 最低
    volume: null
  },
  {
    date: new Date('2026-06-22'),
    open: 4093.95,   // 开盘
    close: 4163.10,  // 收盘
    high: 4164.42,   // 最高
    low: 4070.17,    // 最低
    volume: null
  }
];

console.log('=== K 线数据分析 ===');
console.log('2026-06-23 (当日):');
console.log(`  开盘：${candles[0].open}, 收盘：${candles[0].close}, 最高：${candles[0].high}, 最低：${candles[0].low}`);
console.log(`  K 线类型：${candles[0].close < candles[0].open ? '阴线' : '阳线'}`);
console.log(`  实体大小：${Math.abs(candles[0].close - candles[0].open).toFixed(2)}`);
console.log(`  整体波动：${(candles[0].high - candles[0].low).toFixed(2)}`);

console.log('\n2026-06-22 (前一日):');
console.log(`  开盘：${candles[1].open}, 收盘：${candles[1].close}, 最高：${candles[1].high}, 最低：${candles[1].low}`);
console.log(`  K 线类型：${candles[1].close > candles[1].open ? '阳线' : '阴线'}`);
console.log(`  实体大小：${Math.abs(candles[1].close - candles[1].open).toFixed(2)}`);
console.log(`  整体波动：${(candles[1].high - candles[1].low).toFixed(2)}`);

// 分析实体范围
const prevBodyTop = Math.max(candles[1].open, candles[1].close);
const prevBodyBottom = Math.min(candles[1].open, candles[1].close);
const currBodyTop = Math.max(candles[0].open, candles[0].close);
const currBodyBottom = Math.min(candles[0].open, candles[0].close);

console.log('\n=== 实体范围分析 ===');
console.log(`前一日实体范围：${prevBodyBottom.toFixed(2)} - ${prevBodyTop.toFixed(2)}`);
console.log(`当日实体范围：${currBodyBottom.toFixed(2)} - ${currBodyTop.toFixed(2)}`);
console.log(`当日实体是否被包裹：${currBodyBottom >= prevBodyBottom && currBodyTop <= prevBodyTop ? '是' : '否'}`);

// 检测孕线形态
const results = haramiDetector.detect(candles);

console.log('\n=== 检测结果 ===');
if (results.length > 0) {
  results.forEach(result => {
    console.log(JSON.stringify(result, null, 2));
  });
} else {
  console.log('未检测到任何孕线形态');
}

// 详细规则检查
console.log('\n=== 规则逐一检查 ===');

// 检查看涨孕线条件
console.log('\n【看涨孕线条件检查】');
console.log(`1. 前一日是阳线：${candles[1].close > candles[1].open ? '✓' : '✗'} (${candles[1].close > candles[1].open})`);
console.log(`2. 当日是阳线：${candles[0].close > candles[0].open ? '✓' : '✗'} (${candles[0].close > candles[0].open})`);

// 检查看跌孕线条件
console.log('\n【看跌孕线条件检查】');
console.log(`1. 前一日是阳线：${candles[1].close > candles[1].open ? '✓' : '✗'} (${candles[1].close > candles[1].open})`);
console.log(`2. 当日是阴线：${candles[0].close < candles[0].open ? '✓' : '✗'} (${candles[0].close < candles[0].open})`);
console.log(`3. 当日实体被包裹：${currBodyBottom >= prevBodyBottom && currBodyTop <= prevBodyTop ? '✓' : '✗'}`);
console.log(`   前一日实体：${prevBodyBottom.toFixed(2)} - ${prevBodyTop.toFixed(2)}`);
console.log(`   当日实体：${currBodyBottom.toFixed(2)} - ${currBodyTop.toFixed(2)}`);

// 检查实体大小比例
const prevBodySize = prevBodyTop - prevBodyBottom;
const currBodySize = currBodyTop - currBodyBottom;
const prevRange = candles[1].high - candles[1].low;

console.log(`4. 前一日实体足够大 (>50% 波动)：${prevBodySize > prevRange * 0.5 ? '✓' : ''} (${(prevBodySize / prevRange * 100).toFixed(1)}%)`);
console.log(`5. 当日实体较小 (<50% 前一日实体)：${currBodySize < prevBodySize * 0.5 ? '✓' : '✗'} (${(currBodySize / prevBodySize * 100).toFixed(1)}%)`);

// 检查十字孕线条件
console.log('\n【十字孕线条件检查】');
const currRange = candles[0].high - candles[0].low;
const isDoji = currBodySize < currRange * 0.1;
console.log(`1. 前一日有大实体：${prevBodySize > prevRange * 0.5 ? '✓' : '✗'}`);
console.log(`2. 当日是十字星 (实体<10% 波动)：${isDoji ? '✓' : '✗'} (${(currBodySize / currRange * 100).toFixed(1)}%)`);
console.log(`3. 当日实体被包裹：${currBodyBottom >= prevBodyBottom && currBodyTop <= prevBodyTop ? '✓' : '✗'}`);
