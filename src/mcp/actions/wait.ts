import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP.Action.Wait');

export class WaitAction extends BaseAction {
    async execute(selector?: string, timeout: number = 5000): Promise<ExecutionResult> {
        logger.debug('Waiting', { selector, timeout });
        try {
            const args: any = { timeout };
            if (selector) {
                args.selector = selector;
            }

            const result = await this.client.callTool({
                name: 'browser_wait_for',
                arguments: args
            });

            const content = this.extractContent(result);

            logger.debug('Wait tool called successfully', { selector, timeout });

            return {
                success: true,
                message: `Waited${selector ? ` for ${selector}` : ''} (${timeout}ms)`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Wait failed', error, { selector, timeout });
            return {
                success: false,
                message: `Wait failed${selector ? ` for ${selector}` : ''}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

