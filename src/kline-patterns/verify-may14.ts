/**
 * 验证上证指数 2026-05-14 的形态识别
 * 验证乌云盖顶 vs 看跌吞没的正确识别
 */

import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { Candle } from './dto/kline-pattern.dto';

// 创建测试实例
const twoCandleDetector = new TwoCandlePatterns();

// 根据用户提供的数据创建 K 线
// 5 月 13 日：开盘 4192.31，收盘 4242.57，最高 4245.07，最低 4192.31
// 5 月 14 日：开盘 4256.16，收盘 4177.92，最高 4258.86，最低 4177.92
const candles: Candle[] = [
  {
    date: new Date('2026-05-14'),
    open: 4256.16,   // 开盘
    close: 4177.92,  // 收盘
    high: 4258.86,   // 最高
    low: 4177.92,    // 最低
    volume: null
  },
  {
    date: new Date('2026-05-13'),
    open: 4192.31,   // 开盘
    close: 4242.57,  // 收盘
    high: 4245.07,   // 最高
    low: 4192.31,    // 最低
    volume: null
  }
];

console.log('=== K 线数据分析 ===');
console.log('2026-05-14 (当日):');
console.log(`  开盘：${candles[0].open}, 收盘：${candles[0].close}, 最高：${candles[0].high}, 最低：${candles[0].low}`);
console.log(`  K 线类型：${candles[0].close < candles[0].open ? '阴线' : '阳线'}`);
console.log(`  实体大小：${Math.abs(candles[0].close - candles[0].open).toFixed(2)}`);
console.log(`  整体波动：${(candles[0].high - candles[0].low).toFixed(2)}`);

console.log('\n2026-05-13 (前一日):');
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
console.log(`当日实体是否完全覆盖前一日：${currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop ? '是（吞没形态）' : '否'}`);
console.log(`  - 当日底部 <= 前一日底部：${currBodyBottom} <= ${prevBodyBottom} = ${currBodyBottom <= prevBodyBottom}`);
console.log(`  - 当日顶部 >= 前一日顶部：${currBodyTop} >= ${prevBodyTop} = ${currBodyTop >= prevBodyTop}`);

// 检测双根 K 线形态
const results = twoCandleDetector.detect(candles);

console.log('\n=== 检测结果 ===');
if (results.length > 0) {
  results.forEach(result => {
    console.log(`\n形态：${result.patternName} (${result.patternType})`);
    console.log(`  信号：${result.signal === 'sell' ? '看跌' : result.signal === 'buy' ? '看涨' : '中性'}`);
    console.log(`  置信度：${(result.confidence * 100).toFixed(1)}%`);
    console.log(`  描述：${result.description}`);
    if (result.metadata) {
      console.log(`  支撑位：${result.metadata.supportLevel?.toFixed(2) || '无'}`);
      console.log(`  阻挡位：${result.metadata.resistanceLevel?.toFixed(2) || '无'}`);
    }
  });
} else {
  console.log('未检测到任何双根 K 线形态');
}

// 详细规则检查
console.log('\n=== 规则逐一检查 ===');

console.log('\n【看跌吞没条件检查】');
console.log(`1. 前一日是阳线：${candles[1].close > candles[1].open ? '✓' : '✗'} (${candles[1].close > candles[1].open})`);
console.log(`2. 当日是阴线：${candles[0].close < candles[0].open ? '✓' : '✗'} (${candles[0].close < candles[0].open})`);
console.log(`3. 当日实体完全覆盖前一日：${currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop ? '✓' : '✗'}`);
console.log(`   当日底部 ${currBodyBottom.toFixed(2)} <= 前一日底部 ${prevBodyBottom.toFixed(2)}: ${currBodyBottom <= prevBodyBottom}`);
console.log(`   当日顶部 ${currBodyTop.toFixed(2)} >= 前一日顶部 ${prevBodyTop.toFixed(2)}: ${currBodyTop >= prevBodyTop}`);

console.log('\n【乌云盖顶条件检查】');
console.log(`1. 前一日是阳线：${candles[1].close > candles[1].open ? '✓' : '✗'} (${candles[1].close > candles[1].open})`);
console.log(`2. 当日是阴线：${candles[0].close < candles[0].open ? '✓' : '✗'} (${candles[0].close < candles[0].open})`);
console.log(`3. 跳空高开：${candles[0].open > candles[1].high ? '✓' : '✗'} (${candles[0].open} > ${candles[1].high})`);
const prevBodyMid = (candles[1].open + candles[1].close) / 2;
console.log(`4. 切入前一日实体 50% 以下：${candles[0].close < prevBodyMid ? '✓' : '✗'} (${candles[0].close} < ${prevBodyMid.toFixed(2)})`);
console.log(`5. 非完全覆盖（给乌云盖顶留余地）：${!(currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop) ? '✓' : '✗'} (如果是吞没，此项不检查)`);

console.log('\n=== 结论 ===');
const isEngulfing = currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop;
console.log(`正确识别结果：${isEngulfing ? '看跌吞没形态' : '乌云盖顶形态'}`);
console.log(`算法识别结果：${results.length > 0 ? results[0].patternName : '无形态'}`);
console.log(`识别是否正确：${results.length > 0 && ((isEngulfing && results[0].patternType === 'bearish_engulfing') || (!isEngulfing && results[0].patternType === 'dark_cloud_cover')) ? '✓ 正确' : '✗ 错误'}`);
