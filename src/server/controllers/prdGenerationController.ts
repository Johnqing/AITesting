import { Request, Response } from 'express';
import { PRDGenerationOrchestrator } from '../../core/prdGeneration/prdGenerationOrchestrator.js';
import { prdGenerationService } from '../../db/services/prdGenerationService.js';
import { PRDGenerationAgent } from '../../core/prdGeneration/prdGenerationAgent.js';
import { createLogger } from '../../utils/logger.js';
import { prdService } from '../../db/services/prdService.js';
import { PRDParser } from '../../core/parser/prdParser.js';
import { queryOne } from '../../db/config.js';

const logger = createLogger('PRDGenerationController');
const orchestrator = new PRDGenerationOrchestrator();
const prdGenerationAgent = new PRDGenerationAgent();

/**
 * 启动PRD生成
 * POST /api/v1/prd/generate
 */
export async function startPRDGeneration(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  logger.start('startPRDGeneration', {
    requirementLength: req.body.requirement?.length || 0,
    hasTitle: !!req.body.title
  });

  try {
    const { requirement, title, appId } = req.body;

    if (!requirement || typeof requirement !== 'string' || requirement.trim() === '') {
      logger.warn('Invalid request: requirement is empty');
      res.status(400).json({
        success: false,
        error: '需求文本不能为空'
      });
      return;
    }

    logger.info('Starting PRD generation', {
      requirementLength: requirement.length,
      title: title || undefined,
      appId: appId || undefined
    });

    const taskId = await orchestrator.startGeneration(requirement.trim(), { title, appId });

    const duration = Date.now() - startTime;
    logger.info('PRD generation started successfully', {
      taskId,
      duration: `${duration}ms`
    });
    logger.end('startPRDGeneration', { taskId }, duration);

    res.json({
      success: true,
      data: {
        taskId
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error starting PRD generation', error, {
      duration: `${duration}ms`,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    logger.end('startPRDGeneration', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '启动PRD生成失败'
    });
  }
}

/**
 * 获取生成任务状态
 * GET /api/v1/prd/generate/:taskId/status
 */
export async function getGenerationStatus(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  logger.debug('Getting generation status', { taskId });

  try {
    const task = await orchestrator.getTaskStatus(taskId);

    if (!task) {
      logger.warn('Task not found', { taskId });
      res.status(404).json({
        success: false,
        error: '任务不存在'
      });
      return;
    }

    const duration = Date.now() - startTime;
    logger.debug('Generation status retrieved successfully', {
      taskId,
      status: task.status,
      progress: task.progress,
      duration: `${duration}ms`
    });

    // 禁用缓存，确保每次请求都返回最新状态
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting generation status', error, {
      taskId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取状态失败'
    });
  }
}

/**
 * 继续对话（回答追问问题）
 * POST /api/v1/prd/generate/:taskId/continue
 */
export async function continueConversation(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  const { response } = req.body;
  logger.start('continueConversation', {
    taskId,
    responseLength: response?.length || 0
  });

  try {
    if (!response || typeof response !== 'string' || response.trim() === '') {
      logger.warn('Invalid request: response is empty', { taskId });
      res.status(400).json({
        success: false,
        error: '回答不能为空'
      });
      return;
    }

    logger.info('Continuing conversation', {
      taskId,
      responseLength: response.length
    });

    const result = await orchestrator.continueConversation(taskId, response.trim());

    const duration = Date.now() - startTime;
    logger.info('Conversation continued successfully', {
      taskId,
      isComplete: result.isComplete,
      questionsCount: result.questions?.length || 0,
      duration: `${duration}ms`
    });
    logger.end('continueConversation', { isComplete: result.isComplete }, duration);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error continuing conversation', error, {
      taskId,
      duration: `${duration}ms`,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    logger.end('continueConversation', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '继续对话失败'
    });
  }
}

/**
 * 获取对话历史
 * GET /api/v1/prd/generate/:taskId/messages
 */
export async function getMessages(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  logger.debug('Getting messages', { taskId });

  try {
    const messages = await prdGenerationService.getMessages(taskId);

    const duration = Date.now() - startTime;
    logger.debug('Messages retrieved successfully', {
      taskId,
      messageCount: messages.length,
      duration: `${duration}ms`
    });

    // 禁用缓存，确保每次请求都返回最新消息
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting messages', error, {
      taskId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取对话历史失败'
    });
  }
}

