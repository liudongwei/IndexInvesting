# 🚀 多策略模拟交易系统 - 快速启动指南

## 第一步：数据库初始化

### Windows PowerShell 执行命令

```powershell
# 1. 连接到 PostgreSQL 数据库
psql -U postgres -d index_investing

# 2. 在 psql 中执行以下命令
\i d:/wwwroot/nodejs_wwwroot/IndexInvesting/migrations/create_simulation_tables.sql
\i d:/wwwroot/nodejs_wwwroot/IndexInvesting/migrations/insert_simulation_cron_config.sql

# 3. 验证数据
SELECT COUNT(*) FROM simulation_accounts;        -- 应该返回 3
SELECT COUNT(*) FROM trading_instruments;        -- 应该返回 13
\q
```

或者使用单行命令：

```powershell
psql -U postgres -d index_investing -f "d:\wwwroot\nodejs_wwwroot\IndexInvesting\migrations\create_simulation_tables.sql"
psql -U postgres -d index_investing -f "d:\wwwroot\nodejs_wwwroot\IndexInvesting\migrations\insert_simulation_cron_config.sql"
```

---

## 第二步：启动后端服务

```powershell
cd d:\wwwroot\nodejs_wwwroot\IndexInvesting
npm run start:dev
```

等待看到类似输出：
```
[Nest] INFO [NestApplication] Nest application successfully started
```

---

## 第三步：测试 API 接口

### 方法 1：使用浏览器

直接访问以下 URL 测试：

1. **获取账户列表**
   ```
   http://localhost:3000/simulation/portfolio/accounts
   ```

2. **获取标的列表**
   ```
   http://localhost:3000/admin/trading-instruments?page=1&limit=10
   ```

### 方法 2：使用 PowerShell

```powershell
# 1. 获取账户列表
Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/accounts" -Method Get

# 2. 获取第一个账户的ID（复制下来备用）
$accounts = Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/accounts" -Method Get
$accountId = $accounts[0].id
Write-Host "账户ID: $accountId"

# 3. 买入测试
$body = @{
    accountId = $accountId
    instrumentCode = "510330"
    quantity = 1000
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/buy" -Method Post -Body $body -ContentType "application/json"

# 4. 查询持仓
Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/positions/$accountId" -Method Get

# 5. 卖出测试
$body = @{
    accountId = $accountId
    instrumentCode = "510330"
    quantity = 500
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/sell" -Method Post -Body $body -ContentType "application/json"

# 6. 查询交易记录
Invoke-RestMethod -Uri "http://localhost:3000/simulation/portfolio/trades/$accountId" -Method Get
```

### 方法 3：使用 Postman

1. **GET** `http://localhost:3000/simulation/portfolio/accounts`
2. **POST** `http://localhost:3000/simulation/portfolio/buy`
   ```json
   {
     "accountId": "从步骤1获取的UUID",
     "instrumentCode": "510330",
     "quantity": 1000
   }
   ```
3. **GET** `http://localhost:3000/simulation/portfolio/positions/{accountId}`

---

## 第四步：验证定时任务

### 查看任务日志

```sql
-- 在 psql 中执行
SELECT task_type, execute_time, status, positions_updated, duration_ms
FROM simulation_task_logs
ORDER BY created_at DESC
LIMIT 10;
```

### 手动触发定时任务测试

你可以临时修改 Cron 表达式为每分钟执行，以便快速验证：

```sql
UPDATE cron_configs
SET cron_expression = '* * * * *'  -- 每分钟执行
WHERE task_name = 'simulation_update_positions_morning';
```

然后重启服务，1分钟后查看日志。

---

## 常见问题排查

### Q1: 数据库表不存在？

**错误信息：**
```
relation "trading_instruments" does not exist
```

**解决方法：**
```powershell
# 重新执行迁移脚本
psql -U postgres -d index_investing -f "d:\wwwroot\nodejs_wwwroot\IndexInvesting\migrations\create_simulation_tables.sql"
```

### Q2: 模块找不到？

