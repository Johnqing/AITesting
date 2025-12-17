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
  system?: string;               // 环境（生产环境/预发布环境/测试环境）（可选）
  testObjective?: string;        // 测试目的（可选）
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
  expectedResultsCheck?: ExpectedResultCheck[]; // 预期结果检查列表（可选）
  summary?: {                    // 执行摘要（可选）
    totalActions: number;       // 总操作数
    passedActions: number;       // 通过操作数
    failedActions: number;       // 失败操作数
    totalExpectedResults: number; // 总预期结果数
    matchedExpectedResults: number; // 匹配的预期结果数
    unmatchedExpectedResults: number; // 未匹配的预期结果数
  };
}
```

### ActionResult

单个操作执行结果。

```typescript
interface ActionResult {
  action: {
    type: string;               // 操作类型
    description: string;         // 操作描述
    selector?: string;          // 选择器（可选）
    url?: string;                // URL（可选）
    text?: string;               // 文本内容（可选）
    timeout?: number;            // 超时时间（可选）
    expected?: string;           // 预期结果（可选）
  };
  result: ExecutionResult;      // 执行结果
  timestamp: Date;              // 时间戳
  duration?: number;            // 操作耗时（毫秒，可选）
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

### ExpectedResultCheck

预期结果检查结果。

```typescript
interface ExpectedResultCheck {
  expected: string;             // 预期结果描述
  actual: string;               // 实际结果
  matched: boolean;             // 是否匹配
  matchType: 'exact' | 'partial' | 'contains' | 'not_matched'; // 匹配类型
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

**转换规则**：
- 优先使用文本选择器：对于 fill 和 click 操作，使用页面上的可见文本内容（如标签文本"账号"、"密码"，或按钮文本"登录"），而不是 CSS 选择器
- 系统会通过页面快照匹配元素，所以 selector 必须是页面上实际显示的文本内容
- 例如：填写账号输入框时，使用 selector: "账号" 而不是 selector: "input[placeholder='请输入账号']"

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

## Web API 接口

### 健康检查接口

#### GET /health

健康状态检查接口。

**响应示例**：
```json
{
  "status": "ok",
  "timestamp": "2024-12-17T10:23:49.000Z"
}
```

#### GET /api/v1/info

API 信息接口。

**响应示例**：
```json
{
  "name": "TestFlow API",
  "version": "1.0.0",
  "description": "AI-driven Playwright automation testing system API"
}
```

### 测试用例管理接口

#### GET /api/v1/test-cases

获取所有测试用例。

**查询参数**（可选）：
- `system` (string): 环境筛选（生产环境/预发布环境/测试环境）
- `module` (string): 模块筛选
- `priority` (string): 优先级筛选（P0/P1/P2）

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "caseId": "TC-LOGIN-001",
      "title": "登录功能测试",
      "module": "登录模块",
      "priority": "P0",
      "testType": "功能测试",
      "entryUrl": "https://example.com/login",
      "system": "测试环境",
      "testObjective": "验证用户登录功能",
      "preconditions": ["条件1", "条件2"],
      "steps": ["步骤1", "步骤2"],
      "expectedResults": ["结果1", "结果2"],
      "createdAt": "2024-12-17T10:00:00.000Z",
      "updatedAt": "2024-12-17T10:00:00.000Z"
    }
  ]
}
```

#### GET /api/v1/test-cases/:caseId

获取单个测试用例。

**路径参数**：
- `caseId` (string): 测试用例ID

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caseId": "TC-LOGIN-001",
    "title": "登录功能测试",
    "module": "登录模块",
    "priority": "P0",
    "testType": "功能测试",
    "entryUrl": "https://example.com/login",
    "system": "测试环境",
    "testObjective": "验证用户登录功能",
    "preconditions": ["条件1", "条件2"],
    "steps": ["步骤1", "步骤2"],
    "expectedResults": ["结果1", "结果2"],
    "createdAt": "2024-12-17T10:00:00.000Z",
    "updatedAt": "2024-12-17T10:00:00.000Z"
  }
}
```

#### POST /api/v1/test-cases

创建测试用例。

**请求体**：
```json
{
  "title": "登录功能测试",
  "module": "登录模块",
  "priority": "P0",
  "testType": "功能测试",
  "entryUrl": "https://example.com/login",
  "system": "测试环境",
  "testObjective": "验证用户登录功能",
  "preconditions": ["条件1", "条件2"],
  "steps": ["步骤1", "步骤2"],
  "expectedResults": ["结果1", "结果2"]
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caseId": "TC-LOGIN-001",
    "title": "登录功能测试",
    ...
  }
}
```

#### PUT /api/v1/test-cases/:caseId

更新测试用例。

**路径参数**：
- `caseId` (string): 测试用例ID

**请求体**：同 POST /api/v1/test-cases

**响应示例**：同 POST /api/v1/test-cases

#### DELETE /api/v1/test-cases/:caseId

删除测试用例。

**路径参数**：
- `caseId` (string): 测试用例ID

**响应示例**：
```json
{
  "success": true,
  "message": "测试用例已删除"
}
```

### 测试用例集管理接口

#### GET /api/v1/test-suites

获取所有用例集。

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "suiteId": "SUITE-001",
      "name": "登录功能测试集",
      "description": "包含所有登录相关的测试用例",
      "system": "测试环境",
      "createdBy": "admin",
      "testCases": [
        {
          "id": "uuid",
          "caseId": "TC-LOGIN-001",
          "title": "登录功能测试",
          ...
        }
      ],
      "createdAt": "2024-12-17T10:00:00.000Z",
      "updatedAt": "2024-12-17T10:00:00.000Z"
    }
  ]
}
```

