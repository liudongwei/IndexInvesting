# 交易时同步更新今日盈亏修复说明

## 问题描述

在之前的实现中，模拟账户的 `todayProfit`（今日盈亏）和 `todayProfitRate`（今日盈亏率）**只在定时任务中更新**，而在用户进行买入或卖出交易后不会立即更新。

### 导致的问题

1. ❌ 交易完成后，今日盈亏数据不准确
2. ❌ 需要等待5分钟后的定时任务才会更新
3. ❌ 用户体验不一致，无法立即看到交易对当日盈亏的影响

## 修复方案

### 核心思路

在买入和卖出交易时，**同步计算并更新今日盈亏**，确保交易后立即反映最新的盈亏状态。

### 实现方式

1. **新增私有方法** `calculateTodayProfit()`
   - 从 `simulation_daily_snapshots` 表查询最新快照
   - 计算：今日盈亏 = 当前总资产 - 快照总资产
   - 返回今日盈亏金额

2. **在买入交易中调用**
   - 位置：`buyStock()` 方法的账户统计更新部分
   - 时机：计算完总市值后立即计算今日盈亏

3. **在卖出交易中调用**
   - 位置：`sellStock()` 方法的账户统计更新部分
   - 时机：计算完总市值后立即计算今日盈亏

## 代码修改

### 1. 导入 Snapshot 实体

```typescript
import { SimulationDailySnapshot } from '../entities/simulation-daily-snapshot.entity';
```

### 2. 注入 Repository

```typescript
constructor(
  @InjectRepository(SimulationPosition)
  private positionRepository: Repository<SimulationPosition>,
  @InjectRepository(SimulationTrade)
  private tradeRepository: Repository<SimulationTrade>,
  @InjectRepository(SimulationDailySnapshot)  // ← 新增
  private snapshotRepository: Repository<SimulationDailySnapshot>,
  // ... 其他依赖
) {}
```

### 3. 添加私有方法

```typescript
/**
 * 计算今日盈亏（私有方法）
 * 今日盈亏 = 当前总资产 - 上次快照时的总资产
 */
private async calculateTodayProfit(
  queryRunner: any,
  accountId: string,
  currentBalance: number,
  totalPositionValue: number,
): Promise<number> {
  try {
    // 查询最新的快照
    const latestSnapshot = await queryRunner.manager.findOne(SimulationDailySnapshot, {
      where: { accountId },
      order: { snapshotDate: 'DESC' },
    });

    if (latestSnapshot) {
      // 今日盈亏 = 当前总资产 - 快照总资产
      const currentTotalAssets = currentBalance + totalPositionValue;
      const snapshotTotalAssets = typeof latestSnapshot.totalAssets === 'string'
        ? parseFloat(latestSnapshot.totalAssets)
        : latestSnapshot.totalAssets;
      return currentTotalAssets - snapshotTotalAssets;
    } else {
      // 如果没有快照，今日盈亏为 0
      return 0;
    }
  } catch (error) {
    this.logger.error(`计算今日盈亏失败: ${error.message}`);
    return 0;
  }
}
```

### 4. 买入时更新今日盈亏

```typescript
// 10.1 重新计算账户资产统计
// ... 计算总市值的代码 ...

account.positionValue = totalPositionValue;
account.totalAssets = updatedBalance + totalPositionValue;
account.totalProfit = account.totalAssets - initialCapital;
account.totalProfitRate = initialCapital > 0 ? (account.totalProfit / initialCapital) * 100 : 0;

// 计算今日盈亏 ← 新增
const todayProfit = await this.calculateTodayProfit(queryRunner, accountId, updatedBalance, totalPositionValue);
account.todayProfit = todayProfit;
const assetsBeforeTodayProfit = updatedBalance + totalPositionValue - todayProfit;
account.todayProfitRate = assetsBeforeTodayProfit > 0 ? (todayProfit / assetsBeforeTodayProfit) * 100 : 0;

await queryRunner.manager.save(account);
```

### 5. 卖出时更新今日盈亏

同样的逻辑应用到 `sellStock()` 方法中。

## 数据流程

```
用户执行交易（买入/卖出）
    ↓
开启事务
    ↓
更新持仓数据
    ↓
计算当前总市值
    ↓
计算账户统计（总资产、总盈亏等）
    ↓
【新增】查询最新快照
    ↓
【新增】计算今日盈亏 = 当前总资产 - 快照总资产
    ↓
【新增】更新 todayProfit 和 todayProfitRate
    ↓
保存账户数据
    ↓
提交事务
    ↓
✅ 交易完成，今日盈亏已实时更新
```

## 对比效果

### 修复前

| 操作 | 今日盈亏更新时机 | 延迟时间 |
|------|----------------|---------|
| 买入交易 | 等待定时任务 | 最多5分钟 |
| 卖出交易 | 等待定时任务 | 最多5分钟 |
| 价格变动 | 定时任务自动更新 | 每5分钟 |

### 修复后

| 操作 | 今日盈亏更新时机 | 延迟时间 |
|------|----------------|---------|
| 买入交易 | **立即更新** ✅ | <1秒 |
| 卖出交易 | **立即更新** ✅ | <1秒 |
| 价格变动 | 定时任务自动更新 | 每5分钟 |

## 示例场景

### 场景：早盘买入后价格上涨

