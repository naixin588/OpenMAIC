import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('shiki', () => {
  throw new Error('Server rendering must not load the browser syntax highlighter');
});

import { CodeBlock, highlightCode } from '@/components/ai-elements/code-block';
import { BaseCodeElement } from '@/components/slide-renderer/components/element/CodeElement/BaseCodeElement';
import { BaseCodeElement as SharedCodeElement } from '@/packages/@openmaic/renderer/src/elements/code/BaseCodeElement';

describe('code highlighting on the server', () => {
  it('does not load Shiki when importing or rendering chat code', async () => {
    expect(await highlightCode('const answer = 42', 'typescript')).toEqual(['', '']);
    expect(() =>
      renderToStaticMarkup(
        createElement(CodeBlock, { code: 'const answer = 42', language: 'typescript' }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['application', BaseCodeElement],
    ['shared renderer', SharedCodeElement],
  ] as const)(
    'preserves escaped %s slide code and line numbers before browser highlighting',
    (_, Component) => {
      const html = renderToStaticMarkup(
        createElement(Component, {
          animate: false,
          elementInfo: {
            id: 'fictional-code',
            type: 'code',
            language: 'html',
            fileName: 'example.html',
            lines: [{ id: 'line-1', content: '<script>alert("example")</script>' }],
            showLineNumbers: true,
            fontSize: 14,
            left: 0,
            top: 0,
            width: 420,
            height: 190,
            rotate: 0,
          },
        }),
      );
      expect(html).toContain('example.html');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).toMatch(/>1<\/span>/);
    },
  );
});
