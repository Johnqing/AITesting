/**
 * 应用ID生成工具
 */

/**
 * 从应用名称生成appId
 * 策略：
 * 1. 如果名称是英文，转换为小写，用连字符替换空格和特殊字符
 * 2. 如果名称是中文或包含中文，使用时间戳+随机字符串
 * 3. 如果名称为空，使用时间戳+随机字符串
 */
export function generateAppId(name: string): string {
  if (!name || name.trim().length === 0) {
    return generateRandomAppId();
  }

  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(name);
  
  if (hasChinese) {
    // 包含中文，使用时间戳+随机字符串
    return generateRandomAppId();
  }

  // 英文名称，转换为小写，用连字符替换空格和特殊字符
  let appId = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // 空格替换为连字符
    .replace(/[^a-z0-9-]/g, '')     // 移除非字母数字和连字符的字符
    .replace(/-+/g, '-')             // 多个连字符替换为单个
    .replace(/^-|-$/g, '');         // 移除开头和结尾的连字符

  // 如果转换后为空，使用随机ID
  if (!appId || appId.length === 0) {
    return generateRandomAppId();
  }

  // 限制长度（最多50个字符）
  if (appId.length > 50) {
    appId = appId.substring(0, 50);
  }

  return appId;
}

/**
 * 生成随机appId
 * 格式：app-{timestamp}-{random}
 */
function generateRandomAppId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8); // 6位随机字符串
  return `app-${timestamp}-${random}`;
}

/**
 * 检查appId是否已存在（需要异步查询数据库）
 * 如果存在，生成新的appId
 */
export async function ensureUniqueAppId(
  appId: string,
  checkExists: (appId: string) => Promise<boolean>
): Promise<string> {
  let finalAppId = appId;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const exists = await checkExists(finalAppId);
    if (!exists) {
      return finalAppId;
    }
    
    // 如果存在，在末尾添加随机字符串
    const random = Math.random().toString(36).substring(2, 6);
    finalAppId = `${appId}-${random}`;
    attempts++;
  }

  // 如果多次尝试后仍然冲突，使用完全随机的ID
  return generateRandomAppId();
}

