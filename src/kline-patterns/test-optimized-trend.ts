import { Candle } from './dto/kline-pattern.dto';
import { TrendDetectorService } from './patterns/trend-detector.service';

/**
 * 测试优化后的趋势识别算法
 * 模拟红框区域的走势：下跌后连续 3 根阳线反弹
 */

// 创建模拟数据：先下跌，然后 3 连阳反弹
function createTestCandles(): Candle[] {
  const candles: Candle[] = [];
  
  // 初始价格
  let price = 4000;
  
  // 先生成下跌走势（20 根阴线）
  for (let i = 0; i < 20; i++) {
    const open = price;
    const close = price - 30 - Math.random() * 20;
    const high = open + Math.random() * 10;
    const low = close - Math.random() * 10;
    
    candles.push({ 
      date: new Date(Date.now() - (candles.length * 24 * 60 * 60 * 1000)),
      open, high, low, close, volume: 1000 
    });
    price = close;
  }
  
  // 然后 3 连阳反弹
  for (let i = 0; i < 3; i++) {
    const open = price;
    const close = price + 40 + Math.random() * 20;
    const high = close + Math.random() * 10;
    const low = open - Math.random() * 5;
    
    candles.push({ 
      date: new Date(Date.now() - (candles.length * 24 * 60 * 60 * 1000)),
      open, high, low, close, volume: 1000 
    });
    price = close;
  }
  
  // 继续生成一些横盘数据（10 根）
  for (let i = 0; i < 10; i++) {
    const open = price + (Math.random() - 0.5) * 20;
    const close = open + (Math.random() - 0.5) * 20;
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;
    
    candles.push({ 
      date: new Date(Date.now() - (candles.length * 24 * 60 * 60 * 1000)),
      open, high, low, close, volume: 1000 
    });
    price = close;
  }
  
  return candles.reverse(); // 反转为倒序（最新在前）
}

async function testOptimizedTrendDetection() {
  console.log('=== 测试优化后的趋势识别算法 ===\n');
  
  const detector = new TrendDetectorService();
  const candles = createTestCandles();
  
  console.log(`测试数据：${candles.length}根 K 线`);
  console.log('最新 3 根 K 线:');
  for (let i = 0; i < 3; i++) {
    const c = candles[i];
    const isUp = c.close > c.open;
    console.log(`  [${i}] ${isUp ? '阳线' : '阴线'} 开:${c.open.toFixed(2)} 收:${c.close.toFixed(2)} 高:${c.high.toFixed(2)} 低:${c.low.toFixed(2)}`);
  }
  console.log('\n');
  
  // 测试传统单周期分析
  console.log('=== 传统单周期分析 (window=30) ===');
  const result = detector.analyzeTrend(candles);
  console.log(`趋势状态：${result.trendState}`);
  console.log(`趋势评分：${result.score?.toFixed(4)}`);
  console.log(`置信度：${(result.confidence! * 100).toFixed(1)}%`);
  if (result.components) {
    console.log(`  效率系数：${result.components.efficiency.toFixed(4)}`);
    console.log(`  回归斜率：${result.components.slope.toFixed(6)}`);
    console.log(`  线性度 R²: ${result.components.r2!.toFixed(4)}`);
    console.log(`  均线间距：${result.components.maSpread!.toFixed(4)}`);
    console.log(`  结构因子：${result.components.structure!.toFixed(4)}`);
  }
  console.log('\n');
  
  // 测试多周期分析
  console.log('=== 多周期趋势分层分析 ===');
  const multiResult = detector.scoreTrendAt(candles.reverse(), candles.length - 1, {
    window: 30,
    enableMultiTimeframe: true,
    enableEmergingTrend: false
  });
  
  if (multiResult.multiTimeframe) {
    const mt = multiResult.multiTimeframe;
    console.log(`短期 (${10}周期): ${mt.short} (分数：${mt.shortScore.toFixed(4)})`);
    console.log(`中期 (${30}周期): ${mt.medium} (分数：${mt.mediumScore.toFixed(4)})`);
    console.log(`长期 (${60}周期): ${mt.long} (分数：${mt.longScore.toFixed(4)})`);
    
    // 判断是否短期中期背离
    if (mt.short === 'uptrend' && mt.medium === 'sideways') {
      console.log('✨ 检测到短期反弹、中期横盘的背离形态');
    }
  }
  console.log('\n');
  
  // 测试趋势萌芽检测
  console.log('=== 趋势萌芽/反弹检测 ===');
  const emergingResult = detector.scoreTrendAt(candles.reverse(), candles.length - 1, {
    window: 30,
    enableMultiTimeframe: false,
    enableEmergingTrend: true
  });
  
  if (emergingResult.emergingTrend) {
    console.log(`检测到趋势萌芽：${emergingResult.emergingTrend === 'bounce' ? '超跌反弹 ' : '回调 📉'}`);
  } else {
    console.log('未检测到明显的趋势萌芽状态');
  }
  console.log('\n');
  
  // 综合分析
  console.log('=== 综合分析结论 ===');
  if (multiResult.multiTimeframe) {
    const mt = multiResult.multiTimeframe;
    if (mt.short === 'uptrend' && mt.medium === 'sideways' && emergingResult.emergingTrend === 'bounce') {
      console.log('✅ 算法确认：当前为超跌反弹行情');
      console.log('   - 短期趋势向上（3 连阳）');
      console.log('   - 中期趋势横盘（整体 V 型）');
      console.log('   - 趋势萌芽检测确认为反弹');
      console.log('\n建议：等待中期趋势确认后再跟进，避免下跌中继风险');
    } else if (mt.short === 'uptrend' && mt.medium === 'uptrend') {
      console.log('✅ 算法确认：当前为反转上涨行情');
      console.log('   - 短中期趋势一致向上');
      console.log('\n建议：可以积极跟进');
    } else {
      console.log('⚠️  市场状态复杂，需要结合更多因素判断');
    }
  }
}

if (require.main === module) {
  testOptimizedTrendDetection().catch(console.error);
}
