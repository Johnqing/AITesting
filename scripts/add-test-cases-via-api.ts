#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { CaseParser } from '../src/core/parser/caseParser.js';
import { TestCase } from '../src/types/case.js';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINT = `${API_BASE_URL}/api/v1/test-cases`;

/**
 * 通过 HTTP API 添加测试用例
 */
async function addTestCaseViaAPI(testCase: TestCase): Promise<void> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCase),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`API请求失败 (${response.status}): ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '添加测试用例失败');
    }

    return result.data;
  } catch (error: any) {
    if (error.message.includes('fetch')) {
      throw new Error(`无法连接到API服务器 (${API_BASE_URL})，请确保服务器正在运行`);
    }
    throw error;
  }
}

/**
 * 从 Markdown 文件导入测试用例到数据库（通过 API）
 */
async function importTestCasesViaAPI(filePath: string): Promise<void> {
  try {
    console.log(`📄 读取文件: ${filePath}`);
    
    // 读取文件内容
    const content = readFileSync(filePath, 'utf-8');
    
    // 解析文件
    console.log('🔄 解析测试用例文件...');
    const parser = new CaseParser('', true);
    const caseFile = await parser.parseFileContent(content, filePath);
    
    console.log(`✅ 解析完成，找到 ${caseFile.testCases.length} 个测试用例`);
    console.log(`   模块: ${caseFile.module}`);
    console.log(`   入口URL: ${caseFile.entryUrl || '无'}\n`);
    
    // 通过 API 添加测试用例
    console.log(`🌐 通过 API 添加测试用例到服务器 (${API_BASE_URL})...`);
    const results: TestCase[] = [];
    const errors: Array<{ testCase: TestCase; error: string }> = [];
    
    for (let i = 0; i < caseFile.testCases.length; i++) {
      const testCase = caseFile.testCases[i];
      
      // 设置入口URL（如果文件级别有）
      if (caseFile.entryUrl && !testCase.entryUrl) {
        testCase.entryUrl = caseFile.entryUrl;
      }
      
      try {
        console.log(`   [${i + 1}/${caseFile.testCases.length}] 添加 ${testCase.id} - ${testCase.title}...`);
        const result = await addTestCaseViaAPI(testCase);
        results.push(result);
        console.log(`   ✅ 成功添加 ${testCase.id}`);
      } catch (error: any) {
        const errorMsg = error.message || '未知错误';
        console.error(`   ❌ 添加失败 ${testCase.id}: ${errorMsg}`);
        errors.push({ testCase, error: errorMsg });
      }
    }
    
    console.log(`\n✅ 成功添加 ${results.length} 个测试用例:`);
    results.forEach((tc, index) => {
      console.log(`   ${index + 1}. ${tc.id} - ${tc.title}`);
    });
    
    if (errors.length > 0) {
      console.log(`\n❌ 失败 ${errors.length} 个测试用例:`);
      errors.forEach(({ testCase, error }) => {
        console.log(`   - ${testCase.id}: ${error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 导入失败:', error);
    throw error;
  }
}

async function main() {
  const filePath = process.argv[2] || 'case/04-test.md';
  
  // 检查文件是否存在
  try {
    readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`❌ 文件不存在: ${filePath}`);
      console.log('用法: tsx scripts/add-test-cases-via-api.ts [文件路径]');
      process.exit(1);
    }
    throw error;
  }
  
  try {
    // 导入测试用例
    await importTestCasesViaAPI(filePath);
    
    console.log('\n✅ 导入完成');
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  }
}

main();

