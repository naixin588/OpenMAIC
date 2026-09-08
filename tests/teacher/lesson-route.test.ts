import { randomUUID } from 'node:crypto';
import { BrowserRuntimeStore, type RuntimeStore } from '@openmaic/storage';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/teacher/students/[profileId]/lessons/route';
import {
  GET as history,
  PATCH,
} from '@/app/api/teacher/students/[profileId]/lessons/[lessonId]/route';
import {
  GET as feedbackList,
  POST as feedbackCreate,
} from '@/app/api/teacher/students/[profileId]/lessons/feedback/route';
import {
  GET as feedbackHistory,
  PATCH as feedbackUpdate,
} from '@/app/api/teacher/students/[profileId]/lessons/feedback/[feedbackId]/route';
import { APP_RUNTIME_PAYLOAD_VALIDATORS } from '@/lib/runtime/payload-validators';
import { createTeacherStudent } from '@/lib/server/teacher/students';

const state = vi.hoisted(() => ({ store: undefined as RuntimeStore | undefined }));
const configured = vi.hoisted(() => vi.fn(() => true));
const provider = vi.hoisted(() => vi.fn(async () => ({ runtimeStore: state.store })));
vi.mock('@/lib/config/feature-flags', () => ({ isAgentRuntimeConfigured: configured }));
vi.mock('@/lib/persistence/server-provider', () => ({ getServerPersistenceProvider: provider }));
const ORIGIN = 'http://localhost:3000';
const OWNER = '13fe7cc0-4fd9-4ad4-8455-105c97352dd5';
let profileId: string;
const fields = {
  lessonDate: '2026-09-08',
  subject: '数学',
  topic: '虚构课堂',
  learningContent: '等式变形',
  completedWork: '',
  classroomObservations: '',
  needsPractice: '',
  homework: '',
  nextSteps: '',
  familyActions: '',
};
function req(method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/teacher/students/${profileId}/lessons`, {
    method,
    headers: {
      cookie: `anonymous_id=${OWNER}`,
      ...(body === undefined ? {} : { origin: ORIGIN, 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = () => ({ params: Promise.resolve({ profileId }) });
beforeAll(() => {
  globalThis.IDBKeyRange = IDBKeyRange;
});
beforeEach(async () => {
  configured.mockReturnValue(true);
  provider.mockClear();
  state.store = new BrowserRuntimeStore({
    indexedDB: new IDBFactory(),
    dbName: `fictional-lesson-http-${randomUUID()}`,
    payloadValidators: APP_RUNTIME_PAYLOAD_VALIDATORS,
  });
  profileId = (
    await createTeacherStudent(
      { store: state.store, ownerId: `anon:${OWNER}` },
      {
        requestId: randomUUID(),
        nickname: '虚构学生 HTTP',
        grade: null,
        examYear: null,
        region: null,
      },
    )
  ).student.profile.profileId;
});

describe('lesson and feedback HTTP boundaries', () => {
  it('creates, replays, updates and returns private lesson history', async () => {
    const request = { requestId: randomUUID(), fields };
    const response = await POST(req('POST', request), context());
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    const { lesson } = await response.json();
    expect((await POST(req('POST', request), context())).status).toBe(200);
    expect(await (await GET(req(), context())).json()).toEqual({ lessons: [lesson] });
    const detailContext = { params: Promise.resolve({ profileId, lessonId: lesson.id }) };
    const updatedResponse = await PATCH(
      req('PATCH', {
        expectedUpdatedAt: lesson.updatedAt,
        action: 'save',
        fields: { ...fields, homework: '虚构练习 A' },
      }),
      detailContext,
    );
    expect(updatedResponse.status).toBe(200);
    const { lesson: updated } = await updatedResponse.json();
    expect(await (await history(req(), detailContext)).json()).toEqual({
      history: [lesson, updated],
    });
  });

  it('creates an editable evidence draft and confirms only saved content', async () => {
    const { lesson } = await (
      await POST(req('POST', { requestId: randomUUID(), fields }), context())
    ).json();
    const response = await feedbackCreate(
      req('POST', {
        requestId: randomUUID(),
        locale: 'zh-CN',
        lessonRefs: [{ id: lesson.id, updatedAt: lesson.updatedAt }],
        analysisRefs: [],
      }),
      context(),
    );
    expect(response.status).toBe(201);
    const { feedback } = await response.json();
    expect(feedback.status).toBe('draft');
    const feedbackContext = { params: Promise.resolve({ profileId, feedbackId: feedback.id }) };
    expect(
      (
        await feedbackUpdate(
          req('PATCH', {
            expectedUpdatedAt: feedback.updatedAt,
            action: 'confirm_review',
            text: '未保存的文字',
          }),
          feedbackContext,
        )
      ).status,
    ).toBe(409);
    const confirmed = await feedbackUpdate(
      req('PATCH', {
        expectedUpdatedAt: feedback.updatedAt,
        action: 'confirm_review',
        text: feedback.text,
      }),
      feedbackContext,
    );
    expect(confirmed.status).toBe(200);
    const { feedback: reviewed } = await confirmed.json();
    expect(reviewed.status).toBe('reviewed');
    expect(await (await feedbackList(req(), context())).json()).toEqual({ feedback: [reviewed] });
    expect(await (await feedbackHistory(req(), feedbackContext)).json()).toEqual({
      history: [feedback, reviewed],
    });
  });

  it('rejects foreign origins before storage and hides missing ownership', async () => {
    const response = await POST(
      req('POST', { requestId: randomUUID(), fields }, { origin: 'https://foreign.example' }),
      context(),
    );
    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    const missing = await GET(
      req('GET', undefined, { cookie: `anonymous_id=${randomUUID()}` }),
      context(),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ errorCode: 'LESSON_NOT_FOUND' });
  });

  it('rejects invalid JSON shapes, content types and oversized bodies without saving', async () => {
    expect(
      (
        await POST(
          req('POST', { requestId: randomUUID(), fields: { ...fields, topic: ' ' } }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req('POST', { requestId: randomUUID(), fields }, { 'content-type': 'text/plain' }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect((await POST(req('POST', { padding: 'x'.repeat(1024 * 1024) }), context())).status).toBe(
      400,
    );
    expect(await (await GET(req(), context())).json()).toEqual({ lessons: [] });
  });

  it('returns a safe unavailable error without leaking database failures', async () => {
    provider.mockRejectedValueOnce(new Error('FICTIONAL_DATABASE_PASSWORD'));
    const response = await GET(req(), context());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"errorCode":"LESSON_UNAVAILABLE"}');
    configured.mockReturnValue(false);
    expect((await feedbackList(req(), context())).status).toBe(503);
  });
});
