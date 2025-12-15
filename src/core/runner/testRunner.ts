import { CaseParser } from '../parser/caseParser.js';
import { AIClient, PlaywrightAction } from '../../adapters/ai/aiClient.js';
import { PlaywrightMCPClient } from '../../adapters/mcp/playwrightClient.js';
import { TestCase, CaseFile } from '../../types/case.js';
import { TestResult, ActionResult } from '../../types/result.js';

export class TestRunner {
  private caseParser?: CaseParser;
  private aiClient: AIClient;
  private playwrightClient: PlaywrightMCPClient;

  constructor(caseDir?: string, playwrightClient?: PlaywrightMCPClient) {
    // TestRunner 不再直接管理 CaseParser，由调用方传入用例
    this.aiClient = new AIClient();
    // 如果传入了客户端，使用传入的；否则创建新的
    this.playwrightClient = playwrightClient || new PlaywrightMCPClient();
  }

  /**
   * 设置用例解析器（用于 runAll 和 runFile）
   */
  setCaseParser(parser: CaseParser): void {
    this.caseParser = parser;
  }

  /**
   * 运行所有测试用例
   * 注意：连接管理由调用方负责，此方法不管理连接生命周期
   */
  async runAll(): Promise<TestResult[]> {
    if (!this.caseParser) {
      throw new Error('CaseParser not set. Call setCaseParser() first or use runTestCase() directly.');
    }
    const caseFiles = await this.caseParser.parseDirectory();
    const results: TestResult[] = [];

    // 注意：连接应该由调用方管理，这里不进行连接/断开操作
    // 确保在执行前已连接
    if (!this.playwrightClient['connection'].isConnectedToServer()) {
      throw new Error('Playwright MCP client is not connected. Please connect before calling runAll().');
    }

    for (const caseFile of caseFiles) {
      for (const testCase of caseFile.testCases) {
        const result = await this.runTestCase(testCase, caseFile.entryUrl);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 运行单个测试用例文件
   * 注意：连接管理由调用方负责，此方法不管理连接生命周期
   */
  async runFile(filePath: string): Promise<TestResult[]> {
    if (!this.caseParser) {
      throw new Error('CaseParser not set. Call setCaseParser() first or use runTestCase() directly.');
    }
    const caseFile = await this.caseParser.parseFile(filePath);
    const results: TestResult[] = [];

    // 注意：连接应该由调用方管理，这里不进行连接/断开操作
    // 确保在执行前已连接
    if (!this.playwrightClient.isConnected()) {
      throw new Error('Playwright MCP client is not connected. Please connect before calling runFile().');
    }

    for (const testCase of caseFile.testCases) {
      const result = await this.runTestCase(testCase, caseFile.entryUrl);
      results.push(result);
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
      console.log(`\nRunning test case: ${testCase.id} - ${testCase.title} - ${entryUrl}`);

      // 使用 AI 将测试用例转换为操作序列
      let actions: PlaywrightAction[];
      try {
        actions = await this.aiClient.convertTestCaseToActions(testCase);
        console.log(`Generated ${actions.length} actions from AI`);
      } catch (error) {
        throw new Error(`Failed to convert test case to actions: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 如果有入口URL，确保第一个操作是导航到正确的URL
      if (entryUrl && actions.length > 0) {
        if (actions[0].type === 'navigate') {
          // 如果第一个操作已经是导航，但URL不匹配entryUrl，则替换它
          if (actions[0].url !== entryUrl) {
            console.log(`Replacing navigate URL from "${actions[0].url}" to "${entryUrl}"`);
            actions[0].url = entryUrl;
            actions[0].description = `Navigate to entry URL: ${entryUrl}`;
          }
        } else {
          // 如果第一个操作不是导航，则在前面添加导航操作
          actions.unshift({
            type: 'navigate',
            url: entryUrl,
            description: `Navigate to entry URL: ${entryUrl}`
          });
        }
      }

      // 确保已连接（连接管理由调用方负责，这里只做检查）
      if (!this.playwrightClient.isConnected()) {
        throw new Error('Playwright MCP client is not connected. Please connect before calling runTestCase().');
      }

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

