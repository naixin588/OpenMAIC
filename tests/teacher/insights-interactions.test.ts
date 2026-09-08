// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherInsights } from '@/components/teacher/TeacherInsights';
import type { TeacherStudent } from '@/lib/teacher/students';

vi.mock('@/components/teacher/analysis-ui', () => ({
  analysisCollectionUrl: (id: string) => `/api/teacher/students/${id}/analyses`,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
const students = ['a', 'b'].map((id) => ({
  profile: { profileId: id, displayName: { value: `Fictional ${id}` } },
  archived: false,
})) as TeacherStudent[];
async function mount() {
  const node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () =>
    root.render(createElement(TeacherInsights, { students, locale: 'en', onOpenStudent: vi.fn() })),
  );
}
async function select(i: number) {
  await act(async () =>
    (document.querySelectorAll('input[type=checkbox]')[i] as HTMLInputElement).click(),
  );
}
async function load() {
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((item) => item.textContent?.includes('Load selected records'))!
      .click(),
  );
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
describe('teacher comparison requests', () => {
  it('does not preload all students and suppresses partial failed comparisons', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ analyses: [] })))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await mount();
    expect(fetch).not.toHaveBeenCalled();
    await select(0);
    await select(1);
    await load();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role=alert]')?.textContent).toContain(
      'Some records could not be loaded',
    );
    expect(document.body.textContent).not.toContain('No reviewed analyses in this period');
  });
  it('rejects a response with records belonging to a different student', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ analyses: [{ profileId: 'b' }] }))),
    );
    await mount();
    await select(0);
    await load();
    expect(document.querySelector('[role=alert]')).not.toBeNull();
  });
  it('aborts pending requests when student selection changes', async () => {
    let options: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        options = init;
        return new Promise(() => {});
      }),
    );
    await mount();
    await select(0);
    await load();
    expect(options?.signal?.aborted).toBe(false);
    await select(1);
    expect(options?.signal?.aborted).toBe(true);
    expect(document.body.textContent).toContain('Choose students, then load');
  });
});
