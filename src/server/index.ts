#!/usr/bin/env node

import { startServer } from './app.js';

const port = parseInt(process.env.PORT || '3000', 10);

startServer(port).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

