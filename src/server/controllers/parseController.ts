import { Request, Response } from 'express';
import { TestService } from '../testService.js';
import { CaseParser } from '../../core/parser/caseParser.js';

/**
 * 解析测试用例文件
 */
export async function parseFile(req: Request, res: Response): Promise<void> {
  try {
    const { filePath, caseDir } = req.body;

    if (!filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }

    const service = new TestService(caseDir || 'case');
    const caseFile = await service.parseFile(filePath);

    res.json({
      success: true,
      data: {
        filePath: caseFile.filePath,
        module: caseFile.module,
        entryUrl: caseFile.entryUrl,
        testCases: caseFile.testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          module: tc.module,
          priority: tc.priority,
          testType: tc.testType,
          preconditions: tc.preconditions,
          steps: tc.steps,
          expectedResults: tc.expectedResults,
          entryUrl: tc.entryUrl
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 解析测试用例字符串
 */
export async function parseString(req: Request, res: Response): Promise<void> {
  try {
    const { content, virtualFilePath } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const parser = new CaseParser('', true);
    const caseFile = await parser.parseFileContent(content, virtualFilePath || 'inline-case.md');

    res.json({
      success: true,
      data: {
        filePath: caseFile.filePath,
        module: caseFile.module,
        entryUrl: caseFile.entryUrl,
        testCases: caseFile.testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          module: tc.module,
          priority: tc.priority,
          testType: tc.testType,
          preconditions: tc.preconditions,
          steps: tc.steps,
          expectedResults: tc.expectedResults,
          entryUrl: tc.entryUrl
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 解析目录下所有测试用例文件
 */
export async function parseDirectory(req: Request, res: Response): Promise<void> {
  try {
    const { dirPath, caseDir } = req.body;
    const targetDir = dirPath || caseDir || 'case';

    const service = new TestService(targetDir);
    const caseFiles = await service.parseDirectory();

    res.json({
      success: true,
      data: caseFiles.map(cf => ({
        filePath: cf.filePath,
        module: cf.module,
        entryUrl: cf.entryUrl,
        testCaseCount: cf.testCases.length
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

