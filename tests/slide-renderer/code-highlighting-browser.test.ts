import { afterEach, describe, expect, it, vi } from 'vitest';
import { highlightCode } from '@/components/ai-elements/code-block';

afterEach(() => vi.unstubAllGlobals());

describe('browser syntax highlighting', () => {
  it('loads real language data and both themes with optional line numbers', async () => {
    vi.stubGlobal('window', {});
    const code = 'const answer = 42;\nconsole.log(answer);';
    const [light, dark] = await highlightCode(code, 'typescript', true);
    expect(light).toContain('shiki one-light');
    expect(dark).toContain('shiki one-dark-pro');
    for (const html of [light, dark]) {
      expect(html).toContain('answer');
      expect(html).toContain('select-none');
      expect(html).toMatch(/>1<\/span>/);
      expect(html).toMatch(/>2<\/span>/);
    }
    const [withoutNumbers] = await highlightCode(code, 'typescript');
    expect(withoutNumbers).not.toContain('select-none');
  });

  it('keeps additional bundled languages available and escapes code markup', async () => {
    vi.stubGlobal('window', {});
    const [ruby] = await highlightCode('puts "fictional example"', 'ruby');
    expect(ruby).toContain('fictional example');
    const [html] = await highlightCode('<script>alert("example")</script>', 'html');
    expect(html).toMatch(/&(?:lt|#x3c|#60);/i);
    expect(html).not.toContain('<script>');
  });
});
