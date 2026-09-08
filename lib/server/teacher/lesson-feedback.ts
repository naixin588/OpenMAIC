import {
  createFeedbackSchema,
  updateFeedbackSchema,
  TEACHER_FEEDBACK_KIND,
  TEACHER_FEEDBACK_LIMIT,
  TeacherLessonError,
  validateTeacherFeedback,
  teacherFeedbackSchema,
  type CreateFeedback,
  type FeedbackSource,
  type TeacherFeedback,
  type TeacherLesson,
} from '@/lib/teacher/lessons';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';
import { getTeacherStudent } from './students';
import { getTeacherAnalysis } from './analysis-service';
import { getTeacherLesson } from './lesson-service';
import {
  appendJournal,
  checkLessonAbort,
  journalEntryId,
  lessonConflict,
  lessonHash,
  lessonTimestamp,
  listJournal,
  readJournal,
  safely,
  writableStudent,
  type LessonServiceDeps,
} from './lesson-store';

export const feedbackJournal = {
  kind: TEACHER_FEEDBACK_KIND,
  prefix: 'teacher-feedback',
  limit: TEACHER_FEEDBACK_LIMIT,
  validate: validateTeacherFeedback,
  parse: (value: unknown) => teacherFeedbackSchema.parse(value),
  immutable: (value: TeacherFeedback) => ({
    id: value.id,
    profileId: value.profileId,
    request: value.request,
    sources: value.sources,
    originalText: value.originalText,
    method: value.method,
    createdAt: value.createdAt,
  }),
  transition: (previous: TeacherFeedback | undefined, next: TeacherFeedback) => {
    if (!previous)
      return next.status === 'draft' && next.text === next.originalText && !next.reviewedAt;
    if (previous.status === 'withdrawn') return false;
    if (next.status === 'draft') return !next.reviewedAt;
    if (previous.text !== next.text) return false;
    return next.status === 'reviewed'
      ? previous.status === 'draft' && next.reviewedAt === next.updatedAt
      : next.reviewedAt === previous.reviewedAt;
  },
};

function lessonSource(lesson: TeacherLesson): FeedbackSource {
  const fields = lesson.fields;
  const fieldCategories = {
    learningContent: 'learning',
    completedWork: 'completed',
    classroomObservations: 'observation',
    needsPractice: 'practice',
    homework: 'homework',
    nextSteps: 'next',
    familyActions: 'family',
  } as const;
  return {
    kind: 'lesson',
    id: lesson.id,
    updatedAt: lesson.updatedAt,
    date: fields.lessonDate,
    title: fields.topic,
    subject: fields.subject,
    evidence: Object.entries(fieldCategories).flatMap(([field, category]) => {
      const text = fields[field as keyof typeof fieldCategories];
      return text
        ? [{ category, text, attribution: 'teacher_record' as const, citations: [] }]
        : [];
    }),
  };
}
function analysisSource(analysis: TeacherAnalysis): FeedbackSource {
  const categories = {
    learning_content: 'learning',
    demonstrated: 'completed',
    needs_practice: 'practice',
    needs_verification: 'practice',
  } as const;
  return {
    kind: 'analysis',
    id: analysis.analysisId,
    updatedAt: analysis.updatedAt,
    date: analysis.request.workDate,
    title: analysis.request.title,
    subject: analysis.request.subject,
    evidence: [
      ...analysis.report.observations.map((observation) => ({
        category: categories[observation.category],
        text: observation.text,
        attribution: 'reviewed_inferred' as const,
        citations: observation.citations,
      })),
      ...analysis.report.recommendations.map((recommendation) => ({
        category: 'next' as const,
        text: recommendation.text,
        attribution: 'reviewed_inferred' as const,
        citations: [],
      })),
      ...analysis.report.limitations.map((text) => ({
        category: 'limitation' as const,
        text,
        attribution: 'reviewed_inferred' as const,
        citations: [],
      })),
    ],
  };
}