#### GET /api/v1/test-suites/:suiteId

获取单个用例集。

**路径参数**：
- `suiteId` (string): 用例集ID

**响应示例**：同 GET /api/v1/test-suites（单个对象）

#### POST /api/v1/test-suites

创建用例集。

**请求体**：
```json
{
  "name": "登录功能测试集",
  "description": "包含所有登录相关的测试用例",
  "system": "测试环境",
  "createdBy": "admin",
  "testCaseIds": ["uuid1", "uuid2"]
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "suiteId": "SUITE-001",
    "name": "登录功能测试集",
    ...
  }
}
```

#### PUT /api/v1/test-suites/:suiteId

更新用例集。

**路径参数**：
- `suiteId` (string): 用例集ID

**请求体**：同 POST /api/v1/test-suites

**响应示例**：同 POST /api/v1/test-suites

#### DELETE /api/v1/test-suites/:suiteId

删除用例集。

**路径参数**：
- `suiteId` (string): 用例集ID

**响应示例**：
```json
{
  "success": true,
  "message": "用例集已删除"
}
```

#### POST /api/v1/test-suites/:suiteId/execute

执行用例集。

**路径参数**：
- `suiteId` (string): 用例集ID

**响应示例**：
```json
{
  "success": true,
  "data": {
    "executionId": "EXEC-001",
    "suiteId": "SUITE-001",
    "status": "running",
    "startTime": "2024-12-17T10:00:00.000Z"
  }
}
```

#### GET /api/v1/test-suites/:suiteId/executions

获取用例集执行记录。

**路径参数**：
- `suiteId` (string): 用例集ID

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "executionId": "EXEC-001",
      "suiteId": "SUITE-001",
      "status": "completed",
      "startTime": "2024-12-17T10:00:00.000Z",
      "endTime": "2024-12-17T10:05:00.000Z",
      "duration": 300000,
      "totalCases": 10,
      "passedCases": 8,
      "failedCases": 2
    }
  ]
}
```

#### GET /api/v1/executions/:executionId

获取执行详情。

**路径参数**：
- `executionId` (string): 执行ID

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "executionId": "EXEC-001",
    "suiteId": "SUITE-001",
    "status": "completed",
    "startTime": "2024-12-17T10:00:00.000Z",
    "endTime": "2024-12-17T10:05:00.000Z",
    "duration": 300000,
    "totalCases": 10,
    "passedCases": 8,
    "failedCases": 2,
    "results": [
      {
        "testCase": {
          "id": "uuid",
          "caseId": "TC-LOGIN-001",
          "title": "登录功能测试"
        },
        "status": "success",
        "startTime": "2024-12-17T10:00:00.000Z",
        "endTime": "2024-12-17T10:01:00.000Z",
        "duration": 60000
      }
    ]
  }
}
```

### 测试报告管理接口

#### GET /api/v1/reports

