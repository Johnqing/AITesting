import { TestCase } from './case.js';
import { ExecutionResult } from '../mcp/playwrightClient.js';

export interface TestResult {
  testCase: TestCase;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  actionResults: ActionResult[];
  error?: string;
}

export interface ActionResult {
  action: {
    type: string;
    description: string;
  };
  result: ExecutionResult;
  timestamp: Date;
}

export interface TestReport {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  startTime: Date;
  endTime: Date;
  results: TestResult[];
}