async function selectedSources(
  deps: LessonServiceDeps,
  profileId: string,
  request: CreateFeedback,
) {
  const lessons = await Promise.all(
    request.lessonRefs.map(async (ref) => {
      const lesson = await getTeacherLesson(deps, profileId, ref.id);
      if (lesson.status !== 'active' || lesson.updatedAt !== ref.updatedAt)
        throw new TeacherLessonError('LESSON_SOURCE_CHANGED');
      return lessonSource(lesson);
    }),
  );
  const analyses = await Promise.all(
    request.analysisRefs.map(async (ref) => {
      const analysis = await getTeacherAnalysis(deps, profileId, ref.id);
      if (analysis.status !== 'reviewed' || analysis.updatedAt !== ref.updatedAt)
        throw new TeacherLessonError('LESSON_SOURCE_CHANGED');
      return analysisSource(analysis);
    }),
  );
  return [...lessons, ...analyses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

/** A transparent assembly of selected evidence; this intentionally makes no model claims. */
export function assembleParentFeedback(
  nickname: string,
  locale: string,
  sources: FeedbackSource[],
): string {
  const zh = locale === 'zh-CN';
  const sections = zh
    ? [
        ['learning', '本次学习内容', '已记录的学习主题见上方，具体内容待老师补充。'],
        ['completed', '实际完成情况', '暂未记录具体完成情况，待老师补充核实。'],
        ['observation', '课堂观察', ''],
        ['practice', '仍需练习或验证', '暂未记录；资料不足不能直接认定已掌握。'],
        ['homework', '课后作业安排', '本次选定记录中暂无作业安排，请与老师确认。'],
        ['next', '老师下一步安排', '待老师补充下一步教学安排。'],
        [
          'family',
          '家庭配合建议',
          '请孩子记录练习中卡住的题目和步骤，带到下次课与老师核对；不以一次作答给孩子贴标签。',
        ],
        ['limitation', '需要保留的判断边界', ''],
      ]
    : [
        [
          'learning',
          'Learning content',
          'Topics are listed above; specific content is awaiting teacher notes.',
        ],
        [
          'completed',
          'Work actually completed',
          'Completion has not been recorded; the teacher needs to verify it.',
        ],
        ['observation', 'Classroom observations', ''],
        [
          'practice',
          'Practice and verification needed',
          'Not yet recorded; insufficient evidence does not establish mastery.',
        ],
        [
          'homework',
          'Homework',
          'No assignment in the selected records; confirm with the teacher.',
        ],
        ['next', 'Next teaching actions', 'The teacher will add the next teaching actions.'],
        [
          'family',
          'Family support suggestions',
          'Ask the student to note questions and steps where they get stuck, and bring them to the next lesson. Avoid labels based on a single attempt.',
        ],
        ['limitation', 'Limits of this evidence', ''],
      ];
  const dates = sources.map((source) => source.date).sort();
  const lines = [
    zh ? `${nickname}家长您好：` : `Hello, ${nickname}’s family,`,
    '',
    zh
      ? `以下反馈根据 ${dates[0]} 至 ${dates.at(-1)} 的选定记录整理。`
      : `This feedback uses selected records from ${dates[0]} to ${dates.at(-1)}.`,
    ...sources.map(
      (source, index) => `[${index + 1}] ${source.date} · ${source.subject} · ${source.title}`,
    ),
    '',
  ];
  for (const [category, heading, fallback] of sections) {
    const evidence = sources.flatMap((source, index) =>
      source.evidence
        .filter((item) => item.category === category)
        .map(
          (item) =>
            `• [${index + 1}] ${item.attribution === 'reviewed_inferred' ? (zh ? '已复核分析提示（待持续验证）：' : 'Reviewed analysis suggests (requires continuing verification): ') : ''}${item.text}`,
        ),
    );
    if (evidence.length || fallback)
      lines.push(heading, ...(evidence.length ? evidence : [fallback]), '');
  }
  lines.push(
    zh
      ? '以上课堂观察和分析均不等于长期掌握结论，后续会结合独立练习继续核对。'
      : 'Classroom observations and analysis do not establish long-term mastery. Independent work is needed for further verification.',
  );
  return lines.join('\n');
}

export function listTeacherFeedback(deps: LessonServiceDeps, profileId: string) {
  return safely(() => listJournal(deps, profileId, feedbackJournal));
}
export function getTeacherFeedback(deps: LessonServiceDeps, profileId: string, id: string) {
  return safely(async () => {
    await getTeacherStudent(deps, profileId);
    const feedback = (await readJournal(deps, profileId, feedbackJournal)).entries.get(id);
    if (!feedback) throw new TeacherLessonError('LESSON_NOT_FOUND');
    return feedback;
  });
}
export function getTeacherFeedbackHistory(deps: LessonServiceDeps, profileId: string, id: string) {
  return safely(async () => {
    await getTeacherFeedback(deps, profileId, id);
    return (await readJournal(deps, profileId, feedbackJournal)).records
      .map((record) => record.payload as TeacherFeedback)
      .filter((feedback) => feedback.id === id);
  });
}
export function createTeacherFeedback(
  deps: LessonServiceDeps,
  profileId: string,
  input: unknown,
  signal?: AbortSignal,
) {
  return safely(async () => {
    const parsed = createFeedbackSchema.safeParse(input);
    if (!parsed.success) throw new TeacherLessonError('LESSON_INPUT_INVALID');
    const request = parsed.data;
    checkLessonAbort(signal);
    const student = await writableStudent(deps, profileId);
    const id = journalEntryId(deps, profileId, feedbackJournal, request.requestId);
    const requestFingerprint = lessonHash(request);
    const existing = (await readJournal(deps, profileId, feedbackJournal)).entries.get(id);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) lessonConflict();
      return { feedback: existing, replayed: true };
    }
    const sources = await selectedSources(deps, profileId, request);
    const text = assembleParentFeedback(
      student.profile.displayName.value ?? '',
      request.locale,
      sources,
    );
    const now = lessonTimestamp(deps);
    const feedback: TeacherFeedback = {
      schemaVersion: 1,
      id,
      profileId,
      request,
      requestFingerprint,
      status: 'draft',
      method: 'evidence_assembly',
      sources,
      originalText: text,
      text,
      createdAt: now,
      updatedAt: now,
    };
    const result = await appendJournal(
      deps,
      profileId,
      feedbackJournal,
      feedback,
      undefined,
      signal,
    );
    return { feedback: result.entry, replayed: result.replayed };
  });
}
export function updateTeacherFeedback(
  deps: LessonServiceDeps,
  profileId: string,
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  return safely(async () => {
    const parsed = updateFeedbackSchema.safeParse(input);
    if (!parsed.success) throw new TeacherLessonError('LESSON_INPUT_INVALID');
    const request = parsed.data;
    const current = await getTeacherFeedback(deps, profileId, id);
    if (current.updatedAt !== request.expectedUpdatedAt || current.status === 'withdrawn')
      lessonConflict();
    if (request.action !== 'save_draft' && current.text !== request.text) lessonConflict();
    if (request.action === 'confirm_review') {
      if (current.status !== 'draft') lessonConflict();
      const sources = await selectedSources(deps, profileId, current.request);
      if (lessonHash(sources) !== lessonHash(current.sources))
        throw new TeacherLessonError('LESSON_SOURCE_CHANGED');
    }
    const now = lessonTimestamp(deps, current.updatedAt);
    const { reviewedAt: _reviewedAt, ...withoutReview } = current;
    const updated: TeacherFeedback = {
      ...withoutReview,
      text: request.text,
      updatedAt: now,
      status:
        request.action === 'confirm_review'
          ? 'reviewed'
          : request.action === 'withdraw'
            ? 'withdrawn'
            : 'draft',
      ...(request.action === 'confirm_review' ? { reviewedAt: now } : {}),
      ...(request.action === 'withdraw' && current.reviewedAt
        ? { reviewedAt: current.reviewedAt }
        : {}),
    };
    return (
      await appendJournal(
        deps,
        profileId,
        feedbackJournal,
        updated,
        request.expectedUpdatedAt,
        signal,
      )
    ).entry;
  });
}
