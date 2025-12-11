#!/usr/bin/env node

import { Command } from 'commander';
import { TestRunner } from './runner/testRunner.js';
import { Reporter } from './reporter/reporter.js';
import { validateEnv } from './utils/env.js';

const program = new Command();

program
  .name('testflow')
  .description('AI-driven Playwright automation testing system')
  .version('1.0.0');

program
  .command('run')
  .description('Run all test cases')
  .option('-c, --case-dir <dir>', 'Case directory', 'case')
  .option('-o, --output-dir <dir>', 'Output directory for reports', 'reports')
  .option('-f, --format <format>', 'Report format (markdown, json, both)', 'both')
  .action(async (options) => {
    try {
      // 验证环境变量
      validateEnv();

      console.log('Starting test execution...');
      console.log(`Case directory: ${options.caseDir}`);
      console.log(`Output directory: ${options.outputDir}`);

      const runner = new TestRunner(options.caseDir);
      const results = await runner.runAll();

      const reporter = new Reporter(options.outputDir);
      const report = reporter.generateReport(results);

      reporter.printSummary(report);
      reporter.saveReport(report, options.format as 'markdown' | 'json' | 'both');

      // 如果有失败的测试，退出码为1
      process.exit(report.failed > 0 ? 1 : 0);
    } catch (error) {
      console.error('Error running tests:', error);
      process.exit(1);
    }
  });

program
  .command('run-file')
  .description('Run a single test case file')
  .argument('<file>', 'Path to the test case file')
  .option('-o, --output-dir <dir>', 'Output directory for reports', 'reports')
  .option('-f, --format <format>', 'Report format (markdown, json, both)', 'both')
  .action(async (file, options) => {
    try {
      // 验证环境变量
      validateEnv();

      console.log('Starting test execution...');
      console.log(`Test case file: ${file}`);
      console.log(`Output directory: ${options.outputDir}`);

      const runner = new TestRunner();
      const results = await runner.runFile(file);

      const reporter = new Reporter(options.outputDir);
      const report = reporter.generateReport(results);

      reporter.printSummary(report);
      reporter.saveReport(report, options.format as 'markdown' | 'json' | 'both');

      // 如果有失败的测试，退出码为1
      process.exit(report.failed > 0 ? 1 : 0);
    } catch (error) {
      console.error('Error running test file:', error);
      process.exit(1);
    }
  });

program.parse();

