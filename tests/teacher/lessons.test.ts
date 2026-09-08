import { randomUUID } from 'node:crypto';
import { BrowserRuntimeStore, type RuntimeStore } from '@openmaic/storage';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import { APP_RUNTIME_PAYLOAD_VALIDATORS } from '@/lib/runtime/payload-validators';
import { createClientVisibleRuntimeStore } from '@/app/api/persistence/[...path]/route';
import { isServerOnlyRuntimeKind } from '@/lib/zhongkao/runtime-kinds';
import {
  createTeacherStudent,
  getTeacherStudent,
  updateTeacherStudent,
} from '@/lib/server/teacher/students';
import {
  createTeacherLesson,
  getTeacherLessonHistory,
  listTeacherLessons,
  updateTeacherLesson,
} from '@/lib/server/teacher/lesson-service';
import {
  assembleParentFeedback,
  createTeacherFeedback,
  getTeacherFeedbackHistory,
  listTeacherFeedback,
  updateTeacherFeedback,
} from '@/lib/server/teacher/lesson-feedback';
import {
  createTeacherAnalysis,
  updateTeacherAnalysis,
  type TeacherAnalysisServiceDeps,
} from '@/lib/server/teacher/analysis-service';
import {
  TEACHER_FEEDBACK_KIND,
  TEACHER_LESSON_KIND,
  createFeedbackSchema,
  lessonFieldsSchema,
  type TeacherFeedback,
  type LessonFields,
} from '@/lib/teacher/lessons';
import { type LessonServiceDeps } from '@/lib/server/teacher/lesson-store';
import { zhongkaoStageId } from '@/lib/zhongkao/runtime';
import { resolveZhongkaoLearnerKeyFromOwnerId } from '@/lib/server/zhongkao/learner-identity';

const NOW = '2026-09-08T08:00:00.000Z';
const FIELDS: LessonFields = {
  lessonDate: '2026-09-08',
  subject: '数学',
  topic: '虚构代数课',
  learningContent: '一次方程的等式变形',
  completedWork: '独立写出了第 1 题的两个变形步骤',
  classroomObservations: '第 2 题需要老师提醒移项',
  needsPractice: '再独立核对移项符号',
  homework: '完成虚构练习 A 的第 3 题',
  nextSteps: '下次课检查一道独立迁移题',
  familyActions: '请孩子圈出不确定的步骤，带到下次课讨论',
};
beforeAll(() => {
  globalThis.IDBKeyRange = IDBKeyRange;
});
async function harness() {
  const options = {
    indexedDB: new IDBFactory(),
    dbName: `fictional-lessons-${randomUUID()}`,
    payloadValidators: APP_RUNTIME_PAYLOAD_VALIDATORS,
  };
  const store = new BrowserRuntimeStore(options);
  const deps: LessonServiceDeps = { store, ownerId: 'fictional-lesson-teacher', now: () => NOW };
  const { student } = await createTeacherStudent(deps, {
    requestId: randomUUID(),
    nickname: '虚构学生甲',
    grade: null,
    examYear: null,
    region: null,
  });
  return { deps, store, options, student, profileId: student.profile.profileId };
}
const newLesson = (deps: LessonServiceDeps, profileId: string, fields = FIELDS) =>
  createTeacherLesson(deps, profileId, { requestId: randomUUID(), fields });
const feedbackInput = (id: string, updatedAt: string) => ({
  requestId: randomUUID(),
  locale: 'zh-CN',
  lessonRefs: [{ id, updatedAt }],
  analysisRefs: [],
});
const feedbackEdit = (
  record: TeacherFeedback,
  action: 'save_draft' | 'confirm_review' | 'withdraw',
  text = record.text,
) => ({ expectedUpdatedAt: record.updatedAt, action, text });
function wrappedStore(store: RuntimeStore, append: RuntimeStore['appendRecord']): RuntimeStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'appendRecord') return append;
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function reorderObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderObjectKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([key, nested]) => [key, reorderObjectKeys(nested)]),
    );
  }
  return value;
}

