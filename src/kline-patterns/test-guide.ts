/**
 * K线形态分析模块 - 快速测试指南
 * 
 * 使用方法：
 * 1. 启动后端服务: npm run start:dev
 * 2. 在数据库中启用某个指数的K线形态计算
 * 3. 调用API进行测试
 */

// ============================================
// 步骤1: 启用指数参与K线形态计算
// ============================================
// 在PostgreSQL中执行：
// UPDATE indices 
// SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{participateInKlinePattern}', 'true') 
// WHERE code = 'sh000300';

// ============================================
// 步骤2: 手动触发单次分析（测试用）
// ============================================
// POST http://localhost:3000/kline-patterns/analyze
// Content-Type: application/json
//
// {
//   "indexId": "你的指数UUID",
//   "tradeDate": "2026-09-10",
//   "isRealtime": false
// }

// ============================================
// 步骤3: 查询分析结果
// ============================================
// GET http://localhost:3000/kline-patterns/history/:indexId?limit=10&isRealtime=false

// ============================================
// 步骤4: 批量分析所有标记指数（收盘后使用）
// ============================================
// POST http://localhost:3000/kline-patterns/batch-analyze
// Content-Type: application/json
//
// {
//   "tradeDate": "2026-09-10"
// }

// ============================================
// 步骤5: 实时分析（盘中使用）
// ============================================
// POST http://localhost:3000/kline-patterns/realtime-analyze

// ============================================
// 预期返回格式
// ============================================
/*
{
  "success": true,
  "data": {
    "tradeDate": "2026-09-10",
    "trendState": "uptrend",
    "patterns": [
      {
        "patternType": "bullish_engulfing",
        "patternName": "看涨吞没",
        "confidence": 0.85,
        "signal": "buy",
        "description": "阳线完全包裹阴线，多头力量强劲，看涨反转信号"
      },
      {
        "patternType": "hammer",
        "patternName": "锤子线",
        "confidence": 0.75,
        "signal": "buy",
        "description": "下影线较长，表明下方有支撑，潜在看涨反转信号"
      }
    ],
    "primaryPattern": {
      "patternType": "bullish_engulfing",
      "patternName": "看涨吞没",
      "confidence": 0.85,
      "signal": "buy"
    }
  }
}
*/

// ============================================
// 数据库查询示例
// ============================================
/*
-- 查看最近的K线形态分析结果
SELECT 
  "tradeDate",
  "trendState",
  "patternName",
  confidence,
  signal
FROM kline_patterns
WHERE "indexId" = '你的指数UUID'
  AND "isRealtime" = false
ORDER BY "tradeDate" DESC
LIMIT 20;

-- 统计各形态出现频率
SELECT 
  "patternName",
  signal,
  COUNT(*) as frequency,
  AVG(confidence) as avg_confidence
FROM kline_patterns
WHERE "isRealtime" = false
GROUP BY "patternName", signal
ORDER BY frequency DESC;

-- 查找高置信度的看涨信号
SELECT 
  kp."tradeDate",
  i.name as index_name,
  kp."patternName",
  kp.confidence,
  kp.signal
FROM kline_patterns kp
JOIN indices i ON kp."indexId" = i.id
WHERE kp.signal = 'buy'
  AND kp.confidence > 0.8
  AND kp."isRealtime" = false
ORDER BY kp.confidence DESC
LIMIT 20;
*/

console.log('K线形态分析模块已就绪！');
console.log('详细使用说明请查看 src/kline-patterns/README.md');
