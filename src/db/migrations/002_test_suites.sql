-- 测试用例集表
CREATE TABLE IF NOT EXISTS test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    system VARCHAR(255),
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_suites_suite_id ON test_suites(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_suites_system ON test_suites(system);

-- 用例集与测试用例关联表
CREATE TABLE IF NOT EXISTS test_suite_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    sequence INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(suite_id, test_case_id)
);

CREATE INDEX IF NOT EXISTS idx_test_suite_cases_suite_id ON test_suite_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_cases_test_case_id ON test_suite_cases(test_case_id);

-- 用例集执行记录表
CREATE TABLE IF NOT EXISTS test_suite_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    execution_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    total_cases INTEGER DEFAULT 0,
    passed_cases INTEGER DEFAULT 0,
    failed_cases INTEGER DEFAULT 0,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_suite_executions_suite_id ON test_suite_executions(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_executions_execution_id ON test_suite_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_executions_status ON test_suite_executions(status);

-- 用例集执行结果表（每个用例的执行结果）
CREATE TABLE IF NOT EXISTS test_suite_execution_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES test_suite_executions(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    test_result_id UUID REFERENCES test_results(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, success, failed
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_suite_execution_results_execution_id ON test_suite_execution_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_execution_results_test_case_id ON test_suite_execution_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_suite_execution_results_status ON test_suite_execution_results(status);

-- 更新时间触发器（先删除已存在的触发器）
DROP TRIGGER IF EXISTS update_test_suites_updated_at ON test_suites;
DROP TRIGGER IF EXISTS update_test_suite_executions_updated_at ON test_suite_executions;
DROP TRIGGER IF EXISTS update_test_suite_execution_results_updated_at ON test_suite_execution_results;

CREATE TRIGGER update_test_suites_updated_at BEFORE UPDATE ON test_suites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_suite_executions_updated_at BEFORE UPDATE ON test_suite_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_suite_execution_results_updated_at BEFORE UPDATE ON test_suite_execution_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

