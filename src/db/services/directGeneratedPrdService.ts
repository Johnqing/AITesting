import { query, queryOne } from '../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('DirectGeneratedPrdService');

export interface DirectGeneratedPRD {
    id: string;
    sourcePrdId?: string;
    title: string;
    description?: string;
    prdContent: string;
    requirementText?: string;
    version: string;
    status: string;
    author?: string;
    appId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateDirectGeneratedPRDInput {
    sourcePrdId?: string;
    title: string;
    description?: string;
    prdContent: string;
    requirementText?: string;
    version?: string;
    status?: string;
    author?: string;
    appId?: string;
}

export class DirectGeneratedPrdService {
    /**
     * 创建直接生成的PRD记录
     */
    async createDirectGeneratedPRD(input: CreateDirectGeneratedPRDInput): Promise<DirectGeneratedPRD> {
        const startTime = Date.now();
        logger.start('createDirectGeneratedPRD', {
            title: input.title,
            hasSourcePrdId: !!input.sourcePrdId,
            hasAppId: !!input.appId
        });

        try {
            // 如果提供了appId（字符串形式的app_id），需要转换为数据库UUID
            let appDbId: string | null = null;
            if (input.appId) {
                const { applicationService } = await import('./applicationService.js');
                const app = await applicationService.getApplicationByAppId(input.appId);
                if (app) {
                    appDbId = app.id;
                }
            }

            // 如果提供了sourcePrdId（字符串形式的prd_id），需要转换为数据库UUID
            let sourcePrdDbId: string | null = null;
            if (input.sourcePrdId) {
                const { prdService } = await import('./prdService.js');
                const sourcePrd = await prdService.getPRDById(input.sourcePrdId);
                if (sourcePrd) {
                    sourcePrdDbId = sourcePrd.id;
                }
            }

            const result = await queryOne<any>(
                `INSERT INTO direct_generated_prds (
                    source_prd_id,
                    title,
                    description,
                    prd_content,
                    requirement_text,
                    version,
                    status,
                    author,
                    app_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING 
                    id,
                    source_prd_id as "sourcePrdId",
                    title,
                    description,
                    prd_content as "prdContent",
                    requirement_text as "requirementText",
                    version,
                    status,
                    author,
                    app_id as "appId",
                    created_at as "createdAt",
                    updated_at as "updatedAt"`,
                [
                    sourcePrdDbId,
                    input.title,
                    input.description || null,
                    input.prdContent,
                    input.requirementText || null,
                    input.version || '1.0.0',
                    input.status || 'draft',
                    input.author || null,
                    appDbId
                ]
            );

            const duration = Date.now() - startTime;
            logger.info('Direct generated PRD created successfully', {
                id: result.id,
                title: result.title,
                duration: `${duration}ms`
            });
            logger.end('createDirectGeneratedPRD', { id: result.id }, duration);

            return result as DirectGeneratedPRD;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error creating direct generated PRD', error, {
                title: input.title,
                duration: `${duration}ms`
            });
            logger.end('createDirectGeneratedPRD', { success: false }, duration);
            throw error;
        }
    }

    /**
     * 根据ID获取直接生成的PRD
     */
    async getDirectGeneratedPRDById(id: string): Promise<DirectGeneratedPRD | null> {
        const startTime = Date.now();
        logger.debug('Getting direct generated PRD by id', { id });

        try {
            const result = await queryOne<any>(
                `SELECT 
                    id,
                    source_prd_id as "sourcePrdId",
                    title,
                    description,
                    prd_content as "prdContent",
                    requirement_text as "requirementText",
                    version,
                    status,
                    author,
                    app_id as "appId",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM direct_generated_prds
                WHERE id = $1`,
                [id]
            );

            const duration = Date.now() - startTime;
            if (result) {
                logger.debug('Direct generated PRD retrieved successfully', {
                    id,
                    title: result.title,
                    duration: `${duration}ms`
                });
            } else {
                logger.debug('Direct generated PRD not found', { id, duration: `${duration}ms` });
            }

            return (result as DirectGeneratedPRD) || null;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting direct generated PRD by id', error, {
                id,
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 获取所有直接生成的PRD
     */
    async getAllDirectGeneratedPRDs(): Promise<DirectGeneratedPRD[]> {
        const startTime = Date.now();
        logger.debug('Getting all direct generated PRDs');

        try {
            const results = await query<any>(
                `SELECT 
                    id,
                    source_prd_id as "sourcePrdId",
                    title,
                    description,
                    prd_content as "prdContent",
                    requirement_text as "requirementText",
                    version,
                    status,
                    author,
                    app_id as "appId",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM direct_generated_prds
                ORDER BY created_at DESC`
            );

            const duration = Date.now() - startTime;
            logger.info('Direct generated PRDs retrieved successfully', {
                count: results.length,
                duration: `${duration}ms`
            });

            return results as DirectGeneratedPRD[];
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting all direct generated PRDs', error, {
                duration: `${duration}ms`
            });
            throw error;
        }
    }

    /**
     * 根据源PRD ID获取所有相关的直接生成的PRD
     */
    async getDirectGeneratedPRDsBySourcePrdId(sourcePrdId: string): Promise<DirectGeneratedPRD[]> {
        const startTime = Date.now();
        logger.debug('Getting direct generated PRDs by source PRD id', { sourcePrdId });

        try {
            // 先获取源PRD的数据库UUID
            const { prdService } = await import('./prdService.js');
            const sourcePrd = await prdService.getPRDById(sourcePrdId);
            if (!sourcePrd) {
                return [];
            }

            const results = await query<any>(
                `SELECT 
                    id,
                    source_prd_id as "sourcePrdId",
                    title,
                    description,
                    prd_content as "prdContent",
                    requirement_text as "requirementText",
                    version,
                    status,
                    author,
                    app_id as "appId",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM direct_generated_prds
                WHERE source_prd_id = $1
                ORDER BY created_at DESC`,
                [sourcePrd.id]
            );

            const duration = Date.now() - startTime;
            logger.info('Direct generated PRDs retrieved by source PRD id', {
                sourcePrdId,
                count: results.length,
                duration: `${duration}ms`
            });

            return results as DirectGeneratedPRD[];
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error getting direct generated PRDs by source PRD id', error, {
                sourcePrdId,
                duration: `${duration}ms`
            });
            throw error;
        }
    }
}

export const directGeneratedPrdService = new DirectGeneratedPrdService();

