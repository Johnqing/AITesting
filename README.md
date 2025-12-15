# TestFlow - AI驱动的Playwright自动化测试系统

基于AI大模型和Playwright MCP的自动化测试框架，通过自然语言测试用例自动执行浏览器测试。

## 功能特性

- 📝 支持 Markdown 格式的测试用例
- 🤖 使用 AI 大模型（GLM-4.5）解析测试步骤
- 🎭 通过 MCP 协议调用 Playwright 执行浏览器操作
- 📊 生成详细的测试报告（Markdown/JSON）
- ⚡ 自动化测试执行流程
- 🌐 提供 Web API 服务（RESTful API）
- 💻 提供 Web UI 界面（Vue 3 + Element Plus）
- 🗄️ 数据库存储（PostgreSQL）
- 📦 测试用例管理（CRUD 操作）
- 🎯 测试用例集管理（创建、执行、记录查看）
- 🌍 环境管理（生产环境/预发布环境/测试环境）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

创建 `.env` 文件并配置必要的环境变量（见下方配置说明）

### 3. 初始化数据库

```bash
pnpm db:migrate
```

### 4. 启动服务

**方式一：使用 Web UI（推荐）**

```bash
# 终端1：启动后端 API 服务器
pnpm server:dev

# 终端2：启动前端界面
cd frontend && pnpm dev
```

然后访问 `http://localhost:5174` 使用 Web UI

**方式二：使用命令行工具**

```bash
pnpm dev run
```

## 安装

```bash
pnpm install
```

## 配置

### 1. 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# AI API 配置
API_KEY=xxx.xxx
BASE_URL=https://open.bigmodel.cn/api/paas/v4
DEFAULT_MODEL=glm-4.5

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/testflow
# 或者分别配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=testflow
DB_USER=user
DB_PASSWORD=password

# 服务器配置（可选）
PORT=3000
```

**注意**: 请确保 `.env` 文件已创建，否则程序会报错。

### 2. 数据库初始化

首次使用前需要初始化数据库：

```bash
# 运行数据库迁移
pnpm db:migrate

# 验证数据库表结构
pnpm db:verify
```

### 3. 安装 Playwright 浏览器

```bash
npx playwright install
```

这将安装 Playwright 所需的浏览器驱动。

## 使用方法

### 方式一：Web UI 界面（推荐）

1. **启动后端 API 服务器**

```bash
# 开发模式
pnpm server:dev

# 或生产模式
pnpm build
pnpm server
```

后端服务器默认运行在 `http://localhost:3000`

2. **启动前端界面**

```bash
cd frontend
pnpm install  # 如果还没安装依赖
pnpm dev
```

前端界面默认运行在 `http://localhost:5174`

3. **访问 Web UI**

打开浏览器访问 `http://localhost:5174`，即可使用可视化界面进行：
- 测试用例管理（新增、编辑、删除、筛选）
- 测试用例集管理（创建、执行、查看记录）
- 测试执行和报告查看

### 方式二：命令行工具（CLI）

#### 开发模式运行

```bash
pnpm dev run
```

#### 编译后运行

```bash
pnpm build
pnpm start run
```

#### 直接使用命令（需要先 build）

```bash
npm run build
./dist/index.js run
```

### 命令行选项

#### 运行所有测试用例

```bash
testflow run [options]

Options:
  -c, --case-dir <dir>     测试用例目录 (默认: case)
  -o, --output-dir <dir>   报告输出目录 (默认: reports)
  -f, --format <format>    报告格式: markdown, json, both (默认: both)
```

#### 运行单个测试用例文件

```bash
testflow run-file <file> [options]

Options:
  -o, --output-dir <dir>   报告输出目录 (默认: reports)
  -f, --format <format>    报告格式: markdown, json, both (默认: both)
```

#### 直接运行用例字符串（新功能）

```bash
testflow run-string "<case-content>" [options]

Options:
  -u, --entry-url <url>    测试页面的入口URL
  -o, --output-dir <dir>   报告输出目录 (默认: reports)
  -f, --format <format>    报告格式: markdown, json, both (默认: both)
```

示例：

```bash
# 从字符串运行测试用例
testflow run-string "$(cat case/05-login.md)" -u "https://example.com"

# 或者直接传入用例内容
testflow run-string "# 测试模块

## TC-TEST-001: 测试用例
**功能模块**: 测试
**优先级**: P0
**测试类型**: 功能测试
**测试步骤**:
1. 导航到首页
2. 点击登录按钮
**预期结果**:
- 成功跳转到登录页面"
```

## 测试用例格式

测试用例文件应放在 `case/` 目录下，使用 Markdown 格式：

