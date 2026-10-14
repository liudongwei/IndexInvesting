# API 路由修复报告 - 添加 /api 前缀

## 🐛 问题描述

### 错误信息
```
Cannot POST /admin/trading-instruments
404 Not Found
```

### 根本原因

NestJS 后端配置了全局路由前缀 `/api`（在 `src/main.ts` 中）：

```typescript
// src/main.ts
const apiPrefix = process.env.API_PREFIX || 'api';
if (apiPrefix) {
  app.setGlobalPrefix(apiPrefix);
}
```

这导致所有路由都需要加上 `/api` 前缀。

**实际路由映射：**
```
Controller: @Controller('admin/trading-instruments')
实际路径:   /api/admin/trading-instruments  ← 需要 /api 前缀
```

---

## ✅ 解决方案

### 修改前端 API 调用，添加 `/api` 前缀

#### 1. TradingInstrumentManagement.tsx

**修改前：**
```typescript
fetch('http://localhost:3000/admin/trading-instruments', {...})
```

**修改后：**
```typescript
fetch('http://localhost:3000/api/admin/trading-instruments', {...})
```

**涉及的所有 API 调用：**
- ✅ GET `/api/admin/trading-instruments` - 分页查询
- ✅ GET `/api/admin/trading-instruments/search` - 搜索
- ✅ POST `/api/admin/trading-instruments` - 创建
- ✅ PUT `/api/admin/trading-instruments/:id` - 更新
- ✅ DELETE `/api/admin/trading-instruments/:id` - 删除

---

#### 2. SimulationDashboard.tsx

**修改前：**
```typescript
fetch('http://localhost:3000/simulation/portfolio/accounts', {...})
```

**修改后：**
```typescript
fetch('http://localhost:3000/api/simulation/portfolio/accounts', {...})
```

---

## 📋 完整的路由映射表

### Admin 接口

| 功能 | Controller 定义 | 实际访问路径 |
|------|----------------|-------------|
| 分页查询标的 | `@Get()` | `GET /api/admin/trading-instruments` |
| 搜索标的 | `@Get('search')` | `GET /api/admin/trading-instruments/search` |
| 查询单个 | `@Get(':id')` | `GET /api/admin/trading-instruments/:id` |
| 创建标的 | `@Post()` | `POST /api/admin/trading-instruments` |
| 更新标的 | `@Put(':id')` | `PUT /api/admin/trading-instruments/:id` |
| 删除标的 | `@Delete(':id')` | `DELETE /api/admin/trading-instruments/:id` |
| 批量导入 | `@Post('bulk-import')` | `POST /api/admin/trading-instruments/bulk-import` |

### Web 接口

| 功能 | Controller 定义 | 实际访问路径 |
|------|----------------|-------------|
| 获取账户列表 | `@Get('accounts')` | `GET /api/simulation/portfolio/accounts` |
| 买入股票 | `@Post('buy')` | `POST /api/simulation/portfolio/buy` |
| 卖出股票 | `@Post('sell')` | `POST /api/simulation/portfolio/sell` |
| 查询持仓 | `@Get('positions/:id')` | `GET /api/simulation/portfolio/positions/:id` |
| 交易记录 | `@Get('trades/:id')` | `GET /api/simulation/portfolio/trades/:id` |

---

## 🔍 如何验证修复

### 1. 检查后端服务是否运行

```powershell
# 启动后端
npm run start:dev

# 应该看到类似输出：
# Application is running on: http://localhost:3000
```

### 2. 测试 API 端点

**使用浏览器或 curl 测试：**

```bash
# 测试查询接口
curl http://localhost:3000/api/admin/trading-instruments?page=1&limit=10

# 测试创建接口
curl -X POST http://localhost:3000/api/admin/trading-instruments \
  -H "Content-Type: application/json" \
  -d '{
    "code": "510330",
    "name": "沪深300ETF华夏",
    "type": "ETF",
    "exchange": "上交所",
    "tencentCode": "sh510330",
    "tradingRule": "T+1"
  }'
```

### 3. 测试前端页面

