-- =====================================================
-- 多策略模拟交易系统 - 数据库表创建脚本
-- 创建时间: 2026-10-14
-- 描述: 创建交易标的池、模拟账户、持仓、交易记录等7张表
-- =====================================================

-- =====================================================
-- 表 1: 交易标的池 (trading_instruments)
-- 支持 ETF、股票、可转债等多种交易品种
-- =====================================================
CREATE TABLE IF NOT EXISTS trading_instruments (
    -- ========== 主键 ==========
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ========== 基础信息（必需）==========
    code VARCHAR(10) NOT NULL UNIQUE,              -- 交易代码：510330
    name VARCHAR(50) NOT NULL,                     -- 简称：沪深300ETF华夏
    full_name VARCHAR(100),                        -- 全称
    
    -- ========== 标的类型 ==========
    type VARCHAR(20) NOT NULL DEFAULT 'ETF',       -- ETF/STOCK/CONVERTIBLE_BOND
    exchange VARCHAR(20) NOT NULL,                 -- 交易所：上交所/深交所
    
    -- ========== 腾讯 API 代码（唯一数据源）==========
    tencent_code VARCHAR(20) NOT NULL,             -- 腾讯API代码：sh510330
    
    -- ========== 关联指数（可选）==========
    index_id UUID REFERENCES indices(id),          -- 关联的指数ID（一对多）
    index_code VARCHAR(20),                        -- 指数代码：000300
    index_name VARCHAR(50),                        -- 指数名称：沪深300
    
    -- ========== 交易规则 ==========
    lot_size INTEGER DEFAULT 100,                  -- 最小买卖单位（手）
    trading_rule VARCHAR(5) NOT NULL DEFAULT 'T+1', -- T+1/T+0
    currency VARCHAR(10) DEFAULT 'CNY',            -- 币种
    
    -- ========== 基金公司信息 ==========
    issuer VARCHAR(50),                            -- 基金公司：华夏基金
    
    -- ========== 状态信息 ==========
    status VARCHAR(20) DEFAULT 'active',           -- active/delisted
    listing_date DATE,                             -- 上市日期
    
    -- ========== 元数据（扩展）==========
    metadata JSONB,                                -- 扩展字段
    
    -- ========== 时间戳 ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 注释
COMMENT ON TABLE trading_instruments IS '交易标的池（支持ETF、股票、可转债等）';
COMMENT ON COLUMN trading_instruments.code IS '交易代码，如 510330';
COMMENT ON COLUMN trading_instruments.type IS '标的类型：ETF/STOCK/CONVERTIBLE_BOND';
COMMENT ON COLUMN trading_instruments.tencent_code IS '腾讯API代码，如 sh510330';
COMMENT ON COLUMN trading_instruments.trading_rule IS '交易规则：T+1 或 T+0';
COMMENT ON COLUMN trading_instruments.index_id IS '关联的指数ID（支持一对多，可选）';

-- 索引
CREATE INDEX idx_instruments_code ON trading_instruments(code);
CREATE INDEX idx_instruments_type ON trading_instruments(type);
CREATE INDEX idx_instruments_tencent_code ON trading_instruments(tencent_code);
CREATE INDEX idx_instruments_status ON trading_instruments(status);
CREATE INDEX idx_instruments_index_id ON trading_instruments(index_id);


-- =====================================================
-- 表 2: 模拟账户表 (simulation_accounts)
-- 支持多策略独立核算
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_accounts (
    -- ========== 主键 ==========
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ========== 账户标识 ==========
    name VARCHAR(50) NOT NULL,                     -- 账户名称
    strategy_type VARCHAR(30) NOT NULL,            -- 策略类型：grid/trend_right/trend_left
    description TEXT,                              -- 账户描述
    
    -- ========== 资金信息 ==========
    initial_capital DECIMAL(12,2) NOT NULL DEFAULT 20000, -- 初始资金：2万
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 20000, -- 当前现金余额
    frozen_balance DECIMAL(12,2) DEFAULT 0,        -- 冻结金额（委托未成交）
    
    -- ========== 资产统计 ==========
    position_value DECIMAL(12,2) DEFAULT 0,        -- 持仓市值
    total_assets DECIMAL(12,2) DEFAULT 0,          -- 总资产（现金 + 持仓）
    total_profit DECIMAL(12,2) DEFAULT 0,          -- 总盈亏金额
    total_profit_rate DECIMAL(10,4) DEFAULT 0,     -- 总收益率%
    today_profit DECIMAL(12,2) DEFAULT 0,          -- 今日盈亏
    today_profit_rate DECIMAL(10,4) DEFAULT 0,     -- 今日收益率%
    
    -- ========== 交易统计 ==========
    total_buy_count INTEGER DEFAULT 0,             -- 累计买入次数
    total_sell_count INTEGER DEFAULT 0,            -- 累计卖出次数
    total_commission DECIMAL(12,2) DEFAULT 0,      -- 累计手续费
    
    -- ========== 费率配置（账户级别）==========
    commission_rate DECIMAL(8,6) DEFAULT 0.00006,  -- 佣金率：万分之0.6
    min_commission DECIMAL(10,2) DEFAULT 0.2,      -- 最低佣金：0.2元
    
    -- ========== 状态 ==========
    status VARCHAR(20) DEFAULT 'active',           -- active/paused/closed
    start_date DATE NOT NULL DEFAULT CURRENT_DATE, -- 开始日期
    
    -- ========== 元数据 ==========
    metadata JSONB,                                -- 策略参数配置
    
    -- ========== 时间戳 ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 注释
COMMENT ON TABLE simulation_accounts IS '模拟交易账户表（支持多策略）';
COMMENT ON COLUMN simulation_accounts.strategy_type IS '策略类型：grid=网格，trend_right=右侧趋势，trend_left=左侧逆向';
COMMENT ON COLUMN simulation_accounts.commission_rate IS '账户级别佣金率（万分之0.6=0.00006）';
COMMENT ON COLUMN simulation_accounts.min_commission IS '账户级别最低佣金（0.2元）';

-- 索引
CREATE INDEX idx_accounts_strategy ON simulation_accounts(strategy_type);
CREATE INDEX idx_accounts_status ON simulation_accounts(status);


-- =====================================================
-- 表 3: 持仓表 (simulation_positions)
-- 支持 T+1 和实时盈亏
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_positions (
    -- ========== 主键 ==========
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ========== 关联关系 ==========
    account_id UUID NOT NULL REFERENCES simulation_accounts(id),
    instrument_id UUID NOT NULL REFERENCES trading_instruments(id),
    
    -- ========== 持仓信息 ==========
    quantity DECIMAL(12,0) NOT NULL DEFAULT 0,         -- 持有数量（股）
    available_quantity DECIMAL(12,0) DEFAULT 0,        -- 可用数量（T+1限制）
    frozen_quantity DECIMAL(12,0) DEFAULT 0,           -- 冻结数量（委托未成交）
    
    -- ========== 成本信息 ==========
    avg_cost DECIMAL(10,4) NOT NULL DEFAULT 0,         -- 平均成本价
    total_cost DECIMAL(12,2) DEFAULT 0,                -- 总成本
    
    -- ========== 实时信息 ==========
    current_price DECIMAL(10,4) DEFAULT 0,             -- 当前价格
    market_value DECIMAL(12,2) DEFAULT 0,              -- 市值
    float_profit DECIMAL(12,2) DEFAULT 0,              -- 浮动盈亏
    float_profit_rate DECIMAL(10,4) DEFAULT 0,         -- 浮动盈亏率%
    today_profit DECIMAL(12,2) DEFAULT 0,              -- 今日盈亏
    
    -- ========== 交易记录 ==========
    last_buy_date DATE,                                -- 最后买入日期
    last_sell_date DATE,                               -- 最后卖出日期
    last_update_time TIMESTAMP,                        -- 最后更新时间（5分钟刷新）
    
    -- ========== 时间戳 ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ========== 约束 ==========
    CONSTRAINT uq_account_instrument UNIQUE (account_id, instrument_id)
);

-- 索引
CREATE INDEX idx_positions_account ON simulation_positions(account_id);
CREATE INDEX idx_positions_instrument ON simulation_positions(instrument_id);
CREATE INDEX idx_positions_account_instrument ON simulation_positions(account_id, instrument_id);

-- 注释
COMMENT ON TABLE simulation_positions IS '模拟持仓表（支持T+1和实时盈亏）';
COMMENT ON COLUMN simulation_positions.available_quantity IS '可用数量（扣除当日买入部分）';
COMMENT ON COLUMN simulation_positions.today_profit IS '今日盈亏（基于昨收价计算）';


-- =====================================================
-- 表 4: 交易记录表 (simulation_trades)
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_trades (
    -- ========== 主键 ==========
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ========== 关联关系 ==========
    account_id UUID NOT NULL REFERENCES simulation_accounts(id),
    instrument_id UUID NOT NULL REFERENCES trading_instruments(id),
    
    -- ========== 交易信息 ==========
    trade_type VARCHAR(10) NOT NULL,                   -- BUY/SELL
    trade_date DATE NOT NULL,                          -- 交易日期
    trade_time TIME,                                   -- 交易时间
    price DECIMAL(10,4) NOT NULL,                      -- 成交价格
    
    -- ========== 数量金额 ==========
    quantity DECIMAL(12,0) NOT NULL,                   -- 交易数量（股）
    amount DECIMAL(12,2) NOT NULL,                     -- 交易金额（价格×数量）
    commission DECIMAL(10,2) NOT NULL,                 -- 手续费（按实际费率计算）
    
    -- ========== 账户快照 ==========
    balance_before DECIMAL(12,2),                      -- 交易前余额
    balance_after DECIMAL(12,2),                       -- 交易后余额
    
    -- ========== 订单信息 ==========
    order_id VARCHAR(50),                              -- 订单号（模拟）
    notes TEXT,                                        -- 备注
    
    -- ========== 时间戳 ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_trades_account ON simulation_trades(account_id);
CREATE INDEX idx_trades_instrument ON simulation_trades(instrument_id);
CREATE INDEX idx_trades_date ON simulation_trades(trade_date);

-- 注释
COMMENT ON TABLE simulation_trades IS '模拟交易记录表';


-- =====================================================
-- 表 5: 每日资产快照表 (simulation_daily_snapshots)
-- 用于收益曲线展示
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_daily_snapshots (
    -- ========== 主键 ==========
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ========== 关联关系 ==========
    account_id UUID NOT NULL REFERENCES simulation_accounts(id),
    
    -- ========== 快照日期 ==========
    snapshot_date DATE NOT NULL,                       -- 快照日期（交易日）
    
    -- ========== 资产数据 ==========
    cash_balance DECIMAL(12,2) NOT NULL,               -- 现金余额
    position_value DECIMAL(12,2) NOT NULL,             -- 持仓市值
    total_assets DECIMAL(12,2) NOT NULL,               -- 总资产
    total_profit DECIMAL(12,2) NOT NULL,               -- 总盈亏
    profit_rate DECIMAL(10,4) NOT NULL,                -- 收益率%
    
    -- ========== 今日盈亏 ==========
    today_profit DECIMAL(12,2),                        -- 今日盈亏
    today_profit_rate DECIMAL(10,4),                   -- 今日收益率%
    
    -- ========== 持仓详情（JSON）==========
    positions_snapshot JSONB,                          -- 持仓明细快照
    
    -- ========== 时间戳 ==========
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ========== 约束 ==========
    CONSTRAINT uq_account_date UNIQUE (account_id, snapshot_date)
);

-- 索引
CREATE INDEX idx_snapshots_account_date ON simulation_daily_snapshots(account_id, snapshot_date);

-- 注释
COMMENT ON TABLE simulation_daily_snapshots IS '每日资产快照表（用于收益曲线）';


-- =====================================================
-- 表 6: 定时任务日志表 (simulation_task_logs)
-- =====================================================
CREATE TABLE IF NOT EXISTS simulation_task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type VARCHAR(30) NOT NULL,                    -- 任务类型
    execute_time TIMESTAMP NOT NULL,                   -- 执行时间
    accounts_processed INTEGER DEFAULT 0,              -- 处理的账户数
    positions_updated INTEGER DEFAULT 0,               -- 更新的持仓数
    status VARCHAR(20) DEFAULT 'success',              -- success/failed
    error_message TEXT,                                -- 错误信息
    duration_ms INTEGER,                               -- 耗时（毫秒）
    created_at TIMESTAMP DEFAULT NOW()
);

-- 注释
COMMENT ON TABLE simulation_task_logs IS '定时任务执行日志';


-- =====================================================
-- 初始化示例数据
-- =====================================================

-- 插入3个默认账户
INSERT INTO simulation_accounts (name, strategy_type, description, initial_capital, current_balance, start_date)
VALUES 
('网格交易账号', 'grid', '网格交易策略，2万资金', 20000, 20000, CURRENT_DATE),
('趋势交易账号（右侧）', 'trend_right', '右侧趋势跟踪策略，2万资金', 20000, 20000, CURRENT_DATE),
('左侧交易账号', 'trend_left', '左侧逆向投资策略，2万资金', 20000, 20000, CURRENT_DATE);

-- 插入示例交易标的（沪深300对应的多个ETF）
-- 注意：index_id 需要根据实际的 indices 表数据调整
INSERT INTO trading_instruments (code, name, type, exchange, tencent_code, trading_rule, issuer, index_code, index_name)
VALUES 
('510330', '沪深300ETF华夏', 'ETF', '上交所', 'sh510330', 'T+1', '华夏基金', '000300', '沪深300'),
('510300', '沪深300ETF华泰', 'ETF', '上交所', 'sh510300', 'T+1', '华泰基金', '000300', '沪深300'),
('159919', '沪深300ETF嘉实', 'ETF', '深交所', 'sz159919', 'T+1', '嘉实基金', '000300', '沪深300'),
('510500', '中证500ETF南方', 'ETF', '上交所', 'sh510500', 'T+1', '南方基金', '000905', '中证500'),
('159922', '中证500ETF嘉实', 'ETF', '深交所', 'sz159922', 'T+1', '嘉实基金', '000905', '中证500'),
('510880', '红利ETF', 'ETF', '上交所', 'sh510880', 'T+1', '华泰基金', '000015', '红利指数'),
('159902', '创业板ETF', 'ETF', '深交所', 'sz159902', 'T+1', '易方达基金', '399006', '创业板指'),
('512100', '医药ETF', 'ETF', '上交所', 'sh512100', 'T+1', '华宝基金', '399933', '医药卫生'),
('512660', '军工ETF', 'ETF', '上交所', 'sh512660', 'T+1', '国泰基金', 'H30053', '中证军工'),
('513100', '纳指100ETF', 'ETF', '上交所', 'sh513100', 'T+0', '国泰基金', 'NDX100', '纳斯达克100'),
('513500', '标普500ETF', 'ETF', '上交所', 'sh513500', 'T+0', '博时基金', 'SPX', '标普500'),
('159920', '恒生ETF', 'ETF', '深交所', 'sz159920', 'T+0', '华夏基金', 'HSI', '恒生指数'),
('511360', '国债逆回购', 'CONVERTIBLE_BOND', '上交所', 'sh204001', 'T+0', NULL, NULL, NULL);
