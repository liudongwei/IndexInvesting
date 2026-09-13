/**
 * 综合测试所有双根 K 线形态的支撑位和阻挡位计算
 */

import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { Candle } from './dto/kline-pattern.dto';

const twoCandleDetector = new TwoCandlePatterns();

console.log('=== 双根 K 线形态支撑位/阻挡位综合测试 ===\n');

// 测试用例 1：看跌吞没
console.log('【测试 1】看跌吞没形态');
const bearishEngulfingCandles: Candle[] = [
  {
    date: new Date('2026-05-14'),
    open: 4256.16,
    close: 4177.92,
    high: 4258.86,
    low: 4177.92,
    volume: null
  },
  {
    date: new Date('2026-05-13'),
    open: 4192.31,
    close: 4242.57,
    high: 4245.07,
    low: 4192.31,
    volume: null
  }
];

const beResults = twoCandleDetector.detect(bearishEngulfingCandles);
if (beResults.length > 0) {
  const result = beResults[0];
  console.log(`形态：${result.patternName}`);
  console.log(`预期阻挡位：4258.86（当日最高价）`);
  console.log(`实际阻挡位：${result.metadata?.resistanceLevel?.toFixed(2) || '无'}`);
  console.log(`预期支撑位：4177.92（当日最低价）`);
  console.log(`实际支撑位：${result.metadata?.supportLevel?.toFixed(2) || '无'}`);
  console.log(`结果：${result.metadata?.resistanceLevel === 4258.86 && result.metadata?.supportLevel === 4177.92 ? '✓ 正确' : '✗ 错误'}`);
} else {
  console.log('未检测到形态');
}

// 测试用例 2：看涨吞没
console.log('\n【测试 2】看涨吞没形态');
const bullishEngulfingCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 105,
    close: 120,
    high: 122,
    low: 103,
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 110,
    close: 100,
    high: 112,
    low: 98,
    volume: null
  }
];

const buResults = twoCandleDetector.detect(bullishEngulfingCandles);
if (buResults.length > 0) {
  const result = buResults[0];
  console.log(`形态：${result.patternName}`);
  console.log(`预期阻挡位：122（当日最高价）`);
  console.log(`实际阻挡位：${result.metadata?.resistanceLevel?.toFixed(2) || '无'}`);
  console.log(`预期支撑位：103（当日最低价）`);
  console.log(`实际支撑位：${result.metadata?.supportLevel?.toFixed(2) || '无'}`);
  console.log(`结果：${result.metadata?.resistanceLevel === 122 && result.metadata?.supportLevel === 103 ? '✓ 正确' : '✗ 错误'}`);
} else {
  console.log('未检测到形态');
}

// 测试用例 3：乌云盖顶
console.log('\n【测试 3】乌云盖顶形态');
const darkCloudCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 115,
    close: 103,
    high: 118,
    low: 102,
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 100,
    close: 110,
    high: 112,
    low: 98,
    volume: null
  }
];

const dcResults = twoCandleDetector.detect(darkCloudCandles);
if (dcResults.length > 0) {
  const result = dcResults[0];
  console.log(`形态：${result.patternName}`);
  console.log(`预期阻挡位：118.00（max(当日最高 118, 前日最高 112)）`);
  console.log(`实际阻挡位：${result.metadata?.resistanceLevel?.toFixed(2) || '无'}`);
  console.log(`预期支撑位：100.00（前日阳线开盘价）`);
  console.log(`实际支撑位：${result.metadata?.supportLevel?.toFixed(2) || '无'}`);
  console.log(`结果：${result.metadata?.resistanceLevel === 118 && result.metadata?.supportLevel === 100 ? '✓ 正确' : '✗ 错误'}`);
} else {
  console.log('未检测到形态');
}

// 测试用例 4：刺透形态
console.log('\n【测试 4】刺透形态');
const piercingCandles: Candle[] = [
  {
    date: new Date('2026-06-02'),
    open: 85,
    close: 97,
    high: 88,
    low: 82,
    volume: null
  },
  {
    date: new Date('2026-06-01'),
    open: 100,
    close: 90,
    high: 102,
    low: 88,
    volume: null
  }
];

const pResults = twoCandleDetector.detect(piercingCandles);
if (pResults.length > 0) {
  const result = pResults[0];
  console.log(`形态：${result.patternName}`);
  console.log(`预期支撑位：82.00（min(当日最低 82, 前日最低 88)）`);
  console.log(`实际支撑位：${result.metadata?.supportLevel?.toFixed(2) || '无'}`);
  console.log(`预期阻挡位：100.00（前日阴线收盘价/实体顶部）`);
  console.log(`实际阻挡位：${result.metadata?.resistanceLevel?.toFixed(2) || '无'}`);
  console.log(`结果：${result.metadata?.supportLevel === 82 && result.metadata?.resistanceLevel === 100 ? '✓ 正确' : '✗ 错误'}`);
} else {
  console.log('未检测到形态');
}

console.log('\n=== 测试完成 ===');