获取所有测试报告。

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "reportId": "REPORT-20241217-100000",
      "total": 10,
      "passed": 8,
      "failed": 2,
      "duration": 300000,
      "startTime": "2024-12-17T10:00:00.000Z",
      "endTime": "2024-12-17T10:05:00.000Z",
      "createdAt": "2024-12-17T10:05:00.000Z"
    }
  ]
}
```

#### GET /api/v1/reports/:reportId

获取单个测试报告。

**路径参数**：
- `reportId` (string): 报告ID

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "reportId": "REPORT-20241217-100000",
    "total": 10,
    "passed": 8,
    "failed": 2,
    "duration": 300000,
    "startTime": "2024-12-17T10:00:00.000Z",
    "endTime": "2024-12-17T10:05:00.000Z",
    "summary": {
      "totalActions": 50,
      "passedActions": 45,
      "failedActions": 5,
      "totalExpectedResults": 20,
      "matchedExpectedResults": 18,
      "unmatchedExpectedResults": 2
    },
    "results": [
      {
        "testCase": {
          "id": "uuid",
          "caseId": "TC-LOGIN-001",
          "title": "登录功能测试"
        },
        "success": true,
        "startTime": "2024-12-17T10:00:00.000Z",
        "endTime": "2024-12-17T10:01:00.000Z",
        "duration": 60000,
        "actionResults": [...],
        "expectedResultsCheck": [...]
      }
    ]
  }
}
```

### 用例解析接口

#### POST /api/v1/parse/file

解析测试用例文件（支持 .md 和 .xmind）。

**请求体**：
```json
{
  "filePath": "case/05-login.md",
  "caseDir": "case"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "filePath": "case/05-login.md",
    "module": "登录模块",
    "entryUrl": "https://example.com/login",
    "testCases": [
      {
        "id": "TC-LOGIN-001",
        "title": "登录功能测试",
        "module": "登录模块",
        "priority": "P0",
        "testType": "功能测试",
        "preconditions": ["条件1"],
        "steps": ["步骤1", "步骤2"],
        "expectedResults": ["结果1"],
        "entryUrl": "https://example.com/login"
      }
    ]
  }
}
```

#### POST /api/v1/parse/string

解析测试用例字符串。

**请求体**：
```json
{
  "content": "# 测试模块\n## TC-TEST-001: 测试用例\n**测试步骤**: 1. 步骤1",
  "virtualFilePath": "inline-case.md"
}
```

**响应示例**：同 POST /api/v1/parse/file

#### POST /api/v1/parse/directory

解析目录。

**请求体**：
```json
{
  "dirPath": "case"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "filePath": "case/05-login.md",
      "module": "登录模块",
      "entryUrl": "https://example.com/login",
      "testCases": [...]
    }
  ]
}
```

#### POST /api/v1/parse/xmind

上传并解析 XMind 文件（multipart/form-data）。

**请求格式**：multipart/form-data

**表单字段**：
- `file` (File): XMind 文件（.xmind）

**响应示例**：
```json
{
  "success": true,
  "data": {
    "filePath": "uploaded.xmind",
    "module": "测试模块",
    "testCases": [
      {
        "id": "TC-TEST-001",
        "title": "测试用例1",
        ...
      }
    ]
  }
}
```

### 测试执行接口

#### POST /api/v1/run/all

运行所有测试用例。

**请求体**：
```json
{
  "caseDir": "case",
  "outputDir": "reports",
  "format": "both"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "report": {
      "total": 10,
      "passed": 8,
      "failed": 2,
      "duration": 300000,
      "startTime": "2024-12-17T10:00:00.000Z",
      "endTime": "2024-12-17T10:05:00.000Z",
      "passRate": "80.00%"
    },
    "results": [...]
  }
}
```

#### POST /api/v1/run/file

运行单个测试用例文件。

**请求体**：
```json
{
  "filePath": "case/05-login.md",
  "outputDir": "reports",
  "format": "both"
}
```

**响应示例**：同 POST /api/v1/run/all

#### POST /api/v1/run/testcase

运行单个测试用例对象。

**请求体**：
```json
{
  "testCase": {
    "id": "TC-LOGIN-001",
    "title": "登录功能测试",
    "module": "登录模块",
    "priority": "P0",
    "testType": "功能测试",
    "steps": ["步骤1", "步骤2"],
    "expectedResults": ["结果1"]
  },
  "entryUrl": "https://example.com/login"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "testCase": {
      "id": "TC-LOGIN-001",
      "title": "登录功能测试"
    },
    "success": true,
    "duration": 60000,
    "startTime": "2024-12-17T10:00:00.000Z",
    "endTime": "2024-12-17T10:01:00.000Z",
    "actionResults": [...]
  }
}
```