1. 启动前端：
   ```powershell
   cd web
   npm run dev
   ```

2. 访问：`http://localhost:5173/admin/trading-instruments`

3. 测试操作：
   - ✅ 点击"+ 新增标的" → 填写表单 → 提交
   - ✅ 应该看到"创建成功"提示
   - ✅ 列表自动刷新显示新数据

---

## 🛠️ 其他可能的解决方案

### 方案 A：移除全局前缀（不推荐）

如果不想使用 `/api` 前缀，可以修改 `src/main.ts`：

```typescript
// 注释掉或删除这段代码
// const apiPrefix = process.env.API_PREFIX || 'api';
// if (apiPrefix) {
//   app.setGlobalPrefix(apiPrefix);
// }
```

**缺点：** 
- 与其他模块不一致
- 不符合 RESTful API 最佳实践
- 可能影响现有功能

### 方案 B：使用环境变量控制（推荐）

在 `.env` 文件中配置：

```env
# 开发环境：不使用前缀
API_PREFIX=

# 生产环境：使用前缀
# API_PREFIX=api
```

### 方案 C：保持现状（当前方案）✅

- 所有 API 统一加 `/api` 前缀
- 符合 RESTful 规范
- 便于版本管理（如 `/v1/api/...`）
- 与 Swagger 文档一致

---

## 📊 修改的文件清单

### 前端文件
1. **web/src/components/TradingInstrumentManagement.tsx**
   - 修改 5 处 API 调用
   - 添加 `/api` 前缀

2. **web/src/components/SimulationDashboard.tsx**
   - 修改 1 处 API 调用
   - 添加 `/api` 前缀

### 总计
- 修改文件：2 个
- 修改行数：6 处
- 新增代码：0 行
- 删除代码：0 行

---

## ✨ 最佳实践建议

### 1. 创建 API 基础 URL 常量

**推荐做法：**

```typescript
// web/src/services/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const API_ENDPOINTS = {
  // Admin
  TRADING_INSTRUMENTS: `${API_BASE_URL}/admin/trading-instruments`,
  
  // Simulation
  SIMULATION_ACCOUNTS: `${API_BASE_URL}/simulation/portfolio/accounts`,
  SIMULATION_BUY: `${API_BASE_URL}/simulation/portfolio/buy`,
  SIMULATION_SELL: `${API_BASE_URL}/simulation/portfolio/sell`,
};
```

**使用示例：**
```typescript
import { API_ENDPOINTS } from '@/services/api';

fetch(API_ENDPOINTS.TRADING_INSTRUMENTS, {...})
```

### 2. 创建统一的 HTTP 客户端

```typescript
// web/src/utils/http.ts
class HttpClient {
  private baseURL = 'http://localhost:3000/api';

  async request(url: string, options: RequestInit = {}) {
    const fullURL = `${this.baseURL}${url}`;
    const response = await fetch(fullURL, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  get(url: string) {
    return this.request(url, { method: 'GET' });
  }

  post(url: string, data: any) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put(url: string, data: any) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  delete(url: string) {
    return this.request(url, { method: 'DELETE' });
  }
}

export default new HttpClient();
```

**使用示例：**
```typescript
import http from '@/utils/http';

// 创建标的
await http.post('/admin/trading-instruments', formData);

// 更新标的
await http.put(`/admin/trading-instruments/${id}`, formData);

// 删除标的
await http.delete(`/admin/trading-instruments/${id}`);
```

---

## 🎯 总结

**问题已修复！**

### 修复内容
- ✅ 所有前端 API 调用添加了 `/api` 前缀
- ✅ 与后端全局路由前缀保持一致
- ✅ 符合 RESTful API 规范

### 验证步骤
1. 重启后端服务（如果需要）
2. 刷新前端页面
3. 测试新增、编辑、删除功能
4. 确认不再出现 404 错误

### 后续优化
- 建议创建统一的 API 客户端
- 使用环境变量管理 API 基础 URL
- 添加请求拦截器和错误处理

现在你可以正常使用交易标的的增删改查功能了！🎉
