-- 为 dynamic_trend_data 表添加 version 字段
-- 用于版本化管理动态趋势数据

-- 1. 添加 version 字段，默认值为 1
ALTER TABLE dynamic_trend_data 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. 添加注释
COMMENT ON COLUMN dynamic_trend_data.version IS '版本号，1表示当日首次拉取（基准版本）';

-- 3. 创建索引以加速按版本查询
CREATE INDEX IF NOT EXISTS idx_dynamic_trend_version ON dynamic_trend_data(version);

-- 4. 删除旧的唯一索引（如果存在）
DROP INDEX IF EXISTS idx_dynamic_trend_data_indexid_calculationtime_unique;

-- 5. 创建新的唯一索引（包含 version）
CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamic_trend_data_unique 
ON dynamic_trend_data("indexId", "calculationTime", version);

-- 6. 更新现有数据，将所有现有记录的 version 设为 1
UPDATE dynamic_trend_data SET version = 1 WHERE version IS NULL;
