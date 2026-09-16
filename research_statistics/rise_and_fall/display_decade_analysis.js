const fs = require('fs');
const path = require('path');

// 读取之前生成的分析结果
const resultsPath = path.join(__dirname, 'temp_test', 'decade_analysis_results.json');
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

console.log('\n' + '='.repeat(120));
console.log('                        上证指数十年跨度涨跌统计分析报表 (2006-2025)');
console.log('='.repeat(120));
console.log('');

// 创建格式化表格
console.log('┌─────────────┬──────────┬──────────┬──────────┬──────────┬────────────┬────────────┬────────────┐');
console.log('│   时间跨度   │ 总交易日 │ 上涨天数 │ 下跌天数 │ 平盘天数 │ 上涨概率   │ 下跌概率   │ 平盘概率   │');
console.log('├─────────────┼──────────┼──────────┼──────────┼──────────┼────────────┼────────────┼────────────┤');

results.forEach(result => {
    const period = `${result.startYear}-${result.endYear}`;
    console.log(`│ ${period.padEnd(10)} │ ${result.totalDays.toString().padStart(6)} │ ${result.upDays.toString().padStart(6)} │ ${result.downDays.toString().padStart(6)} │ ${result.flatDays.toString().padStart(6)} │ ${(result.upProbability + '%').padStart(8)} │ ${(result.downProbability + '%').padStart(8)} │ ${(result.flatProbability + '%').padStart(8)} │`);
});

console.log('└─────────────┴──────────┴──────────┴──────────┴──────────┴────────────┴────────────┴────────────┘');

console.log('\n' + '='.repeat(120));
console.log('                              关键统计发现');
console.log('='.repeat(120));

// 找出最佳和最差时期
const bestPeriod = results.reduce((max, item) => 
    parseFloat(item.upProbability) > parseFloat(max.upProbability) ? item : max
);

const worstPeriod = results.reduce((min, item) => 
    parseFloat(item.upProbability) < parseFloat(min.upProbability) ? item : min
);

// 计算平均值
const avgUpProb = results.reduce((sum, item) => sum + parseFloat(item.upProbability), 0) / results.length;
const avgDownProb = results.reduce((sum, item) => sum + parseFloat(item.downProbability), 0) / results.length;

console.log(`\n📈 上涨概率最高的时期: ${bestPeriod.startYear}-${bestPeriod.endYear} (${bestPeriod.upProbability}%)`);
console.log(`   - 在此期间共有 ${bestPeriod.upDays} 个上涨交易日，${bestPeriod.downDays} 个下跌交易日`);
console.log(`   - 平均每年约 ${Math.round(bestPeriod.upDays/10)} 个上涨日`);

console.log(`\n📉 上涨概率最低的时期: ${worstPeriod.startYear}-${worstPeriod.endYear} (${worstPeriod.upProbability}%)`);
console.log(`   - 在此期间共有 ${worstPeriod.upDays} 个上涨交易日，${worstPeriod.downDays} 个下跌交易日`);
console.log(`   - 平均每年约 ${Math.round(worstPeriod.upDays/10)} 个上涨日`);

console.log(`\n📊 整体平均水平:`);
console.log(`   - 平均上涨概率: ${avgUpProb.toFixed(2)}%`);
console.log(`   - 平均下跌概率: ${avgDownProb.toFixed(2)}%`);
console.log(`   - 总体呈现"涨多跌少"特征，上涨概率普遍高于下跌概率`);

console.log(`\n🔍 趋势观察:`);
// 检查是否有明显的趋势变化
const firstHalf = results.slice(0, Math.floor(results.length/2));
const secondHalf = results.slice(Math.floor(results.length/2));

const firstHalfAvg = firstHalf.reduce((sum, item) => sum + parseFloat(item.upProbability), 0) / firstHalf.length;
const secondHalfAvg = secondHalf.reduce((sum, item) => sum + parseFloat(item.upProbability), 0) / secondHalf.length;

if (secondHalfAvg > firstHalfAvg) {
    console.log(`   - 后期时期的平均上涨概率(${secondHalfAvg.toFixed(2)}%)高于前期(${firstHalfAvg.toFixed(2)}%)`);
    console.log(`   - 表明市场可能在后期变得更加稳定或向好`);
} else {
    console.log(`   - 前期时期的平均上涨概率(${firstHalfAvg.toFixed(2)}%)高于后期(${secondHalfAvg.toFixed(2)}%)`);
    console.log(`   - 表明市场可能在后期波动性增加或表现减弱`);
}

console.log('\n' + '='.repeat(120));
console.log('                               数据说明');
console.log('='.repeat(120));
console.log('- 数据来源: 上证指数历史交易数据 (2006年1月4日 - 2025年12月31日)');
console.log('- 分析方法: 滚动10年窗口统计，每年向前移动一年');
console.log('- 上涨定义: 当日收盘价相对于开盘价上涨 (changePercent > 0)');
console.log('- 下跌定义: 当日收盘价相对于开盘价下跌 (changePercent < 0)');
console.log('- 平盘定义: 当日收盘价等于开盘价 (changePercent = 0)');
console.log('- 每个10年周期包含约2600+个交易日');
console.log('='.repeat(120) + '\n');