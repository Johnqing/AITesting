import { PlaywrightAction } from '../ai/aiClient.js';
import { ExecutionResult } from './types.js';
import { MCPConnection } from './connection.js';
import {
    NavigateAction,
    ClickAction,
    WaitAction,
    VerifyAction,
    FillAction,
    SelectAction,
    ScreenshotAction
} from './actions/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP');

export class PlaywrightMCPClient {
    private connection: MCPConnection;
    private navigateAction!: NavigateAction;
    private clickAction!: ClickAction;
    private waitAction!: WaitAction;
    private verifyAction!: VerifyAction;
    private fillAction!: FillAction;
    private selectAction!: SelectAction;
    private screenshotAction!: ScreenshotAction;

    constructor(headless: boolean = false) {
        this.connection = new MCPConnection(headless);
    }

    /**
     * 连接到 Playwright MCP 服务器
     */
    async connect(): Promise<void> {
        await this.connection.connect();

        // 初始化所有操作实例
        const client = this.connection.getClient();
        this.navigateAction = new NavigateAction(client);
        this.clickAction = new ClickAction(client);
        this.waitAction = new WaitAction(client);
        this.verifyAction = new VerifyAction(client);
        this.fillAction = new FillAction(client);
        this.selectAction = new SelectAction(client);
        this.screenshotAction = new ScreenshotAction(client);
    }

    /**
     * 断开连接
     */
    async disconnect(): Promise<void> {
        await this.connection.disconnect();
    }

    /**
     * 检查是否已连接到服务器
     */
    isConnected(): boolean {
        return this.connection.isConnectedToServer();
    }

    /**
     * 执行 Playwright 操作
     */
    async executeAction(action: PlaywrightAction): Promise<ExecutionResult> {
        const startTime = Date.now();
        logger.start('executeAction', {
            type: action.type,
            description: action.description,
            selector: action.selector,
            url: action.url
        });

        if (!this.connection.isConnectedToServer()) {
            logger.error('Not connected to Playwright MCP server');
            throw new Error('Not connected to Playwright MCP server');
        }

        try {
            logger.debug('Executing action', { action });

            let result: ExecutionResult;
            switch (action.type) {
                case 'navigate':
                    result = await this.navigateAction.execute(action.url || '');
                    break;

                case 'click':
                    result = await this.clickAction.execute(action.selector || '', action.text);
                    break;

                case 'wait':
                    result = await this.waitAction.execute(action.selector, action.timeout || 5000);
                    break;

                case 'verify':
                    result = await this.verifyAction.execute(action.selector, action.expected);
                    break;

                case 'fill':
                    result = await this.fillAction.execute(action.selector || '', action.text || '');
                    break;

                case 'select':
                    result = await this.selectAction.execute(action.selector || '', action.text || '');
                    break;

                case 'screenshot':
                    result = await this.screenshotAction.execute();
                    break;

                default:
                    logger.warn('Unknown action type', { type: action.type });
                    result = {
                        success: false,
                        message: `Unknown action type: ${action.type}`
                    };
                    break;
            }

            const duration = Date.now() - startTime;
            logger.debug('Action execution completed', {
                type: action.type,
                success: result.success,
                duration: `${duration}ms`
            });

            if (!result.success) {
                logger.warn('Action execution failed', {
                    type: action.type,
                    message: result.message,
                    error: result.error
                });
            } else {
                logger.info('Action executed successfully', {
                    type: action.type,
                    message: result.message
                });
            }

            logger.end('executeAction', { success: result.success }, duration);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error executing action', error, {
                type: action.type,
                description: action.description,
                duration: `${duration}ms`
            });

            const result: ExecutionResult = {
                success: false,
                message: action.description,
                error: error instanceof Error ? error.message : String(error)
            };

            logger.end('executeAction', { success: false }, duration);
            return result;
        }
    }
}

// 导出类型以便其他模块使用
export type { ExecutionResult } from './types.js';
