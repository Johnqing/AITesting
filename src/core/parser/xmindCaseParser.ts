import { readFileSync } from 'fs';
import { TestCase, CaseFile } from '../../types/case.js';
import { createLogger } from '../../utils/logger.js';
import JSZip from 'jszip';

const logger = createLogger('XMindCaseParser');

export class XMindCaseParser {
  /**
   * 解析 XMind 文件并转换为测试用例
   */
  async parseFile(filePath: string): Promise<CaseFile> {
    const startTime = Date.now();
    logger.start('parseFile', { filePath });

    try {
      // XMind 文件实际上是一个 zip 文件，包含 content.json
      const fileBuffer = readFileSync(filePath);
      const zip = await JSZip.loadAsync(fileBuffer);

      // 读取 content.json
      const contentFile = zip.file('content.json');
      if (!contentFile) {
        throw new Error('content.json not found in XMind file');
      }

      const jsonStr = await contentFile.async('string');
      const jsonObj = JSON.parse(jsonStr);

      logger.debug('XMind file converted to JSON', {
        filePath,
        jsonLength: jsonStr.length
      });

      // 解析 JSON 结构并转换为测试用例
      const testCases: TestCase[] = [];
      let module = '';
      let entryUrl: string | undefined;

      // XMind 文件结构：sheets 数组，每个 sheet 有 rootTopic
      if (Array.isArray(jsonObj) && jsonObj.length > 0) {
        const sheet = jsonObj[0];
        if (sheet.rootTopic) {
          // 根主题的标题作为模块名
          module = this.extractTitleFromTopic(sheet.rootTopic) || '未命名模块';

          // 解析根主题的子节点
          if (sheet.rootTopic.children && sheet.rootTopic.children.attached) {
            const rootChildren = sheet.rootTopic.children.attached;

            // 遍历每个子主题，将其作为测试用例
            rootChildren.forEach((topic: any, index: number) => {
              const testCase = this.convertTopicToTestCase(topic, module, index + 1);
              if (testCase) {
                testCases.push(testCase);
              }
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.info('XMind file parsed successfully', {
        filePath,
        module,
        testCaseCount: testCases.length,
        duration: `${duration}ms`
      });
      logger.end('parseFile', { testCaseCount: testCases.length }, duration);

      return {
        filePath,
        module,
        entryUrl,
        testCases
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to parse XMind file', error, {
        filePath,
        duration: `${duration}ms`
      });
      logger.end('parseFile', { success: false }, duration);
      throw error;
    }
  }

  /**
   * 从主题节点提取标题
   */
  private extractTitleFromTopic(topic: any): string {
    if (topic.title) {
      return topic.title;
    }
    if (topic.attributedTitle && Array.isArray(topic.attributedTitle) && topic.attributedTitle.length > 0) {
      return topic.attributedTitle.map((item: any) => item.text || '').join('');
    }
    return '';
  }

  /**
   * 将 XMind 主题节点转换为测试用例
   * XMind 结构通常为：
   * - 第一层：测试用例标题
   * - 第二层：前置条件、测试步骤、预期结果等
   */
  private convertTopicToTestCase(topic: any, defaultModule: string, index: number): TestCase | null {
    const title = this.extractTitleFromTopic(topic);
    if (!title) {
      return null;
    }

    // 提取测试用例 ID（如果标题中包含 TC- 格式）
    let id = `TC-GENERATED-${index}`;
    const idMatch = title.match(/TC-[\w-]+/);
    if (idMatch) {
      id = idMatch[0];
    }

    // 初始化测试用例字段
    let module = defaultModule;
    let priority = 'P1';
    let testType = '功能测试';
    const preconditions: string[] = [];
    const steps: string[] = [];
    const expectedResults: string[] = [];
    let entryUrl: string | undefined;

    // 解析子节点
    if (topic.children && topic.children.attached) {
      const children = topic.children.attached;

      for (const child of children) {
        const childTitle = this.extractTitleFromTopic(child).toLowerCase();

        // 根据子节点标题判断内容类型
        if (childTitle.includes('前置条件') || childTitle.includes('进入') || childTitle.includes('环境')) {
          // 前置条件
          const conditions = this.extractTextFromTopicTree(child);
          preconditions.push(...conditions);

          // 检查是否包含 URL
          const urlMatch = childTitle.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            entryUrl = urlMatch[0];
          }
        } else if (childTitle.match(/^\d+\./) || childTitle.includes('步骤') || childTitle.includes('操作')) {
          // 测试步骤
          const stepTexts = this.extractTextFromTopicTree(child);
          steps.push(...stepTexts);
        } else if (childTitle.includes('预期') || childTitle.includes('结果') || childTitle.includes('验证')) {
          // 预期结果
          const resultTexts = this.extractTextFromTopicTree(child);
          expectedResults.push(...resultTexts);
        } else if (childTitle.includes('优先级') || childTitle.includes('priority')) {
          // 优先级
          const priorityText = this.extractTitleFromTopic(child);
          if (priorityText.match(/P[0-2]/)) {
            priority = priorityText.match(/P[0-2]/)![0];
          }
        } else if (childTitle.includes('模块')) {
          // 功能模块
          module = this.extractTitleFromTopic(child);
        } else if (childTitle.includes('类型') || childTitle.includes('测试类型')) {
          // 测试类型
          testType = this.extractTitleFromTopic(child);
        } else {
          // 默认作为测试步骤处理
          const stepTexts = this.extractTextFromTopicTree(child);
          if (stepTexts.length > 0) {
            steps.push(...stepTexts);
          }
        }
      }
    }

    // 如果没有明确的步骤，尝试从标题和子节点中提取
    if (steps.length === 0 && topic.children && topic.children.attached) {
      const children = topic.children.attached;
      for (const child of children) {
        const childTitle = this.extractTitleFromTopic(child);
        // 检查是否包含数字编号的步骤
        if (childTitle.match(/^\d+[\.、]/)) {
          steps.push(childTitle);
        } else {
          // 检查子节点的子节点
          if (child.children && child.children.attached) {
            const grandChildren = child.children.attached;
            for (const grandChild of grandChildren) {
              const grandChildTitle = this.extractTitleFromTopic(grandChild);
              if (grandChildTitle.match(/^\d+[\.、]/)) {
                steps.push(grandChildTitle);
              } else if (grandChildTitle) {
                // 检查是否是预期结果（通常包含"显示"、"跳转"、"成功"等关键词）
                const isExpectedResult = /(显示|跳转|成功|失败|提示|验证|检查|确认)/.test(grandChildTitle);
                if (isExpectedResult) {
                  expectedResults.push(grandChildTitle);
                } else {
                  // 如果步骤为空，也作为步骤处理
                  if (steps.length === 0) {
                    steps.push(grandChildTitle);
                  } else {
                    expectedResults.push(grandChildTitle);
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      id,
      title,
      module,
      priority,
      testType,
      preconditions: preconditions.length > 0 ? preconditions : [],
      steps: steps.length > 0 ? steps : [title], // 如果没有步骤，至少使用标题
      expectedResults: expectedResults.length > 0 ? expectedResults : [],
      entryUrl
    };
  }

  /**
   * 从主题树中提取所有文本内容
   */
  private extractTextFromTopicTree(topic: any): string[] {
    const texts: string[] = [];
    const title = this.extractTitleFromTopic(topic);
    if (title) {
      texts.push(title);
    }

    if (topic.children && topic.children.attached) {
      for (const child of topic.children.attached) {
        const childTexts = this.extractTextFromTopicTree(child);
        texts.push(...childTexts);
      }
    }

    return texts;
  }
}

