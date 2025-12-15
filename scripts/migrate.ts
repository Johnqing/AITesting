#!/usr/bin/env tsx

import { connectDatabase, disconnectDatabase } from '../src/db/config.js';
import { runMigrations, checkTables } from '../src/db/migrate.js';

async function main() {
    try {
        console.log('🚀 Starting database migration...\n');

        // 连接数据库
        await connectDatabase();

        // 运行迁移（使用 IF NOT EXISTS，可以安全地重复执行）
        await runMigrations();

        console.log('\n✅ Migration completed successfully');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await disconnectDatabase();
    }
}

main();

