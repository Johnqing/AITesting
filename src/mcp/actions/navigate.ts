import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP.Action.Navigate');

export class NavigateAction extends BaseAction {
    async execute(url: string): Promise<ExecutionResult> {
        logger.debug('Navigating to URL', { url });
        try {
            const result = await this.client.callTool({
                name: 'browser_navigate',
                arguments: { url }
            });

            const content = this.extractContent(result);

            logger.debug('Navigate tool called successfully', {
                hasContent: !!content,
                contentLength: content?.length
            });

            return {
                success: true,
                message: `Navigated to ${url}`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Navigate failed', error, { url });
            return {
                success: false,
                message: `Failed to navigate to ${url}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

