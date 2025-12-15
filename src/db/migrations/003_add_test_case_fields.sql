-- 为测试用例表添加新字段
ALTER TABLE test_cases 
ADD COLUMN IF NOT EXISTS system VARCHAR(255),
ADD COLUMN IF NOT EXISTS test_objective TEXT;

CREATE INDEX IF NOT EXISTS idx_test_cases_system ON test_cases(system);


