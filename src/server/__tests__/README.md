# API 接口测试文档

## 测试概述

本目录包含 TestFlow API 服务器的自动化测试，使用 Vitest 测试框架。

## 运行测试

```bash
# 运行所有 API 测试
pnpm test:api

# 监听模式（开发时使用）
pnpm test:api:watch

# UI 模式（可视化测试结果）
pnpm test:api:ui
```

## 测试覆盖

### 1. 健康检查接口 ✅
- `GET /health` - 健康状态检查
- `GET /api/v1/info` - API 信息查询

### 2. 用例解析接口 ✅
- `POST /api/v1/parse/file` - 解析测试用例文件
- `POST /api/v1/parse/string` - 解析测试用例字符串
- `POST /api/v1/parse/directory` - 解析目录下所有文件
- 参数验证测试（缺少必需参数时返回 400）

### 3. 报告查询接口 ✅
- `GET /api/v1/reports` - 获取报告列表
- `GET /api/v1/reports/:reportId` - 获取指定报告（JSON 格式）
- `GET /api/v1/reports/:reportId?format=markdown` - 获取 Markdown 格式报告

### 4. 错误处理 ✅
- `GET /nonexistent` - 404 错误处理

### 5. 测试执行接口（需要环境变量）✅
- `POST /api/v1/run/file` - 运行测试用例文件
- `POST /api/v1/run/string` - 运行用例字符串

**注意**: 测试执行接口需要配置环境变量（`API_KEY`, `BASE_URL`），如果没有配置会自动跳过。

## 测试环境

- **测试服务器端口**: 3001（避免与开发服务器冲突）
- **测试框架**: Vitest 4.0+
- **超时设置**: 30秒（常规测试），120秒（集成测试）

## 测试结果

```
✓ src/server/__tests__/api.test.ts (13 tests)
  ✓ 健康检查接口 (2 tests)
  ✓ 用例解析接口 (5 tests)
  ✓ 报告查询接口 (3 tests)
  ✓ 错误处理 (1 test)
  ✓ 测试执行接口 (2 tests)
```

## 注意事项

1. **AI 解析失败**: 如果测试环境中没有配置正确的 `API_KEY` 和 `BASE_URL`，AI 解析会失败并自动回退到 regex 解析。这是预期的行为。

2. **测试用例解析**: 如果测试文件格式不符合预期，regex 解析可能无法解析出测试用例。这种情况下，测试会通过但会输出警告信息。

3. **MCP 连接**: 测试执行接口需要连接到 Playwright MCP 服务器，首次运行可能需要下载 Playwright 浏览器。

## 添加新测试

在 `api.test.ts` 中添加新的测试用例：

```typescript
test('描述测试内容', async () => {
    const result = await request('METHOD', '/api/v1/endpoint', {
        // 请求体
    });
    
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    // 更多断言...
});
```

## 持续集成

这些测试可以在 CI/CD 流程中运行，确保 API 接口的稳定性和正确性。

