import { Request, Response } from 'express';
import { testCaseService } from '../../db/services/testCaseService.js';
import { TestCase } from '../../types/case.js';

/**
 * 获取所有测试用例
 */
export async function getAllTestCases(req: Request, res: Response): Promise<void> {
  try {
    const testCases = await testCaseService.getAllTestCases();
    res.json({
      success: true,
      data: testCases,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取测试用例失败',
    });
  }
}

/**
 * 根据ID获取测试用例
 */
export async function getTestCaseById(req: Request, res: Response): Promise<void> {
  try {
    const { caseId } = req.params;
    if (!caseId) {
      res.status(400).json({
        success: false,
        error: '测试用例ID不能为空',
      });
      return;
    }

    const testCase = await testCaseService.getTestCaseById(caseId);
    if (!testCase) {
      res.status(404).json({
        success: false,
        error: '测试用例不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: testCase,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '获取测试用例失败',
    });
  }
}

/**
 * 生成用例ID
 */
function generateCaseId(module: string): string {
  // 将模块名转换为大写，替换空格和特殊字符为连字符
  const moduleCode = module
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .substring(0, 20); // 限制长度
  
  // 生成时间戳后4位作为序号
  const sequence = Date.now().toString().slice(-4);
  
  return `TC-${moduleCode}-${sequence}`;
}

/**
 * 创建或更新测试用例
 */
export async function upsertTestCase(req: Request, res: Response): Promise<void> {
  try {
    const testCase: TestCase = req.body;
    
    if (!testCase.title) {
      res.status(400).json({
        success: false,
        error: '测试用例标题不能为空',
      });
      return;
    }

    // 如果是新增（没有ID）或ID为空，自动生成ID
    if (!testCase.id) {
      if (!testCase.module) {
        res.status(400).json({
          success: false,
          error: '功能模块不能为空（用于生成用例ID）',
        });
        return;
      }
      testCase.id = generateCaseId(testCase.module);
    }

    const result = await testCaseService.upsertTestCase(testCase);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '保存测试用例失败',
    });
  }
}

/**
 * 删除测试用例
 */
export async function deleteTestCase(req: Request, res: Response): Promise<void> {
  try {
    const { caseId } = req.params;
    if (!caseId) {
      res.status(400).json({
        success: false,
        error: '测试用例ID不能为空',
      });
      return;
    }

    await testCaseService.deleteTestCase(caseId);
    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || '删除测试用例失败',
    });
  }
}

