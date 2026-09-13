/**
 * 调试看涨吞没形态检测
 */

import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { Candle } from './dto/kline-pattern.dto';

const twoCandleDetector = new TwoCandlePatterns();

// 创建明显的看涨吞没形态
const bullishEngulfingCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 95,   // 开盘低于前日收盘
    close: 115, // 收盘高于前日开盘
    high: 118,
    low: 93,
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 110,  // 开盘
    close: 100, // 收盘（阴线）
    high: 112,
    low: 98,
    volume: null
  }
];

console.log('=== 看涨吞没形态分析 ===');
console.log('\nK 线数据:');
console.log('2026-06-02 (当日):');
console.log(`  开盘：${bullishEngulfingCandles[0].open}, 收盘：${bullishEngulfingCandles[0].close}, 最高：${bullishEngulfingCandles[0].high}, 最低：${bullishEngulfingCandles[0].low}`);
console.log(`  K 线类型：${bullishEngulfingCandles[0].close > bullishEngulfingCandles[0].open ? '阳线' : '阴线'}`);

console.log('\n2026-06-01 (前一日):');
console.log(`  开盘：${bullishEngulfingCandles[1].open}, 收盘：${bullishEngulfingCandles[1].close}, 最高：${bullishEngulfingCandles[1].high}, 最低：${bullishEngulfingCandles[1].low}`);
console.log(`  K 线类型：${bullishEngulfingCandles[1].close < bullishEngulfingCandles[1].open ? '阴线' : '阳线'}`);

// 分析实体范围
const prevBodyTop = Math.max(bullishEngulfingCandles[1].open, bullishEngulfingCandles[1].close);
const prevBodyBottom = Math.min(bullishEngulfingCandles[1].open, bullishEngulfingCandles[1].close);
const currBodyTop = Math.max(bullishEngulfingCandles[0].open, bullishEngulfingCandles[0].close);
const currBodyBottom = Math.min(bullishEngulfingCandles[0].open, bullishEngulfingCandles[0].close);

console.log('\n实体范围分析:');
console.log(`前一日实体范围：${prevBodyBottom.toFixed(2)} - ${prevBodyTop.toFixed(2)}`);
console.log(`当日实体范围：${currBodyBottom.toFixed(2)} - ${currBodyTop.toFixed(2)}`);
console.log(`当日底部 <= 前一日底部：${currBodyBottom} <= ${prevBodyBottom} = ${currBodyBottom <= prevBodyBottom}`);
console.log(`当日顶部 >= 前一日顶部：${currBodyTop} >= ${prevBodyTop} = ${currBodyTop >= prevBodyTop}`);
console.log(`完全覆盖条件：${currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop ? '满足' : '不满足'}`);

// 检测形态
const results = twoCandleDetector.detect(bullishEngulfingCandles);

console.log('\n检测结果:');
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
  console.log('未检测到任何形态');
}
