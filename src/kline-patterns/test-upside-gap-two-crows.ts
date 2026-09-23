/**
 * 向上跳空两只乌鸦形态测试
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
// 预期返回格式 - 向上跳空两只乌鸦形态
// ============================================
/*
{
  "success": true,
  "data": {
    "tradeDate": "2026-09-10",
    "trendState": "uptrend",
    "patterns": [
      {
        "patternType": "upside_gap_two_crows",
        "patternName": "向上跳空两只乌鸦",
        "confidence": 0.75,
        "signal": "sell",
        "description": "上升趋势中跳空高开后连续两根阴线，看跌反转信号。阻挡位：3500.00，支撑位：3450.00",
        "metadata": {
          "resistanceLevel": 3500.00,
          "supportLevel": 3450.00,
          "gapExists": true
        }
      }
    ],
    "primaryPattern": {
      "patternType": "upside_gap_two_crows",
      "patternName": "向上跳空两只乌鸦",
      "confidence": 0.75,
      "signal": "sell"
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

-- 查找高置信度的看跌信号
SELECT 
  kp."tradeDate",
  i.name as index_name,
  kp."patternName",
  kp.confidence,
  kp.signal
FROM kline_patterns kp
JOIN indices i ON kp."indexId" = i.id
WHERE kp.signal = 'sell'
  AND kp.confidence > 0.7
  AND kp."isRealtime" = false
ORDER BY kp.confidence DESC
LIMIT 20;

-- 专门查询向上跳空两只乌鸦形态
SELECT 
  kp."tradeDate",
  i.name as index_name,
  kp."patternName",
  kp.confidence,
  kp.signal,
  kp.metadata
FROM kline_patterns kp
JOIN indices i ON kp."indexId" = i.id
WHERE kp."patternType" = 'upside_gap_two_crows'
  AND kp."isRealtime" = false
ORDER BY kp.confidence DESC;
*/

console.log('向上跳空两只乌鸦形态测试已就绪！');
console.log('详细使用说明请查看 src/kline-patterns/README.md');
