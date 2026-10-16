-- ============================================
-- 添加模拟交易定时任务配置
-- ============================================

-- 早盘持仓更新（每5分钟）
INSERT INTO cron_configs (
  task_name,
  cron_expression,
  display_name,
  description,
  is_enabled,
  category,
  execution_count,
  created_at,
  updated_at
) VALUES (
  'simulationPositionUpdateMorning',
  '*/5 9-11 * * 1-5',
  '模拟持仓更新(早盘)',
  '工作日上午9:00-11:30，每5分钟更新模拟持仓价格和账户统计',
  TRUE,
  '模拟交易',
  0,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE
  updated_at = NOW();

-- 午盘持仓更新（每5分钟）
INSERT INTO cron_configs (
  task_name,
  cron_expression,
  display_name,
  description,
  is_enabled,
  category,
  execution_count,
  created_at,
  updated_at
) VALUES (
  'simulationPositionUpdateAfternoon',
  '*/5 13-15 * * 1-5',
  '模拟持仓更新(午盘)',
  '工作日下午13:00-15:00，每5分钟更新模拟持仓价格和账户统计',
  TRUE,
  '模拟交易',
  0,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE
  updated_at = NOW();

-- 日终盈亏计算
INSERT INTO cron_configs (
  task_name,
  cron_expression,
  display_name,
  description,
  is_enabled,
  category,
  execution_count,
  created_at,
  updated_at
) VALUES (
  'simulationDailyProfitCalculation',
  '30 15 * * 1-5',
  '模拟日终盈亏计算',
  '每个交易日15:30执行，计算模拟账户当日盈亏并生成快照',
  TRUE,
  '模拟交易',
  0,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE
  updated_at = NOW();

-- 验证插入结果
SELECT 
  task_name AS '任务名称',
  cron_expression AS 'Cron表达式',
  display_name AS '显示名称',
  category AS '分类',
  is_enabled AS '是否启用',
  execution_count AS '执行次数'
FROM cron_configs
WHERE category = '模拟交易'
ORDER BY task_name;
