-- 创建 kline_patterns 表
CREATE TABLE IF NOT EXISTS kline_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "indexId" UUID NOT NULL,
  "tradeDate" DATE NOT NULL,
  "trendState" VARCHAR(20) NOT NULL,
  "patternType" VARCHAR(50) NOT NULL,
  "patternName" VARCHAR(100) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  signal VARCHAR(20) NOT NULL,
  "candleData" JSONB,
  metadata JSONB,
  "isRealtime" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_kline_patterns_index FOREIGN KEY ("indexId") REFERENCES indices(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_kline_patterns_index_date_realtime 
ON kline_patterns ("indexId", "tradeDate", "isRealtime");

CREATE INDEX IF NOT EXISTS idx_kline_patterns_trend_state 
ON kline_patterns ("trendState");

CREATE INDEX IF NOT EXISTS idx_kline_patterns_signal 
ON kline_patterns (signal);

-- 添加注释
COMMENT ON TABLE kline_patterns IS 'K线形态数据表';
COMMENT ON COLUMN kline_patterns."indexId" IS '关联的指数ID';
COMMENT ON COLUMN kline_patterns."tradeDate" IS '交易日期';
COMMENT ON COLUMN kline_patterns."trendState" IS '趋势状态: uptrend/downtrend/sideways';
COMMENT ON COLUMN kline_patterns."patternType" IS 'K线形态类型，如 hammer, bullish_engulfing';
COMMENT ON COLUMN kline_patterns."patternName" IS 'K线形态名称，如 锤子线、看涨吞没';
COMMENT ON COLUMN kline_patterns.confidence IS '置信度 (0-1)';
COMMENT ON COLUMN kline_patterns.signal IS '信号类型: buy/sell/neutral';
COMMENT ON COLUMN kline_patterns."candleData" IS '原始K线数据 [当前, 前1日, 前2日...]';
COMMENT ON COLUMN kline_patterns.metadata IS '扩展信息（成交量、均线等）';
COMMENT ON COLUMN kline_patterns."isRealtime" IS '是否实时计算（true=盘中动态计算，false=收盘后静态计算）';
