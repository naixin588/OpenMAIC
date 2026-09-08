// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherPreparation } from '@/components/teacher/TeacherPreparation';
import { getTeacherPreparationCopy } from '@/lib/i18n/teacher-preparation';

const controls = vi.hoisted(() => ({ push: vi.fn(), busy: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: controls.push }) }));
vi.mock('@/components/workbench/compose-extras', () => ({
  useComposerMaterials: () => ({
    enabled: true,
    materials: [],
    uploading: [],
    failed: [],
    busy: controls.busy,
    addFiles: vi.fn(),
    remove: vi.fn(),
    removeFailed: vi.fn(),
    clear: vi.fn(),
  }),
  AttachButton: () => null,
}));

const copy = getTeacherPreparationCopy('en');
const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const material = {
  materialId: 'mat_fictional_source',
  originalName: 'Fictional lesson.txt',
  bytes: 100,
  mime: 'text/plain',
};

async function mount(href = '/workspace') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(createElement(TeacherPreparation, { locale: 'en', lessonPrepHref: href })),
  );
  return root;
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

async function typeInto(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  const prototype =
    input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

async function prepare() {
  await typeInto('teacher-prep-topic', 'Fictional linear functions lesson');
  await typeInto('teacher-prep-requirements', 'Use a warm-up exercise.');
  await click(copy.library);
  await click(material.originalName);
}

async function role() {
  const select = document.querySelector('select')!;
  await act(async () => {
    select.value = 'textbook';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function stubRequests(createResponse: () => Promise<Response>) {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/materials?scope=owner') return Response.json({ materials: [material] });
    if (url === '/api/agent/sessions' && init?.method === 'POST') return createResponse();
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', request);
  return request;
}

beforeEach(() => {
  controls.busy = false;
  controls.push.mockClear();
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('teacher preparation UI', () => {
  it('only starts on explicit submit, using selected owner materials in the real session API', async () => {
    const request = stubRequests(async () =>
      Response.json({ id: 'session_1', stageId: 'stage_1', status: 'queued' }),
    );
    await mount();
    await prepare();
    await role();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controls.push).not.toHaveBeenCalled();
    await submit();
    const create = request.mock.calls.find(([url]) => url === '/api/agent/sessions')!;
    const body = JSON.parse(String(create[1]?.body));
    expect(body.materialIds).toEqual([material.materialId]);
    expect(body.prompt).toContain('Fictional lesson.txt');
    expect(body.prompt).toContain('Use a warm-up exercise.');
    expect(body.prompt).not.toContain('profileId');
    expect(controls.push).toHaveBeenCalledWith('/workspace?session=session_1');
  });

  it('requires source roles and retains the brief when the session service fails', async () => {
    const request = stubRequests(async () =>
      Response.json({ error: 'Internal failure' }, { status: 503 }),
    );
    await mount();
    await prepare();
    await submit();
    expect(document.body.textContent).toContain(copy.sourcesRequired);
    expect(request).toHaveBeenCalledTimes(1);
    await role();
    await submit();
    expect(document.body.textContent).toContain(copy.createFailed);
    expect(document.body.textContent).not.toContain('Internal failure');
    expect((document.getElementById('teacher-prep-topic') as HTMLInputElement).value).toBe(
      'Fictional linear functions lesson',
    );
    expect(document.body.textContent).toContain(material.originalName);
    expect(controls.push).not.toHaveBeenCalled();
  });

  it('does not submit while material uploads are pending', async () => {
    controls.busy = true;
    const request = stubRequests(async () =>
      Response.json({ id: 'session_1', stageId: 'stage_1' }),
    );
    await mount();
    await prepare();
    await role();
    await submit();
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      (document.querySelector('[data-testid="teacher-prep-start"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not navigate a departed teacher page after a late session creation', async () => {
    let resolve!: (response: Response) => void;
    stubRequests(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const root = await mount();
    await prepare();
    await role();
    await submit();
    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    await act(async () => resolve(Response.json({ id: 'session_late', stageId: 'stage_1' })));
    expect(controls.push).not.toHaveBeenCalled();
  });

  it('explains when the intelligent workspace is unavailable and keeps the existing entry usable', async () => {
    const request = stubRequests(async () => Response.json({}));
    await mount('/');
    await submit();
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(copy.unavailable);
    expect(document.querySelector('a')?.getAttribute('href')).toBe('/');
  });
});
