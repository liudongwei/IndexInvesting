# 模拟账户今日盈亏实时计算说明

## 功能概述

模拟账户的 `todayProfit`（今日盈亏）和 `todayProfitRate`（今日盈亏率）现在会**实时跟随持仓价格变动而更新**，不再仅在日终（15:30）时计算。

## 实现原理

### 今日盈亏计算公式

```typescript
今日盈亏 = 当前总资产 - 上次快照时的总资产
其中：
- 当前总资产 = 现金余额 + 当前持仓总市值
- 上次快照总资产 = 从 simulation_daily_snapshots 表中获取的最新快照
```

### 更新时机

| 时机 | 触发方式 | 是否更新 todayProfit |
|------|---------|---------------------|
| **买入交易** | 手动交易 | ✅ 立即更新 |
| **卖出交易** | 手动交易 | ✅ 立即更新 |
| **盘中实时更新** | 每5分钟定时任务 | ✅ 自动更新 |
| **日终结算** | 15:30定时任务 | ✅ 生成新快照，重置基准 |

## 数据流程

```
┌─────────────────────────────────────┐
│   定时任务触发 (每5分钟)             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  1. 获取所有持仓的实时价格           │
│     (腾讯 API)                       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. 更新持仓数据                     │
│     - currentPrice                  │
│     - marketValue                   │
│     - floatProfit                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. 查询最新快照                     │
│     FROM simulation_daily_snapshots │
│     ORDER BY snapshotDate DESC      │
│     LIMIT 1                         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. 计算今日盈亏                     │
│     todayProfit = 当前总资产         │
│                  - 快照总资产        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. 更新账户统计                     │
│     - positionValue                 │
│     - totalAssets                   │
│     - totalProfit                   │
│     - todayProfit ← 实时更新!       │
│     - todayProfitRate ← 实时更新!   │
└─────────────────────────────────────┘
```

## 示例场景

### 场景1：早盘上涨

**初始状态（9:30）**
- 现金余额：15,000
- 持仓市值：5,000（100股 @ 50元）
- 昨日收盘总资产：20,000
- 今日盈亏：0

**价格上涨后（10:00）**
- 股价涨到 52元
- 持仓市值：5,200（100股 @ 52元）
- 当前总资产：15,000 + 5,200 = 20,200
- **今日盈亏**：20,200 - 20,000 = **+200** ✅
- **今日盈亏率**：200 / 20,000 × 100% = **+1.00%** ✅

### 场景2：午盘回落

**继续下跌（14:00）**
- 股价跌到 49元
- 持仓市值：4,900（100股 @ 49元）
- 当前总资产：15,000 + 4,900 = 19,900
- **今日盈亏**：19,900 - 20,000 = **-100** ✅
- **今日盈亏率**：-100 / 20,000 × 100% = **-0.50%** ✅

### 场景3：日终结算（15:30）

**生成新快照**
- 收盘价：50.5元
- 持仓市值：5,050
- 当前总资产：20,050
- 今日盈亏：+50

**快照保存后**
- 新的快照总资产：20,050
- 明日开盘，今日盈亏将基于 20,050 计算

## 数据库表结构

### simulation_daily_snapshots（每日快照表）

```sql
CREATE TABLE simulation_daily_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  account_id VARCHAR(36) NOT NULL,
  snapshot_date DATETIME NOT NULL,
  cash_balance DECIMAL(12,2),
  position_value DECIMAL(12,2),
  total_assets DECIMAL(12,2),
  total_profit DECIMAL(12,2),
  profit_rate DECIMAL(10,4),
  today_profit DECIMAL(12,2),
  today_profit_rate DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### simulation_accounts（账户表）

```sql
-- 今日盈亏字段
today_profit DECIMAL(12,2),
today_profit_rate DECIMAL(10,4),
```

## 关键代码

### updateAccountStatistics 方法

```typescript
// 4. 计算今日盈亏
let todayProfit = 0;
try {
  // 查询最新的快照
  const latestSnapshot = await this.snapshotRepository.findOne({
    where: { accountId },
    order: { snapshotDate: 'DESC' },
  });

  if (latestSnapshot) {
    // 今日盈亏 = 当前总资产 - 快照时的总资产
    const currentBalance = parseFloat(account.currentBalance);
    const currentTotalAssets = currentBalance + totalPositionValue;
    const snapshotTotalAssets = parseFloat(latestSnapshot.totalAssets);
    todayProfit = currentTotalAssets - snapshotTotalAssets;
  } else {
    todayProfit = 0;
  }
} catch (error) {
  this.logger.error(`计算今日盈亏失败: ${error.message}`);
  todayProfit = 0;
}

