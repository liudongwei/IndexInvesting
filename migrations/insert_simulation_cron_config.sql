-- =====================================================
-- 模拟交易定时任务配置
-- 插入到 cron_configs 表
-- =====================================================

-- 1. 早盘持仓更新（每5分钟）
INSERT INTO cron_configs (task_name, cron_expression, display_name, description, is_enabled, category)
VALUES (
  'simulation_update_positions_morning',
  '*/5 9-11 * * 1-5',
  '模拟盘-早盘持仓更新',
  '交易日上午9-11点，每5分钟更新持仓盈亏',
  true,
  'simulation'
)
ON CONFLICT (task_name) DO UPDATE SET
  cron_expression = EXCLUDED.cron_expression,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  category = EXCLUDED.category;

-- 2. 午盘持仓更新（每5分钟）
INSERT INTO cron_configs (task_name, cron_expression, display_name, description, is_enabled, category)
VALUES (
  'simulation_update_positions_afternoon',
  '*/5 13-15 * * 1-5',
  '模拟盘-午盘持仓更新',
  '交易日下午13-15点，每5分钟更新持仓盈亏',
  true,
  'simulation'
)
ON CONFLICT (task_name) DO UPDATE SET
  cron_expression = EXCLUDED.cron_expression,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  category = EXCLUDED.category;

-- 3. 日终盈亏计算（15:30）
INSERT INTO cron_configs (task_name, cron_expression, display_name, description, is_enabled, category)
VALUES (
  'simulation_daily_profit_calculation',
  '30 15 * * 1-5',
  '模拟盘-日终盈亏计算',
  '交易日15:30计算当日盈亏并生成资产快照',
  true,
  'simulation'
)
ON CONFLICT (task_name) DO UPDATE SET
  cron_expression = EXCLUDED.cron_expression,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  category = EXCLUDED.category;
