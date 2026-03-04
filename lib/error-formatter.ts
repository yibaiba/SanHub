/**
 * 生成错误格式化工具
 *
 * 用途：将技术性错误消息转换为用户友好的提示
 * 原则：仅影响前端展示，不修改后端日志
 *
 * @module error-formatter
 */

// 常见错误模式及其友好提示
const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string | ((match: RegExpMatchArray) => string) }> = [
  // API 配置错误
  { pattern: /Flow API 未配置/i, message: '视频生成服务未配置，请联系管理员' },
  { pattern: /Flow Base URL 未配置/i, message: '视频生成服务配置不完整，请联系管理员' },
  { pattern: /Flow API Key.*not configured/i, message: '视频生成服务密钥未配置，请联系管理员' },
  { pattern: /API Key.*not configured/i, message: '服务密钥未配置，请联系管理员' },

  // 网络和连接错误
  { pattern: /ECONNREFUSED/i, message: '无法连接到服务器，请稍后重试' },
  { pattern: /ETIMEDOUT|timeout/i, message: '请求超时，请稍后重试' },
  { pattern: /ENOTFOUND/i, message: '服务器地址无效，请联系管理员' },
  { pattern: /socket.*closed|ECONNRESET/i, message: '连接中断，请稍后重试' },
  { pattern: /network.*error/i, message: '网络错误，请检查网络连接' },

  // HTTP 状态码错误
  { pattern: /error.*\(400\)|status.*400/i, message: '请求参数错误，请检查输入' },
  { pattern: /error.*\(401\)|status.*401|unauthorized/i, message: '服务授权失败，请联系管理员' },
  { pattern: /error.*\(403\)|status.*403|forbidden/i, message: '访问被拒绝，请联系管理员' },
  { pattern: /error.*\(404\)|status.*404|not found/i, message: '服务不存在，请联系管理员' },
  { pattern: /error.*\(429\)|status.*429|too many requests|rate limit/i, message: '请求过于频繁，请稍后重试' },
  { pattern: /error.*\(500\)|status.*500|internal server error/i, message: '服务器内部错误，请稍后重试' },
  { pattern: /error.*\(502\)|status.*502|bad gateway/i, message: '服务网关错误，请稍后重试' },
  { pattern: /error.*\(503\)|status.*503|service unavailable/i, message: '服务暂时不可用，请稍后重试' },
  { pattern: /error.*\(504\)|status.*504|gateway timeout/i, message: '服务响应超时，请稍后重试' },

  // 余额和配额错误
  { pattern: /insufficient.*balance|余额不足|积分不足/i, message: '积分不足，请充值后重试' },
  { pattern: /quota.*exceeded|配额.*超|limit.*exceeded/i, message: '使用配额已满，请稍后重试' },

  // 内容审核错误
  { pattern: /content.*policy|违规|敏感|审核/i, message: '内容可能违反使用规范，请修改后重试' },
  { pattern: /nsfw|inappropriate/i, message: '内容不合规，请修改后重试' },

  // 模型相关错误
  { pattern: /model.*not.*found|模型.*不存在/i, message: '所选模型不可用，请更换模型' },
  { pattern: /model.*unavailable|模型.*不可用/i, message: '模型暂时不可用，请稍后重试' },
  { pattern: /no.*model.*available|无可用模型/i, message: '暂无可用模型，请联系管理员' },

  // 图片相关错误
  { pattern: /invalid.*image|图片.*无效/i, message: '图片格式无效，请更换图片' },
  { pattern: /image.*too.*large|图片.*过大/i, message: '图片文件过大，请压缩后重试' },
  { pattern: /unsupported.*format|不支持.*格式/i, message: '不支持的文件格式' },
  { pattern: /decode.*base64.*failed|base64.*error/i, message: '图片解码失败，请更换图片' },

  // 提示词相关错误
  { pattern: /prompt.*too.*long|提示词.*过长/i, message: '提示词过长，请精简内容' },
  { pattern: /empty.*prompt|提示词.*为空/i, message: '请输入提示词' },

  // Flow/Sora API 特定错误
  {
    pattern: /Flow API error \((\d+)\): (.+)/i,
    message: (match) => `视频生成失败（错误码 ${match[1]}），请稍后重试`
  },
  {
    pattern: /Flow API returned (.+)/i,
    message: '视频服务返回异常，请稍后重试'
  },

  // 通用 API 错误
  {
    pattern: /API.*error.*\((\d+)\)/i,
    message: (match) => `服务错误 (${match[1]})，请稍后重试`
  },
];

/**
 * 格式化生成错误消息
 *
 * @param error - 错误对象或错误消息字符串
 * @param type - 错误类型：'video' | 'image' | 'chat' | 'generic'
 * @returns 用户友好的错误消息
 */
export function formatGenerationError(error: Error | string, type: 'video' | 'image' | 'chat' | 'generic' = 'generic'): string {
  const message = typeof error === 'string' ? error : error.message;

  // 遍历错误模式进行匹配
  for (const { pattern, message: friendlyMessage } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      if (typeof friendlyMessage === 'function') {
        return friendlyMessage(match);
      }
      return friendlyMessage;
    }
  }

  // 替换常见技术术语
  let formatted = message;

  // 替换渠道/供应商关键词，避免直接暴露到用户提示中
  if (/(flow|veo|sora)/i.test(formatted)) {
    formatted = formatted.replace(/flow/gi, '视频服务');
    formatted = formatted.replace(/veo/gi, '视频服务');
    formatted = formatted.replace(/sora/gi, '视频服务');
  }

  // 截断过长的错误消息
  if (formatted.length > 100) {
    formatted = formatted.substring(0, 100) + '...';
  }

  // 根据类型添加前缀
  const prefixMap = {
    video: '视频生成失败: ',
    image: '图片生成失败: ',
    chat: '聊天失败: ',
    generic: '',
  };

  // 如果消息已经包含"失败"或"错误"，不添加前缀
  if (/失败|错误|error|failed/i.test(formatted)) {
    return formatted;
  }

  return prefixMap[type] + formatted;
}

/**
 * 格式化视频生成错误消息
 * @deprecated 使用 formatGenerationError(error, 'video') 代替
 */
export function formatVideoError(error: Error | string): string {
  return formatGenerationError(error, 'video');
}

/**
 * 格式化图像生成错误消息
 * @deprecated 使用 formatGenerationError(error, 'image') 代替
 */
export function formatImageError(error: Error | string): string {
  return formatGenerationError(error, 'image');
}

/**
 * 格式化聊天错误消息
 */
export function formatChatError(error: Error | string): string {
  return formatGenerationError(error, 'chat');
}