// 更新账户统计
account.todayProfit = todayProfit;
const assetsBeforeTodayProfit = currentBalance + totalPositionValue - todayProfit;
account.todayProfitRate = assetsBeforeTodayProfit > 0
  ? (todayProfit / assetsBeforeTodayProfit) * 100
  : 0;
```

## 注意事项

### 1. 快照的重要性

- **首次使用**：如果没有快照，今日盈亏为 0
- **每日更新**：15:30 的日终任务会生成新快照，作为次日计算的基准
- **手动触发**：可以通过 admin 后台手动执行日终计算任务

### 2. 精度问题

- 所有金额计算使用 `parseFloat()` 确保数值类型安全
- 百分比保留4位小数
- 避免字符串拼接导致的计算错误

### 3. 性能优化

- 快照查询只取最新一条（`LIMIT 1`）
- 批量更新多个账户时，每个账户独立查询快照
- 如果快照表数据量大，建议添加索引：
  ```sql
  CREATE INDEX idx_account_snapshot ON simulation_daily_snapshots(account_id, snapshot_date DESC);
  ```

### 4. 异常情况处理

| 异常场景 | 处理方式 |
|---------|---------|
| 无快照数据 | todayProfit = 0 |
| 快照查询失败 | todayProfit = 0，记录错误日志 |
| 价格为0或负数 | 使用成本价作为参考 |
| 除零错误 | 检查分母 > 0，否则返回 0 |

## 验证方法

### 1. 查看账户数据

```bash
GET http://localhost:3000/api/simulation/portfolio/accounts/{accountId}
```

应该看到：
```json
{
  "todayProfit": "200.00",
  "todayProfitRate": "1.0000"
}
```

### 2. 等待定时任务执行

观察日志输出：
```
[PositionUpdateService] 开始更新持仓实时盈亏...
[PositionUpdateService] 更新完成：更新3条持仓，耗时1200ms
[PositionUpdateService] 账户统计更新完成：更新2个账户
```

### 3. 查询快照表

```sql
SELECT 
  account_id,
  snapshot_date,
  total_assets,
  today_profit
FROM simulation_daily_snapshots
ORDER BY snapshot_date DESC
LIMIT 5;
```

### 4. 手动触发测试

```bash
# 立即执行一次持仓更新
POST http://localhost:3000/api/cron-configs/simulationPositionUpdateMorning/run

# 查看任务状态
GET http://localhost:3000/api/cron-configs/simulationPositionUpdateMorning/status
```

## 与原有逻辑的对比

### 修改前

- ❌ 今日盈亏只在 15:30 日终时计算
- ❌ 盘中价格变动不影响 todayProfit
- ❌ 用户无法实时了解当日表现

### 修改后

- ✅ 今日盈亏每5分钟实时更新
- ✅ 盘中价格变动立即反映在 todayProfit
- ✅ 用户可以实时监控当日盈亏
- ✅ 日终快照作为次日计算的基准点

## 相关文件

- 服务实现: `src/simulation-portfolio/services/position-update.service.ts`
- 定时任务配置: `src/cron-config/cron-config.service.ts`
- 账户实体: `src/simulation-portfolio/entities/simulation-account.entity.ts`
- 快照实体: `src/simulation-portfolio/entities/simulation-daily-snapshot.entity.ts`

## 更新日志

### 2026-10-16
- ✅ 今日盈亏实时计算功能上线
- ✅ 基于最新快照动态计算 todayProfit
- ✅ 支持盘中每5分钟自动更新
- ✅ 兼容无快照场景（今日盈亏为0）
