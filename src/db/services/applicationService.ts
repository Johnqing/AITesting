import { query, queryOne } from '../config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ApplicationService');

export interface Application {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  appType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ApplicationService {
  /**
   * 获取所有应用
   */
  async getAllApplications(): Promise<Application[]> {
    const startTime = Date.now();
    logger.debug('Getting all applications');

    try {
      const results = await query<any>(
        `SELECT 
          id,
          app_id as "appId",
          name,
          description,
          app_type as "appType",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM applications
        ORDER BY name`
      );

      const duration = Date.now() - startTime;
      logger.info('Applications retrieved successfully', {
        count: results.length,
        duration: `${duration}ms`
      });

      return results as Application[];
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error getting applications', error, {
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 根据appId获取应用
   */
  async getApplicationByAppId(appId: string): Promise<Application | null> {
    const startTime = Date.now();
    logger.debug('Getting application by appId', { appId });

    try {
      const result = await queryOne<any>(
        `SELECT 
          id,
          app_id as "appId",
          name,
          description,
          app_type as "appType",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM applications
        WHERE app_id = $1`,
        [appId]
      );

      const duration = Date.now() - startTime;
      if (result) {
        logger.debug('Application retrieved successfully', {
          appId,
          name: result.name,
          duration: `${duration}ms`
        });
      } else {
        logger.debug('Application not found', { appId, duration: `${duration}ms` });
      }

      return (result as Application) || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error getting application by appId', error, {
        appId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 根据ID获取应用
   */
  async getApplicationById(id: string): Promise<Application | null> {
    const startTime = Date.now();
    logger.debug('Getting application by id', { id });

    try {
      const result = await queryOne<any>(
        `SELECT 
          id,
          app_id as "appId",
          name,
          description,
          app_type as "appType",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM applications
        WHERE id = $1`,
        [id]
      );

      const duration = Date.now() - startTime;
      if (result) {
        logger.debug('Application retrieved successfully', {
          id,
          name: result.name,
          duration: `${duration}ms`
        });
      } else {
        logger.debug('Application not found', { id, duration: `${duration}ms` });
      }

      return (result as Application) || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error getting application by id', error, {
        id,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 创建应用
   */
  async createApplication(data: {
    appId: string;
    name: string;
    description?: string;
    appType?: string;
  }): Promise<Application> {
    const startTime = Date.now();
    logger.info('Creating application', { appId: data.appId, name: data.name });

    try {
      const result = await queryOne<any>(
        `INSERT INTO applications (app_id, name, description, app_type)
        VALUES ($1, $2, $3, $4)
        RETURNING 
          id,
          app_id as "appId",
          name,
          description,
          app_type as "appType",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        [data.appId, data.name, data.description || null, data.appType || null]
      );

      const duration = Date.now() - startTime;
      logger.info('Application created successfully', {
        appId: data.appId,
        name: data.name,
        applicationId: result.id,
        duration: `${duration}ms`
      });

      return result as Application;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error creating application', error, {
        appId: data.appId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 更新应用
   */
  async updateApplication(
    appId: string,
    updates: {
      name?: string;
      description?: string;
      appType?: string;
    }
  ): Promise<Application> {
    const startTime = Date.now();
    logger.info('Updating application', { appId });

    try {
      const updatesList: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updatesList.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        updatesList.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.appType !== undefined) {
        updatesList.push(`app_type = $${paramIndex++}`);
        values.push(updates.appType);
      }

      if (updatesList.length === 0) {
        const app = await this.getApplicationByAppId(appId);
        if (!app) {
          throw new Error(`Application not found: ${appId}`);
        }
        return app;
      }

      values.push(appId);

      const result = await queryOne<any>(
        `UPDATE applications 
        SET ${updatesList.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE app_id = $${paramIndex}
        RETURNING 
          id,
          app_id as "appId",
          name,
          description,
          app_type as "appType",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        values
      );

      const duration = Date.now() - startTime;
      logger.info('Application updated successfully', {
        appId,
        duration: `${duration}ms`
      });

      return result as Application;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error updating application', error, {
        appId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 删除应用
   */
  async deleteApplication(appId: string): Promise<void> {
    const startTime = Date.now();
    logger.info('Deleting application', { appId });

    try {
      const result = await query('DELETE FROM applications WHERE app_id = $1', [appId]);

      const duration = Date.now() - startTime;
      logger.info('Application deleted successfully', {
        appId,
        duration: `${duration}ms`
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error deleting application', error, {
        appId,
        duration: `${duration}ms`
      });
      throw error;
    }
  }
}

export const applicationService = new ApplicationService();

