import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPool, queryOne } from './config.js';

/**
 * 运行数据库迁移
 */
export async function runMigrations(): Promise<void> {
    try {
        console.log('🔄 Running database migrations...');

        const migrationsDir = join(process.cwd(), 'src/db/migrations');
        const files = readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort(); // 按文件名排序，确保按顺序执行

        const pool = getPool();

        for (const file of files) {
            console.log(`  📄 Executing ${file}...`);
            const migrationFile = join(migrationsDir, file);
            const sql = readFileSync(migrationFile, 'utf-8');

            // 执行 SQL（需要直接使用 pool.query，因为可能包含多条语句）
            await pool.query(sql);
            console.log(`  ✅ ${file} completed`);
        }

        console.log('✅ Database migrations completed successfully');
    } catch (error) {
        console.error('❌ Database migration failed:', error);
        throw error;
    }
}

/**
 * 检查数据库表是否存在
 */
export async function checkTables(): Promise<boolean> {
    try {
        const result = await queryOne<{ exists: boolean }>(
            `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'test_cases'
      ) as exists`
        );
        return result?.exists || false;
    } catch (error) {
        return false;
    }
}

