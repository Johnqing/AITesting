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

// XMind 文件上传和解析
export const uploadXmindFile = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/parse/xmind', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 60000 // 60秒超时，因为解析可能需要较长时间
  })
}

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
export const getExecutionReport = (executionId: string) => api.get(`/executions/${executionId}/report`)

// PRD 接口
export const getAllPRDs = () => api.get('/prds')
export const getPRDById = (prdId: string) => api.get(`/prds/${prdId}`)
export const createPRD = (data: any) => api.post('/prds', data)
export const updatePRD = (prdId: string, data: any) => api.put(`/prds/${prdId}`, data)
export const deletePRD = (prdId: string) => api.delete(`/prds/${prdId}`)
export const generateTestCasesFromPRD = (prdId: string, saveToDatabase: boolean = true) =>
  api.post(`/prds/${prdId}/generate-test-cases`, { saveToDatabase })
export const getPRDGeneratedTestCases = (prdId: string) => api.get(`/prds/${prdId}/test-cases`)
export const uploadPRDFile = (data: { filePath: string }) => api.post('/prds/upload', data)
export const exportPRDAsMarkdownFile = async (prdId: string) => {
  // 使用相对路径，通过代理访问
  const response = await fetch(`/api/v1/prds/${prdId}/export`)
  if (!response.ok) {
    throw new Error(`导出失败: ${response.statusText}`)
  }
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const contentDisposition = response.headers.get('Content-Disposition')
  if (contentDisposition) {
    const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
    if (fileNameMatch) {
      a.download = decodeURIComponent(fileNameMatch[1])
    }
  } else {
    a.download = `PRD-${prdId}.md`
  }
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

// PRD 生成接口
export const startPRDGeneration = (data: { requirement: string; title?: string; appId?: string }) =>
  api.post('/prd/generate', data)
export const getGenerationStatus = (taskId: string) =>
  api.get(`/prd/generate/${taskId}/status`)
export const continueConversation = (taskId: string, response: string) =>
  api.post(`/prd/generate/${taskId}/continue`, { response })
export const getMessages = (taskId: string) =>
  api.get(`/prd/generate/${taskId}/messages`)
export const getGenerationResult = (taskId: string) =>
  api.get(`/prd/generate/${taskId}/result`)
export const getSchema = (taskId: string) =>
  api.get(`/prd/generate/${taskId}/schema`)
export const saveGeneratedPRD = (taskId: string, data?: { title?: string; description?: string; version?: string; status?: string; author?: string; prdContent?: string }) =>
  api.post(`/prd/generate/${taskId}/save`, data || {})
export const regenerateParagraph = (taskId: string, data: { sectionTitle: string; context?: string }) =>
  api.post(`/prd/generate/${taskId}/regenerate-paragraph`, data)

// 应用管理接口
export const getAllApplications = () => api.get('/applications')
export const getApplicationByAppId = (appId: string) => api.get(`/applications/${appId}`)
export const createApplication = (data: { appId?: string; name: string; description?: string; appType?: string }) =>
  api.post('/applications', data)
export const updateApplication = (appId: string, data: { name?: string; description?: string; appType?: string }) =>
  api.put(`/applications/${appId}`, data)
export const deleteApplication = (appId: string) => api.delete(`/applications/${appId}`)
export const exportPRDAsMarkdown = async (taskId: string) => {
  // 使用相对路径，通过代理访问
  const response = await fetch(`/api/v1/prd/generate/${taskId}/export`)
  if (!response.ok) {
    throw new Error(`导出失败: ${response.statusText}`)
  }
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const contentDisposition = response.headers.get('Content-Disposition')
  if (contentDisposition) {
    const fileNameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
    if (fileNameMatch) {
      a.download = decodeURIComponent(fileNameMatch[1])
    }
  } else {
    a.download = `PRD-${taskId}.md`
  }
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

// 直接从需求说明生成PRD接口（不经过Schema步骤）
export const generatePRDDirect = (data: { requirement: string }) =>
  api.post('/prd/generate-direct', data)

// 保存直接生成的PRD到单独的表
export const saveDirectGeneratedPRD = (data: {
  sourcePrdId?: string
  title: string
  description?: string
  prdContent: string
  requirementText?: string
  version?: string
  status?: string
  author?: string
  appId?: string
}) => api.post('/prd/generate-direct/save', data)

// 产品需求管理接口（direct_generated_prds表）
export const getAllDirectGeneratedPRDs = () => api.get('/direct-generated-prds')
export const getDirectGeneratedPRDById = (id: string) => api.get(`/direct-generated-prds/${id}`)
export const getDirectGeneratedPRDsBySourcePrdId = (sourcePrdId: string) =>
  api.get(`/direct-generated-prds/source/${sourcePrdId}`)
export const updateDirectGeneratedPRD = (id: string, data: {
  title?: string
  description?: string
  prdContent?: string
  version?: string
  status?: string
  author?: string
}) => api.put(`/direct-generated-prds/${id}`, data)
export const deleteDirectGeneratedPRD = (id: string) => api.delete(`/direct-generated-prds/${id}`)

