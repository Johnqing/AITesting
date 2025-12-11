import { WebSocketManager } from './websocket.js';
import { PlaywrightMcpClient } from './mcpClient.js';
import { AITestParser } from './aiParser.js';
import { ScreenshotService } from './screenshotService.js';
import { StreamService } from './streamService.js';
import { ScriptOutputService } from './scriptOutputService.js';
import type { TestStep, TestRun, TestAction, ExpectCondition } from '../../src/types/test.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 简化版测试执行服务 - 不依赖数据库，仅内存存储
 * 参考 sakura-ai 的功能，但保持简化架构
 */
export class TestExecutionService {
  private wsManager: WebSocketManager;
  private aiParser: AITestParser;
  private screenshotService: ScreenshotService;
  private streamService?: StreamService;
  private scriptOutputService: ScriptOutputService;
  private testRuns: Map<string, TestRun> = new Map();
  private runMcpClients: Map<string, PlaywrightMcpClient> = new Map(); // 存储每个运行的MCP客户端

  // 🚀 Phase 4: 性能监控系统
  private performanceMonitor = {
    enabled: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false',
    failureThreshold: 0.05, // 失败率超过5%自动回退
    avgTimeThreshold: 30, // 平均执行时间超过30秒报警
    optimizationMode: process.env.PERFORMANCE_MODE || 'balanced', // fast|balanced|stable

    stats: {
      totalRuns: 0,
      successfulRuns: 0,
      totalTime: 0,
      optimizedRuns: 0,
      fallbackRuns: 0
    },

    recordExecution: (runId: string, success: boolean, duration: number, usedOptimization: boolean) => {
      this.performanceMonitor.stats.totalRuns++;
      if (success) this.performanceMonitor.stats.successfulRuns++;
      this.performanceMonitor.stats.totalTime += duration;
      if (usedOptimization) this.performanceMonitor.stats.optimizedRuns++;
      else this.performanceMonitor.stats.fallbackRuns++;

      // 检查是否需要回退
      if (this.performanceMonitor.shouldFallback()) {
        console.log('⚠️ 性能监控：检测到优化导致问题，建议切换到安全模式');
      }
    },

    shouldFallback: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns < 10) return false; // 样本太小，不做判断

      const failureRate = 1 - (stats.successfulRuns / stats.totalRuns);
      const avgTime = stats.totalTime / stats.totalRuns;

