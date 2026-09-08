import { parseHTML } from 'linkedom';
import { act, createElement, Fragment, type ReactNode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PPTCodeElement } from '@openmaic/dsl';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
  motion: {
    div: ({
      children,
      style,
      className,
    }: {
      children?: ReactNode;
      style?: React.CSSProperties;
      className?: string;
    }) => createElement('div', { style, className }, children),
  },
}));

import { BaseCodeElement as AppCodeElement } from '@/components/slide-renderer/components/element/CodeElement/BaseCodeElement';
import { BaseCodeElement as SharedCodeElement } from '@/packages/@openmaic/renderer/src/elements/code/BaseCodeElement';

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

function hasHighlightedKeyword(container: HTMLElement, keyword: string) {
  return Array.from(container.querySelectorAll('span[style]')).some(
    (span) => span.textContent === keyword && /color\s*:/.test(span.getAttribute('style') ?? ''),
  );
}

async function waitForHighlight(container: HTMLElement, keyword: string) {
  const deadline = Date.now() + 10_000;
  while (!hasHighlightedKeyword(container, keyword) && Date.now() < deadline) {
    // Keep Shiki's actual dynamic language/wasm initialization and the resulting
    // React state update inside act. No highlighter or language data is mocked.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  expect(hasHighlightedKeyword(container, keyword)).toBe(true);
}

describe('slide code highlighting after hydration', () => {
  it.each([
    ['application', AppCodeElement],
    ['shared renderer', SharedCodeElement],
  ] as const)(
    '%s hydrates plain code and applies real Python token colors without losing text',
    async (_, Component) => {
      const elementInfo: PPTCodeElement = {
        id: 'fictional-python',
        type: 'code',
        language: 'python',
        fileName: 'fictional-example.py',
        lines: [
          { id: 'line-1', content: 'def greet(name):' },
          { id: 'line-2', content: '    return "<fictional>" + name' },
        ],
        showLineNumbers: true,
        fontSize: 14,
        left: 0,
        top: 0,
        width: 420,
        height: 190,
        rotate: 0,
      };
      const element = createElement(Component, { elementInfo, animate: false });
      const serverHTML = renderToString(element);
      const { window, document } = parseHTML(
        '<!doctype html><html><body><div id="root"></div></body></html>',
      );
      const container = document.getElementById('root') as unknown as HTMLElement;
      container.innerHTML = serverHTML;
      expect(container.textContent).toContain('def greet(name):');
      expect(container.textContent).toContain('    return "<fictional>" + name');
      expect(hasHighlightedKeyword(container, 'def')).toBe(false);

      vi.stubGlobal('window', window);
      vi.stubGlobal('document', document);
      vi.stubGlobal('HTMLElement', window.HTMLElement);
      vi.stubGlobal('Node', window.Node);
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const network = vi.fn(() => {
        throw new Error('Syntax highlighting must use bundled assets, not network requests');
      });
      vi.stubGlobal('fetch', network);
      const recoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container, element, { onRecoverableError: recoverableError });
      });
      await waitForHighlight(container, 'def');

      expect(container.textContent).toContain('def greet(name):');
      expect(container.textContent).toContain('    return "<fictional>" + name');
      expect(container.querySelector('fictional')).toBeNull();
      expect(recoverableError).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();

      const updated: PPTCodeElement = {
        ...elementInfo,
        lines: [{ id: 'line-1', content: 'return 42  # fictional update' }],
      };
      await act(async () =>
        root!.render(createElement(Component, { elementInfo: updated, animate: false })),
      );
      expect(hasHighlightedKeyword(container, 'return')).toBe(true);
      expect(container.textContent).toContain('return 42  # fictional update');
      expect(container.textContent).not.toContain('def greet(name):');
    },
    15_000,
  );
});
