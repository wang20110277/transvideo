import { describe, it, expect } from 'vitest';
import { toRootBaseUrl } from '@/lib/ai/root-base-url';

describe('toRootBaseUrl(绝对路径端点的域名根化)', () => {
  it('剥掉末尾斜杠与 /v<数字> 版本后缀', () => {
    expect(toRootBaseUrl('https://api.example.com/v1')).toBe('https://api.example.com');
    expect(toRootBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com');
    expect(toRootBaseUrl('https://api.example.com/v3')).toBe('https://api.example.com');
    expect(toRootBaseUrl('https://api.example.com//')).toBe('https://api.example.com');
  });

  it('无版本后缀的 baseUrl 仅去尾斜杠,其余路径段保留', () => {
    expect(toRootBaseUrl('https://ark.cn-beijing.volces.com/api')).toBe('https://ark.cn-beijing.volces.com/api');
    expect(toRootBaseUrl('https://memefast.top')).toBe('https://memefast.top');
    expect(toRootBaseUrl('https://gw.example.com/custom/route/')).toBe('https://gw.example.com/custom/route');
  });

  it('空白容忍:trim 后处理', () => {
    expect(toRootBaseUrl('  https://api.example.com/v1 ')).toBe('https://api.example.com');
  });
});
