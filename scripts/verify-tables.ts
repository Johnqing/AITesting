#!/usr/bin/env tsx

import { connectDatabase, disconnectDatabase, query } from '../src/db/config.js';

async function main() {
    try {
        console.log('🔍 Verifying database tables...\n');

        // 连接数据库
        await connectDatabase();

        // 查询所有表
        const tables = await query<{ table_name: string }>(
            `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_type = 'BASE TABLE'
       ORDER BY table_name`
        );

        console.log(`✅ Found ${tables.length} tables:\n`);

        const expectedTables = [
            'test_cases',
            'test_reports',
            'test_report_summaries',
            'test_results',
            'test_result_summaries',
            'action_results',
            'expected_result_checks',
            'prds',
            'prd_reviews',
            'prd_test_cases',
            'prd_generated_test_cases',
        ];

        const createdTables = tables.map(t => t.table_name);

        expectedTables.forEach(table => {
            if (createdTables.includes(table)) {
                console.log(`  ✅ ${table}`);
            } else {
                console.log(`  ❌ ${table} (missing)`);
            }
        });

        // 检查索引
        console.log('\n📊 Checking indexes...\n');
        const indexes = await query<{ indexname: string; tablename: string }>(
            `SELECT indexname, tablename 
       FROM pg_indexes 
       WHERE schemaname = 'public' 
       ORDER BY tablename, indexname`
        );

        console.log(`Found ${indexes.length} indexes`);
        indexes.forEach(idx => {
            console.log(`  - ${idx.indexname} on ${idx.tablename}`);
        });

        console.log('\n✅ Database verification completed');
    } catch (error) {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    } finally {
        await disconnectDatabase();
    }
}

main();



