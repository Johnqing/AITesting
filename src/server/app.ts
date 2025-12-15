import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/markdown', limit: '10mb' }));

// 注册路由
app.use(routes);

// 错误处理中间件
app.use(errorHandler);

// 404 处理
app.use(notFoundHandler);

export function createApp() {
  return app;
}

export function startServer(port: number | string = PORT) {
  const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
  return new Promise<void>((resolve) => {
    app.listen(portNumber, () => {
      console.log(`TestFlow API Server is running on http://localhost:${portNumber}`);
      console.log(`API Documentation: http://localhost:${portNumber}/api/v1/info`);
      resolve();
    });
  });
}
