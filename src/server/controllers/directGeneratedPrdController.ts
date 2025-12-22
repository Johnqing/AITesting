import { Request, Response } from 'express';
import { directGeneratedPrdService } from '../../db/services/directGeneratedPrdService.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('DirectGeneratedPrdController');

/**
 * 获取所有直接生成的PRD
 * GET /api/v1/direct-generated-prds
 */
export async function getAllDirectGeneratedPRDs(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  logger.start('getAllDirectGeneratedPRDs');

  try {
    const prds = await directGeneratedPrdService.getAllDirectGeneratedPRDs();

    const duration = Date.now() - startTime;
    logger.info('All direct generated PRDs retrieved successfully', {
      count: prds.length,
      duration: `${duration}ms`
    });
    logger.end('getAllDirectGeneratedPRDs', { count: prds.length }, duration);

    res.json({
      success: true,
      data: prds
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting all direct generated PRDs', error, {
      duration: `${duration}ms`
    });
    logger.end('getAllDirectGeneratedPRDs', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取产品需求列表失败'
    });
  }
}

/**
 * 根据ID获取直接生成的PRD
 * GET /api/v1/direct-generated-prds/:id
 */
export async function getDirectGeneratedPRDById(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { id } = req.params;
  logger.start('getDirectGeneratedPRDById', { id });

  try {
    const prd = await directGeneratedPrdService.getDirectGeneratedPRDById(id);

    if (!prd) {
      logger.warn('Direct generated PRD not found', { id });
      res.status(404).json({
        success: false,
        error: '产品需求不存在'
      });
      return;
    }

    const duration = Date.now() - startTime;
    logger.info('Direct generated PRD retrieved successfully', {
      id,
      title: prd.title,
      duration: `${duration}ms`
    });
    logger.end('getDirectGeneratedPRDById', { id }, duration);

    res.json({
      success: true,
      data: prd
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting direct generated PRD by id', error, {
      id,
      duration: `${duration}ms`
    });
    logger.end('getDirectGeneratedPRDById', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取产品需求失败'
    });
  }
}

/**
 * 根据源PRD ID获取所有相关的直接生成的PRD
 * GET /api/v1/direct-generated-prds/source/:sourcePrdId
 */
export async function getDirectGeneratedPRDsBySourcePrdId(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { sourcePrdId } = req.params;
  logger.start('getDirectGeneratedPRDsBySourcePrdId', { sourcePrdId });

  try {
    const prds = await directGeneratedPrdService.getDirectGeneratedPRDsBySourcePrdId(sourcePrdId);

    const duration = Date.now() - startTime;
    logger.info('Direct generated PRDs retrieved by source PRD id', {
      sourcePrdId,
      count: prds.length,
      duration: `${duration}ms`
    });
    logger.end('getDirectGeneratedPRDsBySourcePrdId', { count: prds.length }, duration);

    res.json({
      success: true,
      data: prds
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error getting direct generated PRDs by source PRD id', error, {
      sourcePrdId,
      duration: `${duration}ms`
    });
    logger.end('getDirectGeneratedPRDsBySourcePrdId', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取产品需求列表失败'
    });
  }
}

/**
 * 删除直接生成的PRD
 * DELETE /api/v1/direct-generated-prds/:id
 */
export async function deleteDirectGeneratedPRD(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { id } = req.params;
  logger.start('deleteDirectGeneratedPRD', { id });

  try {
    // 先检查是否存在
    const prd = await directGeneratedPrdService.getDirectGeneratedPRDById(id);
    if (!prd) {
      logger.warn('Direct generated PRD not found for deletion', { id });
      res.status(404).json({
        success: false,
        error: '产品需求不存在'
      });
      return;
    }

    // 删除（需要在service中添加删除方法）
    const { query } = await import('../../db/config.js');
    await query('DELETE FROM direct_generated_prds WHERE id = $1', [id]);

    const duration = Date.now() - startTime;
    logger.info('Direct generated PRD deleted successfully', {
      id,
      title: prd.title,
      duration: `${duration}ms`
    });
    logger.end('deleteDirectGeneratedPRD', { id }, duration);

    res.json({
      success: true,
      message: '产品需求已删除'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error deleting direct generated PRD', error, {
      id,
      duration: `${duration}ms`
    });
    logger.end('deleteDirectGeneratedPRD', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除产品需求失败'
    });
  }
}

/**
 * 更新直接生成的PRD
 * PUT /api/v1/direct-generated-prds/:id
 */
export async function updateDirectGeneratedPRD(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { id } = req.params;
  const { title, description, prdContent, version, status, author } = req.body;
  logger.start('updateDirectGeneratedPRD', { id });

  try {
    // 先检查是否存在
    const existingPrd = await directGeneratedPrdService.getDirectGeneratedPRDById(id);
    if (!existingPrd) {
      logger.warn('Direct generated PRD not found for update', { id });
      res.status(404).json({
        success: false,
        error: '产品需求不存在'
      });
      return;
    }

    // 更新（需要在service中添加更新方法）
    const { queryOne } = await import('../../db/config.js');
    const updatedPrd = await queryOne<any>(
      `UPDATE direct_generated_prds
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           prd_content = COALESCE($3, prd_content),
           version = COALESCE($4, version),
           status = COALESCE($5, status),
           author = COALESCE($6, author),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
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
      [title, description, prdContent, version, status, author, id]
    );

    const duration = Date.now() - startTime;
    logger.info('Direct generated PRD updated successfully', {
      id,
      title: updatedPrd.title,
      duration: `${duration}ms`
    });
    logger.end('updateDirectGeneratedPRD', { id }, duration);

    res.json({
      success: true,
      data: updatedPrd
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error updating direct generated PRD', error, {
      id,
      duration: `${duration}ms`
    });
    logger.end('updateDirectGeneratedPRD', { success: false }, duration);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '更新产品需求失败'
    });
  }
}

