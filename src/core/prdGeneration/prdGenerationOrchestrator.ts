import { ClarificationAgent } from './clarificationAgent.js';
import { SchemaAgent } from './schemaAgent.js';
import { PRDGenerationAgent } from './prdGenerationAgent.js';
import {
  PRDGenerationTask,
  GenerationStatus,
  GenerationStep,
  ClarificationMessage,
  PRDSchemaData
} from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { prdGenerationService } from '../../db/services/prdGenerationService.js';

const logger = createLogger('PRDGenerationOrchestrator');

export class PRDGenerationOrchestrator {
  private clarificationAgent: ClarificationAgent;
  private schemaAgent: SchemaAgent;
  private prdGenerationAgent: PRDGenerationAgent;

  constructor() {
    this.clarificationAgent = new ClarificationAgent();
    this.schemaAgent = new SchemaAgent();
    this.prdGenerationAgent = new PRDGenerationAgent();
  }

  /**
   * 启动PRD生成流程
   */
  async startGeneration(
    requirementText: string,
    options: {
      taskId?: string;
      title?: string;
      appId?: string;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();
    logger.start('startGeneration', { requirementLength: requirementText.length });

    try {
      // 创建生成任务
      const taskId = options.taskId || `TASK-${Date.now()}`;
      logger.info('Creating generation task', { 
        taskId, 
        title: options.title,
        requirementLength: requirementText.length 
      });
      
      // 如果提供了appId，需要转换为UUID
      let appIdUuid: string | undefined = undefined;
      if (options.appId) {
        const { applicationService } = await import('../../db/services/applicationService.js');
        const app = await applicationService.getApplicationByAppId(options.appId);
        if (app) {
          appIdUuid = app.id;
          logger.info('Application found', { appId: options.appId, appName: app.name, appUuid: appIdUuid });
        } else {
          logger.warn('Application not found, continuing without app filter', { appId: options.appId });
        }
      }

      const task = await prdGenerationService.createTask({
        taskId,
        title: options.title,
        status: 'pending',
        progress: 0,
        appId: appIdUuid
      });
      logger.info('Task created successfully', { taskId, taskDbId: task.id, appId: options.appId || undefined });

      // 保存需求输入
      logger.debug('Saving requirement input', { taskId });
      const requirement = await prdGenerationService.saveRequirement(taskId, requirementText);
      logger.info('Requirement saved', { 
        taskId, 
        requirementId: requirement.id,
        requirementLength: requirementText.length 
      });

      // 异步执行生成流程
      logger.info('Starting async generation flow', { taskId, appId: options.appId || undefined });
      this.executeGenerationFlow(taskId, requirementText, options.appId).catch((error) => {
        logger.error('Generation flow failed', error, { 
          taskId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });
      });

      logger.info('Generation started successfully', { 
        taskId,
        title: options.title,
        duration: Date.now() - startTime
      });
      logger.end('startGeneration', { taskId }, Date.now() - startTime);

      return taskId;
    } catch (error) {
      logger.error('Error starting generation', error);
      throw error;
    }
  }

  /**
   * 执行Schema和PRD生成步骤
   */
  private async executeSchemaAndGeneration(
    taskId: string,
    requirementText: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    draftSchema?: Partial<PRDSchemaData>,
    appId?: string
  ): Promise<void> {
    const flowStartTime = Date.now();
    logger.info('Starting schema and generation flow', {
      taskId,
      requirementLength: requirementText.length,
      conversationHistoryLength: conversationHistory.length,
      hasDraftSchema: !!draftSchema
    });

    try {
      // 更新状态到Schema阶段
      logger.info('Updating status to schema step', { taskId, progress: 40 });
      await this.updateTaskStatus(taskId, 'running', 'schema', 40);

      // 步骤2: Schema结构化
      const schemaStartTime = Date.now();
      logger.info('Starting schema structuring', {
        taskId,
        requirementLength: requirementText.length,
        conversationMessages: conversationHistory.length
      });

      const schema = await this.schemaAgent.structureToSchema(
        requirementText,
        conversationHistory,
        draftSchema
      );

      const schemaDuration = Date.now() - schemaStartTime;
      logger.info('Schema structured successfully', {
        taskId,
        duration: schemaDuration,
        hasProductOverview: !!schema.productOverview,
        functionalRequirementsCount: schema.functionalRequirements?.length || 0,
        userScenariosCount: schema.userScenarios?.length || 0
      });

      // 保存Schema
      logger.debug('Saving schema to database', { taskId });
      const savedSchema = await prdGenerationService.saveSchema(taskId, schema);
      logger.info('Schema saved to database', {
        taskId,
        schemaId: savedSchema.id,
        schemaDataSize: JSON.stringify(schema).length
      });

      await this.updateTaskStatus(taskId, 'running', 'generation', 60);
      logger.info('Status updated to generation step', { taskId, progress: 60 });

      // 步骤3: PRD生成（使用RAG增强）
      const prdStartTime = Date.now();
      logger.info('Starting PRD generation with RAG', {
        taskId,
        useRAG: true,
        schemaFunctionalRequirements: schema.functionalRequirements?.length || 0
      });

      const prdContent = await this.prdGenerationAgent.generatePRD(schema, undefined, true, appId);

      const prdDuration = Date.now() - prdStartTime;
      logger.info('PRD generated successfully', {
        taskId,
        duration: prdDuration,
        prdContentLength: prdContent.length,
        prdContentPreview: prdContent.substring(0, 200)
      });

      // 保存PRD生成结果到prd_generation_results表
      logger.debug('Saving PRD generation result', { taskId });
      const result = await prdGenerationService.saveGenerationResult(taskId, prdContent);
      logger.info('PRD result saved', {
        taskId,
        resultId: result.id,
        prdContentLength: prdContent.length
      });

      // 保存PRD到prds表（必须操作）
      logger.debug('Saving PRD to prds table', { taskId });
      const prdSaveResult = await prdGenerationService.savePRDToDatabase(taskId, prdContent);
      logger.info('PRD saved to prds table successfully', {
        taskId,
        prdId: prdSaveResult.prdId,
        prdDbId: prdSaveResult.prdDbId,
        resultId: result.id
      });

      // 完成
      const totalDuration = Date.now() - flowStartTime;
      await this.updateTaskStatus(taskId, 'completed', 'generation', 100);
      
      logger.info('Generation flow completed successfully', {
        taskId,
        totalDuration,
        schemaDuration,
        prdDuration,
        prdContentLength: prdContent.length
      });
    } catch (error) {
      logger.error('Generation flow error', error, { taskId });
      await this.updateTaskStatus(taskId, 'failed', undefined, 0, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 执行生成流程
   */
  private async executeGenerationFlow(taskId: string, initialRequirement: string, appId?: string): Promise<void> {
    const flowStartTime = Date.now();
    logger.info('Starting generation flow', {
      taskId,
      requirementLength: initialRequirement.length,
      requirementPreview: initialRequirement.substring(0, 100)
    });

    try {
      logger.info('Updating status to clarification step', { taskId, progress: 10 });
      await this.updateTaskStatus(taskId, 'running', 'clarification', 10);

      // 先保存用户需求消息
      logger.debug('Saving user requirement message', { taskId, messageIndex: 0 });
      try {
        const savedMessage = await prdGenerationService.saveMessage(taskId, 'user', initialRequirement, 0);
        logger.info('User message saved successfully', {
          taskId,
          messageId: savedMessage.id,
          messageIndex: 0,
          messageLength: initialRequirement.length
        });
      } catch (error) {
        logger.warn('Failed to save user message', error, {
          taskId,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });
        // 继续执行，不中断流程
      }

      // 步骤1: 需求澄清
      const clarificationStartTime = Date.now();
      logger.info('Starting requirement clarification', {
        taskId,
        requirementLength: initialRequirement.length
      });

      const clarificationResult = await this.clarificationAgent.clarifyRequirements(initialRequirement);

      const clarificationDuration = Date.now() - clarificationStartTime;
      logger.info('Requirement clarification completed', {
        taskId,
        duration: clarificationDuration,
        isComplete: clarificationResult.isComplete,
        questionsCount: clarificationResult.questions?.length || 0,
        hasStructuredDraft: !!clarificationResult.structuredDraft
      });
      
      if (!clarificationResult.isComplete) {
        // 需求不完整，保存追问问题并等待用户回答
        logger.info('Requirements incomplete, generating clarification questions', {
          taskId,
          questionsCount: clarificationResult.questions.length
        });

        const questionText = clarificationResult.questions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join('\n');
        
        logger.debug('Saving clarification questions', {
          taskId,
          messageIndex: 1,
          questionsTextLength: questionText.length
        });

        try {
          const savedMessage = await prdGenerationService.saveMessage(taskId, 'assistant', questionText, 1);
          logger.info('Assistant clarification questions saved', {
            taskId,
            messageId: savedMessage.id,
            messageIndex: 1,
            questionsCount: clarificationResult.questions.length,
            questionsPreview: clarificationResult.questions.slice(0, 3).map(q => q.question)
          });
        } catch (error) {
          logger.error('Failed to save assistant message', error, {
            taskId,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined
          });
        }
        
        logger.info('Updating status - waiting for user response', { taskId, progress: 30 });
        await this.updateTaskStatus(taskId, 'running', 'clarification', 30);
        
        logger.info('Generation flow paused - waiting for user clarification', {
          taskId,
          questionsCount: clarificationResult.questions.length,
          flowDuration: Date.now() - flowStartTime
        });
        
        // 返回，等待用户继续对话
        return;
      }

      // 需求完整，保存确认消息并继续下一步
      logger.info('Requirements complete, proceeding to schema generation', {
        taskId,
        hasStructuredDraft: !!clarificationResult.structuredDraft
      });

      try {
        const confirmationMessage = await prdGenerationService.saveMessage(
          taskId,
          'assistant',
          '需求信息已完整，开始生成PRD文档...',
          1
        );
        logger.info('Assistant confirmation message saved', {
          taskId,
          messageId: confirmationMessage.id,
          messageIndex: 1
        });
      } catch (error) {
        logger.warn('Failed to save confirmation message', error, {
          taskId,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }

      logger.debug('Loading conversation history', { taskId });
      const conversationHistory = await prdGenerationService.getMessages(taskId);
      logger.info('Conversation history loaded', {
        taskId,
        messageCount: conversationHistory.length,
        conversationHistory: conversationHistory.map(m => ({
          role: m.role,
          contentLength: m.content.length,
          index: m.messageIndex
        }))
      });

      // 获取任务中的应用ID
      const task = await prdGenerationService.getTask(taskId);
      let appId: string | undefined = undefined;
      if (task && (task as any).appId) {
        const { applicationService } = await import('../../db/services/applicationService.js');
        const app = await applicationService.getApplicationById((task as any).appId);
        if (app) {
          appId = app.appId;
        }
      }

      await this.executeSchemaAndGeneration(
        taskId,
        initialRequirement,
        conversationHistory.map(m => ({ role: m.role, content: m.content })),
        clarificationResult.structuredDraft,
        appId
      );
    } catch (error) {
      logger.error('Generation flow error', error, { taskId });
      await this.updateTaskStatus(taskId, 'failed', undefined, 0, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 继续对话（用户回答追问问题）
   */
  async continueConversation(
    taskId: string,
    userResponse: string
  ): Promise<{ isComplete: boolean; questions?: string[] }> {
    const startTime = Date.now();
    logger.start('continueConversation', { taskId, userResponseLength: userResponse.length });

    try {
      // 保存用户回答
      const messages = await prdGenerationService.getMessages(taskId);
      const nextIndex = messages.length;
      try {
        await prdGenerationService.saveMessage(taskId, 'user', userResponse, nextIndex);
        logger.debug('User response saved', { taskId, messageIndex: nextIndex });
      } catch (error) {
        logger.error('Failed to save user response', error, { taskId });
        throw error; // 保存失败应该抛出错误
      }

      // 获取所有对话历史
      const conversationHistory = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));
      conversationHistory.push({ role: 'user', content: userResponse });

      // 获取原始需求
      logger.debug('Getting requirements for clarification', { taskId });
      const requirements = await prdGenerationService.getRequirements(taskId);
      const requirementText = requirements.map(r => r.requirementText).join('\n\n');
      
      logger.info('Requirements retrieved for clarification', {
        taskId,
        requirementsCount: requirements.length,
        requirementTextLength: requirementText.length,
        conversationHistoryLength: conversationHistory.length
      });

      // 继续澄清
      logger.info('Calling clarification agent', {
        taskId,
        requirementTextLength: requirementText.length,
        conversationHistoryLength: conversationHistory.length
      });
      const clarificationResult = await this.clarificationAgent.clarifyRequirements(
        requirementText,
        conversationHistory
      );
      
      logger.info('Clarification result received', {
        taskId,
        isComplete: clarificationResult.isComplete,
        questionsCount: clarificationResult.questions?.length || 0,
        hasStructuredDraft: !!clarificationResult.structuredDraft
      });

      if (!clarificationResult.isComplete) {
        // 仍有问题
        const questionText = clarificationResult.questions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join('\n');
        
        try {
          await prdGenerationService.saveMessage(taskId, 'assistant', questionText, nextIndex + 1);
          logger.info('Assistant follow-up questions saved', { 
            taskId, 
            questionsCount: clarificationResult.questions.length,
            messageIndex: nextIndex + 1
          });
        } catch (error) {
          logger.error('Failed to save assistant follow-up questions', error, { 
            taskId,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
        
        const duration = Date.now() - startTime;
        logger.info('Continue conversation completed - requirements incomplete', {
          taskId,
          isComplete: false,
          questionsCount: clarificationResult.questions.length,
          duration: `${duration}ms`
        });
        logger.end('continueConversation', { isComplete: false }, duration);
        
        return {
          isComplete: false,
          questions: clarificationResult.questions.map(q => q.question)
        };
      }

      // 需求完整，继续生成流程（从Schema步骤开始）
      logger.info('Requirements complete, checking task status', {
        taskId,
        conversationHistoryLength: conversationHistory.length,
        hasStructuredDraft: !!clarificationResult.structuredDraft
      });

      const task = await prdGenerationService.getTask(taskId);
      if (!task) {
        logger.error('Task not found when requirements complete', undefined, { taskId });
        throw new Error(`Task not found: ${taskId}`);
      }

      if (task.status === 'running' && task.currentStep === 'clarification') {
        // 保存确认消息
        try {
          await prdGenerationService.saveMessage(
            taskId,
            'assistant',
            '需求信息已完整，开始生成PRD文档...',
            nextIndex + 1
          );
          logger.info('Assistant confirmation message saved', { 
            taskId,
            messageIndex: nextIndex + 1
          });
        } catch (error) {
          logger.warn('Failed to save confirmation message, continuing anyway', error, { 
            taskId,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }

        // conversationHistory已经包含了最新的userResponse（在line 393），不需要重复添加
        // 继续执行后续步骤
        logger.info('Proceeding to schema generation from continueConversation', {
          taskId,
          conversationHistoryLength: conversationHistory.length,
          hasStructuredDraft: !!clarificationResult.structuredDraft,
          requirementTextLength: requirementText.length,
          userResponseLength: userResponse.length
        });

        // 获取任务中的应用ID
        const taskForApp = await prdGenerationService.getTask(taskId);
        let appIdForContinue: string | undefined = undefined;
        if (taskForApp && (taskForApp as any).appId) {
          const { applicationService } = await import('../../db/services/applicationService.js');
          const app = await applicationService.getApplicationById((taskForApp as any).appId);
          if (app) {
            appIdForContinue = app.appId;
          }
        }

        // 异步执行，避免阻塞
        this.executeSchemaAndGeneration(
          taskId,
          requirementText + '\n\n' + userResponse,
          conversationHistory, // conversationHistory已经包含了userResponse
          clarificationResult.structuredDraft,
          appIdForContinue
        ).catch((error) => {
          logger.error('Schema and generation flow failed in continueConversation', error, {
            taskId,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined
          });
        });
      } else {
        logger.warn('Task status is not suitable for continuing generation', {
          taskId,
          status: task.status,
          currentStep: task.currentStep
        });
      }

      const duration = Date.now() - startTime;
      logger.info('Continue conversation completed - requirements complete', {
        taskId,
        isComplete: true,
        duration: `${duration}ms`
      });
      logger.end('continueConversation', { isComplete: true }, duration);

      return { isComplete: true };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error continuing conversation', error, { 
        taskId,
        duration: `${duration}ms`,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      logger.end('continueConversation', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(
    taskId: string,
    status: GenerationStatus,
    currentStep?: GenerationStep,
    progress?: number,
    errorMessage?: string
  ): Promise<void> {
    logger.debug('Updating task status', {
      taskId,
      status,
      currentStep,
      progress,
      hasErrorMessage: !!errorMessage
    });

    try {
      await prdGenerationService.updateTask(taskId, {
        status,
        currentStep,
        progress,
        errorMessage,
        completedAt: status === 'completed' ? new Date() : undefined
      });

      logger.debug('Task status updated successfully', {
        taskId,
        status,
        currentStep,
        progress
      });
    } catch (error) {
      logger.error('Failed to update task status', error, {
        taskId,
        status,
        currentStep,
        progress,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<PRDGenerationTask | null> {
    const startTime = Date.now();
    logger.debug('Getting task status', { taskId });

    try {
      const task = await prdGenerationService.getTask(taskId);
      const duration = Date.now() - startTime;
      
      if (task) {
        logger.debug('Task status retrieved successfully', {
          taskId,
          status: task.status,
          progress: task.progress,
          currentStep: task.currentStep,
          duration: `${duration}ms`
        });
      } else {
        logger.debug('Task not found', { taskId, duration: `${duration}ms` });
      }

      return task;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error getting task status', error, {
        taskId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 获取生成结果
   */
  async getGenerationResult(taskId: string): Promise<{ prdContent: string; prdId?: string } | null> {
    const startTime = Date.now();
    logger.debug('Getting generation result via orchestrator', { taskId });

    try {
      const result = await prdGenerationService.getGenerationResult(taskId);
      const duration = Date.now() - startTime;

      if (result) {
        logger.info('Generation result retrieved successfully via orchestrator', {
          taskId,
          prdId: result.prdId,
          prdContentLength: result.prdContent.length,
          duration: `${duration}ms`
        });
      } else {
        logger.debug('Generation result not found', { taskId, duration: `${duration}ms` });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error getting generation result via orchestrator', error, {
        taskId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }
}