function jsonbReadStore(store: RuntimeStore): RuntimeStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'listRecords')
        return async (...args: Parameters<RuntimeStore['listRecords']>) =>
          (await store.listRecords(...args)).map((record) => ({
            ...record,
            payload: reorderObjectKeys(record.payload),
          }));
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function analysis(deps: LessonServiceDeps, profileId: string, reviewed = true) {
  const materialId = `mat_${'a'.repeat(26)}`;
  const analysisDeps: TeacherAnalysisServiceDeps = {
    ...deps,
    generate: async () => ({
      model: { providerId: 'fictional', modelId: 'fictional' },
      sources: [
        {
          sourceId: 'source-1',
          materialId,
          role: 'student_work',
          name: 'fictional.txt',
          mimeType: 'text/plain',
          sha256: 'a'.repeat(64),
          extractorId: 'fictional',
          extractorVersion: '1',
          ocr: false,
          blocks: [{ blockId: 'block-1', text: '2x = 6; x = 4' }],
        },
      ],
      report: {
        readiness: 'sufficient',
        observations: [
          {
            category: 'needs_verification',
            text: '这次作答的除法步骤待核对',
            citations: [{ sourceId: 'source-1', blockId: 'block-1', quote: 'x = 4' }],
          },
        ],
        recommendations: [{ text: '安排一道新题独立验证', observationIndexes: [0] }],
        limitations: ['单次错误不能认定长期薄弱'],
      },
    }),
  };
  const { analysis: draft } = await createTeacherAnalysis(analysisDeps, profileId, {
    requestId: randomUUID(),
    workKind: 'monthly_exam',
    subject: '数学',
    title: '虚构月考',
    workDate: '2026-09-07',
    teacherNotes: '',
    materials: [{ materialId, role: 'student_work' }],
  });
  return reviewed
    ? updateTeacherAnalysis(deps, profileId, draft.analysisId, {
        expectedUpdatedAt: draft.updatedAt,
        action: 'confirm_review',
        report: draft.report,
        teacherComment: '',
      })
    : draft;
}

