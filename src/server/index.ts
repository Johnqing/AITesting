#!/usr/bin/env node

import { startServer } from './app.js';
import { connectDatabase } from '../db/config.js';

const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  try {
    // 连接数据库
    await connectDatabase();
    
    // 启动服务器
    await startServer(port);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

