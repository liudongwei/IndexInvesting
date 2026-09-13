# 趋势分类算法优化说明

## 概述

本次优化将传统的均线硬判断升级为多因子加权打分系统，参考了专业的K线趋势分类算法，解决了原有方法在边界附近信号抖动、横盘误判等问题。

## 核心改进

### 1. 连续打分替代硬分类
- **旧方案**：直接输出 `uptrend/downtrend/sideways` 三分类
- **新方案**：输出 -1~+1 的连续 `score`，下游可按业务阈值切分
- **优势**：更灵活，适配不同风险偏好的业务场景

### 2. 主因子升级：斜率×R²
- **旧方案**：仅用均线排列（MA5>MA10>MA20）
- **新方案**：窗口线性回归斜率 × R²（线性度）
- **优势**：
  - 斜率代表趋势方向
  - R²代表趋势的"笔直程度"，天然区分趋势市和横盘震荡
  - 比单纯均线排列更能刻画趋势质量

### 3. ATR归一化
- **旧方案**：使用绝对价格差值
- **新方案**：所有距离类指标除以ATR（平均真实波动范围）
- **优势**：解决不同品种、不同价位之间趋势强度不可比的问题，跨品种适用性强

### 4. 多因子交叉验证
融合四类逻辑完全不同的因子：
1. **Kaufman效率系数**：方向位移/路径总长度，衡量价格走势的效率
2. **回归斜率×R²**：趋势方向和线性度
3. **均线排列**：MA10-MA20间距（ATR归一）
4. **摆动结构**：HH/HL（上升结构）或 LL/LH（下降结构）

### 5. 迟滞状态机
- **旧方案**：单点硬判断，边界附近容易抖动
- **新方案**：进入/退出双阈值形成迟滞带
  - 进入阈值：0.25（需要较强信号才进入趋势）
  - 退出阈值：0.20（已有趋势时容忍一定回调）
- **优势**：有效抑制边界附近的信号抖动

### 6. 结构因子纳入打分
- **旧方案**：摆动结构只做"一票否决"，不参与打分
- **新方案**：结构因子占15%权重，平滑影响最终score
- **优势**：状态切换更自然，分数和状态不会明显脱节

## Bug修复

### 1. ATR初始值索引错误
- **问题**：标准ATR(n)的第一个有效值应出现在第n根K线（索引n），但原代码赋值给了`out[n-1]`
- **修复**：改为`out[n] = seed / n`，后续递归从`n+1`开始

### 2. 摆动点识别使用收盘价不合理
- **问题**：用收盘价识别局部高低点，丢失影线的关键信息
- **修复**：改用最高价识别高点、最低价识别低点
  ```typescript
  // 旧代码
  if (closes[j] >= closes[i]) isHigh = false;
  
  // 新代码
  if (klines[j].high >= klines[i].high) isHigh = false;
  ```

## 权重配置

```typescript
const score = 0.35 * sEr +      // Kaufman效率系数
              0.30 * sSlope +   // 回归斜率×R²
              0.20 * sMa +      // 均线排列
              0.15 * sStructure; // 摆动结构
```

## 接口变更

### TrendAnalysis 新增字段

```typescript
export interface TrendAnalysis {
  trendState: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  description?: string;
  score?: number;           // 新增：趋势强度 -1~+1
  confidence?: number;      // 新增：置信度 0~1
  components?: {            // 新增：因子详情
    efficiency: number;     // Kaufman效率系数
    slope: number;          // 回归斜率
    r2: number;             // R²线性度
    maSpread: number;       // 均线排列(ATR归一)
    structure: number;      // 摆动结构
  };
}
```

### KLineAnalysisResult 新增字段

```typescript
export interface KLineAnalysisResult {
  tradeDate: Date;
  trendState: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  trendScore?: number;         // 新增：趋势强度
  trendConfidence?: number;    // 新增：趋势置信度
  patterns: PatternResult[];
  primaryPattern?: PatternResult;
}
```

## 使用示例

### 基础用法（兼容旧接口）

```typescript
const candles = await getHistoricalCandles(indexId, date, 30);
const trend = trendDetector.analyzeTrend(candles);

console.log(trend.trendState);      // 'uptrend' | 'downtrend' | 'sideways'
console.log(trend.score);           // 0.45 (趋势强度)
console.log(trend.confidence);      // 0.72 (置信度)
console.log(trend.components);      // 各因子详情
```

### 高级用法（序列分类+迟滞状态机）

```typescript
const sortedCandles = [...candles].reverse(); // 转为正序
const results = trendDetector.classifySeries(sortedCandles);

// results包含每根K线的趋势评分和状态，自动应用迟滞逻辑
results.forEach((r, i) => {
  console.log(`索引${i}: state=${r.state}, score=${r.score.toFixed(3)}`);
});
```

### 自定义参数

```typescript
const result = trendDetector.scoreTrendAt(candles, index, {
  window: 20,              // 缩短窗口，更敏感
  enterThreshold: 0.20,    // 降低进入阈值
  exitThreshold: 0.15,     // 降低退出阈值
  swingK: 3,               // 减少摆动点确认K数
  structureWindow: 40,     // 缩短结构回看窗口
});
```

## 验证结果

运行 `npx ts-node src/kline-patterns/verify-trend-classifier.ts` 进行验证：

```
【测试1】上升趋势检测
趋势状态: uptrend
趋势强度(score): 0.46
置信度: 68%
因子详情:
  - Kaufman效率系数: 0.71
  - 回归斜率: 0.0041
  - R²线性度: 0.96
  - 均线排列(ATR归一): 0.49
  - 摆动结构: 0.00

【测试2】下降趋势检测
趋势状态: downtrend
趋势强度(score): -0.29
置信度: 82%

【测试3】横盘趋势检测
趋势状态: sideways
趋势强度(score): -0.16
置信度: 60%
```

## 性能考虑

当前实现的时间复杂度为 O(N×window)，对于万级K线数据可能需要优化。未来可通过以下方式提升性能：

1. **增量计算**：SMA、ATR支持O(1)增量更新
2. **Welford算法**：线性回归可增量维护均值、协方差
3. **避免数组复制**：将`slice`操作改为索引偏移

## 注意事项

1. **最小样本数**：至少需要 `max(window, structureWindow) + 5` 根K线才能准确判断
2. **阈值调优**：不同品种（股票/期货/加密）可能需要不同的阈值配置
3. **横盘判定**：当score在[-0.25, 0.25]之间时判定为横盘，此时各因子方向不一致
4. **置信度含义**：反映四个因子的方向一致性，而非预测准确率

## 相关文件

- 核心算法：`src/kline-patterns/patterns/trend-detector.service.ts`
- DTO定义：`src/kline-patterns/dto/kline-pattern.dto.ts`
- 服务调用：`src/kline-patterns/kline-pattern.service.ts`
- 验证脚本：`src/kline-patterns/verify-trend-classifier.ts`

## 参考资料

- Kaufman Efficiency Ratio：https://school.stockcharts.com/doku.php?id=technical_indicators:kaufman_s_efficiency_ratio
- Linear Regression in Trading：https://www.investopedia.com/terms/l/linearregressionindicator.asp
- Average True Range (ATR)：https://www.investopedia.com/terms/a/atr.asp
