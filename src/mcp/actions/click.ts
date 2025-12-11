import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseAction } from './base.js';
import { ExecutionResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';
import { findElementInSnapshot, parseYamlSnapshot, getAllTextElements } from '../snapshotParser.js';

const logger = createLogger('MCP.Action.Click');

export class ClickAction extends BaseAction {
    async execute(selector: string, text?: string): Promise<ExecutionResult> {
        logger.debug('Clicking element', { selector, text });
        try {
            // 处理 selector 中的各种格式
            let searchText: string | undefined = text;

            if (selector) {
                // 处理 text= 前缀
                if (selector.startsWith('text=')) {
                    searchText = selector.substring(5);
                    logger.debug('Extracted text from selector', { originalSelector: selector, extractedText: searchText });
                }
                // 处理 Playwright selector 语法，如 button:has-text("登录")
                else if (selector.includes(':has-text(')) {
                    const match = selector.match(/:has-text\(["']([^"']+)["']\)/);
                    if (match && match[1]) {
                        searchText = match[1];
                        logger.debug('Extracted text from Playwright selector', { originalSelector: selector, extractedText: searchText });
                    }
                }
                // 处理其他 Playwright selector，如 button:text("登录")
                else if (selector.includes(':text(')) {
                    const match = selector.match(/:text\(["']([^"']+)["']\)/);
                    if (match && match[1]) {
                        searchText = match[1];
                        logger.debug('Extracted text from Playwright text selector', { originalSelector: selector, extractedText: searchText });
                    }
                }
                // 如果没有 text 参数，使用 selector 作为搜索文本
                else if (!text) {
                    searchText = selector;
                }
            }

            // 获取页面快照来找到元素
            const snapshotResult = await this.client.callTool({
                name: 'browser_snapshot',
                arguments: {}
            });

            const snapshotContent = this.extractContent(snapshotResult);
            if (!snapshotContent) {
                throw new Error('Failed to get page snapshot');
            }

            logger.debug('Page snapshot obtained', { snapshotLength: snapshotContent.length });

            // 解析快照找到匹配的元素
            let elementRef: string | null = null;
            let elementDescription: string = searchText || selector;

            // 查找元素
            const found = findElementInSnapshot(snapshotContent, searchText || selector);

            if (found && found.ref) {
                elementRef = found.ref;
                elementDescription = found.description;
                logger.debug('Found element in snapshot', { ref: elementRef, description: elementDescription });
            } else {
                // 输出所有元素用于调试
                const allElements = getAllTextElements(snapshotContent);
                logger.warn('Element not found in snapshot', {
                    searchText: searchText || selector,
                    availableElements: allElements.slice(0, 20).map(e => `${e.role}: "${e.text}"`)
                });
                elementDescription = searchText || selector;
            }

            // 如果没找到，尝试等待后重试
            if (!elementRef) {
                logger.info('Element not found, waiting 2 seconds and retrying...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    const retrySnapshotResult = await this.client.callTool({
                        name: 'browser_snapshot',
                        arguments: {}
                    });

                    const retrySnapshotContent = this.extractContent(retrySnapshotResult);
                    if (retrySnapshotContent) {
                        const retryFound = findElementInSnapshot(retrySnapshotContent, searchText || selector);
                        if (retryFound && retryFound.ref) {
                            elementRef = retryFound.ref;
                            logger.info('Found element after retry', { ref: elementRef });
                        }
                    }
                } catch (retryError) {
                    logger.warn('Retry failed', { error: retryError instanceof Error ? retryError.message : String(retryError) });
                }
            }

            // 构建点击参数
            if (!elementRef) {
                if (searchText) {
                    elementDescription = `底部菜单中的"${searchText}"选项或按钮`;
                } else if (selector) {
                    elementDescription = `选择器为"${selector}"的元素`;
                }
                logger.warn('Still cannot find ref, attempting click with element description only', {
                    elementDescription,
                    searchText: searchText || selector
                });
            }

            const args: any = {
                element: elementDescription
            };

            if (elementRef) {
                args.ref = elementRef;
            } else {
                args.element = searchText
                    ? `底部菜单中文本为"${searchText}"的按钮或链接`
                    : `选择器为"${selector}"的元素`;
                logger.warn('Clicking without ref, relying on element description', { element: args.element });
            }

            logger.debug('Clicking with args', { element: args.element, hasRef: !!elementRef });

            const result = await this.client.callTool({
                name: 'browser_click',
                arguments: args
            });

            const content = this.extractContent(result);

            logger.debug('Click tool called successfully', {
                element: elementDescription,
                hasContent: !!content
            });

            return {
                success: true,
                message: `Clicked on ${elementDescription}${selector ? ` (selector: ${selector})` : ''}`,
                screenshot: content || undefined
            };
        } catch (error) {
            logger.error('Click failed', error, { selector, text });
            return {
                success: false,
                message: `Failed to click on ${text || selector}`,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

