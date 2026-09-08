import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the teacher product identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('耐心助手');
    expect(DEFAULT_BRAND.shortName).toBe('耐心助手');
    expect(DEFAULT_BRAND.markSrc).toBe('/brand/naixin-mark.svg');
    expect(DEFAULT_BRAND.themeColor).toBe('#176b60');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
    expect(DEFAULT_BRAND.logoSrc).toBe('/brand/naixin-logo.svg');
  });
});
