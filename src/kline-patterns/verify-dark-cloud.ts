/**
 * 验证真正的乌云盖顶形态
 * 创建一个满足乌云盖顶但不满足吞没形态的案例
 */

import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { Candle } from './dto/kline-pattern.dto';

// 创建测试实例
const twoCandleDetector = new TwoCandlePatterns();

// 创建乌云盖顶形态数据
// 前一日：阳线，开盘 100，收盘 110，最高 112，最低 98
// 当日：跳空高开 115，但收阴到 103（切入前一日实体 50% 以下，但未完全覆盖）
const darkCloudCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 115,     // 开盘（跳空高开）
    close: 103,    // 收盘（切入前一日实体内部）
    high: 118,     // 最高
    low: 102,      // 最低
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 100,     // 开盘
    close: 110,    // 收盘
    high: 112,     // 最高
    low: 98,       // 最低
    volume: null
  }
];

console.log('=== 乌云盖顶形态验证 ===');
console.log('\nK 线数据:');
console.log('2026-06-02 (当日):');
console.log(`  开盘：${darkCloudCandles[0].open}, 收盘：${darkCloudCandles[0].close}, 最高：${darkCloudCandles[0].high}, 最低：${darkCloudCandles[0].low}`);
console.log(`  K 线类型：${darkCloudCandles[0].close < darkCloudCandles[0].open ? '阴线' : '阳线'}`);

console.log('\n2026-06-01 (前一日):');
console.log(`  开盘：${darkCloudCandles[1].open}, 收盘：${darkCloudCandles[1].close}, 最高：${darkCloudCandles[1].high}, 最低：${darkCloudCandles[1].low}`);
console.log(`  K 线类型：${darkCloudCandles[1].close > darkCloudCandles[1].open ? '阳线' : '阴线'}`);

// 分析实体范围
const prevBodyTop = Math.max(darkCloudCandles[1].open, darkCloudCandles[1].close);
const prevBodyBottom = Math.min(darkCloudCandles[1].open, darkCloudCandles[1].close);
const currBodyTop = Math.max(darkCloudCandles[0].open, darkCloudCandles[0].close);
const currBodyBottom = Math.min(darkCloudCandles[0].open, darkCloudCandles[0].close);
const prevBodyMid = (darkCloudCandles[1].open + darkCloudCandles[1].close) / 2;

console.log('\n实体范围分析:');
console.log(`前一日实体范围：${prevBodyBottom.toFixed(2)} - ${prevBodyTop.toFixed(2)}`);
console.log(`当日实体范围：${currBodyBottom.toFixed(2)} - ${currBodyTop.toFixed(2)}`);
console.log(`前一日实体中点：${prevBodyMid.toFixed(2)}`);
console.log(`当日是否完全覆盖前一日：${currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop ? '是' : '否'}`);
console.log(`当日收盘价是否低于中点：${darkCloudCandles[0].close} < ${prevBodyMid.toFixed(2)} = ${darkCloudCandles[0].close < prevBodyMid ? '是' : '否'}`);

// 检测形态
const dcResults = twoCandleDetector.detect(darkCloudCandles);

console.log('\n检测结果:');
if (dcResults.length > 0) {
  dcResults.forEach(result => {
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

console.log('\n=== 结论 ===');
const isDarkCloud = dcResults.length > 0 && dcResults[0].patternType === 'dark_cloud_cover';
console.log(`是否正确识别为乌云盖顶：${isDarkCloud ? '✓ 正确' : ' 错误'}`);

// 测试刺透形态
console.log('\n\n=== 刺透形态验证 ===');
const piercingCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 85,      // 开盘（跳空低开）
    close: 97,     // 收盘（切入前一日实体内部）
    high: 88,      // 最高
    low: 82,       // 最低
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 100,     // 开盘
    close: 90,     // 收盘
    high: 102,     // 最高
    low: 88,       // 最低
    volume: null
  }
];

console.log('\nK 线数据:');
console.log('2026-06-02 (当日):');
console.log(`  开盘：${piercingCandles[0].open}, 收盘：${piercingCandles[0].close}, 最高：${piercingCandles[0].high}, 最低：${piercingCandles[0].low}`);
console.log(`  K 线类型：${piercingCandles[0].close > piercingCandles[0].open ? '阳线' : '阴线'}`);

console.log('\n2026-06-01 (前一日):');
console.log(`  开盘：${piercingCandles[1].open}, 收盘：${piercingCandles[1].close}, 最高：${piercingCandles[1].high}, 最低：${piercingCandles[1].low}`);
console.log(`  K 线类型：${piercingCandles[1].close < piercingCandles[1].open ? '阴线' : '阳线'}`);

const pPrevBodyTop = Math.max(piercingCandles[1].open, piercingCandles[1].close);
const pPrevBodyBottom = Math.min(piercingCandles[1].open, piercingCandles[1].close);
const pCurrBodyTop = Math.max(piercingCandles[0].open, piercingCandles[0].close);
const pCurrBodyBottom = Math.min(piercingCandles[0].open, piercingCandles[0].close);
const pPrevBodyMid = (piercingCandles[1].open + piercingCandles[1].close) / 2;

console.log('\n实体范围分析:');
console.log(`前一日实体范围：${pPrevBodyBottom.toFixed(2)} - ${pPrevBodyTop.toFixed(2)}`);
console.log(`当日实体范围：${pCurrBodyBottom.toFixed(2)} - ${pCurrBodyTop.toFixed(2)}`);
console.log(`前一日实体中点：${pPrevBodyMid.toFixed(2)}`);
console.log(`当日是否完全覆盖前一日：${pCurrBodyBottom <= pPrevBodyBottom && pCurrBodyTop >= pPrevBodyTop ? '是' : '否'}`);
console.log(`当日收盘价是否高于中点：${piercingCandles[0].close} > ${pPrevBodyMid.toFixed(2)} = ${piercingCandles[0].close > pPrevBodyMid ? '是' : '否'}`);

const pResults = twoCandleDetector.detect(piercingCandles);

console.log('\n检测结果:');
if (pResults.length > 0) {
  pResults.forEach(result => {
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

console.log('\n=== 结论 ===');
const isPiercing = pResults.length > 0 && pResults[0].patternType === 'piercing_pattern';
console.log(`是否正确识别为刺透形态：${isPiercing ? '✓ 正确' : '✗ 错误'}`);
