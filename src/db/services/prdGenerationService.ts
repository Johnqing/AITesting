import { query, queryOne, transaction } from '../config.js';
import {
    PRDGenerationTask,
    RequirementInput,
    ClarificationMessage,
    PRDSchema,
    PRDSchemaData,
    PRDGenerationResult
} from '../../types/prdGeneration.js';
import { createLogger } from '../../utils/logger.js';
import { prdService } from './prdService.js';

const logger = createLogger('PRDGenerationService');

export class PRDGenerationService {
    /**
     * 创建生成任务
     */
    async createTask(task: {
        taskId: string;
        title?: string;
        status?: string;
        progress?: number;
        appId?: string;
    }): Promise<PRDGenerationTask> {
        const startTime = Date.now();
        logger.info('Creating task', {
            taskId: task.taskId,
            title: task.title || undefined,
            status: task.status || 'pending',
            progress: task.progress || 0,
            appId: task.appId || undefined
        });

        try {
            const result = await queryOne<any>(
                `INSERT INTO prd_generation_tasks (task_id, title, status, progress, app_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING 
         id,
         task_id as "taskId",
         title,
         status,
         current_step as "currentStep",
         progress,
         error_message as "errorMessage",
         app_id as "appId",
         created_at as "createdAt",
         updated_at as "updatedAt",
         completed_at as "completedAt"`,
                [
                    task.taskId,
                    task.title || null,
                    task.status || 'pending',
                    task.progress || 0,
                    task.appId || null
                ]
            );

            const duration = Date.now() - startTime;
            logger.info('Task created successfully', {
                taskId: task.taskId,
                taskDbId: result.id,
                title: task.title,
                status: task.status,
                duration: `${duration}ms`
            });

            return result as PRDGenerationTask;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error creating task', error, {
                taskId: task.taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 更新任务
     */
    async updateTask(
        taskId: string,
        updates: {
            status?: string;
            currentStep?: string;
            progress?: number;
            errorMessage?: string;
            completedAt?: Date;
        }
    ): Promise<void> {
        const startTime = Date.now();
        console.log(`[PRDGenerationService] Updating task: ${taskId}`, {
            status: updates.status,
            currentStep: updates.currentStep,
            progress: updates.progress,
            hasErrorMessage: !!updates.errorMessage
        });

        const updatesList: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.status !== undefined) {
            updatesList.push(`status = $${paramIndex++}`);
            values.push(updates.status);
        }
        if (updates.currentStep !== undefined) {
            updatesList.push(`current_step = $${paramIndex++}`);
            values.push(updates.currentStep);
        }
        if (updates.progress !== undefined) {
            updatesList.push(`progress = $${paramIndex++}`);
            values.push(updates.progress);
        }
        if (updates.errorMessage !== undefined) {
            updatesList.push(`error_message = $${paramIndex++}`);
            values.push(updates.errorMessage);
        }
        if (updates.completedAt !== undefined) {
            updatesList.push(`completed_at = $${paramIndex++}`);
            values.push(updates.completedAt);
        }

        if (updatesList.length === 0) {
            return;
        }

        values.push(taskId);

        await query(
            `UPDATE prd_generation_tasks 
       SET ${updatesList.join(', ')}
       WHERE task_id = $${paramIndex}`,
            values
        );

        const duration = Date.now() - startTime;
        console.log(`[PRDGenerationService] Task updated: ${taskId}, duration: ${duration}ms`);
    }

    /**
     * 获取任务
     */
    async getTask(taskId: string): Promise<PRDGenerationTask | null> {
        const startTime = Date.now();
        logger.debug('Getting task', { taskId });

        try {
            const result = await queryOne<any>(
                `SELECT 
         id,
         task_id as "taskId",
         title,
         status,
         current_step as "currentStep",
         progress,
         error_message as "errorMessage",
         created_at as "createdAt",
         updated_at as "updatedAt",
         completed_at as "completedAt"
       FROM prd_generation_tasks
       WHERE task_id = $1`,
                [taskId]
            );

            const duration = Date.now() - startTime;
            if (result) {
                logger.debug('Task retrieved successfully', {
                    taskId,
                    taskDbId: result.id,
                    status: result.status,
                    progress: result.progress,
                    duration: `${duration}ms`
                });
            } else {
                logger.debug('Task not found', { taskId, duration: `${duration}ms` });
            }

            return (result as PRDGenerationTask) || null;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting task', error, {
                taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 保存需求输入
     */
    async saveRequirement(taskId: string, requirementText: string): Promise<RequirementInput> {
        const startTime = Date.now();
        logger.debug('Saving requirement', { taskId, requirementLength: requirementText.length });

        try {
            const task = await this.getTask(taskId);
            if (!task) {
                logger.error('Task not found when saving requirement', undefined, { taskId });
                throw new Error(`Task not found: ${taskId}`);
            }

            const result = await queryOne<any>(
                `INSERT INTO prd_requirements (task_id, requirement_text)
       VALUES ($1, $2)
       RETURNING 
         id,
         task_id as "taskId",
         requirement_text as "requirementText",
         created_at as "createdAt"`,
                [task.id, requirementText]
            );

            const duration = Date.now() - startTime;
            logger.info('Requirement saved successfully', {
                taskId,
                requirementId: result.id,
                requirementLength: requirementText.length,
                duration: `${duration}ms`
            });

            return result as RequirementInput;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error saving requirement', error, {
                taskId,
                requirementLength: requirementText.length,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 获取需求输入
     */
    async getRequirements(taskId: string): Promise<RequirementInput[]> {
        const startTime = Date.now();
        logger.debug('Getting requirements', { taskId });

        try {
            const task = await this.getTask(taskId);
            if (!task) {
                logger.debug('Task not found, returning empty requirements', { taskId });
                return [];
            }

            const results = await query<any>(
                `SELECT 
         id,
         task_id as "taskId",
         requirement_text as "requirementText",
         created_at as "createdAt"
       FROM prd_requirements
       WHERE task_id = $1
       ORDER BY created_at`,
                [task.id]
            );

            const duration = Date.now() - startTime;
            logger.debug('Requirements retrieved successfully', {
                taskId,
                count: results.length,
                duration: `${duration}ms`
            });

            return results as RequirementInput[];
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting requirements', error, {
                taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 保存对话消息
     */
    async saveMessage(
        taskId: string,
        role: 'user' | 'assistant',
        content: string,
        messageIndex: number
    ): Promise<ClarificationMessage> {
        const startTime = Date.now();
        console.log(`[PRDGenerationService] Saving message: taskId=${taskId}, role=${role}, index=${messageIndex}, contentLength=${content.length}`);

        const task = await this.getTask(taskId);
        if (!task) {
            console.error(`[PRDGenerationService] Task not found: ${taskId}`);
            throw new Error(`Task not found: ${taskId}`);
        }

        const result = await queryOne<any>(
            `INSERT INTO prd_clarification_messages (task_id, role, content, message_index)
       VALUES ($1, $2, $3, $4)
       RETURNING 
         id,
         task_id as "taskId",
         role,
         content,
         message_index as "messageIndex",
         created_at as "createdAt"`,
            [task.id, role, content, messageIndex]
        );

        const duration = Date.now() - startTime;
        console.log(`[PRDGenerationService] Message saved: taskId=${taskId}, messageId=${result.id}, index=${messageIndex}, duration=${duration}ms`);

        return result as ClarificationMessage;
    }

    /**
     * 获取对话消息
     */
    async getMessages(taskId: string): Promise<ClarificationMessage[]> {
        const startTime = Date.now();
        logger.debug('Getting messages', { taskId });

        try {
            const task = await this.getTask(taskId);
            if (!task) {
                logger.debug('Task not found, returning empty messages', { taskId });
                return [];
            }

            const results = await query<any>(
                `SELECT 
         id,
         task_id as "taskId",
         role,
         content,
         message_index as "messageIndex",
         created_at as "createdAt"
       FROM prd_clarification_messages
       WHERE task_id = $1
       ORDER BY message_index`,
                [task.id]
            );

            const duration = Date.now() - startTime;
            logger.debug('Messages retrieved successfully', {
                taskId,
                count: results.length,
                messageIndices: results.map((m: any) => m.messageIndex),
                duration: `${duration}ms`
            });

            return results as ClarificationMessage[];
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting messages', error, {
                taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 保存Schema
     */
    async saveSchema(taskId: string, schemaData: PRDSchemaData): Promise<PRDSchema> {
        const startTime = Date.now();
        const schemaJson = JSON.stringify(schemaData);
        console.log(`[PRDGenerationService] Saving schema: taskId=${taskId}, schemaSize=${schemaJson.length} bytes`);

        const task = await this.getTask(taskId);
        if (!task) {
            console.error(`[PRDGenerationService] Task not found: ${taskId}`);
            throw new Error(`Task not found: ${taskId}`);
        }

        // 检查是否已存在
        const existing = await queryOne<any>(
            `SELECT id FROM prd_schemas WHERE task_id = $1`,
            [task.id]
        );

        if (existing) {
            // 更新
            console.log(`[PRDGenerationService] Updating existing schema: taskId=${taskId}, schemaId=${existing.id}`);
            const result = await queryOne<any>(
                `UPDATE prd_schemas 
         SET schema_data = $1
         WHERE task_id = $2
         RETURNING 
           id,
           task_id as "taskId",
           schema_data as "schemaData",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
                [JSON.stringify(schemaData), task.id]
            );
            const duration = Date.now() - startTime;
            console.log(`[PRDGenerationService] Schema updated: taskId=${taskId}, schemaId=${result.id}, duration=${duration}ms`);
            return result as PRDSchema;
        } else {
            // 创建
            console.log(`[PRDGenerationService] Creating new schema: taskId=${taskId}`);
            const result = await queryOne<any>(
                `INSERT INTO prd_schemas (task_id, schema_data)
         VALUES ($1, $2)
         RETURNING 
           id,
           task_id as "taskId",
           schema_data as "schemaData",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
                [task.id, JSON.stringify(schemaData)]
            );
            const duration = Date.now() - startTime;
            console.log(`[PRDGenerationService] Schema created: taskId=${taskId}, schemaId=${result.id}, duration=${duration}ms`);
            return result as PRDSchema;
        }
    }

    /**
     * 获取Schema
     */
    async getSchema(taskId: string): Promise<PRDSchema | null> {
        const startTime = Date.now();
        logger.debug('Getting schema', { taskId });

        try {
            const task = await this.getTask(taskId);
            if (!task) {
                logger.debug('Task not found, returning null schema', { taskId });
                return null;
            }

            const result = await queryOne<any>(
                `SELECT 
         id,
         task_id as "taskId",
         schema_data as "schemaData",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM prd_schemas
       WHERE task_id = $1`,
                [task.id]
            );

            if (!result) {
                logger.debug('Schema not found', { taskId });
                return null;
            }

            const schemaData = typeof result.schemaData === 'string'
                ? JSON.parse(result.schemaData)
                : result.schemaData;

            const duration = Date.now() - startTime;
            logger.info('Schema retrieved successfully', {
                taskId,
                schemaId: result.id,
                schemaDataSize: JSON.stringify(schemaData).length,
                hasProductOverview: !!schemaData.productOverview,
                functionalRequirementsCount: schemaData.functionalRequirements?.length || 0,
                duration: `${duration}ms`
            });

            return {
                ...result,
                schemaData
            } as PRDSchema;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting schema', error, {
                taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 保存生成结果
     */
    async saveGenerationResult(taskId: string, prdContent: string): Promise<PRDGenerationResult> {
        const startTime = Date.now();
        console.log(`[PRDGenerationService] Saving generation result: taskId=${taskId}, prdContentLength=${prdContent.length}`);

        const task = await this.getTask(taskId);
        if (!task) {
            console.error(`[PRDGenerationService] Task not found: ${taskId}`);
            throw new Error(`Task not found: ${taskId}`);
        }

        // 检查是否已存在
        const existing = await queryOne<any>(
            `SELECT id FROM prd_generation_results WHERE task_id = $1`,
            [task.id]
        );

        if (existing) {
            // 更新
            console.log(`[PRDGenerationService] Updating existing result: taskId=${taskId}, resultId=${existing.id}`);
            const result = await queryOne<any>(
                `UPDATE prd_generation_results 
         SET prd_content = $1
         WHERE task_id = $2
         RETURNING 
           id,
           task_id as "taskId",
           prd_id as "prdId",
           prd_content as "prdContent",
           created_at as "createdAt"`,
                [prdContent, task.id]
            );
            const duration = Date.now() - startTime;
            console.log(`[PRDGenerationService] Result updated: taskId=${taskId}, resultId=${result.id}, duration=${duration}ms`);
            return result as PRDGenerationResult;
        } else {
            // 创建
            console.log(`[PRDGenerationService] Creating new result: taskId=${taskId}`);
            const result = await queryOne<any>(
                `INSERT INTO prd_generation_results (task_id, prd_content)
         VALUES ($1, $2)
         RETURNING 
           id,
           task_id as "taskId",
           prd_id as "prdId",
           prd_content as "prdContent",
           created_at as "createdAt"`,
                [task.id, prdContent]
            );
            const duration = Date.now() - startTime;
            console.log(`[PRDGenerationService] Result created: taskId=${taskId}, resultId=${result.id}, duration=${duration}ms`);
            return result as PRDGenerationResult;
        }
    }

    /**
     * 关联PRD到结果
     */
    async linkPRDToResult(resultId: string, prdId: string): Promise<void> {
        const startTime = Date.now();
        logger.debug('Linking PRD to result', { resultId, prdId });

        try {
            await query(
                `UPDATE prd_generation_results 
       SET prd_id = $1
       WHERE id = $2`,
                [prdId, resultId]
            );

            const duration = Date.now() - startTime;
            logger.info('PRD linked to result successfully', {
                resultId,
                prdId,
                duration: `${duration}ms`
            });
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error linking PRD to result', error, {
                resultId,
                prdId,
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
        logger.debug('Getting generation result', { taskId });

        try {
            const task = await this.getTask(taskId);
            if (!task) {
                logger.debug('Task not found, returning null result', { taskId });
                return null;
            }

            const result = await queryOne<any>(
                `SELECT 
         prd_content as "prdContent",
         prd_id as "prdId"
       FROM prd_generation_results
       WHERE task_id = $1`,
                [task.id]
            );

            if (!result) {
                logger.debug('Generation result not found', { taskId });
                return null;
            }

            const duration = Date.now() - startTime;
            logger.info('Generation result retrieved successfully', {
                taskId,
                prdId: result.prdId || undefined,
                prdContentLength: result.prdContent?.length || 0,
                duration: `${duration}ms`
            });

            return {
                prdContent: result.prdContent,
                prdId: result.prdId || undefined
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting generation result', error, {
                taskId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 保存PRD到数据库（prds表）
     * 这是PRD生成后的主要保存方法，确保PRD内容被保存到prds表中
     */
    async savePRDToDatabase(taskId: string, prdContent: string): Promise<{ prdId: string; prdDbId: string }> {
        const startTime = Date.now();
        logger.info('Saving PRD to database', {
            taskId,
            prdContentLength: prdContent.length
        });

        try {
            // 获取任务中的应用ID
            const task = await this.getTask(taskId);
            let appId: string | undefined = undefined;
            if (task && (task as any).appId) {
                const { applicationService } = await import('./applicationService.js');
                const app = await applicationService.getApplicationById((task as any).appId);
                if (app) {
                    appId = app.appId;
                }
            }

            // 使用prdService解析并保存PRD
            const prdRecord = await prdService.parseAndSavePRDFromContent(prdContent, taskId, appId);

            if (!prdRecord || !prdRecord.prdId) {
                throw new Error(`Failed to save PRD: prdRecord is ${prdRecord ? 'missing prdId' : 'null'}`);
            }

            // 更新prd_generation_results表，关联prdId
            if (task) {
                const existingResult = await queryOne<any>(
                    `SELECT id FROM prd_generation_results WHERE task_id = $1`,
                    [task.id]
                );

                if (existingResult) {
                    await this.linkPRDToResult(existingResult.id, prdRecord.id);
                    logger.debug('Linked PRD to generation result', {
                        taskId,
                        resultId: existingResult.id,
                        prdId: prdRecord.prdId,
                        prdDbId: prdRecord.id
                    });
                }
            }

            const duration = Date.now() - startTime;
            logger.info('PRD saved to database successfully', {
                taskId,
                prdId: prdRecord.prdId,
                prdDbId: prdRecord.id,
                prdContentLength: prdContent.length,
                duration: `${duration}ms`
            });

            return {
                prdId: prdRecord.prdId,
                prdDbId: prdRecord.id
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error saving PRD to database', error, {
                taskId,
                prdContentLength: prdContent.length,
                duration: `${duration}ms`
            });
            throw error;
        }
    }
}

export const prdGenerationService = new PRDGenerationService();

