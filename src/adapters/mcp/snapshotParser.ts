import { createLogger } from '../../utils/logger.js';
import { SnapshotElement } from './types.js';

const logger = createLogger('MCP.SnapshotParser');

/**
 * 解析 YAML 格式的快照
 */
export function parseYamlSnapshot(content: string): SnapshotElement[] {
    const elements: SnapshotElement[] = [];

    // 提取 YAML 代码块
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
        logger.warn('No YAML block found in snapshot');
        return elements;
    }

    const yamlContent = yamlMatch[1];
    const lines = yamlContent.split('\n');

    // 解析每一行
    for (const line of lines) {
        // 匹配格式: - role "text" [ref=xxx] 或 - role [ref=xxx]: text
        const refMatch = line.match(/\[ref=([^\]]+)\]/);
        if (!refMatch) continue;

        const ref = refMatch[1];

        // 提取角色和文本
        // 格式1: - role "text" [ref=xxx]
        const format1Match = line.match(/-\s*(\w+)\s+"([^"]+)"\s*\[ref=/);
        if (format1Match) {
            elements.push({
                role: format1Match[1],
                text: format1Match[2],
                ref: ref
            });
            continue;
        }

        // 格式2: - role [ref=xxx]: text
        const format2Match = line.match(/-\s*(\w+)\s+\[ref=[^\]]+\]:\s*(.+)/);
        if (format2Match) {
            elements.push({
                role: format2Match[1],
                text: format2Match[2].trim(),
                ref: ref
            });
            continue;
        }

        // 格式3: - role [ref=xxx] (没有文本，可能是容器)
        const format3Match = line.match(/-\s*(\w+)\s+\[ref=/);
        if (format3Match) {
            elements.push({
                role: format3Match[1],
                text: '',
                ref: ref
            });
        }
    }

    return elements;
}

/**
 * 从快照中查找匹配的元素
 */
export function findElementInSnapshot(
    snapshotContent: string,
    searchText: string
): { ref: string | null; description: string } | null {
    // 首先尝试解析 YAML 格式
    const yamlElements = parseYamlSnapshot(snapshotContent);

    if (yamlElements.length > 0) {
        logger.debug('Parsed YAML snapshot', { elementCount: yamlElements.length });

        // 查找匹配的元素
        // 移除空格以便匹配（处理"登录"和"登 录"的情况）
        const normalizeText = (text: string) => text.toLowerCase().trim().replace(/\s+/g, '');
        const searchTextNormalized = normalizeText(searchText);
        
        const matches = yamlElements.filter(e => {
            const elementTextNormalized = normalizeText(e.text);
            // 完全匹配（去除空格后）
            if (searchTextNormalized && elementTextNormalized === searchTextNormalized) {
                return true;
            }
            // 包含匹配（去除空格后）
            if (searchTextNormalized && elementTextNormalized.includes(searchTextNormalized)) {
                return true;
            }
            // 原始文本包含匹配（处理空格差异）
            const elementTextLower = e.text.toLowerCase().trim();
            const searchTextLower = searchText.toLowerCase().trim();
            return searchTextLower && elementTextLower.includes(searchTextLower);
        });

        // 优先选择按钮、链接、tab 等交互元素
        const interactiveMatches = matches.filter(e =>
            ['button', 'link', 'tab', 'menuitem'].includes(e.role.toLowerCase())
        );

        const bestMatch = interactiveMatches.length > 0 ? interactiveMatches[0] : matches[0];

        if (bestMatch) {
            logger.debug('Found element in YAML snapshot', {
                ref: bestMatch.ref,
                description: bestMatch.text || searchText,
                role: bestMatch.role
            });
            return {
                ref: bestMatch.ref,
                description: bestMatch.text || searchText
            };
        }

        logger.warn('Element not found in YAML snapshot', {
            searchText,
            availableElements: yamlElements.slice(0, 20).map(e => `${e.role}: "${e.text}"`)
        });
        return null;
    }

    // 尝试解析 JSON 格式（向后兼容）
    try {
        const snapshot = JSON.parse(snapshotContent);
        // 标准化文本函数（移除空格以便匹配）
        const normalizeText = (text: string) => text.toLowerCase().trim().replace(/\s+/g, '');
        const searchTextNormalized = normalizeText(searchText);
        
        const findElement = (node: any): { ref: string | null; description: string } | null => {
            if (!node) return null;

            const nodeText = (node.text || '').toLowerCase().trim();
            const nodeTextNormalized = normalizeText(node.text || '');
            const nodeRole = (node.role || '').toLowerCase();
            const searchTextLower = searchText.toLowerCase().trim();

            // 优先匹配文本内容（标准化后完全匹配）
            if (searchTextNormalized && nodeTextNormalized === searchTextNormalized) {
                return { ref: node.ref || null, description: node.text || searchText };
            }

            // 标准化后包含匹配
            if (searchTextNormalized && nodeTextNormalized.includes(searchTextNormalized)) {
                return { ref: node.ref || null, description: node.text || searchText };
            }

            // 原始文本匹配（处理空格差异）
            if (searchTextLower && nodeText === searchTextLower) {
                return { ref: node.ref || null, description: node.text || searchText };
            }

            if (searchTextLower && nodeText.includes(searchTextLower)) {
                return { ref: node.ref || null, description: node.text || searchText };
            }

            // 检查是否是交互元素
            if (searchTextNormalized && (nodeRole === 'button' || nodeRole === 'link' || nodeRole === 'tab') && nodeTextNormalized.includes(searchTextNormalized)) {
                return { ref: node.ref || null, description: node.text || searchText };
            }

            // 检查子节点
            if (node.children && Array.isArray(node.children)) {
                for (const child of node.children) {
                    const result = findElement(child);
                    if (result && result.ref) {
                        return result;
                    }
                }
            }

            return null;
        };

        return findElement(snapshot);
    } catch (parseError) {
        logger.warn('Failed to parse snapshot as JSON', {
            error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        return null;
    }
}

/**
 * 获取快照中的所有文本元素（用于调试）
 */
export function getAllTextElements(snapshotContent: string): SnapshotElement[] {
    const yamlElements = parseYamlSnapshot(snapshotContent);

    if (yamlElements.length > 0) {
        return yamlElements;
    }

    // 尝试 JSON 格式
    try {
        const snapshot = JSON.parse(snapshotContent);
        const elements: SnapshotElement[] = [];

        const collectElements = (node: any) => {
            if (!node) return;
            if (node.text && node.text.trim() && node.ref) {
                elements.push({
                    text: node.text.trim(),
                    role: node.role || 'unknown',
                    ref: node.ref
                });
            }
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(collectElements);
            }
        };

        collectElements(snapshot);
        return elements;
    } catch (e) {
        return [];
    }
}

