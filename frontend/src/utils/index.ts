/**
 * 格式化时间
 */
export const formatTime = (time: string | Date): string => {
  const date = typeof time === 'string' ? new Date(time) : time
  return date.toLocaleString('zh-CN')
}

/**
 * 格式化时长（毫秒）
 */
export const formatDuration = (ms?: number): string => {
  if (!ms) return '0ms'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(2)
  return `${minutes}m ${seconds}s`
}

/**
 * 格式化文件大小
 */
export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

