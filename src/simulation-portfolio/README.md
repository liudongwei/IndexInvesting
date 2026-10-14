# 多策略模拟交易系统 - 开发文档

## 📊 系统概述

这是一个支持多策略独立核算的模拟交易系统，可以模拟 ETF、股票、可转债等多种交易品种。

### 核心特性

- ✅ **多账户体系**：支持网格交易、趋势交易、左侧交易等多种策略
- ✅ **真实费率**：万 0.6 佣金，最低 0.2 元（账户级别配置）
- ✅ **实时盈亏**：每 5 分钟刷新持仓盈亏
- ✅ **单一数据源**：腾讯 API（https://qt.gtimg.cn/q=）
- ✅ **T+1/T+0 灵活配置**：每个标的可独立配置交易规则
- ✅ **前后端分离**：Admin 管理后台 + Web 交易界面

---

## 🗄️ 数据库初始化

### 1. 执行迁移脚本

```bash
# 连接到 PostgreSQL 数据库
psql -U postgres -d index_investing

# 执行建表脚本
\i migrations/create_simulation_tables.sql

# 执行 Cron 配置脚本
\i migrations/insert_simulation_cron_config.sql
```

### 2. 验证数据

```sql
-- 检查表是否创建成功
\dt simulation_*
\dt trading_instruments

-- 检查默认账户
SELECT id, name, strategy_type, current_balance FROM simulation_accounts;

-- 检查示例标的
SELECT code, name, type, trading_rule FROM trading_instruments;
```

---

## 🔧 后端 API 接口

### Admin 接口（交易标的管理）

#### 1. 创建交易标的
```http
POST /admin/trading-instruments
Content-Type: application/json

{
  "code": "510330",
  "name": "沪深300ETF华夏",
  "type": "ETF",
  "exchange": "上交所",
  "tencentCode": "sh510330",
  "tradingRule": "T+1",
  "issuer": "华夏基金"
}
```

#### 2. 查询所有标的（分页）
```http
GET /admin/trading-instruments?page=1&limit=20&type=ETF&status=active
```

#### 3. 搜索标的
```http
GET /admin/trading-instruments/search?keyword=510330
```

#### 4. 更新标的
```http
PUT /admin/trading-instruments/{id}
Content-Type: application/json

{
  "status": "delisted"
}
```

#### 5. 删除标的
```http
DELETE /admin/trading-instruments/{id}
```

#### 6. 批量导入
```http
POST /admin/trading-instruments/bulk-import
Content-Type: application/json

[
  {
    "code": "510330",
    "name": "沪深300ETF华夏",
    "type": "ETF",
    "exchange": "上交所",
    "tencentCode": "sh510330",
    "tradingRule": "T+1"
  }
]
```

---

### Web 接口（交易功能）

#### 1. 获取所有账户
```http
GET /simulation/portfolio/accounts
```

**响应示例：**
```json
[
  {
    "id": "uuid-1",
    "name": "网格交易账号",
    "strategyType": "grid",
    "currentBalance": 20000,
    "positionValue": 0,
    "totalAssets": 20000,
    "todayProfit": 0
  }
]
```

#### 2. 买入股票
```http
POST /simulation/portfolio/buy
Content-Type: application/json

{
  "accountId": "uuid-1",
  "instrumentCode": "510330",
  "quantity": 1000
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "买入成功",
  "data": {
    "price": 4.523,
    "quantity": 1000,
    "amount": 4523.00,
    "commission": 0.27,
    "totalCost": 4523.27,
    "remainingBalance": 15476.73
  }
}
```

#### 3. 卖出股票
```http
POST /simulation/portfolio/sell
Content-Type: application/json

{
  "accountId": "uuid-1",
  "instrumentCode": "510330",
  "quantity": 500
}
```

#### 4. 查询持仓
```http
GET /simulation/portfolio/positions/{accountId}
```

**响应示例：**
```json
[
  {
    "id": "pos-uuid",
    "accountId": "uuid-1",
    "instrument": {
      "code": "510330",
      "name": "沪深300ETF华夏"
    },
    "quantity": 1000,
    "avgCost": 4.450,
    "currentPrice": 4.523,
    "marketValue": 4523.00,
    "floatProfit": 73.00,
    "floatProfitRate": 1.64
  }
]
```

#### 5. 查询交易记录
```http
GET /simulation/portfolio/trades/{accountId}?limit=50
```

---

## ⏰ 定时任务

### 硬编码的 Cron 任务

系统内置了以下定时任务（基于 `@nestjs/schedule`）：

| 任务 | Cron 表达式 | 说明 |
|------|------------|------|
| 早盘持仓更新 | `*/5 9-11 * * 1-5` | 交易日上午每5分钟更新 |
| 午盘持仓更新 | `*/5 13-15 * * 1-5` | 交易日下午每5分钟更新 |
| 日终盈亏计算 | `30 15 * * 1-5` | 交易日15:30计算当日盈亏 |

### 通过 Cron-Config 模块管理

你也可以通过 admin 界面的 Cron 配置页面动态管理这些任务：

1. 访问 `/admin/cron-config`
2. 找到分类为 `simulation` 的任务
3. 可以启用/禁用或修改 Cron 表达式

