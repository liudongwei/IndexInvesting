# 交易账户管理功能说明

## 📋 功能概述

已完成交易账户管理的后台开发，包括完整的 CRUD 操作、前端管理页面和菜单集成。

---

## 🎯 核心功能

### 1. 后端 API 接口

#### Admin 控制器
**路径**: `src/simulation-portfolio/controllers/simulation-account-admin.controller.ts`

提供以下 RESTful API：

| 方法 | 路径 | 功能 | 说明 |
|------|------|------|------|
| POST | `/admin/simulation-accounts` | 创建账户 | 支持自定义初始资金、佣金率等参数 |
| GET | `/admin/simulation-accounts` | 分页查询 | 支持状态筛选（active/paused/closed） |
| GET | `/admin/simulation-accounts/:id` | 查询详情 | 返回账户完整信息 |
| PUT | `/admin/simulation-accounts/:id` | 更新账户 | 支持部分字段更新 |
| DELETE | `/admin/simulation-accounts/:id` | 删除账户 | 软删除，状态设为 closed |

#### DTO 验证类
- **CreateAccountDto**: 创建账户的数据验证
  - 必填字段：name, strategyType
  - 可选字段：description, initialCapital, commissionRate, minCommission, status
  
- **UpdateAccountDto**: 更新账户的数据验证
  - 所有字段均为可选

---

### 2. 前端管理页面

#### 页面组件
**路径**: `web/src/components/SimulationAccountManagement.tsx`

#### 主要功能

**列表展示**
- ✅ 分页显示（每页 20 条）
- ✅ 搜索功能（按账户名称或 ID）
- ✅ 状态筛选（运行中/已暂停/已关闭）
- ✅ 实时统计数据：
  - 账户名称
  - 策略类型标签
  - 初始资金
  - 总资产
  - 总盈亏（带百分比）
  - 账户状态

**新增账户**
- 模态框表单
- 字段：
  - 账户名称（必填）
  - 策略类型（必填）：网格交易、右侧趋势、左侧逆向、自定义
  - 账户描述（可选）
  - 初始资金（默认 20000）
  - 佣金率（默认 0.00006 = 万0.6）
  - 最低佣金（默认 0.2）
  - 账户状态（默认 active）

**编辑账户**
- 模态框表单
- 可修改除 ID 外的所有字段
- 只发送变更字段到后端

**删除账户**
- 二次确认提示
- 软删除（状态改为 closed）
- 不影响历史交易数据

---

### 3. 菜单集成

#### App.tsx 配置
**路径**: `web/src/App.tsx`

```typescript
// 菜单项配置
{ 
  path: '/admin/simulation-accounts', 
  label: '交易账户', 
  icon: '👛' 
}

// 路由配置
<Route path="simulation-accounts" element={<SimulationAccountManagement />} />
```

**菜单位置**: 
- 在"交易标的"之后
- 在"指数配置"之前

---

## 🚀 使用方法

### 启动服务

```bash
# 1. 启动后端（如果未启动）
cd d:\wwwroot\nodejs_wwwroot\IndexInvesting
npm run start:dev

# 2. 启动前端（如果未启动）
cd web
npm run dev
```

### 访问页面

1. 打开浏览器访问：`http://localhost:5173/admin/simulation-accounts`
   - 或者通过侧边栏菜单点击"交易账户"进入

2. 功能操作：
   - **新增账户**: 点击右上角"+ 新增账户"按钮
   - **编辑账户**: 点击表格行的"编辑"按钮
   - **删除账户**: 点击表格行的"删除"按钮
   - **搜索**: 在搜索框输入账户名称或 ID
   - **筛选**: 使用状态下拉框筛选

---

## 📊 数据结构

### SimulationAccount 实体关键字段