```markdown
# 模块名称

## 模块说明
模块描述信息

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

### 测试用例字段说明

- **用例ID**: 格式为 `TC-XXX-001`，可通过 Web UI 自动生成
- **测试名称**: 测试用例的标题
- **环境**: 生产环境/预发布环境/测试环境（通过 Web UI 选择）
- **功能模块**: 测试用例所属的功能模块
- **优先级**: P0（最高）/P1（高）/P2（中）
- **测试类型**: 功能测试/性能测试/UI测试/兼容性测试等
- **测试目的**: 测试用例的目的说明
- **入口URL**: 测试页面的入口地址
- **前置条件**: 执行测试前需要满足的条件
- **测试步骤**: 详细的测试操作步骤
- **预期结果**: 每个步骤或整体的预期结果

## 项目结构

```
testflow/
├── case/                    # 测试用例目录
│   └── *.md
├── frontend/                # Web UI 前端
│   ├── src/
│   │   ├── views/          # 页面视图
│   │   │   ├── Home.vue
│   │   │   ├── TestCases.vue
│   │   │   ├── TestSuites.vue
│   │   │   ├── Run.vue
│   │   │   ├── Reports.vue
│   │   │   └── ExecutionDetail.vue
│   │   ├── api/            # API 接口
│   │   ├── router/         # 路由配置
│   │   └── components/     # 组件
│   └── package.json
├── src/
│   ├── core/               # 核心功能模块
│   │   ├── parser/         # 用例解析器
│   │   └── runner/         # 测试执行器
│   ├── adapters/           # 适配器层（便于扩展其他能力）
│   │   ├── ai/             # AI 客户端适配器
│   │   └── mcp/            # MCP 客户端适配器
│   ├── services/           # 服务层（封装业务逻辑）
│   │   └── testService.ts  # 测试服务
│   ├── server/             # Web API 服务器
│   │   ├── app.ts          # Express 应用配置
│   │   ├── controllers/    # 控制器层
│   │   ├── routes/         # 路由层
│   │   └── middleware/     # 中间件
│   ├── db/                  # 数据库相关
│   │   ├── config.ts       # 数据库配置
│   │   ├── migrate.ts      # 数据库迁移
│   │   ├── migrations/      # 迁移脚本
│   │   └── services/       # 数据库服务层
│   ├── commands/           # CLI 命令模块
│   │   └── runCommand.ts   # 运行命令实现
│   ├── reporter/           # 报告生成器
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   └── index.ts            # CLI 主入口
├── scripts/                # 工具脚本
│   ├── migrate.ts          # 数据库迁移脚本
│   ├── verify-tables.ts    # 验证数据库表
│   └── add-test-cases-via-api.ts  # 通过 API 添加测试用例
├── reports/                # 测试报告输出目录
├── package.json
├── tsconfig.json
└── README.md
```

### 目录结构说明

- **core/**: 核心功能模块，包含测试运行和解析的核心逻辑
- **adapters/**: 适配器层，封装外部依赖（AI、MCP等），便于后续扩展其他能力
- **services/**: 服务层，封装业务逻辑，提供统一的测试服务接口
- **server/**: Web API 服务器，提供 RESTful API 接口
- **db/**: 数据库相关，包括配置、迁移和服务层
- **frontend/**: Web UI 前端，基于 Vue 3 + Element Plus
- **commands/**: CLI 命令模块，将命令逻辑与入口文件分离
- **reporter/**: 报告生成模块
- **types/**: 类型定义
- **utils/**: 工具函数
- **scripts/**: 工具脚本，用于数据库迁移和管理

## 工作流程

### CLI 命令行模式

1. **读取测试用例**: 从 `case/` 目录读取 Markdown 格式的测试用例文件
2. **AI 解析**: 使用 GLM-4.5 将自然语言测试步骤转换为 Playwright 操作序列
3. **MCP 执行**: 通过 MCP 协议调用 Playwright 服务器执行浏览器操作
4. **结果收集**: 收集每个操作的执行结果
5. **报告生成**: 生成详细的测试报告（Markdown/JSON）

### Web UI 模式

1. **测试用例管理**: 通过 Web UI 界面创建、编辑、删除测试用例
2. **用例集管理**: 创建测试用例集，关联多个测试用例
3. **执行用例集**: 一键执行用例集中的所有测试用例
4. **查看报告**: 查看执行记录和详细的测试报告
5. **数据持久化**: 所有数据存储在 PostgreSQL 数据库中

## 注意事项

1. **环境变量**: 确保 `.env` 文件已创建并配置正确的 API 密钥和数据库连接
2. **数据库**: 确保 PostgreSQL 数据库已安装并运行，并已执行数据库迁移
3. **Playwright MCP**: 首次运行时会自动通过 `npx` 下载 `@playwright/mcp` 包
4. **网络连接**: 需要网络连接以访问 AI API 和下载 MCP 服务器
5. **浏览器**: 确保已安装 Playwright 浏览器驱动（运行 `npx playwright install`）
6. **端口占用**: 确保端口 3000（后端）和 5174（前端）未被占用

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

## API 文档

详细的 API 文档请参考 [API.md](./API.md)

主要 API 端点：
- `GET /api/v1/test-cases` - 获取所有测试用例
- `POST /api/v1/test-cases` - 创建测试用例
- `GET /api/v1/test-suites` - 获取所有用例集
- `POST /api/v1/test-suites/:suiteId/execute` - 执行用例集
- `GET /api/v1/reports` - 获取所有测试报告

## 数据库

系统使用 PostgreSQL 数据库存储数据，主要数据表：
- `test_cases` - 测试用例表
- `test_reports` - 测试报告表
- `test_results` - 测试结果表
- `test_suites` - 测试用例集表
- `test_suite_executions` - 用例集执行记录表

## 依赖

- Node.js 18+
- TypeScript
- PostgreSQL
- Playwright
- MCP SDK
- OpenAI SDK (兼容 GLM-4.5 API)
- Express.js (Web API)
- Vue 3 (Web UI)
- Element Plus (UI 组件库)

## 许可证

MIT