describe('student lesson records', () => {
  it('reads existing fingerprints and edits lessons and feedback after JSONB reorders every nested object', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    const reordered = { ...h.deps, store: jsonbReadStore(h.store) };
    expect((await listTeacherLessons(reordered, h.profileId))[0]).toEqual(lesson);
    const editedLesson = await updateTeacherLesson(reordered, h.profileId, lesson.id, {
      expectedUpdatedAt: lesson.updatedAt,
      action: 'save',
      fields: { ...FIELDS, homework: '更正的虚构作业' },
    });
    expect(editedLesson.requestFingerprint).toBe(lesson.requestFingerprint);
    expect(await getTeacherLessonHistory(reordered, h.profileId, lesson.id)).toEqual([
      lesson,
      editedLesson,
    ]);
    const reviewedAnalysis = await analysis(reordered, h.profileId);
    const request = {
      ...feedbackInput(lesson.id, editedLesson.updatedAt),
      analysisRefs: [{ id: reviewedAnalysis.analysisId, updatedAt: reviewedAnalysis.updatedAt }],
    };
    const { feedback } = await createTeacherFeedback(reordered, h.profileId, request);
    expect((await listTeacherFeedback(reordered, h.profileId))[0]).toEqual(feedback);
    const editedFeedback = await updateTeacherFeedback(
      reordered,
      h.profileId,
      feedback.id,
      feedbackEdit(feedback, 'save_draft', `${feedback.text}\n虚构老师补充记录。`),
    );
    const confirmed = await updateTeacherFeedback(
      reordered,
      h.profileId,
      feedback.id,
      feedbackEdit(editedFeedback, 'confirm_review'),
    );
    expect(confirmed.status).toBe('reviewed');
    expect(confirmed.requestFingerprint).toBe(feedback.requestFingerprint);
    expect(await createTeacherFeedback(reordered, h.profileId, request)).toEqual({
      feedback: confirmed,
      replayed: true,
    });
    expect(await getTeacherFeedbackHistory(reordered, h.profileId, feedback.id)).toEqual([
      feedback,
      editedFeedback,
      confirmed,
    ]);
  });
  it('preserves dated teacher observations, original homework and revisions across reload without changing the profile', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    const updated = await updateTeacherLesson(h.deps, h.profileId, lesson.id, {
      expectedUpdatedAt: lesson.updatedAt,
      action: 'save',
      fields: { ...FIELDS, homework: '改为虚构练习 B 第 1 题' },
    });
    const reloaded = { ...h.deps, store: new BrowserRuntimeStore(h.options) };
    expect((await listTeacherLessons(reloaded, h.profileId))[0]).toEqual(updated);
    expect(updated.request.fields.homework).toBe(FIELDS.homework);
    expect(await getTeacherLessonHistory(reloaded, h.profileId, lesson.id)).toEqual([
      lesson,
      updated,
    ]);
    expect(await getTeacherStudent(h.deps, h.profileId)).toEqual(h.student);
    const sessions = await h.store.listSessions(
      zhongkaoStageId(h.profileId),
      resolveZhongkaoLearnerKeyFromOwnerId(h.deps.ownerId),
    );
    expect(sessions.map((session) => session.kind)).not.toContain('zhongkaoStudyAttempt');
  });

  it('replays create requests and rejects altered inputs with the same request id', async () => {
    const h = await harness();
    const request = { requestId: randomUUID(), fields: FIELDS };
    const first = await createTeacherLesson(h.deps, h.profileId, request);
    expect(await createTeacherLesson(h.deps, h.profileId, request)).toEqual({
      lesson: first.lesson,
      replayed: true,
    });
    await expect(
      createTeacherLesson(h.deps, h.profileId, {
        ...request,
        fields: { ...FIELDS, topic: 'different' },
      }),
    ).rejects.toMatchObject({ code: 'LESSON_CONFLICT' });
  });

  it('isolates owners and students for reads and writes', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    await expect(
      listTeacherLessons({ ...h.deps, ownerId: 'fictional-other-teacher' }, h.profileId),
    ).rejects.toMatchObject({ code: 'LESSON_NOT_FOUND' });
    await expect(
      newLesson({ ...h.deps, ownerId: 'fictional-other-teacher' }, h.profileId),
    ).rejects.toMatchObject({ code: 'LESSON_NOT_FOUND' });
    const other = (
      await createTeacherStudent(h.deps, {
        requestId: randomUUID(),
        nickname: '虚构学生乙',
        grade: null,
        examYear: null,
        region: null,
      })
    ).student.profile.profileId;
    expect(await listTeacherLessons(h.deps, other)).toEqual([]);
    await expect(
      updateTeacherLesson(h.deps, other, lesson.id, {
        expectedUpdatedAt: lesson.updatedAt,
        action: 'save',
        fields: FIELDS,
      }),
    ).rejects.toMatchObject({ code: 'LESSON_NOT_FOUND' });
    await expect(getTeacherLessonHistory(h.deps, other, lesson.id)).rejects.toMatchObject({
      code: 'LESSON_NOT_FOUND',
    });
  });

  it('allows only one concurrent update and keeps a withdrawn lesson immutable', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    const attempts = await Promise.allSettled(
      ['A', 'B'].map((homework) =>
        updateTeacherLesson(h.deps, h.profileId, lesson.id, {
          expectedUpdatedAt: lesson.updatedAt,
          action: 'save',
          fields: { ...FIELDS, homework },
        }),
      ),
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'LESSON_CONFLICT' },
    });
    const current = (await listTeacherLessons(h.deps, h.profileId))[0];
    await expect(
      updateTeacherLesson(h.deps, h.profileId, current.id, {
        expectedUpdatedAt: current.updatedAt,
        action: 'withdraw',
        fields: FIELDS,
      }),
    ).rejects.toMatchObject({ code: 'LESSON_CONFLICT' });
    const withdrawn = await updateTeacherLesson(h.deps, h.profileId, current.id, {
      expectedUpdatedAt: current.updatedAt,
      action: 'withdraw',
      fields: current.fields,
    });
    await expect(
      updateTeacherLesson(h.deps, h.profileId, withdrawn.id, {
        expectedUpdatedAt: withdrawn.updatedAt,
        action: 'save',
        fields: FIELDS,
      }),
    ).rejects.toMatchObject({ code: 'LESSON_CONFLICT' });
  });

  it('recovers a committed write after a lost acknowledgement', async () => {
    const h = await harness();
    let writes = 0;
    const store = wrappedStore(h.store, async (...args) => {
      await h.store.appendRecord(...args);
      writes++;
      throw new Error('FICTIONAL_STORAGE_SECRET');
    });
    const result = await newLesson({ ...h.deps, store }, h.profileId);
    expect(result.replayed).toBe(true);
    expect(writes).toBe(1);
    expect(await listTeacherLessons(h.deps, h.profileId)).toEqual([result.lesson]);
  });

  it('rejects archived students and aborted writes while retaining existing history', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    await updateTeacherStudent(h.deps, h.profileId, {
      expectedUpdatedAt: h.student.profile.updatedAt,
      nickname: '虚构学生甲',
      grade: null,
      examYear: null,
      region: null,
      archived: true,
    });
    await expect(newLesson(h.deps, h.profileId)).rejects.toMatchObject({ code: 'LESSON_ARCHIVED' });
    await expect(
      updateTeacherLesson(h.deps, h.profileId, lesson.id, {
        expectedUpdatedAt: lesson.updatedAt,
        action: 'save',
        fields: FIELDS,
      }),
    ).rejects.toMatchObject({ code: 'LESSON_ARCHIVED' });
    expect(await listTeacherLessons(h.deps, h.profileId)).toHaveLength(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTeacherLesson(
        h.deps,
        h.profileId,
        { requestId: randomUUID(), fields: FIELDS },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'LESSON_CANCELED' });
  });

  it('rejects impossible dates, whitespace required fields, extra mastery fields and excessive notes', () => {
    for (const fields of [
      { ...FIELDS, lessonDate: '2026-02-30' },
      { ...FIELDS, topic: ' ' },
      { ...FIELDS, mastery: 99 },
      { ...FIELDS, homework: 'x'.repeat(3001) },
    ]) {
      expect(lessonFieldsSchema.safeParse(fields).success).toBe(false);
    }
    expect(
      lessonFieldsSchema.safeParse({ ...FIELDS, completedWork: '', needsPractice: '' }).success,
    ).toBe(true);
  });
});

