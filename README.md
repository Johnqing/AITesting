# TestFlow - AI驱动的Playwright自动化测试系统

基于AI大模型和Playwright MCP的自动化测试框架，通过自然语言测试用例自动执行浏览器测试。

## 功能特性

- 📝 支持 Markdown 格式的测试用例
- 🤖 使用 AI 大模型（GLM-4.5）解析测试步骤
- 🎭 通过 MCP 协议调用 Playwright 执行浏览器操作
- 📊 生成详细的测试报告（Markdown/JSON）
- ⚡ 自动化测试执行流程

## 安装

```bash
pnpm install
```

## 配置

### 1. 环境变量配置

在项目根目录创建 `.env` 文件：

```env
API_KEY=xxx.xxx
BASE_URL=https://open.bigmodel.cn/api/paas/v4
DEFAULT_MODEL=glm-4.5
```

**注意**: 请确保 `.env` 文件已创建，否则程序会报错。

### 2. 安装 Playwright 浏览器

```bash
npx playwright install
```

这将安装 Playwright 所需的浏览器驱动。

## 使用方法

### 开发模式运行（推荐）

```bash
pnpm dev run
```

### 编译后运行

```bash
pnpm build
pnpm start run
```

### 直接使用命令（需要先 build）

```bash
npm run build
./dist/index.js run
```

### 命令行选项

```bash
testflow run [options]

Options:
  -c, --case-dir <dir>     测试用例目录 (默认: case)
  -o, --output-dir <dir>   报告输出目录 (默认: reports)
  -f, --format <format>    报告格式: markdown, json, both (默认: both)
  -h, --help               显示帮助信息
```

## 测试用例格式

测试用例文件应放在 `case/` 目录下，使用 Markdown 格式：

```markdown
# 模块名称

## 测试页面的入口url
* https://example.com

---

## TC-TEST-001: 测试用例标题

**功能模块**: 模块名称
**优先级**: P0
**测试类型**: 功能测试

**前置条件**:
- 条件1
- 条件2

**测试步骤**:
1. 步骤1
2. 步骤2
3. 步骤3

**预期结果**:
- 结果1
- 结果2
```

## 项目结构

```
testflow/
├── case/                    # 测试用例目录
│   └── *.md
├── src/
│   ├── parser/             # Case 解析器
│   ├── ai/                 # AI 客户端
│   ├── mcp/                # MCP 客户端
│   ├── runner/             # 测试执行器
│   ├── reporter/           # 报告生成器
│   ├── types/              # 类型定义
│   └── index.ts            # 主入口
├── reports/                # 测试报告输出目录
├── package.json
├── tsconfig.json
└── README.md
```

## 工作流程

1. **读取测试用例**: 从 `case/` 目录读取 Markdown 格式的测试用例文件
2. **AI 解析**: 使用 GLM-4.5 将自然语言测试步骤转换为 Playwright 操作序列
3. **MCP 执行**: 通过 MCP 协议调用 Playwright 服务器执行浏览器操作
4. **结果收集**: 收集每个操作的执行结果
5. **报告生成**: 生成详细的测试报告（Markdown/JSON）

## 注意事项

1. **环境变量**: 确保 `.env` 文件已创建并配置正确的 API 密钥
2. **Playwright MCP**: 首次运行时会自动通过 `npx` 下载 `@playwright/mcp` 包
3. **网络连接**: 需要网络连接以访问 AI API 和下载 MCP 服务器
4. **浏览器**: 确保已安装 Playwright 浏览器驱动（运行 `npx playwright install`）

## 故障排除

### 连接 Playwright MCP 服务器失败

如果遇到连接问题，可以尝试：
1. 手动安装: `npm install -g @playwright/mcp`
2. 检查网络连接
3. 查看错误日志了解详细信息

### AI API 调用失败

1. 检查 `.env` 文件中的 API_KEY 是否正确
2. 确认 BASE_URL 和 DEFAULT_MODEL 配置正确
3. 检查网络连接和 API 配额

## 依赖

- Node.js 18+
- TypeScript
- Playwright
- MCP SDK
- OpenAI SDK (兼容 GLM-4.5 API)

## 许可证

MIT

