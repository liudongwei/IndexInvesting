# K线形态分析模块

## 功能概述

本模块基于《日本蜡烛图技术》实现了一套完整的K线形态识别和分析系统，支持：

- **趋势判断**：自动识别上升趋势、下降趋势、横盘趋势
- **形态识别**：识别14种经典K线形态（单根、双根、三根）
- **静态计算**：收盘后批量计算，数据固定不再变更
- **实时计算**：盘中每分钟动态计算，捕捉买卖信号
- **置信度评分**：每个形态都有0-1的置信度评分

## 已实现的形态

### 单根K线形态（6种）
1. ✅ **锤子线 (Hammer)** - 看涨反转
2. ✅ **上吊线 (Hanging Man)** - 看跌反转
3. ✅ **倒锤子线 (Inverted Hammer)** - 看涨反转
4. ✅ **射击之星 (Shooting Star)** - 看跌反转
5. ✅ **十字星 (Doji)** - 犹豫/反转信号
6. ✅ **大阳线/大阴线 (Marubozu)** - 强势信号

### 双根K线形态（4种）
7. ✅ **看涨吞没 (Bullish Engulfing)** - 看涨反转
8. ✅ **看跌吞没 (Bearish Engulfing)** - 看跌反转
9. ✅ **乌云盖顶 (Dark Cloud Cover)** - 看跌反转
10. ✅ **刺透形态 (Piercing Pattern)** - 看涨反转

### 三根K线形态（4种）
11. ✅ **早晨之星 (Morning Star)** - 看涨反转
12. ✅ **黄昏之星 (Evening Star)** - 看跌反转
13. ✅ **三只乌鸦 (Three Black Crows)** - 看跌延续
14. ✅ **三个白兵 (Three White Soldiers)** - 看涨延续

## 数据库结构

### kline_patterns 表
```sql
- id: UUID
- indexId: UUID (关联指数)
- tradeDate: Date (交易日期)
- trendState: ENUM (uptrend/downtrend/sideways)
- patternType: String (形态类型标识)
- patternName: String (形态名称)
- confidence: Decimal (置信度 0-1)
- signal: ENUM (buy/sell/neutral)
- candleData: JSONB (原始K线数据)
- metadata: JSONB (扩展信息)
- isRealtime: Boolean (是否实时计算)
```

### indices 表配置
通过 `metadata` 字段的 `participateInKlinePattern` 属性控制：
```json
{
  "participateInKlinePattern": true
}
```

## API接口

### 1. 分析指定指数的K线形态
```http
POST /kline-patterns/analyze
Content-Type: application/json

{
  "indexId": "uuid",
  "tradeDate": "2026-09-10",
  "isRealtime": false
}
```

### 2. 获取指数的K线形态历史
```http
GET /kline-patterns/history/:indexId?limit=10&isRealtime=false
```

### 3. 获取指定日期的K线形态
```http
GET /kline-patterns/:indexId/:date?isRealtime=false
```

### 4. 批量分析所有活跃指数（收盘后使用）
```http
POST /kline-patterns/batch-analyze
Content-Type: application/json

{
  "tradeDate": "2026-09-10"
}
```

### 5. 实时分析所有活跃指数（盘中使用）
```http
POST /kline-patterns/realtime-analyze
```

## 定时任务

### 1. 收盘后批量计算
- **执行时间**：每个交易日 16:00
- **功能**：计算当日所有标记指数的静态K线形态
- **特点**：数据保存后不再变更

### 2. 盘中实时计算
- **执行时间**：工作日 9:00-15:59，每分钟一次
- **功能**：实时检测买卖信号
- **特点**：不保存到数据库（或单独标记），用于触发通知

## 使用示例

### 启用某个指数的K线形态计算
```typescript
// 更新 indices 表的 metadata 字段
UPDATE indices 
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{participateInKlinePattern}', 'true') 
WHERE code = 'sh000300';
```

### 手动触发批量分析
```typescript
// 通过控制器调用
await kLinePatternCronService.triggerManualBatchAnalysis(new Date('2026-09-10'));
```

### 查询高置信度的看涨信号
```typescript
const patterns = await klinePatternRepo.find({
  where: {
    signal: 'buy',
    confidence: MoreThan(0.8),
    isRealtime: false
  },
  order: { confidence: 'DESC' }
});
```

## 配置与扩展

### 添加新的K线形态
1. 在对应的pattern文件中创建新类
2. 实现 `detect()` 方法
3. 在主服务中注册调用

### 调整形态阈值
修改对应pattern文件中的判断条件，例如：
```typescript
// single-candle.pattern.ts
// 调整锤子线下影线要求从2倍改为3倍
if (lowerShadow < bodySize * 3) {  // 原来是 2
  return null;
}
```

### 集成通知功能
在 `KLinePatternService.realtimeAnalyzeAll()` 中添加：
```typescript
if (pattern.signal === 'buy' && pattern.confidence > 0.8) {
  // 发送邮件/短信
  await notificationService.sendAlert(...);
}
```

## 注意事项

1. **数据要求**：至少需要30根历史K线才能进行准确的趋势判断
2. **性能优化**：批量计算时使用事务，避免逐条保存
3. **时区处理**：确保交易日期与时区设置一致
4. **周末处理**：定时任务已设置为工作日执行
5. **置信度调优**：可根据实际回测结果调整各形态的基础置信度

## 后续扩展计划

- [ ] 支持更多K线形态（四根及以上）
- [ ] 成交量配合分析
- [ ] 形态组合策略
- [ ] 回测验证功能
- [ ] 前端可视化展示
- [ ] 邮件/短信通知集成
- [ ] 形态权重配置化
