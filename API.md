# TestFlow API 接口文档

## 目录

1. [概述](#概述)
2. [类型定义](#类型定义)
3. [核心服务接口](#核心服务接口)
4. [用例解析接口](#用例解析接口)
5. [测试执行接口](#测试执行接口)
6. [AI 转换接口](#ai-转换接口)
7. [报告生成接口](#报告生成接口)
8. [MCP 客户端接口](#mcp-客户端接口)
9. [工具函数接口](#工具函数接口)
10. [CLI 命令接口](#cli-命令接口)

---

## 概述

TestFlow 提供了完整的 TypeScript/JavaScript API，支持程序化调用所有功能。本文档详细描述了所有可用的接口、参数和返回值。

### 使用方式

```typescript
import { TestService } from './services/testService.js';
import { Reporter } from './reporter/reporter.js';
import { CaseParser } from './core/parser/caseParser.js';
```

---

## 类型定义

### TestCase

测试用例数据结构。

```typescript
interface TestCase {
  id: string;                    // 测试用例ID，如 "TC-LOGIN-001"
  title: string;                // 测试用例标题
  module: string;                // 功能模块
  priority: string;              // 优先级，如 "P0", "P1", "P2"
  testType: string;              // 测试类型，如 "功能测试", "性能测试"
  preconditions: string[];       // 前置条件列表
  steps: string[];               // 测试步骤列表
  expectedResults: string[];     // 预期结果列表
  entryUrl?: string;             // 入口URL（可选）
}
```

### CaseFile

测试用例文件数据结构。

```typescript
interface CaseFile {
  filePath: string;              // 文件路径
  module: string;                // 模块说明
  entryUrl?: string;             // 入口URL（可选）
  testCases: TestCase[];         // 测试用例列表
}
```

### TestResult

测试执行结果。

```typescript
interface TestResult {
  testCase: TestCase;            // 测试用例信息
  success: boolean;              // 是否成功
  startTime: Date;              // 开始时间
  endTime: Date;                // 结束时间
  duration: number;             // 耗时（毫秒）
  actionResults: ActionResult[]; // 操作结果列表
  error?: string;               // 错误信息（如有）
}
```

### ActionResult

单个操作执行结果。

```typescript
interface ActionResult {
  action: {
    type: string;               // 操作类型
    description: string;         // 操作描述
  };
  result: ExecutionResult;      // 执行结果
  timestamp: Date;              // 时间戳
}
```

### ExecutionResult

操作执行结果详情。

```typescript
interface ExecutionResult {
  success: boolean;              // 是否成功
  message: string;              // 消息
  error?: string;               // 错误信息（如有）
  screenshot?: string;           // 截图（如有）
}
```

### TestReport

测试报告数据结构。

```typescript
interface TestReport {
  total: number;                // 总用例数
  passed: number;               // 通过数
  failed: number;              // 失败数
  duration: number;             // 总耗时（毫秒）
  startTime: Date;             // 开始时间
  endTime: Date;               // 结束时间
  results: TestResult[];        // 测试结果列表
}
```

### PlaywrightAction

Playwright 操作定义。

```typescript
interface PlaywrightAction {
  type: 'navigate' | 'click' | 'wait' | 'verify' | 'fill' | 'select' | 'screenshot';
  selector?: string;            // CSS选择器或文本内容
  url?: string;                // URL（仅navigate类型）
  text?: string;               // 文本内容
  timeout?: number;            // 超时时间（毫秒）
  expected?: string;           // 预期结果（verify类型）
  description: string;         // 操作描述
}
```

---

## 核心服务接口

### TestService

测试服务类，提供统一的测试执行接口。

#### 构造函数

```typescript
constructor(caseDir: string = 'case')
```

**参数：**
- `caseDir` (string, 可选): 测试用例目录，默认 `'case'`

**示例：**
```typescript
const service = new TestService('case');
```

#### runAll()

运行所有测试用例。

```typescript
async runAll(): Promise<TestResult[]>
```

**返回值：**
- `Promise<TestResult[]>`: 测试结果数组

**示例：**
```typescript
const results = await service.runAll();
console.log(`执行了 ${results.length} 个测试用例`);
```

#### runFile()

运行单个测试用例文件。

```typescript
async runFile(filePath: string): Promise<TestResult[]>
```

**参数：**
- `filePath` (string): 测试用例文件路径

**返回值：**
- `Promise<TestResult[]>`: 测试结果数组

**示例：**
```typescript
const results = await service.runFile('case/05-login.md');
```

#### runTestCase()

运行单个测试用例。

```typescript
async runTestCase(testCase: TestCase, entryUrl?: string): Promise<TestResult>
```

**参数：**
- `testCase` (TestCase): 测试用例对象
- `entryUrl` (string, 可选): 入口URL

**返回值：**
- `Promise<TestResult>`: 测试结果

**示例：**
```typescript
const testCase: TestCase = {
  id: 'TC-TEST-001',
  title: '测试用例',
  module: '测试模块',
  priority: 'P0',
  testType: '功能测试',
  preconditions: [],
  steps: ['步骤1', '步骤2'],
  expectedResults: ['结果1']
};

const result = await service.runTestCase(testCase, 'https://example.com');
console.log(`测试${result.success ? '通过' : '失败'}`);
```

#### runFromString()

解析用例字符串并运行。

```typescript
async runFromString(caseContent: string, entryUrl?: string): Promise<TestResult[]>
```

**参数：**
- `caseContent` (string): 测试用例内容（Markdown格式）
- `entryUrl` (string, 可选): 入口URL

**返回值：**
- `Promise<TestResult[]>`: 测试结果数组

**示例：**
```typescript
const caseContent = `
# 测试模块
## TC-TEST-001: 测试用例
**测试步骤**:
1. 导航到首页
2. 点击登录按钮
`;

const results = await service.runFromString(caseContent, 'https://example.com');
```

#### parseDirectory()

解析目录下所有测试用例文件。

```typescript
async parseDirectory(dirPath?: string): Promise<CaseFile[]>
```

**参数：**
- `dirPath` (string, 可选): 目录路径，默认使用构造函数中的 `caseDir`

**返回值：**
- `Promise<CaseFile[]>`: 用例文件数组

**示例：**
```typescript
const caseFiles = await service.parseDirectory('case');
caseFiles.forEach(file => {
  console.log(`文件: ${file.filePath}, 用例数: ${file.testCases.length}`);
});
```

#### parseFile()

解析单个测试用例文件。

```typescript
async parseFile(filePath: string): Promise<CaseFile>
```

**参数：**
- `filePath` (string): 文件路径

**返回值：**
- `Promise<CaseFile>`: 用例文件对象

**示例：**
```typescript
const caseFile = await service.parseFile('case/05-login.md');
console.log(`模块: ${caseFile.module}`);
console.log(`用例数: ${caseFile.testCases.length}`);
```

---

## 用例解析接口

### CaseParser

测试用例解析器，支持 AI 和正则两种解析方式。

#### 构造函数

```typescript
constructor(caseDir: string = 'case', useAI: boolean = true)
```

**参数：**
- `caseDir` (string, 可选): 测试用例目录，默认 `'case'`
- `useAI` (boolean, 可选): 是否使用AI解析，默认 `true`

**示例：**
```typescript
// 使用AI解析
const parser = new CaseParser('case', true);

// 使用正则解析
const parser = new CaseParser('case', false);
```

#### parseFile()

解析单个测试用例文件。

```typescript
async parseFile(filePath: string): Promise<CaseFile>
```

**参数：**
- `filePath` (string): 文件路径

**返回值：**
- `Promise<CaseFile>`: 用例文件对象

**示例：**
```typescript
const caseFile = await parser.parseFile('case/05-login.md');
```

#### parseFileContent()

解析用例字符串内容（不依赖文件系统）。

```typescript
async parseFileContent(content: string, virtualFilePath?: string): Promise<CaseFile>
```

**参数：**
- `content` (string): 测试用例内容（Markdown格式）
- `virtualFilePath` (string, 可选): 虚拟文件路径，默认 `'inline-case.md'`

**返回值：**
- `Promise<CaseFile>`: 用例文件对象

**示例：**
```typescript
const content = `# 测试模块
## TC-TEST-001: 测试用例
**测试步骤**: 1. 步骤1
`;

const caseFile = await parser.parseFileContent(content);
```

#### parseDirectory()

解析目录下所有测试用例文件。

```typescript
async parseDirectory(dirPath?: string): Promise<CaseFile[]>
```

**参数：**
- `dirPath` (string, 可选): 目录路径，默认使用构造函数中的 `caseDir`

**返回值：**
- `Promise<CaseFile[]>`: 用例文件数组

**示例：**
```typescript
const caseFiles = await parser.parseDirectory('case');
```

---

## 测试执行接口

### TestRunner

测试运行器，负责执行测试用例。

#### 构造函数

```typescript
constructor(caseDir?: string)
```

**参数：**
- `caseDir` (string, 可选): 测试用例目录（已废弃，使用 setCaseParser）

**示例：**
```typescript
const runner = new TestRunner();
```

#### setCaseParser()

设置用例解析器。

```typescript
setCaseParser(parser: CaseParser): void
```

**参数：**
- `parser` (CaseParser): 用例解析器实例

**示例：**
```typescript
const parser = new CaseParser('case');
const runner = new TestRunner();
runner.setCaseParser(parser);
```

#### runAll()

运行所有测试用例。

```typescript
async runAll(): Promise<TestResult[]>
```

**返回值：**
- `Promise<TestResult[]>`: 测试结果数组

**注意：** 需要先调用 `setCaseParser()` 设置解析器。

**示例：**
```typescript
const results = await runner.runAll();
```

#### runFile()

运行单个测试用例文件。

```typescript
async runFile(filePath: string): Promise<TestResult[]>
```

**参数：**
- `filePath` (string): 测试用例文件路径

**返回值：**
- `Promise<TestResult[]>`: 测试结果数组

**注意：** 需要先调用 `setCaseParser()` 设置解析器。

**示例：**
```typescript
const results = await runner.runFile('case/05-login.md');
```

#### runTestCase()

运行单个测试用例。

```typescript
async runTestCase(testCase: TestCase, entryUrl?: string): Promise<TestResult>
```

**参数：**
- `testCase` (TestCase): 测试用例对象
- `entryUrl` (string, 可选): 入口URL

**返回值：**
- `Promise<TestResult>`: 测试结果

**注意：** 此方法不管理连接生命周期，由调用方负责。

**示例：**
```typescript
const result = await runner.runTestCase(testCase, 'https://example.com');
```

---

## AI 转换接口

### AIClient

AI 客户端，负责将测试用例转换为 Playwright 操作序列。

#### 构造函数

```typescript
constructor()
```

**环境变量要求：**
- `API_KEY`: AI API 密钥
- `BASE_URL`: AI API 基础URL
- `DEFAULT_MODEL`: 默认模型名称（默认：'glm-4.5'）

**示例：**
```typescript
const aiClient = new AIClient();
```

#### convertTestCaseToActions()

将测试用例转换为 Playwright 操作序列。

```typescript
async convertTestCaseToActions(testCase: TestCase): Promise<PlaywrightAction[]>
```

**参数：**
- `testCase` (TestCase): 测试用例对象

**返回值：**
- `Promise<PlaywrightAction[]>`: Playwright 操作序列

**示例：**
```typescript
const actions = await aiClient.convertTestCaseToActions(testCase);
console.log(`生成了 ${actions.length} 个操作`);
actions.forEach(action => {
  console.log(`${action.type}: ${action.description}`);
});
```

---

## 报告生成接口

### Reporter

报告生成器，负责生成和保存测试报告。

#### 构造函数

```typescript
constructor(outputDir: string = 'reports')
```

**参数：**
- `outputDir` (string, 可选): 输出目录，默认 `'reports'`

**示例：**
```typescript
const reporter = new Reporter('reports');
```

#### generateReport()

生成测试报告对象。

```typescript
generateReport(results: TestResult[]): TestReport
```

**参数：**
- `results` (TestResult[]): 测试结果数组

**返回值：**
- `TestReport`: 测试报告对象

**示例：**
```typescript
const report = reporter.generateReport(results);
console.log(`总计: ${report.total}, 通过: ${report.passed}, 失败: ${report.failed}`);
```

#### generateMarkdownReport()

生成 Markdown 格式报告。

```typescript
generateMarkdownReport(report: TestReport): string
```

**参数：**
- `report` (TestReport): 测试报告对象

**返回值：**
- `string`: Markdown 格式的报告内容

**示例：**
```typescript
const markdown = reporter.generateMarkdownReport(report);
console.log(markdown);
```

#### generateJSONReport()

生成 JSON 格式报告。

```typescript
generateJSONReport(report: TestReport): string
```

**参数：**
- `report` (TestReport): 测试报告对象

**返回值：**
- `string`: JSON 格式的报告内容

**示例：**
```typescript
const json = reporter.generateJSONReport(report);
const reportData = JSON.parse(json);
```

#### saveReport()

保存报告到文件。

```typescript
saveReport(report: TestReport, format?: 'markdown' | 'json' | 'both'): void
```

**参数：**
- `report` (TestReport): 测试报告对象
- `format` ('markdown' | 'json' | 'both', 可选): 报告格式，默认 `'both'`

**示例：**
```typescript
// 保存两种格式
reporter.saveReport(report, 'both');

// 只保存 Markdown
reporter.saveReport(report, 'markdown');

// 只保存 JSON
reporter.saveReport(report, 'json');
```

#### printSummary()

在控制台输出报告摘要。

```typescript
printSummary(report: TestReport): void
```

**参数：**
- `report` (TestReport): 测试报告对象

**示例：**
```typescript
reporter.printSummary(report);
```

---

## MCP 客户端接口

### PlaywrightMCPClient

Playwright MCP 客户端，负责执行浏览器操作。

#### 构造函数

```typescript
constructor(headless?: boolean)
```

**参数：**
- `headless` (boolean, 可选): 是否无头模式，默认 `false`

**示例：**
```typescript
// 有头模式（显示浏览器）
const client = new PlaywrightMCPClient(false);

// 无头模式（不显示浏览器）
const client = new PlaywrightMCPClient(true);
```

#### connect()

连接到 Playwright MCP 服务器。

```typescript
async connect(): Promise<void>
```

**示例：**
```typescript
await client.connect();
```

#### disconnect()

断开连接。

```typescript
async disconnect(): Promise<void>
```

**示例：**
```typescript
await client.disconnect();
```

#### executeAction()

执行 Playwright 操作。

```typescript
async executeAction(action: PlaywrightAction): Promise<ExecutionResult>
```

**参数：**
- `action` (PlaywrightAction): Playwright 操作对象

**返回值：**
- `Promise<ExecutionResult>`: 执行结果

**示例：**
```typescript
const action: PlaywrightAction = {
  type: 'navigate',
  url: 'https://example.com',
  description: '导航到首页'
};

const result = await client.executeAction(action);
if (result.success) {
  console.log(result.message);
} else {
  console.error(result.error);
}
```

---

## 工具函数接口

### Logger

日志工具类。

#### createLogger()

创建日志实例。

```typescript
function createLogger(module: string, level?: LogLevel): Logger
```

**参数：**
- `module` (string): 模块名称
- `level` (LogLevel, 可选): 日志级别

**返回值：**
- `Logger`: 日志实例

**示例：**
```typescript
const logger = createLogger('MyModule');
logger.info('信息');
logger.error('错误', error);
```

#### Logger 方法

```typescript
class Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error | any, ...args: any[]): void;
  start(method: string, params?: Record<string, any>): void;
  end(method: string, result?: any, duration?: number): void;
}
```

### validateEnv()

验证环境变量。

```typescript
function validateEnv(): void
```

**抛出错误：** 如果缺少必需的环境变量

**示例：**
```typescript
try {
  validateEnv();
  console.log('环境变量验证通过');
} catch (error) {
  console.error('环境变量验证失败:', error.message);
}
```

### 日期格式化函数

```typescript
function formatDateTime(date: Date): string
function formatDateTimeForFilename(): string
```

**示例：**
```typescript
const formatted = formatDateTime(new Date());
const filename = formatDateTimeForFilename();
```

---

## CLI 命令接口

### runAllCommand()

运行所有测试用例命令。

```typescript
async function runAllCommand(options: {
  caseDir: string;
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void>
```

**参数：**
- `options.caseDir` (string): 测试用例目录
- `options.outputDir` (string): 输出目录
- `options.format` ('markdown' | 'json' | 'both'): 报告格式

**示例：**
```typescript
await runAllCommand({
  caseDir: 'case',
  outputDir: 'reports',
  format: 'both'
});
```

### runFileCommand()

运行单个测试用例文件命令。

```typescript
async function runFileCommand(file: string, options: {
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void>
```

**参数：**
- `file` (string): 测试用例文件路径
- `options.outputDir` (string): 输出目录
- `options.format` ('markdown' | 'json' | 'both'): 报告格式

**示例：**
```typescript
await runFileCommand('case/05-login.md', {
  outputDir: 'reports',
  format: 'both'
});
```

### runStringCommand()

运行用例字符串命令。

```typescript
async function runStringCommand(caseContent: string, options: {
  entryUrl?: string;
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void>
```

**参数：**
- `caseContent` (string): 测试用例内容（Markdown格式）
- `options.entryUrl` (string, 可选): 入口URL
- `options.outputDir` (string): 输出目录
- `options.format` ('markdown' | 'json' | 'both'): 报告格式

**示例：**
```typescript
const content = `# 测试模块
## TC-TEST-001: 测试用例
**测试步骤**: 1. 步骤1
`;

await runStringCommand(content, {
  entryUrl: 'https://example.com',
  outputDir: 'reports',
  format: 'both'
});
```

---

## 完整使用示例

### 示例 1: 运行所有测试用例

```typescript
import { TestService } from './services/testService.js';
import { Reporter } from './reporter/reporter.js';

async function runAllTests() {
  const service = new TestService('case');
  const results = await service.runAll();
  
  const reporter = new Reporter('reports');
  const report = reporter.generateReport(results);
  
  reporter.printSummary(report);
  reporter.saveReport(report, 'both');
  
  return report.failed === 0;
}
```

### 示例 2: 运行单个测试用例文件

```typescript
import { TestService } from './services/testService.js';
import { Reporter } from './reporter/reporter.js';

async function runSingleFile(filePath: string) {
  const service = new TestService();
  const results = await service.runFile(filePath);
  
  const reporter = new Reporter('reports');
  const report = reporter.generateReport(results);
  
  return report;
}
```

### 示例 3: 解析并运行用例字符串

```typescript
import { TestService } from './services/testService.js';

async function runFromString() {
  const service = new TestService();
  
  const caseContent = `
# 登录模块测试用例
## TC-LOGIN-001: 登录功能测试
**测试步骤**:
1. 导航到登录页面
2. 输入用户名
3. 输入密码
4. 点击登录按钮
**预期结果**:
- 成功登录
  `;
  
  const results = await service.runFromString(
    caseContent,
    'https://example.com/login'
  );
  
  return results;
}
```

### 示例 4: 自定义测试执行流程

```typescript
import { CaseParser } from './core/parser/caseParser.js';
import { TestRunner } from './core/runner/testRunner.js';
import { PlaywrightMCPClient } from './adapters/mcp/playwrightClient.js';
import { AIClient } from './adapters/ai/aiClient.js';

async function customTestFlow() {
  // 1. 解析用例
  const parser = new CaseParser('case');
  const caseFile = await parser.parseFile('case/05-login.md');
  
  // 2. 连接浏览器
  const playwrightClient = new PlaywrightMCPClient(false);
  await playwrightClient.connect();
  
  try {
    // 3. 转换用例为操作
    const aiClient = new AIClient();
    const testCase = caseFile.testCases[0];
    const actions = await aiClient.convertTestCaseToActions(testCase);
    
    // 4. 执行操作
    for (const action of actions) {
      const result = await playwrightClient.executeAction(action);
      console.log(`${action.type}: ${result.success ? '成功' : '失败'}`);
    }
  } finally {
    // 5. 断开连接
    await playwrightClient.disconnect();
  }
}
```

### 示例 5: 批量处理多个测试用例

```typescript
import { TestService } from './services/testService.js';
import { Reporter } from './reporter/reporter.js';

async function batchProcess() {
  const service = new TestService('case');
  
  // 解析所有用例文件
  const caseFiles = await service.parseDirectory();
  
  const allResults = [];
  
  // 逐个执行
  for (const caseFile of caseFiles) {
    console.log(`处理文件: ${caseFile.filePath}`);
    
    for (const testCase of caseFile.testCases) {
      const result = await service.runTestCase(
        testCase,
        caseFile.entryUrl
      );
      allResults.push(result);
    }
  }
  
  // 生成报告
  const reporter = new Reporter('reports');
  const report = reporter.generateReport(allResults);
  reporter.saveReport(report, 'both');
  
  return report;
}
```

---

## 错误处理

### 常见错误类型

1. **环境变量缺失**
   ```typescript
   Error: Missing required environment variables: API_KEY, BASE_URL
   ```

2. **文件不存在**
   ```typescript
   Error: ENOENT: no such file or directory
   ```

3. **MCP 连接失败**
   ```typescript
   McpError: MCP error -32000: Connection closed
   ```

4. **AI API 调用失败**
   ```typescript
   Error: API request failed
   ```

### 错误处理示例

```typescript
import { TestService } from './services/testService.js';

async function runWithErrorHandling() {
  try {
    const service = new TestService('case');
    const results = await service.runAll();
    return results;
  } catch (error) {
    if (error instanceof Error) {
      console.error('测试执行失败:', error.message);
      console.error('错误堆栈:', error.stack);
    } else {
      console.error('未知错误:', error);
    }
    throw error;
  }
}
```

---

## 性能优化建议

1. **复用连接**: 批量执行时复用 PlaywrightMCPClient 连接
2. **并行执行**: 可以并行执行多个独立的测试用例
3. **缓存解析结果**: 对于相同的用例文件，可以缓存解析结果
4. **异步处理**: 使用 async/await 避免阻塞

---

## 版本信息

- **API 版本**: 1.0.0
- **文档版本**: 1.0.0
- **最后更新**: 2024-12-12

---

## 相关文档

- [产品需求文档 (PRD)](./PRD.md)
- [README](./README.md)
- [类型定义](./src/types/)

