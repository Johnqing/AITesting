import { TestCase } from './case.js';
import { ExecutionResult } from '../adapters/mcp/playwrightClient.js';

export interface ExpectedResultCheck {
  expected: string;           // 预期结果描述
  actual: string;             // 实际结果
  matched: boolean;           // 是否匹配
  matchType: 'exact' | 'partial' | 'contains' | 'not_matched'; // 匹配类型
}

export interface TestResult {
  testCase: TestCase;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  actionResults: ActionResult[];
  error?: string;
  expectedResultsCheck?: ExpectedResultCheck[]; // 预期结果检查
  summary?: {
    totalActions: number;
    passedActions: number;
    failedActions: number;
    totalExpectedResults: number;
    matchedExpectedResults: number;
    unmatchedExpectedResults: number;
  };
}

export interface ActionResult {
  action: {
    type: string;
    description: string;
    selector?: string;
    url?: string;
    text?: string;
    timeout?: number;
    expected?: string;
  };
  result: ExecutionResult;
  timestamp: Date;
  duration?: number; // 操作耗时（毫秒）
}

export interface TestReportSummary {
  totalActions: number;
  passedActions: number;
  failedActions: number;
  totalExpectedResults: number;
  matchedExpectedResults: number;
  unmatchedExpectedResults: number;
}

export interface TestReport {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  startTime: Date;
  endTime: Date;
  results: TestResult[];
  summary?: TestReportSummary;
}

