#!/usr/bin/env node

import { Command } from 'commander';
import { runAllCommand, runFileCommand, runStringCommand } from './commands/runCommand.js';

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
    await runAllCommand({
      caseDir: options.caseDir,
      outputDir: options.outputDir,
      format: options.format as 'markdown' | 'json' | 'both'
    });
  });

program
  .command('run-file')
  .description('Run a single test case file')
  .argument('<file>', 'Path to the test case file')
  .option('-o, --output-dir <dir>', 'Output directory for reports', 'reports')
  .option('-f, --format <format>', 'Report format (markdown, json, both)', 'both')
  .action(async (file, options) => {
    await runFileCommand(file, {
      outputDir: options.outputDir,
      format: options.format as 'markdown' | 'json' | 'both'
    });
  });

program
  .command('run-string')
  .description('Run test cases from a string (markdown format)')
  .argument('<content>', 'Test case content in markdown format')
  .option('-u, --entry-url <url>', 'Entry URL for the test cases')
  .option('-o, --output-dir <dir>', 'Output directory for reports', 'reports')
  .option('-f, --format <format>', 'Report format (markdown, json, both)', 'both')
  .action(async (content, options) => {
    await runStringCommand(content, {
      entryUrl: options.entryUrl,
      outputDir: options.outputDir,
      format: options.format as 'markdown' | 'json' | 'both'
    });
  });

program.parse();
