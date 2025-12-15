-- 测试用例表
CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    module VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    test_type VARCHAR(100) NOT NULL,
    entry_url TEXT,
    file_path TEXT,
    preconditions JSONB DEFAULT '[]'::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    expected_results JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_cases_case_id ON test_cases(case_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_module ON test_cases(module);
CREATE INDEX IF NOT EXISTS idx_test_cases_priority ON test_cases(priority);

-- 测试报告表
CREATE TABLE IF NOT EXISTS test_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(255) UNIQUE NOT NULL,
    total INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    duration INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_reports_report_id ON test_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_test_reports_start_time ON test_reports(start_time);

-- 测试报告摘要表
CREATE TABLE IF NOT EXISTS test_report_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID UNIQUE NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    total_actions INTEGER DEFAULT 0,
    passed_actions INTEGER DEFAULT 0,
    failed_actions INTEGER DEFAULT 0,
    total_expected_results INTEGER DEFAULT 0,
    matched_expected_results INTEGER DEFAULT 0,
    unmatched_expected_results INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 测试结果表
CREATE TABLE IF NOT EXISTS test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    success BOOLEAN DEFAULT false,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration INTEGER NOT NULL,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_results_report_id ON test_results(report_id);
CREATE INDEX IF NOT EXISTS idx_test_results_test_case_id ON test_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_results_success ON test_results(success);

-- 测试结果摘要表
CREATE TABLE IF NOT EXISTS test_result_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID UNIQUE NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    total_actions INTEGER DEFAULT 0,
    passed_actions INTEGER DEFAULT 0,
    failed_actions INTEGER DEFAULT 0,
    total_expected_results INTEGER DEFAULT 0,
    matched_expected_results INTEGER DEFAULT 0,
    unmatched_expected_results INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 操作结果表
CREATE TABLE IF NOT EXISTS action_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    selector TEXT,
    url TEXT,
    text TEXT,
    timeout INTEGER,
    expected TEXT,
    success BOOLEAN DEFAULT false,
    message TEXT,
    error TEXT,
    screenshot TEXT,
    timestamp TIMESTAMP NOT NULL,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_action_results_result_id ON action_results(result_id);
CREATE INDEX IF NOT EXISTS idx_action_results_action_type ON action_results(action_type);
CREATE INDEX IF NOT EXISTS idx_action_results_success ON action_results(success);

-- 预期结果检查表
CREATE TABLE IF NOT EXISTS expected_result_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    expected TEXT NOT NULL,
    actual TEXT NOT NULL,
    matched BOOLEAN DEFAULT false,
    match_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expected_result_checks_result_id ON expected_result_checks(result_id);
CREATE INDEX IF NOT EXISTS idx_expected_result_checks_matched ON expected_result_checks(matched);

-- PRD 表
CREATE TABLE IF NOT EXISTS prds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    version VARCHAR(50) DEFAULT '1.0.0',
    status VARCHAR(50) DEFAULT 'draft',
    author VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prds_prd_id ON prds(prd_id);
CREATE INDEX IF NOT EXISTS idx_prds_status ON prds(status);

-- PRD 评审表
CREATE TABLE IF NOT EXISTS prd_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id UUID NOT NULL REFERENCES prds(id) ON DELETE CASCADE,
    reviewer VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_reviews_prd_id ON prd_reviews(prd_id);
CREATE INDEX IF NOT EXISTS idx_prd_reviews_status ON prd_reviews(status);

-- PRD 与测试用例关联表
CREATE TABLE IF NOT EXISTS prd_test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id UUID NOT NULL REFERENCES prds(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(prd_id, test_case_id)
);

CREATE INDEX IF NOT EXISTS idx_prd_test_cases_prd_id ON prd_test_cases(prd_id);
CREATE INDEX IF NOT EXISTS idx_prd_test_cases_test_case_id ON prd_test_cases(test_case_id);

-- PRD 生成的测试用例表
CREATE TABLE IF NOT EXISTS prd_generated_test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id UUID NOT NULL REFERENCES prds(id) ON DELETE CASCADE,
    case_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    module VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    test_type VARCHAR(100) NOT NULL,
    entry_url TEXT,
    preconditions JSONB DEFAULT '[]'::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    expected_results JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prd_generated_test_cases_prd_id ON prd_generated_test_cases(prd_id);
CREATE INDEX IF NOT EXISTS idx_prd_generated_test_cases_case_id ON prd_generated_test_cases(case_id);
CREATE INDEX IF NOT EXISTS idx_prd_generated_test_cases_status ON prd_generated_test_cases(status);

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有表添加更新时间触发器（先删除已存在的触发器）
DROP TRIGGER IF EXISTS update_test_cases_updated_at ON test_cases;
DROP TRIGGER IF EXISTS update_test_reports_updated_at ON test_reports;
DROP TRIGGER IF EXISTS update_test_report_summaries_updated_at ON test_report_summaries;
DROP TRIGGER IF EXISTS update_test_results_updated_at ON test_results;
DROP TRIGGER IF EXISTS update_test_result_summaries_updated_at ON test_result_summaries;
DROP TRIGGER IF EXISTS update_action_results_updated_at ON action_results;
DROP TRIGGER IF EXISTS update_expected_result_checks_updated_at ON expected_result_checks;
DROP TRIGGER IF EXISTS update_prds_updated_at ON prds;
DROP TRIGGER IF EXISTS update_prd_reviews_updated_at ON prd_reviews;
DROP TRIGGER IF EXISTS update_prd_generated_test_cases_updated_at ON prd_generated_test_cases;

CREATE TRIGGER update_test_cases_updated_at BEFORE UPDATE ON test_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_reports_updated_at BEFORE UPDATE ON test_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_report_summaries_updated_at BEFORE UPDATE ON test_report_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_results_updated_at BEFORE UPDATE ON test_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_result_summaries_updated_at BEFORE UPDATE ON test_result_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_results_updated_at BEFORE UPDATE ON action_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expected_result_checks_updated_at BEFORE UPDATE ON expected_result_checks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prds_updated_at BEFORE UPDATE ON prds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prd_reviews_updated_at BEFORE UPDATE ON prd_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prd_generated_test_cases_updated_at BEFORE UPDATE ON prd_generated_test_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

