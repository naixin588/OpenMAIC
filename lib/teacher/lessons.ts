import { z } from 'zod';

export const TEACHER_LESSON_KIND = 'teacherStudentLesson';
export const TEACHER_FEEDBACK_KIND = 'teacherParentFeedback';
export const TEACHER_LESSON_LIMIT = 500;
export const TEACHER_FEEDBACK_LIMIT = 200;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const note = z.string().trim().max(3000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const profileId = z.string().regex(/^teacher-student:v1:[a-f0-9]{64}$/);
const lessonId = z.string().regex(/^teacher-lesson:v1:[a-f0-9]{64}$/);
const analysisId = z.string().regex(/^teacher-analysis:v1:[a-f0-9]{64}$/);
const feedbackId = z.string().regex(/^teacher-feedback:v1:[a-f0-9]{64}$/);

export const lessonFieldsSchema = z
  .object({
    lessonDate: date,
    subject: shortText(40),
    topic: shortText(160),
    learningContent: note,
    completedWork: note,
    classroomObservations: note,
    needsPractice: note,
    homework: note,
    nextSteps: note,
    familyActions: note,
  })
  .strict();

export const createLessonSchema = z
  .object({
    requestId: z.string().uuid(),
    fields: lessonFieldsSchema,
  })
  .strict();
export const updateLessonSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    action: z.enum(['save', 'withdraw']),
    fields: lessonFieldsSchema,
  })
  .strict();

export const teacherLessonSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: lessonId,
    profileId,
    request: createLessonSchema,
    requestFingerprint: hash,
    status: z.enum(['active', 'withdrawn']),
    fields: lessonFieldsSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const lessonRef = z.object({ id: lessonId, updatedAt: z.string().datetime() }).strict();
const analysisRef = z.object({ id: analysisId, updatedAt: z.string().datetime() }).strict();
export const createFeedbackSchema = z
  .object({
    requestId: z.string().uuid(),
    locale: z.enum(['zh-CN', 'en-US']),
    lessonRefs: z.array(lessonRef).max(10),
    analysisRefs: z.array(analysisRef).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = [...value.lessonRefs, ...value.analysisRefs].map((ref) => ref.id);
    if (ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Select 1–10 distinct sources' });
    }
  });

// Only selected evidence is copied; raw answer files and other students never enter a draft.
export const feedbackSourceSchema = z
  .object({
    kind: z.enum(['lesson', 'analysis']),
    id: z.union([lessonId, analysisId]),
    updatedAt: z.string().datetime(),
    date,
    title: shortText(160),
    subject: shortText(40),
    evidence: z
      .array(
        z
          .object({
            category: z.enum([
              'learning',
              'completed',
              'practice',
              'observation',
              'homework',
              'next',
              'family',
              'limitation',
            ]),
            text: shortText(3000),
            attribution: z.enum(['teacher_record', 'reviewed_inferred']),
            citations: z
              .array(
                z
                  .object({
                    sourceId: shortText(40),
                    blockId: shortText(100),
                    quote: shortText(600),
                  })
                  .strict(),
              )
              .max(4),
          })
          .strict(),
      )
      .max(48),
  })
  .strict();

export const teacherFeedbackSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: feedbackId,
    profileId,
    request: createFeedbackSchema,
    requestFingerprint: hash,
    status: z.enum(['draft', 'reviewed', 'withdrawn']),
    method: z.literal('evidence_assembly'),
    sources: z.array(feedbackSourceSchema).min(1).max(10),
    originalText: shortText(280000),
    text: shortText(280000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    reviewedAt: z.string().datetime().optional(),
  })
  .strict();
export const updateFeedbackSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    action: z.enum(['save_draft', 'confirm_review', 'withdraw']),
    text: shortText(280000),
  })
  .strict();

export type LessonFields = z.infer<typeof lessonFieldsSchema>;
export type TeacherLesson = z.infer<typeof teacherLessonSchema>;
export type TeacherFeedback = z.infer<typeof teacherFeedbackSchema>;
export type FeedbackSource = z.infer<typeof feedbackSourceSchema>;
export type CreateFeedback = z.infer<typeof createFeedbackSchema>;

export function validateTeacherLesson(value: unknown) {
  const parsed = teacherLessonSchema.safeParse(value);
  return parsed.success && Date.parse(parsed.data.updatedAt) >= Date.parse(parsed.data.createdAt)
    ? { valid: true as const }
    : { valid: false as const, errors: [{ path: '/payload', message: 'Invalid lesson record' }] };
}

export function validateTeacherFeedback(value: unknown) {
  const parsed = teacherFeedbackSchema.safeParse(value);
  if (parsed.success) {
    const feedback = parsed.data;
    const refs = [
      ...feedback.request.lessonRefs.map((ref) => ({ ...ref, kind: 'lesson' })),
      ...feedback.request.analysisRefs.map((ref) => ({ ...ref, kind: 'analysis' })),
    ];
    if (
      Date.parse(feedback.updatedAt) >= Date.parse(feedback.createdAt) &&
      (feedback.status !== 'draft' || !feedback.reviewedAt) &&
      (feedback.status !== 'reviewed' || !!feedback.reviewedAt) &&
      (!feedback.reviewedAt ||
        (feedback.reviewedAt >= feedback.createdAt && feedback.reviewedAt <= feedback.updatedAt)) &&
      new Set(feedback.sources.map((source) => source.id)).size === refs.length &&
      feedback.sources.length === refs.length &&
      refs.every((ref) =>
        feedback.sources.some(
          (source) =>
            source.id === ref.id && source.kind === ref.kind && source.updatedAt === ref.updatedAt,
        ),
      )
    ) {
      return { valid: true as const };
    }
  }
  return {
    valid: false as const,
    errors: [{ path: '/payload', message: 'Invalid feedback record' }],
  };
}

export type TeacherLessonErrorCode =
  | 'LESSON_INPUT_INVALID'
  | 'LESSON_NOT_FOUND'
  | 'LESSON_CONFLICT'
  | 'LESSON_ARCHIVED'
  | 'LESSON_SOURCE_CHANGED'
  | 'LESSON_LIMIT_REACHED'
  | 'LESSON_UNAVAILABLE'
  | 'LESSON_ORIGIN_REJECTED'
  | 'LESSON_CANCELED'
  | 'LESSON_STORAGE_CORRUPT';
const statuses: Record<TeacherLessonErrorCode, number> = {
  LESSON_INPUT_INVALID: 400,
  LESSON_NOT_FOUND: 404,
  LESSON_CONFLICT: 409,
  LESSON_ARCHIVED: 409,
  LESSON_SOURCE_CHANGED: 409,
  LESSON_LIMIT_REACHED: 409,
  LESSON_UNAVAILABLE: 503,
  LESSON_ORIGIN_REJECTED: 403,
  LESSON_CANCELED: 408,
  LESSON_STORAGE_CORRUPT: 409,
};
export class TeacherLessonError extends Error {
  readonly status: number;
  constructor(readonly code: TeacherLessonErrorCode) {
    super(code);
    this.name = 'TeacherLessonError';
    this.status = statuses[code];
  }
}