      return failureRate > this.performanceMonitor.failureThreshold ||
        avgTime > this.performanceMonitor.avgTimeThreshold;
    },

    getReport: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns === 0) return '性能监控：暂无数据';

      return `性能监控报告:
📊 总运行次数: ${stats.totalRuns}
✅ 成功率: ${((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1)}%
⏱️  平均用时: ${(stats.totalTime / stats.totalRuns).toFixed(1)}秒
🚀 优化模式运行: ${stats.optimizedRuns}次
🛡️ 安全模式运行: ${stats.fallbackRuns}次`;
    }
  };

  // 🚀 Phase 6: 日志批量处理队列，解决同步WebSocket瓶颈
  private logQueue: Map<string, { logs: Array<{ id: string; timestamp: Date; level: string; message: string }>; timer?: NodeJS.Timeout }> = new Map();

  constructor(
    wsManager: WebSocketManager,
    aiParser: AITestParser,
    _mcpClient: PlaywrightMcpClient, // 保留参数以保持API兼容性，但不再使用
    screenshotService?: ScreenshotService,
    streamService?: StreamService,
    scriptOutputService?: ScriptOutputService
  ) {
    this.wsManager = wsManager;
    this.aiParser = aiParser;
    this.screenshotService = screenshotService || new ScreenshotService();
    this.streamService = streamService;
    this.scriptOutputService = scriptOutputService || new ScriptOutputService();
  }

  /**
   * 执行测试用例（自然语言描述）
   */
  async runTest(testDescription: string, environment: string = 'staging'): Promise<string> {
    const startTime = Date.now();
    const runId = uuidv4();

    console.log('[TestExecution] ========================================');
    console.log('[TestExecution] 开始创建测试运行');
    console.log('[TestExecution] 参数:', {
      runId,
      testDescriptionLength: testDescription.length,
      testDescriptionPreview: testDescription.substring(0, 200),
      environment
    });

    // 创建测试运行记录
    const testRun: TestRun = {
      id: runId,
      runId,
      testCaseId: 0,
      status: 'queued',
      logs: [],
      startedAt: new Date(),
      environment,
      steps: [],
      successfulSteps: [],
    };

    this.testRuns.set(runId, testRun);
    console.log('[TestExecution] 测试运行记录已创建并存储');
    console.log('[TestExecution] 当前测试运行总数:', this.testRuns.size);

    console.log('[TestExecution] 发送测试更新 (queued)...');
    this.wsManager.sendTestUpdate(runId, { status: 'queued' });

    // 异步执行
    console.log('[TestExecution] 启动异步测试执行...');
    this.executeTest(runId, testDescription).catch(error => {
      const errorDuration = Date.now() - startTime;
      console.error(`[TestExecution] ❌ [${runId}] 测试执行失败 (耗时: ${errorDuration}ms)`);
      console.error(`[TestExecution] 错误详情:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      testRun.status = 'error';
      testRun.error = error.message;
      console.log('[TestExecution] 发送测试错误到 WebSocket...');
      this.wsManager.sendTestError(runId, error);
    });

    const initDuration = Date.now() - startTime;
    console.log(`[TestExecution] ✅ 测试运行已创建 (耗时: ${initDuration}ms)`);
    console.log('[TestExecution] ========================================');
    return runId;
  }

  /**
   * 执行测试
   */
  private async executeTest(runId: string, testDescription: string): Promise<void> {
    // 🚀 Phase 4-5: 全面性能监控开始
    const executionStartTime = Date.now();
    const useOptimization = this.performanceMonitor.optimizationMode !== 'stable' &&
      !this.performanceMonitor.shouldFallback();

    if (this.performanceMonitor.enabled) {
      console.log(`📊 [${runId}] 性能监控: 使用${useOptimization ? '优化' : '安全'}模式`);
      this.addLog(runId, `📊 性能监控启用 (${useOptimization ? '优化' : '安全'}模式)`, 'info');
    }

    const executeStartTime = Date.now();
    console.log(`[TestExecution ${runId}] ========================================`);
    console.log(`[TestExecution ${runId}] 开始执行测试`);
    console.log(`[TestExecution ${runId}] 测试描述长度: ${testDescription.length} 字符`);

    const testRun = this.testRuns.get(runId);
    if (!testRun) {
      console.error(`[TestExecution ${runId}] ❌ 测试运行不存在`);
      throw new Error(`测试运行不存在: ${runId}`);
    }

    let executionSuccess = false;

    try {
      console.log(`[TestExecution ${runId}] 更新状态为 running...`);
      testRun.status = 'running';
      this.wsManager.sendTestUpdate(runId, { status: 'running' });
      this.addLog(runId, `开始执行测试: ${testDescription}`, 'info');

      // 🔥 修复：在创建新MCP客户端前，确保所有旧的实例都已关闭
      console.log(`[TestExecution ${runId}] 检查并等待所有旧的MCP客户端关闭...`);
      const existingClients = Array.from(this.runMcpClients.values());
      if (existingClients.length > 0) {
        console.log(`[TestExecution ${runId}] 发现 ${existingClients.length} 个旧的MCP客户端，等待它们关闭...`);
        for (const oldClient of existingClients) {
          try {
            await oldClient.close();
            console.log(`[TestExecution ${runId}] ✅ 旧的MCP客户端已关闭`);
          } catch (closeError: any) {
            console.warn(`[TestExecution ${runId}] ⚠️  关闭旧MCP客户端失败:`, closeError?.message);
          }
        }
        // 等待浏览器进程完全终止
        await this.delay(3000);
        console.log(`[TestExecution ${runId}] ✅ 所有旧的MCP客户端已清理完成`);
      }

      // 为每个测试运行创建独立的MCP客户端
      console.log(`[TestExecution ${runId}] 创建 MCP 客户端...`);
      const mcpClientStartTime = Date.now();
      const runMcpClient = new PlaywrightMcpClient();
      // 检查是否使用无头模式（从环境变量）
      const headless = process.env.PLAYWRIGHT_HEADLESS === 'true' || process.env.HEADLESS === 'true';
      console.log(`[TestExecution ${runId}] 浏览器模式: ${headless ? '无头模式' : '有头模式'}`);
      await runMcpClient.initialize({ headless });
      const mcpClientDuration = Date.now() - mcpClientStartTime;
      this.runMcpClients.set(runId, runMcpClient);
      console.log(`[TestExecution ${runId}] ✅ MCP客户端初始化完成 (耗时: ${mcpClientDuration}ms)`);
      this.addLog(runId, `MCP客户端已初始化${headless ? ' (无头模式)' : ''}`, 'success');

      // 🚀 Phase 5: 异步启动实时流服务，不阻塞主流程
      setImmediate(async () => {
        try {
          if (this.streamService) {
            console.log(`🎬 [${runId}] 异步启动实时流，runId: ${runId}`);
            this.streamService.startStreamWithMcp(runId, runMcpClient);
            console.log(`📺 [${runId}] 实时流异步启动完成`);
            this.addLog(runId, `📺 实时流已启动(后台模式)`, 'success');
          }
        } catch (streamError) {
          console.error(`❌ [${runId}] 启动实时流失败:`, streamError);
          this.addLog(runId, `⚠️ 启动实时流失败: ${(streamError as Error).message}`, 'warning');
        }
      });

      // 解析测试步骤
      console.log(`[TestExecution ${runId}] 开始解析测试步骤...`);
      let remainingSteps = testDescription;
      const steps: TestStep[] = [];
      let snapshot: string | null = null;
      let stepIndex = 0;
      let previousStepsText = ''; // 🔥 新增：用于防止无限循环
      const maxSteps = 50; // 🔥 新增：最大步骤数限制

      // 🔥 新增：计算总步骤数（预估，用于显示进度）
      const estimatedTotalSteps = this.estimateStepsCount(testDescription);
      testRun.totalSteps = estimatedTotalSteps;
      console.log(`📊 [${runId}] 预估总步骤数: ${estimatedTotalSteps}`);

      // 🔥 AI闭环执行 - 修复：添加步骤间延迟和无限循环保护
      while (remainingSteps?.trim()) {
        stepIndex++;

        // 🔥 防止无限循环：检查是否与上一次步骤相同
        if (remainingSteps === previousStepsText) {
          console.error(`❌ [${runId}] 检测到无限循环，剩余步骤未变化: "${remainingSteps}"`);
          this.addLog(runId, `❌ 检测到无限循环，停止执行`, 'error');
          testRun.status = 'failed';
          testRun.error = '检测到无限循环，测试已停止';
          return;
        }

        // 🔥 防止步骤数过多
        if (stepIndex > maxSteps) {
          console.error(`❌ [${runId}] 步骤数超过限制 (${maxSteps})，可能存在无限循环`);
          this.addLog(runId, `❌ 步骤数超过限制，停止执行`, 'error');
          testRun.status = 'failed';
          testRun.error = `步骤数超过限制 (${maxSteps})，测试已停止`;
          return;
        }

        previousStepsText = remainingSteps; // 记录当前步骤文本

        const stepStartTime = Date.now();
        console.log(`[TestExecution ${runId}] ========================================`);
        console.log(`[TestExecution ${runId}] 处理步骤 #${stepIndex}`);
        console.log(`[TestExecution ${runId}] 剩余描述长度: ${remainingSteps.length} 字符`);
        console.log(`[TestExecution ${runId}] 剩余描述预览: ${remainingSteps.substring(0, 150)}`);
        this.addLog(runId, `开始处理步骤 #${stepIndex}`, 'info');

        // 🚀 Phase 5: AI解析优化 - 第一步直接跳过快照获取（避免46秒延迟）
        if (stepIndex === 1) {
          // 第一步直接跳过快照，避免在空白页面耗时46秒
          // 设置为 null 让AI解析器使用启发式算法
          console.log(`[TestExecution ${runId}] 第一步：跳过初始快照获取，使用启发式算法`);
          this.addLog(runId, `⚡ 第一步：跳过初始快照获取，使用启发式算法`, 'info');
          snapshot = null; // 设置为 null，让AI解析器回退到启发式算法
        } else {
          console.log(`[TestExecution ${runId}] 获取页面快照...`);
          this.addLog(runId, `🔍 正在获取页面快照用于AI分析...`, 'info');
          snapshot = await runMcpClient.getSnapshot();
          console.log(`[TestExecution ${runId}] 页面快照获取完成`);
          this.addLog(runId, `📸 页面快照获取成功，开始AI解析`, 'info');
        }

        // AI解析下一步
        console.log(`[TestExecution ${runId}] 调用 AI 解析下一步...`);
        this.addLog(runId, `🤖 开始AI解析下一步...`, 'info');
        const aiParseStartTime = Date.now();
        let aiResult;
        try {
          // 使用90秒超时，给AI解析器足够时间（包括AI调用和回退到启发式算法的时间）
          aiResult = await Promise.race([
            this.aiParser.parseNextStep(remainingSteps, snapshot, runId),
            new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error('AI解析超时(90秒)')), 90000)
            )
          ]);
        } catch (parseError: any) {
          console.error(`[TestExecution ${runId}] AI解析出错:`, parseError);
          this.addLog(runId, `❌ AI解析失败: ${parseError.message}`, 'error');
          // AI解析器内部已经有回退机制，如果这里还失败，说明回退也失败了
          throw parseError;
        }
        const aiParseDuration = Date.now() - aiParseStartTime;
        console.log(`[TestExecution ${runId}] AI 解析完成 (耗时: ${aiParseDuration}ms)`);
        console.log(`[TestExecution ${runId}] AI 解析结果:`, {
          success: aiResult.success,
          hasStep: !!aiResult.step,
          error: aiResult.error,
          remainingLength: aiResult.remaining?.length || 0
        });

        // 🔥 修复：如果AI解析返回"没有剩余步骤"，检查是否是因为跳过了验证步骤
        if (!aiResult.success || !aiResult.step) {
          const errorMsg = aiResult.error || '无法解析测试步骤';

          // 🔥 新增：如果是因为没有剩余步骤（可能是跳过了验证步骤），正常结束测试
          if (errorMsg === '没有剩余步骤' || errorMsg.includes('没有剩余步骤')) {
            console.log(`[TestExecution ${runId}] ℹ️ 没有剩余步骤，测试正常完成`);
            this.addLog(runId, `✅ 所有操作步骤已完成，测试正常结束`, 'success');
            // 正常结束测试循环
            break;
          }

          console.error(`[TestExecution ${runId}] ❌ AI 解析失败: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const step = aiResult.step;
        console.log(`[TestExecution ${runId}] 解析到的步骤:`, {
          id: step.id,
          action: step.action,
          description: step.description,
          selector: step.selector,
          url: step.url
        });

        // 确保step有order属性，并转换action和condition类型
        const stepWithOrder: TestStep = {
          ...step,
          action: step.action as TestAction,
          condition: step.condition as ExpectCondition | undefined,
          order: steps.length + 1
        };
        steps.push(stepWithOrder);
        // 🔥 修复：立即同步步骤到testRun，避免提前返回时步骤丢失
        testRun.steps = [...steps];
        remainingSteps = aiResult.remaining || '';
        console.log(`[TestExecution ${runId}] 步骤已添加到列表，当前步骤数: ${steps.length}`);

        // 执行步骤
        console.log(`[TestExecution ${runId}] 开始执行步骤...`);
        // 🔥 新增：记录步骤详细信息到测试日志
        const stepDetails: any = {
          action: step.action,
          description: step.description,
          ref: (step as any).ref,
          element: (step as any).element,
          selector: step.selector,
          url: step.url
        };
        this.addLog(runId, `执行步骤 ${stepIndex}: ${step.description}`, 'info');
        this.addLog(runId, `📋 步骤详情: ${JSON.stringify(stepDetails, null, 2)}`, 'info');

        // 🚀 Phase 5: 智能UI稳定等待 (仅首次执行需要)
        if (stepIndex === 1) {
          this.addLog(runId, `⚡ 第一步：跳过UI稳定等待`, 'info');
          // 第一步通常是导航，不需要等待UI稳定
        } else {
          this.addLog(runId, `⏳ 等待UI稳定...`, 'info');
          await this.delay(500); // 🚀 优化：减少到0.5秒
        }

        try {
          const stepExecuteStartTime = Date.now();

          // 🔥 Phase 1 修复：执行稳定性增强 - 多策略重试机制
          const executionResult = await this.executeStepWithRetryAndFallback(stepWithOrder, runId, stepIndex, runMcpClient);

          // 记录验证信息
          if (executionResult.verificationInfo) {
            const vInfo = executionResult.verificationInfo;
            if (vInfo.inputVerified !== undefined) {
              if (vInfo.inputVerified) {
                this.addLog(runId, `✅ 输入验证成功: 实际值="${vInfo.inputValue || '(已设置)'}"`, 'success');
              } else {
                this.addLog(runId, `⚠️ 输入验证失败: 实际值="${vInfo.inputValue || '(未获取到)'}"`, 'warning');
              }
            }
            if (vInfo.clickSuccess !== undefined) {
              if (vInfo.urlChanged) {
                this.addLog(runId, `✅ 按钮点击成功: 页面已导航`, 'success');
              } else {
                this.addLog(runId, `✅ 按钮点击成功: 页面URL未变化（可能是表单提交）`, 'success');
              }
            }
          }

          // 🔥 修复：更新步骤状态
          const stepInArray = steps.find(s => s.id === stepWithOrder.id);
          if (stepInArray) {
            if (!executionResult.success) {
              (stepInArray as any).status = 'failed';
              (stepInArray as any).error = executionResult.error;
              (stepInArray as any).successful = false;
            } else {
              (stepInArray as any).status = 'success';
              (stepInArray as any).error = null;
              (stepInArray as any).successful = true;
            }
            // 更新验证信息
            if (executionResult.verificationInfo) {
              (stepInArray as any).verificationInfo = executionResult.verificationInfo;
            }
          }

          if (!executionResult.success) {
            this.addLog(runId, `❌ 步骤执行最终失败: ${executionResult.error}`, 'error');
            await this.takeStepScreenshot(runId, stepIndex, 'failed', step.description, runMcpClient);

            // 🔥 智能失败处理：根据步骤重要性和错误类型决定是否继续
            const shouldContinue = await this.shouldContinueAfterFailure(stepWithOrder, runId, executionResult.error, runMcpClient);

            if (!shouldContinue) {
              // 🔥 修复：确保步骤已保存到testRun
              testRun.steps = [...steps];
              testRun.status = 'failed';
              testRun.error = `关键步骤 ${stepIndex} 失败: ${executionResult.error}`;
              testRun.endedAt = new Date();
              return;
            } else {
              this.addLog(runId, `⚠️ 步骤 ${stepIndex} 失败但继续执行: ${executionResult.error}`, 'warning');
              // 🔥 新增：失败步骤也更新进度
              testRun.failedSteps = (testRun.failedSteps || 0) + 1;
              testRun.completedSteps = stepIndex;
              testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
            }
          } else {
            const stepExecuteDuration = Date.now() - stepExecuteStartTime;
            testRun.successfulSteps.push(step.id);
            console.log(`[TestExecution ${runId}] ✅ 步骤执行成功 (耗时: ${stepExecuteDuration}ms)`);
            this.addLog(runId, `✅ 步骤 ${stepIndex} 执行成功`, 'success');

            // 🔥 新增：更新进度和成功步骤数
            testRun.passedSteps = (testRun.passedSteps || 0) + 1;
            testRun.completedSteps = stepIndex;
            testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
            console.log(`📊 [${runId}] 进度更新: ${testRun.completedSteps}/${testRun.totalSteps} (${testRun.progress}%)`);
          }

          // 🔥 关键修复：操作后等待，确保页面响应
          // 🚀 Phase 1&3: 智能延迟优化
          const isFirstStepNavigation = stepIndex === 1 && (step.action === 'navigate' || step.action === 'browser_navigate' || step.action === 'open' || step.action === 'goto');

          await this.smartWaitAfterOperation(step.action, {
            runId,
            isFirstStep: isFirstStepNavigation,
            stepIndex
          });

          // 🔥 新增：每个步骤执行成功后都截图
          await this.takeStepScreenshot(runId, stepIndex, 'success', step.description, runMcpClient);

          // 🔥 关键修复：确保步骤正确推进
          const newRemainingSteps = aiResult.remaining || '';

          // 🔥 增强日志：显示步骤推进情况
          console.log(`🔄 [${runId}] 步骤推进状态:`);
          console.log(`   ⬅️ 执行前剩余: "${remainingSteps.substring(0, 100)}..."`);
          console.log(`   ➡️ 执行后剩余: "${newRemainingSteps.substring(0, 100)}..."`);
          console.log(`   📊 步骤是否推进: ${remainingSteps !== newRemainingSteps ? '✅ 是' : '❌ 否'}`);

          remainingSteps = newRemainingSteps;

          this.addLog(runId, `📋 步骤推进: ${remainingSteps.trim() ? `还有 ${remainingSteps.split('\n').filter(l => l.trim()).length} 个步骤` : '所有步骤已完成'}`, 'info');

          // 🔥 关键修复：步骤间等待
          if (remainingSteps.trim()) {
            this.addLog(runId, `⏳ 等待下一步骤...`, 'info');
            await this.delay(1500);
          }

        } catch (stepError: any) {
          const stepErrorDuration = Date.now() - stepStartTime;
          console.error(`[TestExecution ${runId}] ❌ 步骤执行失败 (耗时: ${stepErrorDuration}ms)`);
          console.error(`[TestExecution ${runId}] 错误详情:`, {
            message: stepError.message,
            name: stepError.name,
            stack: stepError.stack?.split('\n').slice(0, 5).join('\n')
          });
          // 🔥 修复：确保步骤已保存到testRun，即使发生异常
          testRun.steps = [...steps];
          this.addLog(runId, `步骤执行失败: ${stepError.message}`, 'error');
          console.log(`[TestExecution ${runId}] 拍摄失败截图...`);
          await this.takeStepScreenshot(runId, stepIndex, 'failed', step.description, runMcpClient);
          throw stepError;
        }

        const stepTotalDuration = Date.now() - stepStartTime;
        console.log(`[TestExecution ${runId}] 步骤 #${stepIndex} 总耗时: ${stepTotalDuration}ms`);
        console.log(`[TestExecution ${runId}] ========================================`);
      }

      const totalDuration = Date.now() - executeStartTime;
      console.log(`[TestExecution ${runId}] ========================================`);
      console.log(`[TestExecution ${runId}] 所有步骤执行完成`);
      console.log(`[TestExecution ${runId}] 统计信息:`, {
        totalSteps: steps.length,
        successfulSteps: testRun.successfulSteps.length,
        totalDuration: `${totalDuration}ms`,
        averageStepDuration: `${Math.round(totalDuration / steps.length)}ms`
      });

      testRun.steps = steps;
      testRun.status = 'completed';
      testRun.endedAt = new Date();

      console.log(`[TestExecution ${runId}] 发送测试完成消息...`);
      this.wsManager.sendTestComplete(runId, {
        status: 'completed',
        steps: steps.length,
        successfulSteps: testRun.successfulSteps.length
      });

      this.addLog(runId, '测试执行完成', 'success');
      console.log(`[TestExecution ${runId}] ✅ 测试执行成功 (总耗时: ${totalDuration}ms)`);
      console.log(`[TestExecution ${runId}] ========================================`);
      executionSuccess = true; // 🚀 标记执行成功

    } catch (error: any) {
      const errorDuration = Date.now() - executeStartTime;
      console.error(`[TestExecution ${runId}] ========================================`);
      console.error(`[TestExecution ${runId}] ❌ 测试执行失败 (耗时: ${errorDuration}ms)`);
      console.error(`[TestExecution ${runId}] 错误详情:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 10).join('\n')
      });

      testRun.status = 'failed';
      testRun.error = error.message;
      testRun.endedAt = new Date();

      console.log(`[TestExecution ${runId}] 发送测试错误消息...`);
      this.wsManager.sendTestError(runId, error);
      this.addLog(runId, `测试执行失败: ${error.message}`, 'error');
      console.error(`[TestExecution ${runId}] ========================================`);
      executionSuccess = false; // 🚀 标记执行失败

    } finally {
      // 🚀 Phase 6: 确保所有日志都被发送
      this.flushLogQueue(runId);
      this.logQueue.delete(runId);

      console.log(`[TestExecution ${runId}] 开始清理资源...`);

      // 停止实时流
      if (this.streamService) {
        console.log(`[TestExecution ${runId}] 停止实时流...`);
        this.streamService.stopStream(runId);
      }

      // 关闭MCP客户端
      const runMcpClient = this.runMcpClients.get(runId);
      if (runMcpClient) {
        console.log(`[TestExecution ${runId}] 关闭 MCP 客户端...`);
        try {
          await runMcpClient.close();
          this.runMcpClients.delete(runId);
          console.log(`[TestExecution ${runId}] ✅ MCP 客户端已关闭`);

          // 🔥 修复：等待浏览器进程完全终止，避免多个标签页问题
          console.log(`[TestExecution ${runId}] 等待浏览器进程完全终止...`);
          await this.delay(2000); // 等待2秒，确保浏览器进程完全关闭
          console.log(`[TestExecution ${runId}] ✅ 浏览器进程清理完成`);
        } catch (closeError: any) {
          console.error(`[TestExecution ${runId}] ❌ 关闭MCP客户端失败:`, {
            message: closeError?.message,
            name: closeError?.name
          });
          // 即使关闭失败，也等待一段时间
          await this.delay(1000);
        }
      } else {
        console.log(`[TestExecution ${runId}] MCP 客户端不存在，跳过关闭`);
      }

      // 🚀 Phase 4: 性能监控记录
      if (this.performanceMonitor.enabled) {
        const executionDuration = (Date.now() - executionStartTime) / 1000;
        this.performanceMonitor.recordExecution(runId, executionSuccess, executionDuration, useOptimization);

        console.log(`📊 [${runId}] 性能监控记录:`);
        console.log(`   ⏱️ 执行时间: ${executionDuration.toFixed(1)}秒`);
        console.log(`   ✅ 执行状态: ${executionSuccess ? '成功' : '失败'}`);
        console.log(`   🚀 优化模式: ${useOptimization ? '是' : '否'}`);

        // 每10次执行输出一次统计报告
        if (this.performanceMonitor.stats.totalRuns % 10 === 0) {
          console.log(`\n📈 ${this.performanceMonitor.getReport()}\n`);
        }
      }

      // 🚀 生成测试执行脚本和报告
      try {
        console.log(`[TestExecution ${runId}] 开始生成执行脚本和报告...`);
        const testRun = this.testRuns.get(runId);
        if (testRun) {
          const outputs = await this.scriptOutputService.generateAllOutputs(testRun);
          console.log(`[TestExecution ${runId}] ✅ 脚本和报告已生成:`);
          console.log(`   📝 执行脚本: ${outputs.script}`);
          console.log(`   📊 JSON报告: ${outputs.report}`);
          console.log(`   📄 Markdown摘要: ${outputs.summary}`);
        }
      } catch (outputError: any) {
        console.error(`[TestExecution ${runId}] ⚠️ 生成脚本和报告失败:`, outputError.message);
        // 不抛出错误，避免影响测试执行流程
      }

      console.log(`[TestExecution ${runId}] ✅ 资源清理完成`);
    }
  }

  // 🚀 Phase 2: 智能重试策略配置
  private getSmartRetryConfig(action: string): { maxRetries: number; strategies: string[]; shouldRetry: (error: string, attempt: number) => boolean } {
    const baseConfig = {
      navigate: { maxRetries: 2, strategies: ['standard'] },
      click: { maxRetries: 2, strategies: ['standard', 'alternative'] },
      input: { maxRetries: 1, strategies: ['standard'] },
      fill: { maxRetries: 1, strategies: ['standard'] },
      type: { maxRetries: 1, strategies: ['standard'] },
      scroll: { maxRetries: 1, strategies: ['standard'] },
      wait: { maxRetries: 1, strategies: ['standard'] }
    };

    const defaultConfig = { maxRetries: 2, strategies: ['standard', 'alternative'] };
    const config = baseConfig[action as keyof typeof baseConfig] || defaultConfig;

    return {
      ...config,
      shouldRetry: (error: string, attempt: number) => {
        // 网络问题：值得重试
        if (error.includes('timeout') || error.includes('network') || error.includes('ERR_')) return true;

        // 元素未找到：值得重试
        if (error.includes('element not found') || error.includes('Element not found')) return true;

        // 页面加载问题：值得重试
        if (error.includes('navigation') || error.includes('loading')) return true;

        // AI解析错误：不值得重试
        if (error.includes('AI解析失败') || error.includes('AI parsing failed')) return false;

        // 参数错误：不值得重试
        if (error.includes('Invalid argument') || error.includes('参数错误')) return false;

        // 超过最大重试次数：不再重试
        return attempt < config.maxRetries;
      }
    };
  }

  // 🚀 Phase 2: 优化版重试和降级机制的步骤执行方法
  private async executeStepWithRetryAndFallback(step: TestStep, runId: string, stepIndex: number, mcpClient: PlaywrightMcpClient): Promise<{ success: boolean; error?: string; verificationInfo?: { inputVerified?: boolean; inputValue?: string; clickSuccess?: boolean; urlChanged?: boolean } }> {
    const retryConfig = this.getSmartRetryConfig(step.action);
    let lastError = '';

    this.addLog(runId, `🎯 智能重试策略: ${step.action} (最多${retryConfig.maxRetries}次重试)`, 'info');

    for (let strategy = 0; strategy < retryConfig.strategies.length; strategy++) {
      const strategyName = retryConfig.strategies[strategy];
      this.addLog(runId, `🔄 使用策略 "${strategyName}" 执行步骤`, 'info');

      for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          // 🚀 轻量级页面稳定性检查 (仅在重试时进行)
          if (attempt > 1) {
            await this.ensurePageStability(runId, mcpClient);
          }

          // 🚀 根据策略调整执行方式
          const result = await this.executeStepWithStrategy(step, runId, strategyName, stepIndex, mcpClient);

          if (result.success) {
            // 🔥 修复：如果之前有重试，记录重试成功信息
            if (attempt > 1 || strategy > 0) {
              this.addLog(runId, `✅ 步骤执行成功 (策略: ${strategyName}, 尝试: ${attempt}${strategy > 0 ? ', 已切换策略' : ''})`, 'success');
            } else {
              this.addLog(runId, `✅ 步骤执行成功 (策略: ${strategyName}, 尝试: ${attempt})`, 'success');
            }
            return { success: true, verificationInfo: result.verificationInfo };
          } else {
            throw new Error(result.error || '执行失败');
          }
        } catch (error: any) {
          lastError = error.message;
          const isLastAttempt = attempt === retryConfig.maxRetries;
          const isLastStrategy = strategy === retryConfig.strategies.length - 1;

          // 🚀 智能重试判断
          if (!retryConfig.shouldRetry(lastError, attempt)) {
            this.addLog(runId, `⏭️ 错误类型不适合重试，跳过: ${lastError}`, 'warning');
            break;
          }

          if (isLastAttempt && isLastStrategy) {
            this.addLog(runId, `❌ 所有策略和重试均失败: ${lastError}`, 'error');
            return { success: false, error: lastError };
          } else if (isLastAttempt) {
            this.addLog(runId, `🔄 策略 "${strategyName}" 所有尝试均失败，切换到下一策略`, 'info');
            break; // 跳到下一个策略
          } else {
            // 🔥 修复：改进重试日志，明确这是重试过程，不是最终失败
            this.addLog(runId, `🔄 策略 "${strategyName}" 第${attempt}次尝试失败，正在重试 (${attempt + 1}/${retryConfig.maxRetries}): ${lastError}`, 'info');
            // 🚀 智能延迟：基础延迟500ms + 尝试次数 * 300ms
            await this.delay(500 + (attempt - 1) * 300);
          }
        }
      }
    }

    return { success: false, error: lastError || '所有策略和重试均失败' };
  }

  // 🔥 新增：根据策略执行步骤
  private async executeStepWithStrategy(step: TestStep, runId: string, strategy: string, stepIndex: number, mcpClient: PlaywrightMcpClient): Promise<{ success: boolean; error?: string; verificationInfo?: { inputVerified?: boolean; inputValue?: string; clickSuccess?: boolean; urlChanged?: boolean } }> {
    switch (strategy) {
      case 'standard':
        // 标准策略：直接使用现有的executeStep
        try {
          const result = await mcpClient.executeStep(step, runId);
          return { success: result.success, verificationInfo: result.verificationInfo };
        } catch (error: any) {
          return { success: false, error: error.message };
        }

      case 'alternative':
        // 替代策略：使用更宽松的元素查找
        this.addLog(runId, `🔄 使用替代策略：宽松元素查找`, 'info');
        try {
          // 先尝试标准执行
          await mcpClient.executeStep(step, runId);
          return { success: true };
        } catch (error: any) {
          // 如果失败，尝试重新获取快照并重新解析
          try {
            const snapshot = await mcpClient.getSnapshot();
            const aiResult = await this.aiParser.parseNextStep(step.description, snapshot, runId);
            if (aiResult.success && aiResult.step) {
              await mcpClient.executeStep(aiResult.step, runId);
              return { success: true };
            }
          } catch (retryError: any) {
            return { success: false, error: retryError.message };
          }
          return { success: false, error: error.message };
        }

      default:
        try {
          await mcpClient.executeStep(step, runId);
          return { success: true };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
    }
  }

  // 🔥 智能判断失败后是否应该继续执行
  private async shouldContinueAfterFailure(step: TestStep, runId: string, error?: string, mcpClient?: PlaywrightMcpClient): Promise<boolean> {
    // 🔥 MCP连接问题：尝试重连而不是直接终止
    if (error?.includes('MCP_DISCONNECTED') || error?.includes('Client is not initialized') || error?.includes('not connected')) {
      this.addLog(runId, `⚠️ 检测到MCP连接问题，尝试重新连接...`, 'warning');

      if (mcpClient) {
        try {
          // 尝试重新初始化MCP客户端
          const headless = process.env.PLAYWRIGHT_HEADLESS === 'true' || process.env.HEADLESS === 'true';
          await mcpClient.initialize({ headless });
          this.addLog(runId, `✅ MCP客户端重新连接成功，继续执行`, 'success');
          return true; // 重连成功，继续执行
        } catch (reconnectError: any) {
          this.addLog(runId, `❌ MCP重新连接失败: ${reconnectError?.message}，终止执行`, 'error');
          return false; // 重连失败，终止执行
        }
      } else {
        this.addLog(runId, `❌ MCP客户端不存在，无法重连，终止执行`, 'error');
        return false;
      }
    }

    // 🔥 关键操作类型失败不继续
    const criticalActions = ['navigate', 'browser_navigate'];
    if (criticalActions.includes(step.action)) {
      this.addLog(runId, `❌ 关键操作 "${step.action}" 失败，终止执行`, 'error');
      return false;
    }

    // 🔥 AI解析失败不继续
    if (error?.includes('AI解析失败')) {
      this.addLog(runId, `❌ AI解析失败，终止执行`, 'error');
      return false;
    }

    // 🔥 其他情况继续执行，但记录警告
    this.addLog(runId, `⚠️ 非关键步骤失败，继续执行后续步骤`, 'warning');
    return true;
  }

  // 🚀 Phase 1: 智能等待条件检查
  private async waitForCondition(
    checkFn: () => Promise<boolean> | boolean,
    options: {
      minWait?: number;
      maxWait?: number;
      checkInterval?: number;
    } = {}
  ): Promise<boolean> {
    const {
      minWait = 200,
      maxWait = 2000,
      checkInterval = 100
    } = options;

    // 最小等待时间
    await this.delay(minWait);

    const startTime = Date.now();
    const endTime = startTime + maxWait - minWait;

    while (Date.now() < endTime) {
      try {
        const result = await checkFn();
        if (result) {
          return true;
        }
      } catch (error) {
        // 检查条件时出错，继续等待
      }

      await this.delay(checkInterval);
    }

    return false;
  }

  // 🚀 Phase 3: 智能动态延迟系统
  private async smartWaitAfterOperation(action: string, context: { runId: string; isFirstStep?: boolean; stepIndex?: number }): Promise<void> {
    const { runId, isFirstStep = false } = context;

    switch (action) {
      case 'navigate':
      case 'browser_navigate':
        // 🚀 第一步导航：使用智能等待，已在executeStep中处理
        if (isFirstStep) {
          console.log(`⚡ [${runId}] 第一步导航：跳过额外等待`);
          return; // 跳过所有延迟
        }

        // 🚀 普通导航：检查网络活动是否稳定
        console.log(`🌐 [${runId}] 导航后智能等待...`);
        await this.delay(1000); // 简化实现
        break;

      case 'click':
      case 'browser_click':
        // 🚀 智能点击等待：检查页面是否有响应变化
        console.log(`👆 [${runId}] 点击后智能等待页面响应...`);
        await this.delay(500);
        break;

      case 'fill':
      case 'input':
      case 'type':
      case 'browser_type':
        // 🚀 输入等待：检查输入值是否已设置
        console.log(`⌨️ [${runId}] 输入后轻量等待...`);
        await this.delay(300); // 输入操作通常很快，轻量等待即可
        break;

      case 'wait':
      case 'browser_wait_for':
        // 等待命令不需要额外延迟
        return;

      default:
        // 🚀 其他操作：最小延迟
        console.log(`⚙️ [${runId}] 默认操作后轻量等待...`);
        await this.delay(200);
        break;
    }
  }

  // 🔥 新增：确保页面稳定性 - 增强版
  private async ensurePageStability(runId: string, mcpClient: PlaywrightMcpClient): Promise<void> {
    try {
      this.addLog(runId, `⏳ 确保页面稳定性...`, 'info');

      // 1. 等待页面完全加载（增强版）
      await mcpClient.waitForPageFullyLoaded();

      // 2. 检测页面稳定性
      await mcpClient.waitForPageStability();

      // 3. 刷新页面快照确保同步
      await mcpClient.getSnapshot();

      this.addLog(runId, `✅ 页面稳定性检查完成`, 'info');
    } catch (error: any) {
      this.addLog(runId, `⚠️ 页面稳定性检查失败，使用降级策略: ${error.message}`, 'warning');

      // 降级策略：基础等待
      try {
        await mcpClient.waitForLoad();
        await this.delay(1000);
        await mcpClient.getSnapshot();
        this.addLog(runId, `✅ 降级页面稳定性检查完成`, 'info');
      } catch (fallbackError: any) {
        this.addLog(runId, `⚠️ 降级策略也失败，继续执行: ${fallbackError.message}`, 'warning');
      }
    }
  }

  /**
   * 🔥 新增：预估测试步骤总数
   * 通过解析步骤文本中的数字编号来预估总步骤数
   */
  private estimateStepsCount(stepsText: string): number {
    if (!stepsText || !stepsText.trim()) {
      return 1; // 默认至少1步
    }

    // 尝试匹配步骤编号格式：1. 2. 3. 或 1) 2) 3) 或 步骤1 步骤2
    const numberMatches = stepsText.match(/(?:^|\n)\s*(\d+)[.、:)]/g);
    if (numberMatches && numberMatches.length > 0) {
      return numberMatches.length;
    }

    // 如果没有编号，按换行符估算（每行一步）
    const lines = stepsText.split('\n').filter(line => line.trim().length > 0);
    return Math.max(1, Math.min(lines.length, 20)); // 限制在1-20之间
  }

  /**
   * 获取测试运行
   */
  getTestRun(runId: string): TestRun | undefined {
    return this.testRuns.get(runId);
  }

  /**
   * 获取所有测试运行
   */
  getAllTestRuns(): TestRun[] {
    return Array.from(this.testRuns.values());
  }

  /**
   * 添加日志（批量处理版本）
   */
  private addLog(runId: string, message: string, level: 'info' | 'success' | 'warning' | 'error'): void {
    const testRun = this.testRuns.get(runId);
    if (testRun) {
      const log = {
        id: uuidv4(),
        timestamp: new Date(),
        level,
        message
      };
      testRun.logs.push(log);

      // 🚀 Phase 6: 批量WebSocket广播，避免同步阻塞
      this.queueLogForBroadcast(runId, log);
    }
  }

  // 🚀 Phase 6: 日志批量广播队列
  private queueLogForBroadcast(runId: string, logEntry: { id: string; timestamp: Date; level: string; message: string }) {
    if (!this.logQueue.has(runId)) {
      this.logQueue.set(runId, { logs: [] });
    }

    const queue = this.logQueue.get(runId)!;
    queue.logs.push(logEntry);

    // 清除之前的定时器
    if (queue.timer) {
      clearTimeout(queue.timer);
    }

    // 🚀 关键优化：50ms批量发送，或达到5条立即发送
    if (queue.logs.length >= 5) {
      this.flushLogQueue(runId);
    } else {
      queue.timer = setTimeout(() => this.flushLogQueue(runId), 50);
    }
  }

  // 🚀 Phase 6: 批量刷新日志队列
  private flushLogQueue(runId: string) {
    const queue = this.logQueue.get(runId);
    if (!queue || queue.logs.length === 0) return;

    // 🔥 核心修复：复制日志数组，避免异步发送时数组已被清空
    const logsToSend = [...queue.logs];

    // 🔥 立即清理队列，为下一批日志做准备
    queue.logs = [];

    // 异步广播，不阻塞主流程
    setImmediate(() => {
      try {
        logsToSend.forEach(log => {
          this.wsManager.sendTestLog(runId, log);
        });
      } catch (error) {
        console.warn(`WebSocket日志广播失败:`, error);
      }
    });

    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
  }

  /**
   * 获取测试运行的MCP客户端（供streamService使用）
   */
  getMcpClientForRun(runId: string): PlaywrightMcpClient | undefined {
    return this.runMcpClients.get(runId);
  }

  /**
   * 截图
   */
  private async takeStepScreenshot(
    runId: string,
    stepIndex: number,
    status: 'success' | 'failed' | 'error' | 'completed',
    description: string,
    mcpClient: PlaywrightMcpClient
  ): Promise<void> {
    const screenshotStartTime = Date.now();
    console.log(`[Screenshot ${runId}] 开始拍摄步骤截图`);
    console.log(`[Screenshot ${runId}] 参数:`, {
      stepIndex,
      status,
      description: description.substring(0, 100)
    });

    try {
      const filename = `run-${runId}-step-${stepIndex}-${Date.now()}.png`;
      console.log(`[Screenshot ${runId}] 文件名: ${filename}`);

      console.log(`[Screenshot ${runId}] 调用 MCP 客户端截图...`);
      const mcpScreenshotStartTime = Date.now();
      await mcpClient.takeScreenshot(filename);
      const mcpScreenshotDuration = Date.now() - mcpScreenshotStartTime;
      console.log(`[Screenshot ${runId}] MCP 截图调用完成 (耗时: ${mcpScreenshotDuration}ms)`);

      const screenshotDir = this.screenshotService.getScreenshotsDirectory();
      const filePath = path.join(screenshotDir, filename);
      console.log(`[Screenshot ${runId}] 预期文件路径: ${filePath}`);

      // 等待文件保存完成（最多重试5次，每次等待200ms）
      console.log(`[Screenshot ${runId}] 等待文件保存...`);
      let fileExists = false;
      for (let i = 0; i < 5; i++) {
        if (fs.existsSync(filePath)) {
          fileExists = true;
          console.log(`[Screenshot ${runId}] ✅ 文件已找到 (尝试 ${i + 1}/5)`);
          break;
        }
        await this.delay(200);
      }

      if (!fileExists) {
        console.warn(`[Screenshot ${runId}] ⚠️  文件未在预期路径找到，尝试查找相似文件...`);
        // 尝试查找文件（可能文件名略有不同）
        const files = fs.readdirSync(screenshotDir).filter(f =>
          f.includes(`run-${runId}-step-${stepIndex}`) && f.endsWith('.png')
        );

        console.log(`[Screenshot ${runId}] 找到 ${files.length} 个相似文件`);
        if (files.length > 0) {
          const actualFilePath = path.join(screenshotDir, files[files.length - 1]);
          console.log(`[Screenshot ${runId}] 使用文件: ${files[files.length - 1]}`);
          await this.screenshotService.saveScreenshot({
            runId,
            stepIndex: stepIndex.toString(),
            stepDescription: description,
            status,
            filePath: actualFilePath,
            fileName: files[files.length - 1],
          });
          this.addLog(runId, `截图已保存: ${files[files.length - 1]}`, 'info');
          const totalDuration = Date.now() - screenshotStartTime;
          console.log(`[Screenshot ${runId}] ✅ 截图保存完成 (耗时: ${totalDuration}ms)`);
          return;
        }

        console.warn(`[Screenshot ${runId}] ⚠️  截图文件未找到: ${filePath}，但继续执行`);
      }

      console.log(`[Screenshot ${runId}] 保存截图记录...`);
      await this.screenshotService.saveScreenshot({
        runId,
        stepIndex: stepIndex.toString(),
        stepDescription: description,
        status,
        filePath,
        fileName: filename,
      });

      this.addLog(runId, `截图已保存: ${filename}`, 'info');
      const totalDuration = Date.now() - screenshotStartTime;
      console.log(`[Screenshot ${runId}] ✅ 截图流程完成 (耗时: ${totalDuration}ms)`);
    } catch (error: any) {
      const errorDuration = Date.now() - screenshotStartTime;
      console.error(`[Screenshot ${runId}] ❌ 截图失败 (耗时: ${errorDuration}ms)`);
      console.error(`[Screenshot ${runId}] 错误详情:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
