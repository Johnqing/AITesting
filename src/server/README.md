# Server 目录结构说明

## 目录结构

```
server/
├── app.ts                    # Express 应用配置和启动
├── index.ts                  # 服务器启动入口
├── testService.ts            # 测试服务层
├── controllers/              # 控制器层（业务逻辑）
│   ├── healthController.ts  # 健康检查和 API 信息
│   ├── parseController.ts   # 用例解析相关接口
│   ├── runController.ts      # 测试执行相关接口
│   └── reportController.ts   # 报告查询相关接口
├── routes/                   # 路由层（URL 映射）
│   ├── index.ts             # 路由汇总
│   ├── healthRoutes.ts      # 健康检查路由
│   ├── parseRoutes.ts       # 解析路由
│   ├── runRoutes.ts         # 运行路由
│   └── reportRoutes.ts      # 报告路由
└── middleware/              # 中间件
    ├── errorHandler.ts      # 错误处理中间件
    └── notFoundHandler.ts   # 404 处理中间件
```

## 文件说明

### 核心文件

- **app.ts**: Express 应用主文件，配置中间件和注册路由
- **index.ts**: 服务器启动入口
- **testService.ts**: 测试服务层，封装测试执行逻辑

### Controllers（控制器）

控制器负责处理业务逻辑，每个控制器对应一个功能模块：

- **healthController.ts**: 
  - `healthCheck()` - 健康检查
  - `apiInfo()` - API 信息

- **parseController.ts**:
  - `parseFile()` - 解析测试用例文件
  - `parseString()` - 解析测试用例字符串
  - `parseDirectory()` - 解析目录

- **runController.ts**:
  - `runAll()` - 运行所有测试用例
  - `runFile()` - 运行单个测试用例文件
  - `runTestCase()` - 运行单个测试用例
  - `runString()` - 运行用例字符串

- **reportController.ts**:
  - `getReport()` - 获取测试报告
  - `listReports()` - 列出所有测试报告

### Routes（路由）

路由负责 URL 到控制器的映射：

- **healthRoutes.ts**: `/health`, `/api/v1/info`
- **parseRoutes.ts**: `/api/v1/parse/*`
- **runRoutes.ts**: `/api/v1/run/*`
- **reportRoutes.ts**: `/api/v1/reports/*`
- **index.ts**: 汇总所有路由

### Middleware（中间件）

中间件处理请求和响应的通用逻辑：

- **errorHandler.ts**: 统一错误处理
- **notFoundHandler.ts**: 404 处理

## 设计原则

1. **关注点分离**: 路由、控制器、中间件各司其职
2. **单一职责**: 每个文件只负责一个功能模块
3. **易于扩展**: 新增功能只需添加对应的控制器和路由
4. **统一错误处理**: 所有错误通过中间件统一处理

## 添加新功能的步骤

1. 在 `controllers/` 创建新的控制器文件
2. 在 `routes/` 创建对应的路由文件
3. 在 `routes/index.ts` 注册新路由

示例：

```typescript
// controllers/newController.ts
export async function newHandler(req: Request, res: Response) {
  // 业务逻辑
}

// routes/newRoutes.ts
import { Router } from 'express';
import { newHandler } from '../controllers/newController.js';

const router = Router();
router.post('/api/v1/new', newHandler);
export default router;

// routes/index.ts
import newRoutes from './newRoutes.js';
router.use(newRoutes);
```

