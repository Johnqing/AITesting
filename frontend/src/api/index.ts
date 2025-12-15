import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 300000, // 5分钟超时，因为测试执行可能需要较长时间
  headers: {
    'Content-Type': 'application/json'
  }
})

// 直接请求的 axios 实例（用于健康检查等不需要代理的请求）
const directApi = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    const message = error.response?.data?.error || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

export default api

// 健康检查
export const healthCheck = () => directApi.get('/health')

// API 信息
export const getApiInfo = () => api.get('/info')

// 解析接口
export const parseFile = (data: { filePath: string; caseDir?: string }) =>
  api.post('/parse/file', data)

export const parseString = (data: { content: string; virtualFilePath?: string }) =>
  api.post('/parse/string', data)

export const parseDirectory = (data: { dirPath?: string; caseDir?: string }) =>
  api.post('/parse/directory', data)

// 运行接口
export const runAll = (data: { caseDir?: string; outputDir?: string; format?: string }) =>
  api.post('/run/all', data)

export const runFile = (data: { filePath: string; outputDir?: string; format?: string }) =>
  api.post('/run/file', data)

export const runTestCase = (data: {
  testCase: any
  entryUrl?: string
  outputDir?: string
  format?: string
}) => api.post('/run/testcase', data)

export const runString = (data: {
  content: string
  entryUrl?: string
  outputDir?: string
  format?: string
}) => api.post('/run/string', data)

// 报告接口
export const listReports = () => api.get('/reports')

export const getReport = async (reportId: string, format?: string) => {
  if (format === 'markdown') {
    // Markdown 格式需要使用 fetch 或直接请求
    const response = await fetch(`http://localhost:3000/api/v1/reports/${reportId}?format=markdown`)
    return await response.text()
  } else {
    return api.get(`/reports/${reportId}`, {
      params: { format }
    })
  }
}

// 测试用例接口
export const getAllTestCases = () => api.get('/test-cases')
export const getTestCaseById = (caseId: string) => api.get(`/test-cases/${caseId}`)
export const createTestCase = (data: any) => api.post('/test-cases', data)
export const updateTestCase = (caseId: string, data: any) => api.put(`/test-cases/${caseId}`, data)
export const deleteTestCase = (caseId: string) => api.delete(`/test-cases/${caseId}`)

// 用例集接口
export const getAllTestSuites = () => api.get('/test-suites')
export const getTestSuiteById = (suiteId: string) => api.get(`/test-suites/${suiteId}`)
export const createTestSuite = (data: any) => api.post('/test-suites', data)
export const updateTestSuite = (suiteId: string, data: any) => api.put(`/test-suites/${suiteId}`, data)
export const deleteTestSuite = (suiteId: string) => api.delete(`/test-suites/${suiteId}`)
export const executeTestSuite = (suiteId: string) => api.post(`/test-suites/${suiteId}/execute`)
export const getSuiteExecutions = (suiteId: string) => api.get(`/test-suites/${suiteId}/executions`)
export const getExecution = (executionId: string) => api.get(`/executions/${executionId}`)

