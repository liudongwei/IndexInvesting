# 模拟交易定时任务配置指南

## 概述

模拟交易的定时任务已集成到 `cron-config` 模块中，可以通过 admin 后台灵活配置、启用/禁用和手动触发。

## 定时任务列表

### 1. 模拟持仓更新（早盘）
- **任务名称**: `simulationPositionUpdateMorning`
- **Cron 表达式**: `*/5 9-11 * * 1-5`
- **执行时间**: 工作日上午 9:00-11:30，每5分钟
- **功能**: 
  - 获取所有持仓的实时价格
  - 更新持仓市值、浮动盈亏
  - 重新计算账户统计数据（总资产、总盈亏等）

### 2. 模拟持仓更新（午盘）
- **任务名称**: `simulationPositionUpdateAfternoon`
- **Cron 表达式**: `*/5 13-15 * * 1-5`
- **执行时间**: 工作日下午 13:00-15:00，每5分钟
- **功能**: 同早盘更新

### 3. 模拟日终盈亏计算
- **任务名称**: `simulationDailyProfitCalculation`
- **Cron 表达式**: `30 15 * * 1-5`
- **执行时间**: 每个交易日 15:30
- **功能**:
  - 获取收盘价
  - 计算当日盈亏
  - 生成每日资产快照
  - 更新账户统计

## 部署步骤

### 1. 运行数据库迁移

```bash
# 进入项目根目录
cd d:\wwwroot\nodejs_wwwroot\IndexInvesting

# 执行 SQL 脚本添加定时任务配置
mysql -u your_username -p your_database < migrations/add_simulation_cron_tasks.sql
```

### 2. 重启服务

```bash
npm run start:dev
```

服务启动时会自动：
1. 读取数据库中的 cron 配置
2. 为启用的任务创建定时任务
3. 开始按计划执行

### 3. 验证配置

访问 admin 后台查看定时任务配置：
```
GET /api/cron-configs
```

应该能看到 3 个新的"模拟交易"分类的任务。

## Admin 后台操作

### 查看所有定时任务
```
GET /api/cron-configs
```

### 查看单个任务
```
GET /api/cron-configs/{taskName}
```

### 启用/禁用任务
```
POST /api/cron-configs/{taskName}/toggle
```

### 修改 Cron 表达式
```
PATCH /api/cron-configs/{taskName}
{
  "cronExpression": "*/10 9-11 * * 1-5",  // 改为每10分钟
  "isEnabled": true
}
```

### 立即执行一次
```
POST /api/cron-configs/{taskName}/run
```

### 查看任务状态
```
GET /api/cron-configs/{taskName}/status
```

返回示例：
```json
{
  "running": true,
  "nextRun": "2026-10-16T09:05:00.000Z"
}
```

## 自定义配置示例

### 修改更新频率

#### 每10分钟更新一次
```json
{
  "cronExpression": "*/10 9-11 * * 1-5"
}
```

#### 每1分钟更新一次（高频测试）
```json
{
  "cronExpression": "*/1 9-11 * * 1-5"
}
```

#### 只在特定时间更新
```json
{
  "cronExpression": "0 9,10,11,13,14,15 * * 1-5"
}
```

### 禁用某个任务

通过 admin 后台或 API：
```json
{
  "isEnabled": false
}
```

## 监控和日志

### 查看任务执行历史

查询数据库：
```sql
SELECT 
  task_name,
  last_executed_at,
  execution_count,
  last_error,
  is_enabled
FROM cron_configs
WHERE category = '模拟交易'
ORDER BY last_executed_at DESC;
```

### 查看应用日志

定时任务的执行日志会输出到控制台：
```
[CronConfigService] 执行 Cron 任务: simulationPositionUpdateMorning
[CronConfigService] Cron 任务完成: simulationPositionUpdateMorning (1234ms)
[PositionUpdateService] 更新完成：更新3条持仓，耗时1200ms
[PositionUpdateService] 账户统计更新完成：更新2个账户
```

## 故障排查

### 任务未执行

1. 检查任务是否启用：
   ```sql
   SELECT * FROM cron_configs WHERE task_name = 'simulationPositionUpdateMorning';
   ```

2. 检查 Cron 表达式是否正确：
   - 使用在线工具验证：https://crontab.guru/
   - 确保符合 Linux cron 格式

3. 查看错误信息：
   ```sql
   SELECT last_error FROM cron_configs WHERE task_name = '...';
   ```

### 数据未更新

1. 检查是否有持仓：
   ```sql
   SELECT COUNT(*) FROM simulation_positions WHERE quantity > 0;
   ```

2. 检查腾讯 API 是否正常：
   - 查看日志中的 API 调用记录
   - 确认网络连接正常

3. 手动触发测试：
   ```bash
   POST /api/cron-configs/simulationPositionUpdateMorning/run
   ```

## 技术架构

```
┌─────────────────────────────────────┐
│     CronConfigModule                │
│  ┌───────────────────────────────┐  │
│  │   CronConfigService           │  │
│  │                               │  │
│  │  1. 读取数据库配置            │  │
│  │  2. 创建 CronJob              │  │
│  │  3. 调度执行                  │  │
│  │  4. 记录执行日志              │  │
│  └──────────┬───────────────────┘  │
└─────────────┼──────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  PositionUpdateService              │
│                                     │
│  updatePositionsRealTime()          │
│  ├── 获取实时价格                   │
│  ├── 更新持仓数据                   │
│  └── 更新账户统计                   │
│                                     │
│  calculateTodayProfit()             │
│  ├── 获取收盘价                     │
│  ├── 计算当日盈亏                   │
│  └── 生成资产快照                   │
└─────────────────────────────────────┘
```

## 注意事项

1. **交易时间设置**：默认只在工作日交易时间执行，非交易时间不会执行
2. **API 限流**：每次请求间隔 100ms，避免过快请求腾讯 API
3. **数据一致性**：在事务中更新数据，确保数据一致性
4. **性能优化**：批量获取价格，减少 API 调用次数
5. **备份策略**：定期备份 `cron_configs` 表，防止配置丢失

## 相关文件

- 服务实现: `src/cron-config/cron-config.service.ts`
- 实体定义: `src/cron-config/entities/cron-config.entity.ts`
- 控制器: `src/cron-config/cron-config.controller.ts`
- 持仓更新: `src/simulation-portfolio/services/position-update.service.ts`
- 迁移脚本: `migrations/add_simulation_cron_tasks.sql`

## 更新日志

### 2026-10-16
- ✅ 将模拟交易定时任务迁移到 cron-config 模块
- ✅ 支持通过 admin 后台灵活配置
- ✅ 添加早盘/午盘持仓更新任务
- ✅ 添加日终盈亏计算任务
- ✅ 移除硬编码的 @Cron 装饰器
