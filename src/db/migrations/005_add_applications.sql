-- 应用分类表
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id VARCHAR(255) UNIQUE NOT NULL, -- 应用唯一标识，如 "warm-warm", "app-name"
    name VARCHAR(255) NOT NULL, -- 应用名称，如 "暖暖"
    description TEXT, -- 应用描述
    app_type VARCHAR(100), -- 应用类型：mobile_app, web_app, desktop_app, other
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_app_id ON applications(app_id);
CREATE INDEX IF NOT EXISTS idx_applications_name ON applications(name);

-- 在prd_generation_tasks表中添加app_id字段
ALTER TABLE prd_generation_tasks 
ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prd_generation_tasks_app_id ON prd_generation_tasks(app_id);

-- 在prds表中添加app_id字段
ALTER TABLE prds 
ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prds_app_id ON prds(app_id);

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_applications_updated_at ON applications;
CREATE TRIGGER update_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 插入一些示例应用（可选）
INSERT INTO applications (app_id, name, description, app_type) 
VALUES 
    ('warm-warm', '暖暖', '换装类移动应用', 'mobile_app'),
    ('default', '默认应用', '默认应用分类', 'other')
ON CONFLICT (app_id) DO NOTHING;

