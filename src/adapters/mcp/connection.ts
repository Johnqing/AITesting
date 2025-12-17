import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP.Connection');

export class MCPConnection {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private isConnected: boolean = false;
    private headless: boolean = false;

    constructor(headless: boolean = false) {
        this.headless = headless;
    }

    /**
     * 连接到 Playwright MCP 服务器
     */
    async connect(): Promise<void> {
        const startTime = Date.now();
        logger.start('connect');

        if (this.isConnected) {
            logger.warn('Already connected to Playwright MCP server');
            return;
        }

        try {
            logger.info('Connecting to Playwright MCP server', {
                command: 'npx',
                args: ['-y', '@playwright/mcp'],
                headless: this.headless
            });

            // 设置环境变量来控制 headless 模式和缓存
            // Playwright 默认每个浏览器上下文都是新的，不会保留缓存
            // 这些环境变量作为额外保障，确保不使用持久化缓存
            const env = {
                ...process.env,
                PLAYWRIGHT_HEADLESS: String(this.headless),
                HEADLESS: String(this.headless),
                // 默认移除用户缓存，使用无痕模式
                PLAYWRIGHT_INCOGNITO: 'true',
                PLAYWRIGHT_NO_CACHE: 'true',
                // 使用临时用户数据目录，避免使用持久化缓存
                PLAYWRIGHT_TEMP_USER_DATA: 'true',
                // 禁用浏览器缓存
                PLAYWRIGHT_DISABLE_CACHE: 'true'
            };

            logger.debug('Environment variables set for cache control', {
                incognito: env.PLAYWRIGHT_INCOGNITO,
                noCache: env.PLAYWRIGHT_NO_CACHE,
                tempUserData: env.PLAYWRIGHT_TEMP_USER_DATA,
                disableCache: env.PLAYWRIGHT_DISABLE_CACHE
            });

            this.transport = new StdioClientTransport({
                command: 'npx',
                args: ['-y', '@playwright/mcp'],
                env
            });

            logger.debug('Created stdio transport');

            this.client = new Client(
                {
                    name: 'testflow-client',
                    version: '1.0.0'
                },
                {
                    capabilities: {}
                }
            );

            logger.debug('Created MCP client');

            await this.client.connect(this.transport);
            this.isConnected = true;

            const duration = Date.now() - startTime;
            logger.info('Connected to Playwright MCP server', { duration: `${duration}ms` });
            logger.end('connect', { success: true }, duration);
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Failed to connect to Playwright MCP server', error, { duration: `${duration}ms` });
            throw error;
        }
    }

    /**
     * 断开连接
     */
    async disconnect(): Promise<void> {
        logger.start('disconnect');

        if (this.client && this.isConnected) {
            try {
                logger.info('Disconnecting from Playwright MCP server');
                await this.client.close();
                this.isConnected = false;
                this.client = null;
                this.transport = null;
                logger.info('Disconnected from Playwright MCP server');
            } catch (error) {
                logger.error('Error during disconnect', error);
                throw error;
            }
        } else {
            logger.warn('Not connected, skipping disconnect');
        }

        logger.end('disconnect');
    }

    /**
     * 获取 MCP 客户端实例
     */
    getClient(): Client {
        if (!this.client || !this.isConnected) {
            throw new Error('Not connected to Playwright MCP server');
        }
        return this.client;
    }

    /**
     * 检查是否已连接
     */
    isConnectedToServer(): boolean {
        return this.isConnected;
    }
}

