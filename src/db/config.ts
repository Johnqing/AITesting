import { Pool, PoolClient } from 'pg';

// 数据库配置
export const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    max: 20, // 连接池最大连接数
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// 创建连接池
let pool: Pool | null = null;

// 获取数据库连接池
export function getPool(): Pool {
    if (!pool) {
        pool = new Pool(dbConfig);

        // 连接池错误处理
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });
    }
    return pool;
}

// 连接数据库
export async function connectDatabase(): Promise<void> {
    try {
        const pool = getPool();
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

// 断开数据库连接
export async function disconnectDatabase(): Promise<void> {
    try {
        if (pool) {
            await pool.end();
            pool = null;
            console.log('✅ Database disconnected');
        }
    } catch (error) {
        console.error('❌ Database disconnection failed:', error);
        throw error;
    }
}

// 执行查询的辅助函数
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const pool = getPool();
    const result = await pool.query(text, params);
    return result.rows;
}

// 执行单个查询（返回第一行）
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

// 执行事务
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// 默认导出连接池
export default getPool();