```typescript
{
  id: string;                    // UUID
  name: string;                  // 账户名称
  strategyType: StrategyType;    // 策略类型枚举
  description?: string;          // 描述
  initialCapital: number;        // 初始资金
  currentBalance: number;        // 当前余额
  positionValue: number;         // 持仓市值
  totalAssets: number;           // 总资产
  totalProfit: number;           // 总盈亏
  totalProfitRate: number;       // 总收益率(%)
  todayProfit: number;           // 今日盈亏
  todayProfitRate: number;       // 今日收益率(%)
  totalBuyCount: number;         // 累计买入次数
  totalSellCount: number;        // 累计卖出次数
  totalCommission: number;       // 累计佣金
  commissionRate: number;        // 佣金率
  minCommission: number;         // 最低佣金
  status: AccountStatus;         // 账户状态
  startDate: Date;               // 开始日期
  createdAt: Date;               // 创建时间
  updatedAt: Date;               // 更新时间
}
```

### 策略类型枚举 (StrategyType)

```typescript
enum StrategyType {
  GRID = 'grid',              // 网格交易
  TREND_RIGHT = 'trend_right', // 右侧趋势交易
  TREND_LEFT = 'trend_left',   // 左侧逆向交易
  CUSTOM = 'custom',          // 自定义策略
}
```

### 账户状态枚举 (AccountStatus)

```typescript
enum AccountStatus {
  ACTIVE = 'active',    // 运行中
  PAUSED = 'paused',    // 已暂停
  CLOSED = 'closed',    // 已关闭
}
```

---

## 🔧 技术实现

### 后端技术栈

- **NestJS**: Controller + Service 架构
- **TypeORM**: 数据库 ORM
- **class-validator**: DTO 数据验证
- **PostgreSQL**: 数据库

### 前端技术栈

- **React**: 函数式组件 + Hooks
- **TypeScript**: 类型安全
- **Tailwind CSS**: 样式设计
- **Fetch API**: HTTP 请求

### 关键特性

1. **环境变量适配**: 
   ```typescript
   const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
   ```
   - 开发环境: `http://localhost:3000/api`
   - 生产环境: `/api`（相对路径，通过 Nginx 代理）

2. **软删除机制**: 
   - 不物理删除数据
   - 将状态设为 `CLOSED`
   - 保留历史交易记录

3. **分页处理**:
   - 前端简单分页（slice）
   - 支持状态筛选

4. **数据验证**:
   - 后端 DTO 装饰器验证
   - 前端表单基本验证

---

## 📝 API 测试示例

### 创建账户

```bash
curl -X POST http://localhost:3000/api/admin/simulation-accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "网格交易策略A",
    "strategyType": "grid",
    "description": "沪深300ETF网格交易",
    "initialCapital": 50000,
    "commissionRate": 0.00006,
    "minCommission": 0.2,
    "status": "active"
  }'
```

### 查询账户列表

```bash
# 查询所有账户
curl http://localhost:3000/api/admin/simulation-accounts?page=1&limit=20

# 筛选运行中的账户
curl http://localhost:3000/api/admin/simulation-accounts?status=active
```

### 更新账户

```bash
curl -X PUT http://localhost:3000/api/admin/simulation-accounts/{account-id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "网格交易策略B（已更新）",
    "commissionRate": 0.00005
  }'
```

### 删除账户

```bash
curl -X DELETE http://localhost:3000/api/admin/simulation-accounts/{account-id}
```

---

## ✅ 完成清单

- [x] 后端 Controller（CRUD 接口）
- [x] DTO 类（Create/Update）
- [x] 前端管理页面组件
- [x] 菜单集成（App.tsx）
- [x] 路由配置
- [x] 环境变量适配
- [x] 文档更新

---

## 🎉 总结

交易账户管理功能已完全开发完成，包括：

1. **5个后端 API 接口**（增删改查 + 分页查询）
2. **1个前端管理页面**（完整的 UI 交互）
3. **菜单集成**（侧边栏入口）
4. **数据验证**（前后端双重验证）
5. **生产环境适配**（环境变量配置）

系统现在可以通过后台界面完整管理模拟交易账户，支持多策略独立核算！
