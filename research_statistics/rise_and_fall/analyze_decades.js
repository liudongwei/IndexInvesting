const fs = require('fs');
const path = require('path');

// 读取CSV文件
const csvFilePath = path.join(__dirname, 'temp_test', 'index_histories_202609161614.csv');
const csvData = fs.readFileSync(csvFilePath, 'utf-8');

// 解析CSV数据
const lines = csvData.trim().split('\n');
const headers = lines[0].split(',');

// 存储所有交易日的涨跌数据
const tradingDays = [];

for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 4) {
        const tradeDate = values[0];
        const changePercent = parseFloat(values[3]);
        
        // 跳过没有涨跌幅数据的行（如第一行）
        if (!isNaN(changePercent)) {
            const date = new Date(tradeDate);
            const year = date.getFullYear();
            
            tradingDays.push({
                date: tradeDate,
                year: year,
                changePercent: changePercent,
                isUp: changePercent > 0,
                isDown: changePercent < 0,
                isFlat: changePercent === 0
            });
        }
    }
}

console.log(`总共交易日数: ${tradingDays.length}`);
console.log(`数据时间范围: ${tradingDays[0].date} 至 ${tradingDays[tradingDays.length - 1].date}\n`);

// 计算指定年份范围的统计数据
function calculateDecadeStats(startYear, endYear) {
    // 筛选出指定年份范围内的交易日
    const decadeDays = tradingDays.filter(day => day.year >= startYear && day.year <= endYear);
    
    if (decadeDays.length === 0) {
        return null;
    }
    
    const upDays = decadeDays.filter(day => day.isUp).length;
    const downDays = decadeDays.filter(day => day.isDown).length;
    const flatDays = decadeDays.filter(day => day.isFlat).length;
    const totalDays = decadeDays.length;
    
    return {
        startYear,
        endYear,
        totalDays,
        upDays,
        downDays,
        flatDays,
        upProbability: (upDays / totalDays * 100).toFixed(2),
        downProbability: (downDays / totalDays * 100).toFixed(2),
        flatProbability: (flatDays / totalDays * 100).toFixed(2)
    };
}

// 生成所有可能的10年跨度统计 (2005-2015, 2006-2016, ..., 2015-2025)
console.log('=== 十年跨度统计分析 ===');
console.log('格式: 起始年-结束年 | 总天数 | 上涨天数 | 下跌天数 | 平盘天数 | 上涨概率 | 下跌概率 | 平盘概率\n');

const results = [];

// 根据实际数据年份动态生成年份范围
const minYear = Math.min(...tradingDays.map(d => d.year));
const maxYear = Math.max(...tradingDays.map(d => d.year));

// 生成从minYear到maxYear的所有10年跨度
for (let startYear = minYear; startYear <= maxYear - 10; startYear++) {
    const endYear = startYear + 10;
    const stats = calculateDecadeStats(startYear, endYear);
    
    if (stats) {
        results.push(stats);
        console.log(`${stats.startYear}-${stats.endYear} | ` +
                   `总天数: ${stats.totalDays.toString().padStart(5)} | ` +
                   `上涨: ${stats.upDays.toString().padStart(5)} | ` +
                   `下跌: ${stats.downDays.toString().padStart(5)} | ` +
                   `平盘: ${stats.flatDays.toString().padStart(5)} | ` +
                   `上涨概率: ${stats.upProbability}% | ` +
                   `下跌概率: ${stats.downProbability}% | ` +
                   `平盘概率: ${stats.flatProbability}%`);
    }
}

// 找出上涨概率最高和最低的时期
if (results.length > 0) {
    const bestUpPeriod = results.reduce((max, item) => 
        parseFloat(item.upProbability) > parseFloat(max.upProbability) ? item : max
    );
    
    const worstUpPeriod = results.reduce((min, item) => 
        parseFloat(item.upProbability) < parseFloat(min.upProbability) ? item : min
    );
    
    console.log('\n=== 关键发现 ===');
    console.log(`上涨概率最高的10年: ${bestUpPeriod.startYear}-${bestUpPeriod.endYear} (${bestUpPeriod.upProbability}%)`);
    console.log(`上涨概率最低的10年: ${worstUpPeriod.startYear}-${worstUpPeriod.endYear} (${worstUpPeriod.upProbability}%)`);
    
    // 计算平均上涨概率
    const avgUpProbability = results.reduce((sum, item) => 
        sum + parseFloat(item.upProbability), 0) / results.length;
    console.log(`所有10年跨期的平均上涨概率: ${avgUpProbability.toFixed(2)}%`);
}

// 将结果保存为JSON文件以便进一步分析
const outputPath = path.join(__dirname, 'temp_test', 'decade_analysis_results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n详细结果已保存至: ${outputPath}`);