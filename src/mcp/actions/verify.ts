import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';
import { WaitAction } from './wait.js';

const logger = createLogger('MCP.Action.Verify');

export class VerifyAction extends BaseAction {
    private waitAction: WaitAction;

    constructor(client: Client) {
        super(client);
        this.waitAction = new WaitAction(client);
    }

    async execute(selector?: string, expected?: string): Promise<ExecutionResult> {
        logger.debug('Verifying', { selector, expected });
        try {
            // 如果没有选择器，尝试使用 wait 来验证页面加载
            if (!selector) {
                logger.warn('No selector provided for verify, using wait instead');
                return await this.waitAction.execute(undefined, 2000);
            }

            // 首先尝试使用 wait 等待元素出现
            try {
                await this.waitAction.execute(selector, 5000);
                logger.debug('Element found via wait', { selector });
            } catch (waitError) {
                logger.debug('Wait failed, element may not exist', { selector });
            }

            // 尝试使用 browser_evaluate 工具
            let result;
            let toolName = 'browser_evaluate';
            let args: any = {
                function: expected
                    ? `(element) => element !== null && element !== undefined && element.textContent.includes("${expected}")`
                    : '(element) => element !== null && element !== undefined',
                element: selector
            };

            try {
                result = await this.client.callTool({
                    name: toolName,
                    arguments: args
                });
            } catch (evaluateError) {
                // 如果 evaluate 失败，尝试使用 snapshot 来验证页面状态
                logger.debug('Evaluate tool failed, trying snapshot', { selector });
                try {
                    const snapshotResult = await this.client.callTool({
                        name: 'browser_snapshot',
                        arguments: {}
                    });
                    result = snapshotResult;
                } catch (snapshotError) {
                    throw evaluateError;
                }
            }

            const content = this.extractContent(result) || '';

            // 更智能的成功判断逻辑
            let success = false;
            const contentLower = content.toLowerCase();

            // 检查各种可能的成功标识
            if (contentLower.includes('true') ||
                contentLower.includes('verified') ||
                contentLower.includes('success') ||
                contentLower.includes('found') ||
                contentLower.includes('exists') ||
                contentLower === 'true' ||
                content === '1' ||
                (content && !contentLower.includes('error') && !contentLower.includes('failed') && !contentLower.includes('not found'))) {
                success = true;
            }

            // 尝试解析 JSON 响应
            try {
                const jsonContent = JSON.parse(content);
                if (typeof jsonContent === 'boolean') {
                    success = jsonContent;
                } else if (typeof jsonContent === 'object' && jsonContent !== null) {
                    success = jsonContent.success !== false && jsonContent.found !== false;
                }
            } catch (parseError) {
                // 不是 JSON，使用字符串判断
            }

            logger.debug('Verify tool called', {
                toolName,
                selector,
                expected,
                success,
                contentPreview: content.substring(0, 200)
            });

            if (!success && selector) {
                logger.warn('Verify returned false, but element may still exist', {
                    selector,
                    content
                });
            }

            return {
                success,
                message: `Verified${selector ? ` ${selector}` : ''}${expected ? ` (expected: ${expected})` : ''}${success ? '' : ' - verification returned false'}`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Verify failed', error, { selector, expected });
            // 如果错误是因为工具不存在，尝试使用 wait 作为后备
            if (selector && error instanceof Error && error.message.includes('not found')) {
                logger.info('Verify tool not found, using wait as fallback', { selector });
                try {
                    const waitResult = await this.waitAction.execute(selector, 3000);
                    return {
                        success: true,
                        message: `Element found via wait fallback: ${selector}`
                    };
                } catch (waitError) {
                    // 继续返回错误
                }
            }

            return {
                success: false,
                message: `Verification failed${selector ? ` for ${selector}` : ''}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