#### POST /api/v1/run/string

运行用例字符串。

**请求体**：
```json
{
  "content": "# 测试模块\n## TC-TEST-001: 测试用例\n**测试步骤**: 1. 步骤1",
  "entryUrl": "https://example.com",
  "outputDir": "reports",
  "format": "both"
}
```

**响应示例**：同 POST /api/v1/run/all

### PRD 管理接口

#### GET /api/v1/prds

获取所有 PRD。

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "prdId": "PRD-001",
      "title": "登录功能需求文档",
      "description": "描述",
      "version": "1.0.0",
      "status": "draft",
      "author": "admin",
      "createdAt": "2024-12-17T10:00:00.000Z",
      "updatedAt": "2024-12-17T10:00:00.000Z"
    }
  ]
}
```

#### GET /api/v1/prds/:prdId

获取单个 PRD。

**路径参数**：
- `prdId` (string): PRD ID

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "prdId": "PRD-001",
    "title": "登录功能需求文档",
    "description": "描述",
    "content": "# PRD 内容...",
    "version": "1.0.0",
    "status": "draft",
    "author": "admin",
    "createdAt": "2024-12-17T10:00:00.000Z",
    "updatedAt": "2024-12-17T10:00:00.000Z"
  }
}
```

#### POST /api/v1/prds

创建或更新 PRD。

**请求体**：
```json
{
  "title": "登录功能需求文档",
  "description": "描述",
  "content": "# PRD 内容...",
  "version": "1.0.0",
  "status": "draft",
  "author": "admin",
  "prdId": "PRD-001"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "prdId": "PRD-001",
    "title": "登录功能需求文档",
    ...
  }
}
```

#### PUT /api/v1/prds/:prdId

更新 PRD。

**路径参数**：
- `prdId` (string): PRD ID

**请求体**：同 POST /api/v1/prds

**响应示例**：同 POST /api/v1/prds

#### DELETE /api/v1/prds/:prdId

删除 PRD。

**路径参数**：
- `prdId` (string): PRD ID

**响应示例**：
```json
{
  "success": true,
  "message": "PRD 已删除"
}
```

#### POST /api/v1/prds/upload

上传 PRD 文件（multipart/form-data）。

**请求格式**：multipart/form-data

**表单字段**：
- `file` (File): PRD 文件（.md）

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "prdId": "PRD-001",
    "title": "登录功能需求文档",
    ...
  }
}
```

#### POST /api/v1/prds/:prdId/generate-test-cases

从 PRD 生成测试用例。

**路径参数**：
- `prdId` (string): PRD ID

**请求体**（可选）：
```json
{
  "saveToDatabase": true
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "prdId": "PRD-001",
    "testCases": [
      {
        "id": "TC-LOGIN-001",
        "title": "登录功能测试",
        "module": "登录模块",
        "priority": "P0",
        "testType": "功能测试",
        ...
      }
    ],
    "count": 10
  }
}
```

#### GET /api/v1/prds/:prdId/test-cases

获取 PRD 生成的测试用例。

**路径参数**：
- `prdId` (string): PRD ID

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "caseId": "TC-LOGIN-001",
      "title": "登录功能测试",
      "module": "登录模块",
      "priority": "P0",
      "testType": "功能测试",
      "status": "draft",
      ...
    }
  ]
}
```

### 错误响应格式

所有接口在发生错误时返回以下格式：

```json
{
  "success": false,
  "error": "错误信息描述"
}
```

**HTTP 状态码**：
- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

---

## MCP 客户端接口

### PlaywrightMCPClient

Playwright MCP 客户端，负责执行浏览器操作。

**默认配置**：
- 默认移除用户缓存，每次测试运行在全新的浏览器上下文中
- 使用无痕模式，不保留缓存、Cookie 和本地存储

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

**FillAction 智能匹配**：
- 支持多种 selector 格式：纯文本（如"账号"）、包含"输入框"的文本（如"账号输入框"）、placeholder 格式、id 格式
- 自动提取关键词：如"账号输入框"会自动提取为"账号"
- 支持多种匹配策略：
  - 完全匹配（标准化后）
  - 元素文本包含搜索文本
  - 搜索文本包含元素文本
  - 原始文本包含匹配
  - 关键词匹配（提取关键词后匹配）
- 自动移除特殊字符（如 `*`）进行匹配

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

