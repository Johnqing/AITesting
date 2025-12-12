import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('MCP.Action.Screenshot');

export class ScreenshotAction extends BaseAction {
    async execute(): Promise<ExecutionResult> {
        logger.debug('Taking screenshot');
        try {
            const result = await this.client.callTool({
                name: 'browser_take_screenshot',
                arguments: {}
            });

            const content = this.extractContent(result);

            logger.debug('Screenshot tool called successfully', {
                hasContent: !!content,
                contentLength: content?.length
            });

            return {
                success: true,
                message: 'Screenshot taken',
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Screenshot failed', error);
            return {
                success: false,
                message: 'Failed to take screenshot',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