**9:30 - 初始状态**
- 现金余额：20,000
- 昨日收盘总资产：20,000
- 今日盈亏：0

**9:35 - 买入操作**
- 买入100股 @ 50元 = 5,000元
- 现金余额：15,000
- 持仓市值：5,000
- **今日盈亏**：(15,000 + 5,000) - 20,000 = **0** ✅

**10:00 - 价格上涨到52元**
- 持仓市值：5,200
- 当前总资产：15,000 + 5,200 = 20,200
- **今日盈亏**：20,200 - 20,000 = **+200** ✅（定时任务更新）

**10:05 - 再买入50股 @ 52元**
- 现金余额：15,000 - 2,600 = 12,400
- 持仓市值：7,800（150股 @ 52元）
- 当前总资产：12,400 + 7,800 = 20,200
- **今日盈亏**：20,200 - 20,000 = **+200** ✅（买入时立即更新）

## 技术细节

### 1. 事务一致性

使用 `queryRunner.manager` 查询快照，确保在同一个事务中：

```typescript
const latestSnapshot = await queryRunner.manager.findOne(SimulationDailySnapshot, {
  where: { accountId },
  order: { snapshotDate: 'DESC' },
});
```

### 2. 异常处理

如果快照查询失败，今日盈亏设为 0，不影响交易流程：

```typescript
try {
  // 查询快照并计算
} catch (error) {
  this.logger.error(`计算今日盈亏失败: ${error.message}`);
  return 0;
}
```

### 3. 数值类型安全

所有字符串类型的数值都使用 `parseFloat()` 转换：

```typescript
const snapshotTotalAssets = typeof latestSnapshot.totalAssets === 'string'
  ? parseFloat(latestSnapshot.totalAssets)
  : latestSnapshot.totalAssets;
```

### 4. 除零保护

检查分母是否大于 0：

```typescript
const assetsBeforeTodayProfit = updatedBalance + totalPositionValue - todayProfit;
account.todayProfitRate = assetsBeforeTodayProfit > 0 
  ? (todayProfit / assetsBeforeTodayProfit) * 100 
  : 0;
```

## 验证方法

### 1. 执行买入交易

```bash
POST http://localhost:3000/api/simulation/portfolio/buy
{
  "accountId": "xxx",
  "instrumentCode": "159915",
  "quantity": 100
}
```

**检查响应**：应该包含更新后的账户数据，包括 `todayProfit` 和 `todayProfitRate`。

### 2. 查询账户详情

```bash
GET http://localhost:3000/api/simulation/portfolio/accounts/{accountId}
```

**预期结果**：
```json
{
  "todayProfit": "200.00",
  "todayProfitRate": "1.0000"
}
```

### 3. 查看数据库

```sql
SELECT 
  id,
  name,
  current_balance,
  position_value,
  total_assets,
  today_profit,
  today_profit_rate,
  updated_at
FROM simulation_accounts
ORDER BY updated_at DESC
LIMIT 5;
```

**验证点**：
- `updated_at` 应该是最近的时间（交易时间）
- `today_profit` 应该准确反映当日盈亏

### 4. 对比定时任务

观察交易后5分钟内的变化：
- 交易后立即：今日盈亏已更新 ✅
- 5分钟后定时任务：今日盈亏保持一致 ✅

## 注意事项

### 1. 快照的重要性

- **首次使用**：如果没有快照，今日盈亏为 0
- **日终快照**：15:30 的任务会生成新快照，作为次日计算的基准
- **建议**：确保日终任务正常运行，每天生成快照

### 2. 性能影响

- 每次交易额外查询一次快照表
- 快照表应该有索引：`(account_id, snapshot_date DESC)`
- 查询只返回一条记录，性能影响很小

### 3. 数据一致性

- 买入/卖出/定时任务 三者使用相同的计算逻辑
- 都基于最新快照计算今日盈亏
- 确保数据一致性

### 4. 边界情况

| 场景 | 处理方式 |
|------|---------|
| 无快照数据 | todayProfit = 0 |
| 快照查询失败 | todayProfit = 0，记录日志 |
| 总资产为负 | 正常计算，可能为负值 |
| 除零错误 | 检查分母 > 0，否则返回 0 |

## 相关文件

- 服务实现: `src/simulation-portfolio/services/simulation-trade.service.ts`
- 持仓更新: `src/simulation-portfolio/services/position-update.service.ts`
- 快照实体: `src/simulation-portfolio/entities/simulation-daily-snapshot.entity.ts`
- 账户实体: `src/simulation-portfolio/entities/simulation-account.entity.ts`

## 更新日志

### 2026-10-16
- ✅ 买入交易时同步更新今日盈亏
- ✅ 卖出交易时同步更新今日盈亏
- ✅ 添加 `calculateTodayProfit()` 私有方法
- ✅ 注入 `SimulationDailySnapshot` Repository
- ✅ 确保事务一致性和异常处理

## 总结

通过这次修复，模拟账户的今日盈亏数据现在会在以下时机实时更新：

1. ✅ **买入交易** - 立即更新
2. ✅ **卖出交易** - 立即更新
3. ✅ **定时任务** - 每5分钟自动更新
4. ✅ **日终结算** - 生成新快照

用户可以随时看到准确的当日盈亏情况，提升了用户体验和数据准确性！🎉