describe('source-bound parent feedback', () => {
  it('accepts ten valid maximum-length lesson sources without silently truncating evidence', async () => {
    const h = await harness();
    const maximal = {
      ...FIELDS,
      learningContent: '学'.repeat(3000),
      completedWork: '做'.repeat(3000),
      classroomObservations: '观'.repeat(3000),
      needsPractice: '练'.repeat(3000),
      homework: '题'.repeat(3000),
      nextSteps: '教'.repeat(3000),
      familyActions: '家'.repeat(3000),
    };
    const lessons = [];
    for (let index = 0; index < 10; index++)
      lessons.push((await newLesson(h.deps, h.profileId, maximal)).lesson);
    const { feedback } = await createTeacherFeedback(h.deps, h.profileId, {
      requestId: randomUUID(),
      locale: 'zh-CN',
      lessonRefs: lessons.map((lesson) => ({ id: lesson.id, updatedAt: lesson.updatedAt })),
      analysisRefs: [],
    });
    expect(feedback.text.length).toBeGreaterThan(210000);
    expect(feedback.sources).toHaveLength(10);
    const confirmed = await updateTeacherFeedback(
      h.deps,
      h.profileId,
      feedback.id,
      feedbackEdit(feedback, 'confirm_review'),
    );
    expect(confirmed.status).toBe('reviewed');
  });
  it('assembles only explicit sources, stores snapshots and preserves original text and review history', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    await newLesson(h.deps, h.profileId, {
      ...FIELDS,
      topic: 'NOT_SELECTED',
      completedWork: 'DO_NOT_INCLUDE',
    });
    const reviewed = await analysis(h.deps, h.profileId);
    const request = {
      ...feedbackInput(lesson.id, lesson.updatedAt),
      analysisRefs: [{ id: reviewed.analysisId, updatedAt: reviewed.updatedAt }],
    };
    const { feedback } = await createTeacherFeedback(h.deps, h.profileId, request);
    expect(feedback.status).toBe('draft');
    expect(feedback.method).toBe('evidence_assembly');
    expect(feedback.text).toContain(FIELDS.completedWork);
    expect(feedback.text).toContain(FIELDS.homework);
    expect(feedback.text).toContain('已复核分析提示（待持续验证）');
    expect(feedback.text).not.toContain('DO_NOT_INCLUDE');
    expect(
      feedback.sources.find((source) => source.kind === 'analysis')?.evidence[0].citations,
    ).toEqual(reviewed.report.observations[0].citations);
    const saved = await updateTeacherFeedback(
      h.deps,
      h.profileId,
      feedback.id,
      feedbackEdit(feedback, 'save_draft', `${feedback.text}\n老师补充：下次课当面核对。`),
    );
    expect(saved.originalText).toBe(feedback.text);
    await expect(
      updateTeacherFeedback(
        h.deps,
        h.profileId,
        saved.id,
        feedbackEdit(saved, 'confirm_review', '未保存内容'),
      ),
    ).rejects.toMatchObject({ code: 'LESSON_CONFLICT' });
    const confirmed = await updateTeacherFeedback(
      h.deps,
      h.profileId,
      saved.id,
      feedbackEdit(saved, 'confirm_review'),
    );
    expect(confirmed.status).toBe('reviewed');
    expect(await createTeacherFeedback(h.deps, h.profileId, request)).toEqual({
      feedback: confirmed,
      replayed: true,
    });
    expect(await getTeacherFeedbackHistory(h.deps, h.profileId, feedback.id)).toEqual([
      feedback,
      saved,
      confirmed,
    ]);
    expect(
      (
        await listTeacherFeedback(
          { ...h.deps, store: new BrowserRuntimeStore(h.options) },
          h.profileId,
        )
      )[0],
    ).toEqual(confirmed);
    const edited = await updateTeacherFeedback(
      h.deps,
      h.profileId,
      confirmed.id,
      feedbackEdit(confirmed, 'save_draft', '老师修改后的事实反馈'),
    );
    expect(edited.status).toBe('draft');
    expect(edited.reviewedAt).toBeUndefined();
    expect(await getTeacherStudent(h.deps, h.profileId)).toEqual(h.student);
  });

  it('rejects empty, duplicate and oversized source selections', () => {
    const ref = { id: `teacher-lesson:v1:${'a'.repeat(64)}`, updatedAt: NOW };
    const base = { requestId: randomUUID(), locale: 'zh-CN', analysisRefs: [] };
    expect(createFeedbackSchema.safeParse({ ...base, lessonRefs: [] }).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ ...base, lessonRefs: [ref, ref] }).success).toBe(false);
    expect(
      createFeedbackSchema.safeParse({ ...base, lessonRefs: Array(11).fill(ref) }).success,
    ).toBe(false);
  });

  it('rejects unreviewed, withdrawn and cross-student evidence', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    const draft = await analysis(h.deps, h.profileId, false);
    await expect(
      createTeacherFeedback(h.deps, h.profileId, {
        requestId: randomUUID(),
        locale: 'zh-CN',
        lessonRefs: [],
        analysisRefs: [{ id: draft.analysisId, updatedAt: draft.updatedAt }],
      }),
    ).rejects.toMatchObject({ code: 'LESSON_SOURCE_CHANGED' });
    const other = (
      await createTeacherStudent(h.deps, {
        requestId: randomUUID(),
        nickname: '虚构学生乙',
        grade: null,
        examYear: null,
        region: null,
      })
    ).student.profile.profileId;
    await expect(
      createTeacherFeedback(h.deps, other, feedbackInput(lesson.id, lesson.updatedAt)),
    ).rejects.toMatchObject({ code: 'LESSON_NOT_FOUND' });
    const withdrawn = await updateTeacherLesson(h.deps, h.profileId, lesson.id, {
      expectedUpdatedAt: lesson.updatedAt,
      action: 'withdraw',
      fields: lesson.fields,
    });
    await expect(
      createTeacherFeedback(h.deps, h.profileId, feedbackInput(withdrawn.id, withdrawn.updatedAt)),
    ).rejects.toMatchObject({ code: 'LESSON_SOURCE_CHANGED' });
    expect(await listTeacherFeedback(h.deps, h.profileId)).toEqual([]);
  });

  it('requires current reviewed source versions again when confirming a saved draft', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    const { feedback } = await createTeacherFeedback(
      h.deps,
      h.profileId,
      feedbackInput(lesson.id, lesson.updatedAt),
    );
    await updateTeacherLesson(h.deps, h.profileId, lesson.id, {
      expectedUpdatedAt: lesson.updatedAt,
      action: 'save',
      fields: { ...FIELDS, completedWork: '更正后的观察' },
    });
    await expect(
      updateTeacherFeedback(
        h.deps,
        h.profileId,
        feedback.id,
        feedbackEdit(feedback, 'confirm_review'),
      ),
    ).rejects.toMatchObject({ code: 'LESSON_SOURCE_CHANGED' });
    expect(
      (await listTeacherFeedback(h.deps, h.profileId))[0].sources[0].evidence.some(
        (item) => item.text === FIELDS.completedWork,
      ),
    ).toBe(true);
    expect((await listTeacherFeedback(h.deps, h.profileId))[0].status).toBe('draft');
  });

  it('does not invent completion when only a lesson topic exists and labels guidance as a suggestion', () => {
    const text = assembleParentFeedback('虚构昵称', 'zh-CN', [
      {
        kind: 'lesson',
        id: `teacher-lesson:v1:${'a'.repeat(64)}`,
        updatedAt: NOW,
        date: '2026-09-08',
        title: '虚构课题',
        subject: '数学',
        evidence: [],
      },
    ]);
    expect(text).toContain('暂未记录具体完成情况');
    expect(text).toContain('家庭配合建议');
    expect(text).not.toContain('进步');
    expect(text).not.toContain('掌握率');
  });

  it('hides lesson and feedback sessions from generic persistence reads, creation, updates and deletion', async () => {
    const h = await harness();
    const { lesson } = await newLesson(h.deps, h.profileId);
    await createTeacherFeedback(h.deps, h.profileId, feedbackInput(lesson.id, lesson.updatedAt));
    const client = createClientVisibleRuntimeStore(h.store);
    const privateSessions = (
      await h.store.listSessions(
        zhongkaoStageId(h.profileId),
        resolveZhongkaoLearnerKeyFromOwnerId(h.deps.ownerId),
      )
    ).filter((session) => [TEACHER_LESSON_KIND, TEACHER_FEEDBACK_KIND].includes(session.kind));
    expect(privateSessions).toHaveLength(2);
    for (const session of privateSessions) {
      expect(isServerOnlyRuntimeKind(session.kind)).toBe(true);
      const records = await h.store.listRecords(session.id);
      expect(await client.getSession(session.id)).toBeUndefined();
      expect(await client.listRecords(session.id)).toEqual([]);
      await expect(
        client.createSession({ ...session, id: `fake:${session.id}` }),
      ).rejects.toThrow();
      await expect(
        client.appendRecord({
          id: randomUUID(),
          sessionId: session.id,
          createdAt: NOW,
          payload: records[0].payload,
        }),
      ).rejects.toThrow();
      await client.deleteSession(session.id);
      expect(await h.store.listRecords(session.id)).toEqual(records);
    }
  });
});
