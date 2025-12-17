/**
 * PRD 自动生成相关类型定义
 */

export type GenerationStep = 'clarification' | 'schema' | 'generation';
export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PRDGenerationTask {
  id: string;
  taskId: string;
  title?: string;
  status: GenerationStatus;
  currentStep?: GenerationStep;
  progress: number; // 0-100
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface RequirementInput {
  id: string;
  taskId: string;
  requirementText: string;
  createdAt: Date;
}

export interface ClarificationMessage {
  id: string;
  taskId: string;
  role: 'user' | 'assistant';
  content: string;
  messageIndex: number;
  createdAt: Date;
}

export interface PRDSchema {
  id: string;
  taskId: string;
  schemaData: PRDSchemaData;
  createdAt: Date;
  updatedAt: Date;
}

export interface PRDSchemaData {
  // 产品概述
  productOverview?: {
    productName?: string;
    productDescription?: string;
    targetUsers?: string[];
    coreValue?: string[];
  };
  
  // 功能需求
  functionalRequirements?: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2';
    userStory?: string;
    acceptanceCriteria?: string[];
  }>;
  
  // 非功能需求
  nonFunctionalRequirements?: {
    performance?: string[];
    security?: string[];
    compatibility?: string[];
    usability?: string[];
  };
  
  // 用户场景
  userScenarios?: Array<{
    scenario: string;
    steps: string[];
    expectedResult: string;
  }>;
  
  // 技术约束
  technicalConstraints?: string[];
  
  // 业务规则
  businessRules?: string[];
  
  // 其他信息
  additionalInfo?: Record<string, any>;
}

export interface PRDGenerationResult {
  id: string;
  taskId: string;
  prdId?: string;
  prdContent: string;
  createdAt: Date;
}

export interface ClarificationQuestion {
  question: string;
  field?: string; // 关联的Schema字段
  required: boolean;
}

export interface ClarificationResponse {
  isComplete: boolean;
  questions: ClarificationQuestion[];
  structuredDraft?: Partial<PRDSchemaData>;
}

