// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentLessons, ParentFeedback } from '@/components/teacher/StudentLessons';
import type { TeacherFeedback, TeacherLesson } from '@/lib/teacher/lessons';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const PROFILE = `teacher-student:v1:${'a'.repeat(64)}`;
const NOW = '2026-09-08T08:00:00.000Z';
const props = { profileId: PROFILE, nickname: 'Fictional student', locale: 'en-US' };
const fields = {
  lessonDate: '2026-09-08',
  subject: 'Math',
  topic: 'Fictional lesson',
  learningContent: 'Linear equations',
  completedWork: '',
  classroomObservations: '',
  needsPractice: '',
  homework: '',
  nextSteps: '',
  familyActions: '',
};
const lesson: TeacherLesson = {
  schemaVersion: 1,
  id: `teacher-lesson:v1:${'b'.repeat(64)}`,
  profileId: PROFILE,
  request: { requestId: '13fe7cc0-4fd9-4ad4-8455-105c97352dd5', fields },
  requestFingerprint: 'c'.repeat(64),
  status: 'active',
  fields,
  createdAt: NOW,
  updatedAt: NOW,
};
const feedback: TeacherFeedback = {
  schemaVersion: 1,
  id: `teacher-feedback:v1:${'d'.repeat(64)}`,
  profileId: PROFILE,
  request: {
    requestId: '13fe7cc0-4fd9-4ad4-8455-105c97352dd5',
    locale: 'en-US',
    lessonRefs: [{ id: lesson.id, updatedAt: NOW }],
    analysisRefs: [],
  },
  requestFingerprint: 'e'.repeat(64),
  status: 'draft',
  method: 'evidence_assembly',
  text: 'Fictional saved feedback',
  originalText: 'Fictional saved feedback',
  sources: [
    {
      kind: 'lesson',
      id: lesson.id,
      updatedAt: NOW,
      date: fields.lessonDate,
      title: fields.topic,
      subject: fields.subject,
      evidence: [],
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return root;
}
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(target: HTMLElement) {
  await act(async () => target.click());
}
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('lesson and feedback interactions', () => {
  it('loads after StrictMode cleanup even when the aborted first request resolves last', async () => {
    const pending: Array<{ resolve: (value: Response) => void; signal: AbortSignal }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve) =>
            pending.push({ resolve, signal: init.signal as AbortSignal }),
          ),
      ),
    );
    await mount(createElement(StrictMode, null, createElement(StudentLessons, props)));
    expect(pending).toHaveLength(2);
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => pending[1].resolve(response({ lessons: [] })));
    expect(document.body.textContent).toContain('Start with today’s lesson');
    await act(async () =>
      pending[0].resolve(
        response({ lessons: [{ ...lesson, fields: { ...fields, topic: 'STALE PRIVATE TOPIC' } }] }),
      ),
    );
    expect(document.body.textContent).not.toContain('STALE PRIVATE TOPIC');
    expect(button('Record a lesson').disabled).toBe(false);
  });

  it('aborts old student requests and keeps delayed old records out of the new student card', async () => {
    const pending: Array<{ resolve: (value: Response) => void; signal: AbortSignal }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve) =>
            pending.push({ resolve, signal: init.signal as AbortSignal }),
          ),
      ),
    );
    const root = await mount(createElement(StudentLessons, props));
    await act(async () =>
      root.render(
        createElement(StudentLessons, {
          ...props,
          profileId: `teacher-student:v1:${'f'.repeat(64)}`,
          nickname: 'Fictional second',
        }),
      ),
    );
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => pending[1].resolve(response({ lessons: [] })));
    await act(async () => pending[0].resolve(response({ lessons: [lesson] })));
    expect(document.body.textContent).toContain('Fictional second');
    expect(document.body.textContent).not.toContain('Fictional lesson');
  });

  it('records date and actual classroom details through the selected student route', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === 'POST' ? response({ lesson }) : response({ lessons: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await mount(createElement(StudentLessons, props));
    await click(button('Record a lesson'));
    const labels = [...document.querySelectorAll('form label')];
    await type(
      labels.find((label) => label.textContent?.startsWith('Subject'))!.querySelector('input')!,
      'Math',
    );
    await type(
      labels
        .find((label) => label.textContent?.startsWith('Lesson topic'))!
        .querySelector('input')!,
      'Fictional lesson',
    );
    await type(
      labels.find((label) => label.textContent?.startsWith('Homework'))!.querySelector('textarea')!,
      'Fictional question 2',
    );
    await act(async () =>
      document
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    const write = fetchMock.mock.calls.find((call) => call[1].method === 'POST')!;
    expect(write[0]).toContain(encodeURIComponent(PROFILE));
    const body = JSON.parse(write[1].body as string);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.fields.homework).toBe('Fictional question 2');
    expect(body.fields.lessonDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.fields.completedWork).toBe('');
  });

  it('requires explicit feedback source selection and excludes unreviewed analyses', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') return response({ feedback });
      if (url.endsWith('/feedback')) return response({ feedback: [] });
      if (url.endsWith('/analyses'))
        return response({
          analyses: [
            {
              profileId: PROFILE,
              analysisId: 'fake-analysis',
              status: 'draft',
              request: { title: 'Unreviewed private work' },
            },
          ],
        });
      return response({ lessons: [lesson] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount(createElement(ParentFeedback, props));
    expect(button('Assemble feedback draft').disabled).toBe(true);
    expect(document.body.textContent).not.toContain('Unreviewed private work');
    await click(document.querySelector('input[type="checkbox"]')!);
    await click(button('Assemble feedback draft'));
    const body = JSON.parse(
      fetchMock.mock.calls.find((call) => call[1].method === 'POST')![1].body as string,
    );
    expect(body.lessonRefs).toEqual([{ id: lesson.id, updatedAt: lesson.updatedAt }]);
    expect(body.analysisRefs).toEqual([]);
    expect(document.querySelector('textarea')!.value).toBe(feedback.text);
    await type(document.querySelector('textarea')!, 'Edited unsaved feedback');
    expect(button('Copy text').disabled).toBe(true);
    expect(button('Confirm feedback').disabled).toBe(true);
    expect(button('Save edits').disabled).toBe(false);
  });

  it('flags stale reviewed feedback prominently and blocks copying or downloading it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/feedback'))
          return response({ feedback: [{ ...feedback, status: 'reviewed', reviewedAt: NOW }] });
        if (url.endsWith('/analyses')) return response({ analyses: [] });
        return response({ lessons: [{ ...lesson, updatedAt: '2026-09-08T09:00:00.000Z' }] });
      }),
    );
    await mount(createElement(ParentFeedback, props));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Evidence used by this feedback changed',
    );
    expect(button('Copy text').disabled).toBe(true);
    expect(button('Download text').disabled).toBe(true);
  });

  it('keeps archived students readable while removing creation and edit actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ lessons: [lesson] })),
    );
    await mount(createElement(StudentLessons, { ...props, archived: true }));
    expect(document.body.textContent).toContain('Fictional lesson');
    expect(document.body.textContent).not.toContain('Record a lesson');
    expect(document.body.textContent).not.toContain('Edit lesson / homework');
  });
});