---

## 🎨 前端开发指南

### Admin 页面（交易标的管理）

**路由**: `/admin/trading-instruments`

**功能需求：**
1. 表格展示所有交易标的
2. 支持新增、编辑、删除
3. 支持按类型、状态筛选
4. 支持搜索（代码/名称）
5. 批量导入功能

**UI 组件参考：**
```tsx
import { Table, Button, Modal, Form, Input, Select } from 'antd';

const TradingInstrumentManager = () => {
  // TODO: 实现标的管理页面
};
```

### Web 页面（交易界面）

#### 1. 多账户仪表盘
**路由**: `/simulation/dashboard`

**功能：**
- Tab 切换不同策略账户
- 展示总资产、今日盈亏、持仓数量
- 快速买入/卖出按钮

#### 2. 买入面板
**组件**: `TradePanel` (mode='buy')

**功能：**
- 选择账户
- 输入股票代码自动搜索
- 显示实时价格
- 计算手续费和总金额
- 确认交易

#### 3. 持仓列表
**组件**: `PositionList`

**功能：**
- 表格展示持仓明细
- 显示成本价、现价、盈亏
- 每5分钟自动刷新

#### 4. 交易记录
**组件**: `TradeHistory`

**功能：**
- 时间线展示交易历史
- 区分买入/卖出
- 显示手续费和盈亏

---

## 🧪 测试流程

### 1. 启动后端服务
```bash
npm run start:dev
```

### 2. 测试买入交易
```bash
curl -X POST http://localhost:3000/simulation/portfolio/buy \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "第一个账户的UUID",
    "instrumentCode": "510330",
    "quantity": 1000
  }'
```

### 3. 查询持仓
```bash
curl http://localhost:3000/simulation/portfolio/positions/{accountId}
```

### 4. 测试卖出交易
```bash
curl -X POST http://localhost:3000/simulation/portfolio/sell \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "第一个账户的UUID",
    "instrumentCode": "510330",
    "quantity": 500
  }'
```

### 5. 查看交易记录
```bash
curl http://localhost:3000/simulation/portfolio/trades/{accountId}
```

---

## 📝 关键业务逻辑

### 1. 手续费计算

```typescript
// 账户级别佣金率（默认万0.6）
const commission = Math.max(amount * account.commissionRate, account.minCommission);
// 例如：买入1000元，佣金 = max(1000 * 0.00006, 0.2) = 0.2元
```

### 2. T+1 规则

```typescript
// T+1：当日买入的股票，次日才能卖出
if (instrument.tradingRule === 'T+1') {
  const todayBuys = await getTodayBuyQuantity(accountId, instrumentId);
  const availableQty = totalQty - todayBuys;
  
  if (availableQty < sellQty) {
    throw new Error('受T+1限制，可用持仓不足');
  }
}
```

### 3. 加权平均成本

```typescript
// 买入时重新计算平均成本
const oldCost = position.avgCost * position.quantity;
const newCost = buyAmount;
const newQty = position.quantity + buyQty;
position.avgCost = (oldCost + newCost) / newQty;
```

### 4. 实时盈亏计算

```typescript
// 浮动盈亏
const floatProfit = (currentPrice - avgCost) * quantity;
const floatProfitRate = ((currentPrice - avgCost) / avgCost) * 100;

// 今日盈亏（基于昨收价）
const todayProfit = (closePrice - yesterdayClose) * quantity;
```

---

## 🚀 下一步计划

### Phase 6: 前端开发（待实施）

- [ ] Admin 交易标的管理页面
- [ ] Web 多账户仪表盘
- [ ] Web 买入/卖出面板
- [ ] Web 持仓盈亏展示
- [ ] Web 交易记录页面

### Phase 7: 测试与优化（待实施）

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 用户体验优化

---

## ❓ 常见问题

### Q1: 如何添加新的交易标的？
通过 Admin API 或直接在数据库中插入：
```sql
INSERT INTO trading_instruments (code, name, type, exchange, tencent_code, trading_rule)
VALUES ('510500', '中证500ETF南方', 'ETF', '上交所', 'sh510500', 'T+1');
```

### Q2: 如何调整佣金率？
在 `simulation_accounts` 表中修改：
```sql
UPDATE simulation_accounts 
SET commission_rate = 0.0001, min_commission = 0.1 
WHERE id = 'account-uuid';
```

### Q3: 定时任务不执行怎么办？
1. 检查 `cron_configs` 表中任务是否启用
2. 查看日志：`simulation_task_logs` 表
3. 确认服务器时间在交易时段内

### Q4: 如何重置模拟账户？
```sql
UPDATE simulation_accounts 
SET current_balance = 20000, 
    position_value = 0, 
    total_assets = 20000,
    total_profit = 0
WHERE id = 'account-uuid';

DELETE FROM simulation_positions WHERE account_id = 'account-uuid';
```

---

## 📞 技术支持

如有问题，请查看：
- 数据库表结构：`migrations/create_simulation_tables.sql`
- Entity 定义：`src/simulation-portfolio/entities/`
- Service 实现：`src/simulation-portfolio/services/`
