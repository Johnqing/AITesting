import { TestService } from '../services/testService.js';
import { Reporter } from '../reporter/reporter.js';
import { validateEnv } from '../utils/env.js';

/**
 * 运行所有测试用例命令
 */
export async function runAllCommand(options: {
  caseDir: string;
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void> {
  try {
    validateEnv();

    console.log('Starting test execution...');
    console.log(`Case directory: ${options.caseDir}`);
    console.log(`Output directory: ${options.outputDir}`);

    const service = new TestService(options.caseDir);
    const results = await service.runAll();

    const reporter = new Reporter(options.outputDir);
    const report = reporter.generateReport(results);

    reporter.printSummary(report);
    reporter.saveReport(report, options.format);

    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

/**
 * 运行单个测试用例文件命令
 */
export async function runFileCommand(file: string, options: {
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void> {
  try {
    validateEnv();

    console.log('Starting test execution...');
    console.log(`Test case file: ${file}`);
    console.log(`Output directory: ${options.outputDir}`);

    const service = new TestService();
    const results = await service.runFile(file);

    const reporter = new Reporter(options.outputDir);
    const report = reporter.generateReport(results);

    reporter.printSummary(report);
    reporter.saveReport(report, options.format);

    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error running test file:', error);
    process.exit(1);
  }
}

/**
 * 运行用例字符串命令
 */
export async function runStringCommand(caseContent: string, options: {
  entryUrl?: string;
  outputDir: string;
  format: 'markdown' | 'json' | 'both';
}): Promise<void> {
  try {
    validateEnv();

    console.log('Starting test execution from string...');
    console.log(`Case content length: ${caseContent.length} characters`);
    if (options.entryUrl) {
      console.log(`Entry URL: ${options.entryUrl}`);
    }
    console.log(`Output directory: ${options.outputDir}`);

    const service = new TestService();
    const results = await service.runFromString(caseContent, options.entryUrl);

    const reporter = new Reporter(options.outputDir);
    const report = reporter.generateReport(results);

    reporter.printSummary(report);
    reporter.saveReport(report, options.format);

    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error running test from string:', error);
    process.exit(1);
  }
}

