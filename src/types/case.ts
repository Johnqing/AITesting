export interface TestCase {
  id: string;
  title: string;
  module: string;
  priority: string;
  testType: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  entryUrl?: string;
  // 新增字段
  system?: string;        // 测试系统
  testObjective?: string; // 测试目的
}

export interface CaseFile {
  filePath: string;
  module: string;
  entryUrl?: string;
  testCases: TestCase[];
}

// 测试用例集
export interface TestSuite {
  id: string;
  suiteId: string;
  name: string;
  description?: string;
  system?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  testCases?: TestCase[];
}

// 用例集执行记录
export interface TestSuiteExecution {
  id: string;
  suiteId: string;
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  createdBy?: string;
  createdAt?: Date;
  results?: TestSuiteExecutionResult[];
}

// 用例集执行结果（单个用例）
export interface TestSuiteExecutionResult {
  id: string;
  executionId: string;
  testCaseId: string;
  testResultId?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  testCase?: TestCase;
  testResult?: any; // TestResult 类型
}

