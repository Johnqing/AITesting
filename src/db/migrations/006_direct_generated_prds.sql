-- 直接从需求说明生成的PRD表（不经过Schema步骤）

CREATE TABLE IF NOT EXISTS direct_generated_prds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_prd_id UUID REFERENCES prds(id) ON DELETE SET NULL, -- 关联到源需求说明（可选）
    title VARCHAR(500) NOT NULL,
    description TEXT,
    prd_content TEXT NOT NULL, -- 生成的PRD Markdown内容
    requirement_text TEXT, -- 原始需求文本（用于追溯）
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'draft', -- draft, reviewing, approved, published
    author VARCHAR(255),
    app_id UUID REFERENCES applications(id) ON DELETE SET NULL, -- 关联应用分类（可选）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_direct_generated_prds_source_prd_id ON direct_generated_prds(source_prd_id);
CREATE INDEX IF NOT EXISTS idx_direct_generated_prds_status ON direct_generated_prds(status);
CREATE INDEX IF NOT EXISTS idx_direct_generated_prds_app_id ON direct_generated_prds(app_id);
CREATE INDEX IF NOT EXISTS idx_direct_generated_prds_created_at ON direct_generated_prds(created_at);

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_direct_generated_prds_updated_at ON direct_generated_prds;
CREATE TRIGGER update_direct_generated_prds_updated_at
    BEFORE UPDATE ON direct_generated_prds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

