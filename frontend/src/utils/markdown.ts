import { marked } from 'marked'

// 配置marked选项
marked.setOptions({
  breaks: true, // 支持换行
  gfm: true, // GitHub风格Markdown
})

/**
 * 渲染Markdown为HTML
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return ''
  try {
    return marked.parse(markdown) as string
  } catch (error) {
    console.error('Markdown rendering error:', error)
    // 如果渲染失败，返回转义的HTML
    return markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>')
  }
}

