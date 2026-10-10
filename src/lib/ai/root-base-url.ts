// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * 把用户配置的 baseUrl 归一化为"域名根",供从根开始拼接绝对路径的端点使用
 * (如火山 `/volc/v1/...`、阿里百炼 `/alibailian/...`、可灵 `/kling/...`)。
 *
 * API 配置面板的占位符是 `https://api.example.com/v1`,且拉模型列表兼容两种
 * 写法,所以 baseUrl 常以 `/v1` 结尾;直接拼接绝对路径会产生
 * `/v1/volc/v1/...` 这类重复路径(网关 404)。此处统一剥掉末尾斜杠与
 * `/v<数字>` 版本后缀;OpenAI 风格的相对路径端点不要用本函数。
 */
export function toRootBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v\d+$/, '');
}