**错误信息：**
```
Cannot find module './controllers/...'
```

**解决方法：**
这是 TypeScript 缓存问题，重启服务即可：
```powershell
# 停止服务（Ctrl+C）
# 重新启动
npm run start:dev
```

### Q3: 腾讯 API 请求失败？

**错误信息：**
```
获取腾讯API数据失败
```

**检查项：**
1. 确认网络连接正常
2. 手动访问测试：`https://qt.gtimg.cn/q=sh510330`
3. 查看后端日志中的详细错误信息

### Q4: 余额不足？

**错误信息：**
```
余额不足：需要XXX元，可用XXX元
```

**解决方法：**
```sql
-- 重置账户余额
UPDATE simulation_accounts 
SET current_balance = 20000 
WHERE id = '你的账户UUID';
```

### Q5: T+1 限制导致无法卖出？

**错误信息：**
```
可用持仓不足：受T+1限制
```

**说明：**
这是正常行为！当日买入的股票，次日才能卖出。

**测试方法：**
1. 今日买入
2. 明日再尝试卖出
3. 或使用 T+0 的标的（如国债逆回购）

---

## 常用 SQL 查询

### 查看所有账户
```sql
SELECT id, name, strategy_type, current_balance, total_assets, today_profit
FROM simulation_accounts
ORDER BY created_at;
```

### 查看持仓详情
```sql
SELECT 
    a.name AS account_name,
    i.code AS instrument_code,
    i.name AS instrument_name,
    p.quantity,
    p.avg_cost,
    p.current_price,
    p.market_value,
    p.float_profit,
    p.float_profit_rate
FROM simulation_positions p
JOIN simulation_accounts a ON p.account_id = a.id
JOIN trading_instruments i ON p.instrument_id = i.id
WHERE p.quantity > 0
ORDER BY a.name, i.code;
```

### 查看今日盈亏
```sql
SELECT 
    name,
    current_balance,
    position_value,
    total_assets,
    today_profit,
    today_profit_rate
FROM simulation_accounts
WHERE status = 'active';
```

### 查看交易历史
```sql
SELECT 
    a.name AS account_name,
    i.code AS instrument_code,
    t.trade_type,
    t.price,
    t.quantity,
    t.amount,
    t.commission,
    t.trade_date,
    t.trade_time
FROM simulation_trades t
JOIN simulation_accounts a ON t.account_id = a.id
JOIN trading_instruments i ON t.instrument_id = i.id
ORDER BY t.trade_date DESC, t.trade_time DESC
LIMIT 20;
```

### 清空所有测试数据
```sql
-- ⚠️ 谨慎操作！这会删除所有交易数据
DELETE FROM simulation_trades;
DELETE FROM simulation_positions;
DELETE FROM simulation_daily_snapshots;
DELETE FROM simulation_task_logs;

-- 重置账户余额
UPDATE simulation_accounts 
SET current_balance = 20000,
    position_value = 0,
    total_assets = 20000,
    total_profit = 0,
    today_profit = 0,
    total_buy_count = 0,
    total_sell_count = 0,
    total_commission = 0;
```

---

## 下一步开发建议

### 立即可做
✅ 系统已可正常使用，通过 API 进行买卖交易

### 后续优化
1. **前端页面**（可选）
   - Admin 标的管理界面
   - Web 交易仪表盘
   - 实时盈亏展示

2. **功能增强**
   - 收益曲线图表
   - 绩效分析报告
   - 策略对比功能

3. **性能优化**
   - Redis 缓存实时价格
   - 批量更新优化
   - WebSocket 推送实时更新

---

## 📞 技术支持

遇到问题？查看以下文档：

1. **完整开发文档**: `src/simulation-portfolio/README.md`
2. **系统总结**: `SIMULATION_SYSTEM_SUMMARY.md`
3. **数据库设计**: `migrations/create_simulation_tables.sql`

---

## 🎉 开始交易吧！

系统已准备就绪，祝你投资顺利！💰
