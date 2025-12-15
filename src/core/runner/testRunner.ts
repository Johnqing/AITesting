import { CaseParser } from '../parser/caseParser.js';
import { AIClient, PlaywrightAction } from '../../adapters/ai/aiClient.js';
import { PlaywrightMCPClient } from '../../adapters/mcp/playwrightClient.js';
import { TestCase, CaseFile } from '../../types/case.js';
import { TestResult, ActionResult, ExpectedResultCheck } from '../../types/result.js';

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
   * @param testCase 测试用例
   * @param entryUrl 入口URL
   * @param currentUrl 当前已打开的URL（如果与entryUrl相同，则跳过导航）
   */
  async runTestCase(testCase: TestCase, entryUrl?: string, currentUrl?: string): Promise<TestResult> {
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
      // 但如果当前URL与入口URL相同，则跳过导航操作
      if (entryUrl && actions.length > 0) {
        // 检查是否需要导航（当前URL与入口URL不同）
        const needNavigate = currentUrl !== entryUrl;

        if (needNavigate) {
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
        } else {
          // 当前URL与入口URL相同，跳过导航操作
          console.log(`Skipping navigation - already on URL: ${entryUrl}`);
          // 如果第一个操作是导航且URL匹配，移除它
          if (actions[0].type === 'navigate' && actions[0].url === entryUrl) {
            actions.shift();
            console.log(`Removed redundant navigate action`);
          }
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
        const actionDuration = actionEndTime.getTime() - actionStartTime.getTime();

        actionResults.push({
          action: {
            type: action.type,
            description: action.description,
            selector: action.selector,
            url: action.url,
            text: action.text,
            timeout: action.timeout,
            expected: action.expected
          },
          result: executionResult,
          timestamp: actionStartTime,
          duration: actionDuration
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

      // 检查预期结果是否匹配
      const expectedResultsCheck = this.checkExpectedResults(
        testCase.expectedResults,
        actionResults
      );

      // 统计信息
      const passedActions = actionResults.filter(ar => ar.result.success).length;
      const failedActions = actionResults.length - passedActions;
      const matchedExpectedResults = expectedResultsCheck.filter(ec => ec.matched).length;
      const unmatchedExpectedResults = expectedResultsCheck.length - matchedExpectedResults;

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        testCase,
        success,
        startTime,
        endTime,
        duration,
        actionResults,
        expectedResultsCheck,
        summary: {
          totalActions: actionResults.length,
          passedActions,
          failedActions,
          totalExpectedResults: testCase.expectedResults.length,
          matchedExpectedResults,
          unmatchedExpectedResults
        }
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

  /**
   * 检查预期结果是否匹配
   */
  private checkExpectedResults(
    expectedResults: string[],
    actionResults: ActionResult[]
  ): ExpectedResultCheck[] {
    const checks: ExpectedResultCheck[] = [];

    // 收集所有操作的实际结果，包含更详细的信息
    const actualResults: string[] = [];
    const actionDetails: Array<{ description: string; message: string; success: boolean; type: string }> = [];

    actionResults.forEach(ar => {
      const detail = {
        description: ar.action.description,
        message: ar.result.message || '',
        success: ar.result.success,
        type: ar.action.type
      };
      actionDetails.push(detail);

      // 收集消息
      if (ar.result.message) {
        actualResults.push(ar.result.message);
      }
      // 收集操作描述
      actualResults.push(ar.action.description);
      // 收集操作类型和结果
      if (ar.action.type === 'verify' && ar.action.expected) {
        actualResults.push(`验证${ar.action.expected}: ${ar.result.success ? '通过' : '失败'}`);
      }
      if (ar.action.type === 'fill' && ar.action.text) {
        actualResults.push(`输入${ar.action.text}`);
      }
      if (ar.action.type === 'click') {
        actualResults.push(`点击${ar.action.text || ar.action.selector || '元素'}`);
      }
    });

    // 将实际结果合并为一个字符串用于匹配
    const actualResultsText = actualResults.join(' ').toLowerCase();

    // 检查每个预期结果
    expectedResults.forEach(expected => {
      const expectedLower = expected.toLowerCase().trim();
      let matched = false;
      let matchType: 'exact' | 'partial' | 'contains' | 'not_matched' = 'not_matched';
      let actual = '';

      // 提取预期结果中的关键词
      const keywords = expectedLower
        .replace(/[，。、；：！？""''（）()【】\[\]]/g, ' ')
        .split(/\s+/)
        .filter(k => k.length > 1);

      // 1. 精确匹配
      if (actualResultsText.includes(expectedLower)) {
        matched = true;
        matchType = 'exact';
        // 找到匹配的实际结果
        const matchingDetails = actionDetails.filter(ad =>
          ad.message.toLowerCase().includes(expectedLower) ||
          ad.description.toLowerCase().includes(expectedLower)
        );
        if (matchingDetails.length > 0) {
          actual = matchingDetails.map(ad => `${ad.type}: ${ad.message || ad.description}`).join('; ');
        } else {
          actual = expected;
        }
      } else {
        // 2. 部分匹配（关键词匹配）
        const matchedKeywords = keywords.filter(k => actualResultsText.includes(k));
        if (matchedKeywords.length > 0) {
          const matchRatio = matchedKeywords.length / keywords.length;
          if (matchRatio >= 0.5) {
            matched = true;
            matchType = matchRatio >= 0.8 ? 'partial' : 'contains';

            // 找到包含这些关键词的操作
            const matchingDetails = actionDetails.filter(ad => {
              const text = (ad.message + ' ' + ad.description).toLowerCase();
              return matchedKeywords.some(k => text.includes(k));
            });

            if (matchingDetails.length > 0) {
              actual = matchingDetails.map(ad => `${ad.type}: ${ad.message || ad.description}`).join('; ');
            } else {
              actual = `匹配到关键词: ${matchedKeywords.join(', ')}`;
            }
          }
        }

        // 3. 如果没有匹配，尝试从操作结果中提取相关信息
        if (!matched && keywords.length > 0) {
          // 查找相关的操作结果
          const relatedActions = actionDetails.filter(ad => {
            const text = (ad.message + ' ' + ad.description).toLowerCase();
            return keywords.some(k => text.includes(k));
          });

          if (relatedActions.length > 0) {
            actual = relatedActions
              .map(ad => `${ad.type}: ${ad.message || ad.description}${ad.success ? ' (成功)' : ' (失败)'}`)
              .join('; ');
            matchType = 'contains';
            // 如果相关操作都成功，认为部分匹配
            if (relatedActions.every(ad => ad.success)) {
              matched = true;
            }
          } else {
            // 尝试模糊匹配：查找包含部分关键词的操作
            const partialMatches: string[] = [];
            keywords.forEach(k => {
              actionDetails.forEach(ad => {
                const text = (ad.message + ' ' + ad.description).toLowerCase();
                if (text.includes(k) && !partialMatches.includes(ad.description)) {
                  partialMatches.push(`${ad.type}: ${ad.message || ad.description}`);
                }
              });
            });

            if (partialMatches.length > 0) {
              actual = `部分相关操作: ${partialMatches.join('; ')}`;
            } else {
              actual = `未找到匹配的实际结果。实际执行的操作: ${actionDetails.map(ad => ad.description).join('; ')}`;
            }
          }
        }
      }

      // 如果没有找到实际结果，使用所有操作结果的摘要
      if (!actual) {
        const summary = actionDetails
          .filter(ad => ad.success)
          .map(ad => ad.description)
          .join('; ');
        actual = summary || '无成功操作';
      }

      checks.push({
        expected,
        actual: actual.length > 500 ? actual.substring(0, 500) + '...' : actual,
        matched,
        matchType
      });
    });

    return checks;
  }
}

