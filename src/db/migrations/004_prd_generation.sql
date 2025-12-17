-- PRD 生成相关表

-- PRD 生成任务表（存储生成流程的状态）
CREATE TABLE IF NOT EXISTS prd_generation_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
    current_step VARCHAR(100), -- clarification, schema, generation
    progress INTEGER DEFAULT 0, -- 0-100
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_generation_tasks_task_id ON prd_generation_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_prd_generation_tasks_status ON prd_generation_tasks(status);

-- 需求输入表（存储用户的原始需求输入）
CREATE TABLE IF NOT EXISTS prd_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES prd_generation_tasks(id) ON DELETE CASCADE,
    requirement_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_requirements_task_id ON prd_requirements(task_id);

-- 需求澄清对话表（存储多轮对话历史）
CREATE TABLE IF NOT EXISTS prd_clarification_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES prd_generation_tasks(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- user, assistant
    content TEXT NOT NULL,
    message_index INTEGER NOT NULL, -- 对话顺序
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_clarification_messages_task_id ON prd_clarification_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_prd_clarification_messages_message_index ON prd_clarification_messages(task_id, message_index);

-- PRD Schema 表（存储结构化后的需求Schema）
CREATE TABLE IF NOT EXISTS prd_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES prd_generation_tasks(id) ON DELETE CASCADE,
    schema_data JSONB NOT NULL, -- 存储结构化的Schema JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_schemas_task_id ON prd_schemas(task_id);

-- PRD 生成结果表（存储生成的PRD内容，关联到prds表）
CREATE TABLE IF NOT EXISTS prd_generation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES prd_generation_tasks(id) ON DELETE CASCADE,
    prd_id UUID REFERENCES prds(id) ON DELETE SET NULL, -- 关联到生成的PRD
    prd_content TEXT NOT NULL, -- 生成的PRD Markdown内容
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_generation_results_task_id ON prd_generation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_prd_generation_results_prd_id ON prd_generation_results(prd_id);

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_prd_generation_tasks_updated_at ON prd_generation_tasks;
CREATE TRIGGER update_prd_generation_tasks_updated_at
    BEFORE UPDATE ON prd_generation_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prd_schemas_updated_at ON prd_schemas;
CREATE TRIGGER update_prd_schemas_updated_at
    BEFORE UPDATE ON prd_schemas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

