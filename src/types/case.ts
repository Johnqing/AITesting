export interface TestCase {
  id: string;
  title: string;
  module: string;
  priority: string;
  testType: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  entryUrl?: string;
}

export interface CaseFile {
  filePath: string;
  module: string;
  entryUrl?: string;
  testCases: TestCase[];
}

