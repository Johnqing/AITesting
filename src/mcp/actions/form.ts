import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';
import { findElementInSnapshot, getAllTextElements } from '../snapshotParser.js';

const logger = createLogger('MCP.Action.Form');

export class FillAction extends BaseAction {
    async execute(selector: string, text: string): Promise<ExecutionResult> {
        logger.debug('Filling form', { selector, textLength: text.length });
        try {
            // 获取页面快照来找到输入框元素
            const snapshotResult = await this.client.callTool({
                name: 'browser_snapshot',
                arguments: {}
            });

            const snapshotContent = this.extractContent(snapshotResult);
            if (!snapshotContent) {
                throw new Error('Failed to get page snapshot');
            }

            logger.debug('Page snapshot obtained for fill', { snapshotLength: snapshotContent.length });

            // 处理 selector，提取搜索文本
            let searchText: string = selector;
            
            // 处理 placeholder 格式，如 placeholder="请输入用户名"
            if (selector.includes('placeholder=')) {
                const match = selector.match(/placeholder=["']([^"']+)["']/);
                if (match && match[1]) {
                    searchText = match[1];
                    logger.debug('Extracted placeholder from selector', { originalSelector: selector, extractedText: searchText });
                }
            }
            // 处理 id 格式，如 id="form_item_username"
            else if (selector.includes('id=')) {
                const match = selector.match(/id=["']([^"']+)["']/);
                if (match && match[1]) {
                    searchText = match[1];
                    logger.debug('Extracted id from selector', { originalSelector: selector, extractedText: searchText });
                }
            }

            // 查找输入框元素
            const allElements = getAllTextElements(snapshotContent);
            
            // 查找匹配的输入框（textbox 类型）
            const textboxMatches = allElements.filter(e => {
                const elementTextNormalized = e.text.toLowerCase().trim().replace(/\s+/g, '');
                const searchTextNormalized = searchText.toLowerCase().trim().replace(/\s+/g, '');
                const elementTextLower = e.text.toLowerCase().trim();
                const searchTextLower = searchText.toLowerCase().trim();
                
                return (e.role.toLowerCase() === 'textbox' || e.role.toLowerCase() === 'combobox') &&
                       (elementTextNormalized === searchTextNormalized ||
                        elementTextNormalized.includes(searchTextNormalized) ||
                        elementTextLower.includes(searchTextLower) ||
                        searchTextLower.includes(elementTextLower));
            });

            if (textboxMatches.length === 0) {
                logger.warn('No textbox found for fill', {
                    selector,
                    searchText,
                    availableTextboxes: allElements
                        .filter(e => e.role.toLowerCase() === 'textbox' || e.role.toLowerCase() === 'combobox')
                        .slice(0, 10)
                        .map(e => `${e.role}: "${e.text}"`)
                });
                throw new Error(`Cannot find textbox element for selector: ${selector}`);
            }

            // 选择第一个匹配的输入框
            const targetElement = textboxMatches[0];
            logger.debug('Found textbox element', {
                role: targetElement.role,
                text: targetElement.text,
                ref: targetElement.ref
            });

            // 构建 browser_fill_form 的参数
            const result = await this.client.callTool({
                name: 'browser_fill_form',
                arguments: {
                    fields: [{
                        name: targetElement.text || selector,
                        type: 'textbox',
                        ref: targetElement.ref,
                        value: text
                    }]
                }
            });

            const content = this.extractContent(result);

            logger.debug('Fill tool called successfully', { selector, ref: targetElement.ref });

            return {
                success: true,
                message: `Filled ${targetElement.text || selector} with "${text}"`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Fill failed', error, { selector });
            return {
                success: false,
                message: `Failed to fill ${selector}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

export class SelectAction extends BaseAction {
    async execute(selector: string, value: string): Promise<ExecutionResult> {
        logger.debug('Selecting option', { selector, value });
        try {
            const result = await this.client.callTool({
                name: 'browser_select_option',
                arguments: { selector, value }
            });

            const content = this.extractContent(result);

            logger.debug('Select tool called successfully', { selector, value });

            return {
                success: true,
                message: `Selected "${value}" in ${selector}`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Select failed', error, { selector, value });
            return {
                success: false,
                message: `Failed to select in ${selector}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

