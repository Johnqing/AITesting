# TestFlow Frontend

TestFlow 前端界面，基于 Vue 3 + Element Plus + Vite 构建。

## 功能特性

- ✅ 用例解析（文件、字符串、目录）
- ✅ 测试执行（所有、文件、字符串）
- ✅ 测试报告查看和管理
- ✅ 实时状态显示

## 技术栈

- Vue 3
- Element Plus
- Vite
- TypeScript
- Vue Router
- Pinia
- Axios

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview
```

## 配置

前端默认运行在 `http://localhost:5174`，API 代理到 `http://localhost:3000`。

如需修改，请编辑 `vite.config.ts` 中的配置。

## 项目结构

```
frontend/
├── src/
│   ├── api/          # API 接口
│   ├── components/   # 组件
│   ├── router/       # 路由配置
│   ├── views/        # 页面视图
│   ├── utils/        # 工具函数
│   └── main.ts       # 入口文件
├── public/           # 静态资源
└── vite.config.ts    # Vite 配置
```

