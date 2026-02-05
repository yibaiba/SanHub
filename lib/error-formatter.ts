/**
 * 视频生成错误格式化工具
 *
 * 用途：将技术性错误消息转换为用户友好的提示
 * 原则：仅影响前端展示，不修改后端日志
 *
 * @module error-formatter
 */

/**
 * 格式化视频生成错误消息
 *
 * @param error - 错误对象或错误消息字符串
 * @returns 用户友好的错误消息
 *
 * @example
 * ```typescript
 * formatVideoError("Flow API error (500): timeout")
 * // => "视频生成失败 (500): timeout"
 *
 * formatVideoError("Flow API 未配置")
 * // => "视频生成服务未配置，请联系管理员"
 *
 * formatVideoError(new Error("Connection failed"))
 * // => "Connection failed"
 * ```
 */
export function formatVideoError(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;

  // 1. 匹配 "Flow API error (状态码): 详情" 格式
  const flowApiErrorMatch = message.match(/Flow API error \((\d+)\): (.+)/i);
  if (flowApiErrorMatch) {
    const [, statusCode, detail] = flowApiErrorMatch;
    return `视频生成失败 (${statusCode}): ${detail}`;
  }

  // 2. 匹配 "Flow API returned xxx" 格式
  const flowReturnedMatch = message.match(/Flow API returned (.+)/i);
  if (flowReturnedMatch) {
    const [, content] = flowReturnedMatch;
    // 截断过长内容
    const truncatedContent = content.length > 100
      ? content.substring(0, 100) + '...'
      : content;
    return `视频生成服务返回异常内容: ${truncatedContent}`;
  }

  // 3. 匹配配置错误
  if (/Flow API 未配置/i.test(message)) {
    return '视频生成服务未配置，请联系管理员';
  }

  if (/Flow Base URL 未配置/i.test(message)) {
    return '视频生成服务配置不完整，请联系管理员';
  }

  if (/Flow API Key.*not configured/i.test(message)) {
    return '视频生成服务密钥未配置，请联系管理员';
  }

  // 4. 通用 Flow 关键词替换（兜底策略，不区分大小写）
  if (/flow/i.test(message)) {
    return message.replace(/flow/gi, '视频生成');
  }

  // 5. 不包含 Flow 的错误直接返回
  return message;
}

/**
 * 格式化图像生成错误消息
 *
 * @param error - 错误对象或错误消息字符串
 * @returns 用户友好的错误消息
 *
 * @example
 * ```typescript
 * formatImageError("Flow API error (400): invalid format")
 * // => "视频生成失败 (400): invalid format"
 * ```
 */
export function formatImageError(error: Error | string): string {
  // 复用视频错误格式化逻辑
  return formatVideoError(error);
}
