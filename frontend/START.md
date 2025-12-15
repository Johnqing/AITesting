# TestFlow 前端启动指南

## 前置条件

1. 确保后端 API 服务器已启动（运行在 http://localhost:3000）
   ```bash
   cd /Users/l/Documents/work/code/demo/aitest/testflow
   pnpm server:dev
   ```

## 启动前端

```bash
cd frontend
pnpm install  # 如果还没安装依赖
pnpm dev
```

前端将在 http://localhost:5174 启动

## 功能说明

### 1. 首页
- 显示系统概览
- 快速导航到各个功能模块

### 2. 用例解析
- **解析文件**: 解析单个测试用例文件
- **解析字符串**: 直接解析 Markdown 格式的用例内容
- **解析目录**: 批量解析目录下的所有用例文件

### 3. 测试执行
- **运行所有**: 执行指定目录下的所有测试用例
- **运行文件**: 执行单个测试用例文件
- **运行字符串**: 直接执行用例字符串

### 4. 测试报告
- 查看所有测试报告列表
- 支持 JSON 和 Markdown 两种格式查看
- 显示报告详情和执行结果

## 注意事项

1. 确保后端 API 服务器正在运行
2. 测试执行可能需要较长时间，请耐心等待
3. 如果遇到跨域问题，检查 vite.config.ts 中的代理配置
