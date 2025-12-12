import { CaseParser } from '../parser/caseParser.js';
import { AIClient, PlaywrightAction } from '../../adapters/ai/aiClient.js';
import { PlaywrightMCPClient } from '../../adapters/mcp/playwrightClient.js';
import { TestCase, CaseFile } from '../../types/case.js';
import { TestResult, ActionResult } from '../../types/result.js';

export class TestRunner {
  private caseParser?: CaseParser;
  private aiClient: AIClient;
  private playwrightClient: PlaywrightMCPClient;

  constructor(caseDir?: string) {
    // TestRunner 不再直接管理 CaseParser，由调用方传入用例
    this.aiClient = new AIClient();
    this.playwrightClient = new PlaywrightMCPClient();
  }

  /**
   * 设置用例解析器（用于 runAll 和 runFile）
   */
  setCaseParser(parser: CaseParser): void {
    this.caseParser = parser;
  }

  /**
   * 运行所有测试用例
   */
  async runAll(): Promise<TestResult[]> {
    if (!this.caseParser) {
      throw new Error('CaseParser not set. Call setCaseParser() first or use runTestCase() directly.');
    }
    const caseFiles = await this.caseParser.parseDirectory();
    const results: TestResult[] = [];

    // 连接到 Playwright MCP 服务器
    await this.playwrightClient.connect();

    try {
      for (const caseFile of caseFiles) {
        for (const testCase of caseFile.testCases) {
          const result = await this.runTestCase(testCase, caseFile.entryUrl);
          results.push(result);
        }
      }
    } finally {
      // 断开连接
      await this.playwrightClient.disconnect();
    }

    return results;
  }

  /**
   * 运行单个测试用例文件
   */
  async runFile(filePath: string): Promise<TestResult[]> {
    if (!this.caseParser) {
      throw new Error('CaseParser not set. Call setCaseParser() first or use runTestCase() directly.');
    }
    const caseFile = await this.caseParser.parseFile(filePath);
    const results: TestResult[] = [];

    // 连接到 Playwright MCP 服务器
    await this.playwrightClient.connect();

    try {
      for (const testCase of caseFile.testCases) {
        const result = await this.runTestCase(testCase, caseFile.entryUrl);
        results.push(result);
      }
    } finally {
      // 断开连接
      await this.playwrightClient.disconnect();
    }

    return results;
  }

  /**
   * 运行单个测试用例（不需要连接管理，由调用方负责）
   */
  async runTestCase(testCase: TestCase, entryUrl?: string): Promise<TestResult> {
    const startTime = new Date();
    const actionResults: ActionResult[] = [];

    try {
      console.log(`\nRunning test case: ${testCase.id} - ${testCase.title}`);

      // 使用 AI 将测试用例转换为操作序列
      let actions: PlaywrightAction[];
      try {
        actions = await this.aiClient.convertTestCaseToActions(testCase);
        console.log(`Generated ${actions.length} actions from AI`);
      } catch (error) {
        throw new Error(`Failed to convert test case to actions: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 如果有入口URL，且第一个操作不是导航，则先导航
      if (entryUrl && actions.length > 0 && actions[0].type !== 'navigate') {
        actions.unshift({
          type: 'navigate',
          url: entryUrl,
          description: `Navigate to entry URL: ${entryUrl}`
        });
      }

      // 确保已连接（连接管理由调用方负责，这里只做检查）

      // 执行每个操作
      for (const action of actions) {
        console.log(`  Executing: ${action.type} - ${action.description}`);
        
        const actionStartTime = new Date();
        const executionResult = await this.playwrightClient.executeAction(action);
        const actionEndTime = new Date();

        actionResults.push({
          action: {
            type: action.type,
            description: action.description
          },
          result: executionResult,
          timestamp: actionStartTime
        });

        // 如果操作失败，记录错误但继续执行（可选：可以在这里停止）
        if (!executionResult.success) {
          // 对于 verify 操作，如果只是返回 false 但没有错误，可能是元素不存在但不算严重错误
          const isVerifyWarning = action.type === 'verify' && !executionResult.error;
          if (isVerifyWarning) {
            console.warn(`    Warning: ${executionResult.message}${executionResult.error ? ` - ${executionResult.error}` : ''}`);
          } else {
            console.error(`    Error: ${executionResult.message}${executionResult.error ? ` - ${executionResult.error}` : ''}`);
          }
        } else {
          console.log(`    Success: ${executionResult.message}`);
        }

        // 操作之间稍作延迟
        await this.delay(500);
      }

      // 判断测试是否成功
      // 对于 verify 操作，如果返回 warning 但没有错误，可以视为部分成功
      // 但为了严格性，我们仍然要求所有操作都成功
      const success = actionResults.every(ar => {
        // verify 操作如果只是返回 false（没有错误），可以视为警告但不一定失败
        if (ar.action.type === 'verify' && !ar.result.success && !ar.result.error) {
          // 这种情况下，我们仍然认为操作失败，但可以记录为警告
          return false;
        }
        return ar.result.success;
      });

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        testCase,
        success,
        startTime,
        endTime,
        duration,
        actionResults
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        testCase,
        success: false,
        startTime,
        endTime,
        duration,
        actionResults,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

