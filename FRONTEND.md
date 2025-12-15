# TestFlow 前端项目

基于 Vue 3 + Element Plus + Vite 构建的前端界面。

## 项目结构

```
frontend/
├── src/
│   ├── api/              # API 接口封装
│   │   └── index.ts      # 所有 API 接口
│   ├── components/       # 公共组件
│   │   └── NavMenu.vue   # 导航菜单
│   ├── router/           # 路由配置
│   │   └── index.ts
│   ├── utils/            # 工具函数
│   │   └── index.ts
│   ├── views/            # 页面视图
│   │   ├── Home.vue      # 首页
│   │   ├── Parse.vue     # 用例解析
│   │   ├── Run.vue       # 测试执行
│   │   └── Reports.vue   # 测试报告
│   ├── App.vue           # 根组件
│   └── main.ts           # 入口文件
├── public/               # 静态资源
├── index.html            # HTML 模板
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
└── package.json          # 依赖配置
```

## 快速开始

### 1. 安装依赖

```bash
cd frontend
pnpm install
```

### 2. 启动开发服务器

```bash
pnpm dev
```

前端将在 `http://localhost:5174` 启动。

### 3. 构建生产版本

```bash
pnpm build
```

## 功能模块

### 1. 首页 (Home)
- 系统概览
- 功能导航卡片
- API 状态显示

### 2. 用例解析 (Parse)
- **解析文件**: 解析单个测试用例文件
  - 支持指定文件路径和用例目录
  - 显示解析结果和用例列表
- **解析字符串**: 直接解析 Markdown 格式的用例内容
  - 支持在线编辑用例内容
  - 实时解析预览
- **解析目录**: 批量解析目录下的所有用例文件
  - 显示所有文件的解析结果
  - 统计用例数量

### 3. 测试执行 (Run)
- **运行所有**: 执行指定目录下的所有测试用例
  - 配置用例目录、输出目录、报告格式
  - 显示执行进度和结果统计
- **运行文件**: 执行单个测试用例文件
  - 支持选择文件路径
  - 查看详细的执行结果
- **运行字符串**: 直接执行用例字符串
  - 支持在线编辑用例
  - 配置入口 URL

### 4. 测试报告 (Reports)
- 报告列表展示
- 支持 JSON 和 Markdown 两种格式查看
- 报告详情展示
- 执行结果统计

## API 接口

所有 API 接口封装在 `src/api/index.ts` 中，包括：

- `healthCheck()` - 健康检查
- `getApiInfo()` - 获取 API 信息
- `parseFile()` - 解析文件
- `parseString()` - 解析字符串
- `parseDirectory()` - 解析目录
- `runAll()` - 运行所有
- `runFile()` - 运行文件
- `runString()` - 运行字符串
- `listReports()` - 获取报告列表
- `getReport()` - 获取报告详情

## 技术栈

- **Vue 3**: 渐进式 JavaScript 框架
- **Element Plus**: Vue 3 组件库
- **Vite**: 下一代前端构建工具
- **TypeScript**: 类型安全的 JavaScript
- **Vue Router**: 官方路由管理器
- **Pinia**: 状态管理库
- **Axios**: HTTP 客户端

## 配置说明

### 代理配置

在 `vite.config.ts` 中配置了 API 代理：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

### 环境变量

可以通过环境变量配置 API 地址（需要修改代码）。

## 开发指南

### 添加新页面

1. 在 `src/views/` 创建新的 Vue 组件
2. 在 `src/router/index.ts` 添加路由配置
3. 在 `src/components/NavMenu.vue` 添加导航菜单项

### 添加新 API

在 `src/api/index.ts` 中添加新的 API 函数。

### 样式规范

- 使用 Element Plus 组件库的样式
- 自定义样式使用 scoped 作用域
- 响应式设计，支持移动端

## 注意事项

1. **后端服务**: 确保后端 API 服务器运行在 `http://localhost:3000`
2. **超时设置**: 测试执行接口设置了 5 分钟超时
3. **跨域问题**: 开发环境使用 Vite 代理，生产环境需要配置 CORS
4. **浏览器兼容**: 支持现代浏览器（Chrome、Firefox、Safari、Edge）

## 故障排查

### 无法连接后端

1. 检查后端服务是否启动
2. 检查 `vite.config.ts` 中的代理配置
3. 检查浏览器控制台的错误信息

### 样式问题

1. 确保 Element Plus 样式已正确导入
2. 检查浏览器兼容性

### 构建失败

1. 检查 TypeScript 类型错误
2. 检查依赖是否完整安装
3. 查看构建日志

## 相关文档

- [API 文档](../API.md)
- [后端 README](../README.md)
- [Element Plus 文档](https://element-plus.org/)

