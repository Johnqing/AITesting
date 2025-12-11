/**
 * 将日期格式化为 YYYY-MM-DD HH:mm:ss 格式（中国时区）
 * @param date 要格式化的日期对象
 * @returns 格式化后的时间字符串
 */
export function formatDateTime(date: Date): string {
  // 使用 Intl.DateTimeFormat 格式化中国时区时间
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const second = parts.find(p => p.type === 'second')?.value || '';
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 获取当前时间的格式化字符串（用于文件名）
 * @returns 格式化的时间字符串，适合用作文件名
 */
export function formatDateTimeForFilename(date: Date = new Date()): string {
  return formatDateTime(date).replace(/[: ]/g, '-');
}