/**
 * SSE流式推送对话消息和任务状态
 * GET /api/v1/prd/generate/:taskId/stream
 */
export async function streamConversation(req: Request, res: Response): Promise<void> {
  const { taskId } = req.params;
  logger.info('Starting SSE stream for conversation', { taskId });

  // 设置SSE响应头
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用nginx缓冲
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // 发送初始连接确认
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ taskId, timestamp: new Date().toISOString() })}\n\n`);

  // 获取初始状态和消息
  let lastMessageCount = 0;
  let lastStatus: string | null = null;
  let lastProgress = -1;
  let isClientConnected = true;
  let pollInterval: NodeJS.Timeout | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  // 清理函数
  const cleanup = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    isClientConnected = false;
    logger.info('SSE stream cleaned up', { taskId });
  };

  // 客户端断开连接处理
  req.on('close', () => {
    cleanup();
  });

  req.on('error', (error) => {
    logger.error('SSE request error', error, { taskId });
    cleanup();
  });

  try {
    // 发送初始任务状态
    const initialTask = await orchestrator.getTaskStatus(taskId);
    if (initialTask) {
      res.write(`event: status\n`);
      res.write(`data: ${JSON.stringify({
        status: initialTask.status,
        currentStep: initialTask.currentStep,
        progress: initialTask.progress,
        errorMessage: initialTask.errorMessage,
        timestamp: new Date().toISOString()
      })}\n\n`);
      lastStatus = initialTask.status;
      lastProgress = initialTask.progress;
    }

    // 发送所有现有消息
    const initialMessages = await prdGenerationService.getMessages(taskId);
    if (initialMessages.length > 0) {
      res.write(`event: messages\n`);
      res.write(`data: ${JSON.stringify({
        messages: initialMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          messageIndex: m.messageIndex,
          createdAt: m.createdAt
        })),
        timestamp: new Date().toISOString()
      })}\n\n`);
      lastMessageCount = initialMessages.length;
    }
  } catch (error) {
    logger.error('Error sending initial data', error, { taskId });
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to load initial data',
      timestamp: new Date().toISOString()
    })}\n\n`);
  }

  // 心跳保持连接
  heartbeatInterval = setInterval(() => {
    if (!isClientConnected) {
      cleanup();
      return;
    }
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      // 客户端已断开，清理资源
      cleanup();
    }
  }, 30000); // 每30秒发送一次心跳

  // 轮询检查新消息和状态更新
  pollInterval = setInterval(async () => {
    if (!isClientConnected) {
      cleanup();
      return;
    }

    try {
      // 检查任务状态
      const task = await orchestrator.getTaskStatus(taskId);
      if (task) {
        // 如果状态或进度发生变化，推送状态更新
        if (task.status !== lastStatus || task.progress !== lastProgress) {
          res.write(`event: status\n`);
          res.write(`data: ${JSON.stringify({
            status: task.status,
            currentStep: task.currentStep,
            progress: task.progress,
            errorMessage: task.errorMessage,
            timestamp: new Date().toISOString()
          })}\n\n`);

          lastStatus = task.status;
          lastProgress = task.progress;

          // 如果任务完成或失败，发送完成事件并关闭连接
          if (task.status === 'completed' || task.status === 'failed') {
            res.write(`event: completed\n`);
            res.write(`data: ${JSON.stringify({
              status: task.status,
              timestamp: new Date().toISOString()
            })}\n\n`);
            cleanup();
            res.end();
            return;
          }
        }
      }

      // 检查新消息
      const messages = await prdGenerationService.getMessages(taskId);
      if (messages.length > lastMessageCount) {
        // 发送新增的消息
        const newMessages = messages.slice(lastMessageCount);
        logger.debug('Sending new messages via SSE', {
          taskId,
          newMessageCount: newMessages.length,
          totalMessages: messages.length
        });
        for (const message of newMessages) {
          const messageData = {
            id: message.id,
            role: message.role,
            content: message.content,
            messageIndex: message.messageIndex,
            createdAt: message.createdAt,
            timestamp: new Date().toISOString()
          };
          logger.debug('Sending SSE message event', {
            taskId,
            messageId: message.id,
            role: message.role,
            contentLength: message.content.length
          });
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(messageData)}\n\n`);
        }
        lastMessageCount = messages.length;
      }
    } catch (error) {
      logger.error('Error in SSE polling', error, { taskId });
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }
  }, 1000); // 每秒检查一次

  // 设置超时（30分钟）
  timeoutId = setTimeout(() => {
    logger.info('SSE stream timeout', { taskId });
    try {
      res.write(`event: timeout\n`);
      res.write(`data: ${JSON.stringify({
        message: 'Stream timeout after 30 minutes',
        timestamp: new Date().toISOString()
      })}\n\n`);
    } catch (error) {
      // 忽略写入错误
    }
    cleanup();
    res.end();
  }, 30 * 60 * 1000);
}

/**
 * 获取生成结果
 * GET /api/v1/prd/generate/:taskId/result
 */
export async function getGenerationResult(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  logger.debug('Getting generation result', { taskId });

  try {
    const result = await orchestrator.getGenerationResult(taskId);

    if (!result) {
      logger.warn('Generation result not found', { taskId });
      res.status(404).json({
        success: false,
        error: '生成结果不存在'
      });
      return;
    }

    const duration = Date.now() - startTime;
    logger.info('Generation result retrieved successfully', {
      taskId,
      prdId: result.prdId,
      prdContentLength: result.prdContent.length,
      duration: `${duration}ms`
    });

    // 禁用缓存，确保每次请求都返回最新结果
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting generation result', error, {
      taskId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取生成结果失败'
    });
  }
}

/**
 * 获取Schema
 * GET /api/v1/prd/generate/:taskId/schema
 */
export async function getSchema(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  logger.debug('Getting schema', { taskId });

  try {
    const schema = await prdGenerationService.getSchema(taskId);

    if (!schema) {
      logger.warn('Schema not found', { taskId });
      res.status(404).json({
        success: false,
        error: 'Schema不存在'
      });
      return;
    }

    const duration = Date.now() - startTime;
    logger.info('Schema retrieved successfully', {
      taskId,
      schemaId: schema.id,
      schemaDataSize: JSON.stringify(schema.schemaData).length,
      duration: `${duration}ms`
    });

    // 禁用缓存，确保每次请求都返回最新Schema
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting schema', error, {
      taskId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取Schema失败'
    });
  }
}

/**
 * 保存生成的PRD到prds表
 * POST /api/v1/prd/generate/:taskId/save
 */
export async function saveGeneratedPRD(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  const { title, description, version, status, author, prdContent: editedContent } = req.body;
  logger.start('saveGeneratedPRD', { taskId, hasEditedContent: !!editedContent });

  try {
    // 如果提供了编辑后的内容，先更新生成结果
    if (editedContent) {
      logger.info('Updating generation result with edited content', {
        taskId,
        contentLength: editedContent.length
      });
      await prdGenerationService.saveGenerationResult(taskId, editedContent);
    }

    // 获取生成结果（可能是更新后的）
    const result = await orchestrator.getGenerationResult(taskId);
    if (!result || !result.prdContent) {
      logger.warn('PRD generation result not found', { taskId });
      res.status(404).json({
        success: false,
        error: 'PRD生成结果不存在，请先完成PRD生成'
      });
      return;
    }

    // 获取任务信息
    const task = await orchestrator.getTaskStatus(taskId);
    if (!task) {
      logger.warn('Task not found', { taskId });
      res.status(404).json({
        success: false,
        error: '任务不存在'
      });
      return;
    }

    // 解析PRD内容
    logger.info('Parsing PRD content', {
      taskId,
      prdContentLength: result.prdContent.length,
      hasPrdId: !!result.prdId
    });

    const parser = new PRDParser();
    const prd = await parser.parseContent(result.prdContent);

    // 使用提供的字段或任务信息覆盖解析结果
    if (title) {
      prd.title = title;
    } else if (task.title) {
      prd.title = task.title;
    }

    if (description) prd.description = description;
    if (version) prd.version = version;
    if (status) prd.status = status;
    if (author) prd.author = author;

    // 如果生成结果已经有prdId，使用它
    if (result.prdId) {
      prd.prdId = result.prdId;
    }

    // 保存PRD
    logger.info('Saving PRD to database', {
      taskId,
      prdId: prd.prdId,
      title: prd.title
    });

    const prdRecord = await prdService.upsertPRD(prd);

    // 如果生成结果还没有关联PRD，建立关联
    // prdRecord.id 是 prds 表的数据库 UUID，prdRecord.prdId 是业务ID
    const taskRecord = await prdGenerationService.getTask(taskId);
    if (taskRecord) {
      const resultRecord = await queryOne<any>(
        `SELECT id, prd_id as "prdId" FROM prd_generation_results WHERE task_id = $1`,
        [taskRecord.id]
      );
      if (resultRecord && resultRecord.id) {
        // 如果还没有关联PRD，或者关联的PRD不同，更新关联
        // linkPRDToResult 的 prdId 参数应该是 prds 表的 id (UUID)，不是 prdId (业务ID)
        if (!resultRecord.prdId || resultRecord.prdId !== prdRecord.id) {
          await prdGenerationService.linkPRDToResult(resultRecord.id, prdRecord.id);
          logger.debug('Linked PRD to generation result', {
            taskId,
            resultId: resultRecord.id,
            prdDbId: prdRecord.id,
            prdBusinessId: prdRecord.prdId,
            wasLinked: !!resultRecord.prdId
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('PRD saved successfully', {
      taskId,
      prdId: prdRecord.prdId,
      prdDbId: prdRecord.id,
      title: prdRecord.title,
      duration: `${duration}ms`
    });
    logger.end('saveGeneratedPRD', { prdId: prdRecord.prdId }, duration);

    res.json({
      success: true,
      data: {
        prdId: prdRecord.prdId,
        id: prdRecord.id,
        title: prdRecord.title,
        message: 'PRD保存成功'
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error saving generated PRD', error, {
      taskId,
      duration: `${duration}ms`,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    logger.end('saveGeneratedPRD', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '保存PRD失败'
    });
  }
}

/**
 * 导出PRD为Markdown文件
 * GET /api/v1/prd/generate/:taskId/export
 */
export async function exportPRDAsMarkdown(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  logger.debug('Exporting PRD as markdown', { taskId });

  try {
    const result = await orchestrator.getGenerationResult(taskId);

    if (!result) {
      logger.warn('Generation result not found for export', { taskId });
      res.status(404).json({
        success: false,
        error: '生成结果不存在'
      });
      return;
    }

    const task = await prdGenerationService.getTask(taskId);
    const fileName = task?.title 
      ? `${task.title.replace(/[^\w\s-]/g, '')}.md`
      : `PRD-${taskId}.md`;

    const duration = Date.now() - startTime;
    logger.info('PRD exported as markdown successfully', {
      taskId,
      fileName,
      contentLength: result.prdContent.length,
      duration: `${duration}ms`
    });

    // 设置响应头，让浏览器下载文件
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(result.prdContent);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error exporting PRD as markdown', error, {
      taskId,
      duration: `${duration}ms`
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '导出失败'
    });
  }
}

/**
 * 段落级重生成
 * POST /api/v1/prd/generate/:taskId/regenerate-paragraph
 */
export async function regenerateParagraph(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { taskId } = req.params;
  const { sectionTitle, context } = req.body;
  logger.start('regenerateParagraph', {
    taskId,
    sectionTitle,
    contextLength: context?.length || 0
  });

  try {
    if (!sectionTitle || typeof sectionTitle !== 'string') {
      logger.warn('Invalid request: sectionTitle is empty', { taskId });
      res.status(400).json({
        success: false,
        error: '章节标题不能为空'
      });
      return;
    }

    logger.debug('Getting schema for paragraph regeneration', { taskId });
    const schema = await prdGenerationService.getSchema(taskId);
    if (!schema) {
      logger.warn('Schema not found for paragraph regeneration', { taskId });
      res.status(404).json({
        success: false,
        error: 'Schema不存在'
      });
      return;
    }

    logger.info('Regenerating paragraph', {
      taskId,
      sectionTitle,
      contextLength: context?.length || 0
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

    const paragraph = await prdGenerationAgent.regenerateParagraph(
      schema.schemaData,
      sectionTitle,
      context || '',
      true,
      appId
    );

    const duration = Date.now() - startTime;
    logger.info('Paragraph regenerated successfully', {
      taskId,
      sectionTitle,
      paragraphLength: paragraph.length,
      duration: `${duration}ms`
    });
    logger.end('regenerateParagraph', { success: true }, duration);

    res.json({
      success: true,
      data: {
        sectionTitle,
        content: paragraph
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error regenerating paragraph', error, {
      taskId,
      sectionTitle,
      duration: `${duration}ms`,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    logger.end('regenerateParagraph', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '段落重生成失败'
    });
  }
}

