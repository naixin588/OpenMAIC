import {
  createLessonSchema,
  updateLessonSchema,
  TEACHER_LESSON_KIND,
  TEACHER_LESSON_LIMIT,
  TeacherLessonError,
  validateTeacherLesson,
  teacherLessonSchema,
  type TeacherLesson,
} from '@/lib/teacher/lessons';
import { getTeacherStudent } from './students';
import {
  appendJournal,
  journalEntryId,
  lessonConflict,
  lessonHash,
  lessonTimestamp,
  listJournal,
  readJournal,
  safely,
  writableStudent,
  checkLessonAbort,
  type LessonServiceDeps,
} from './lesson-store';

export const lessonJournal = {
  kind: TEACHER_LESSON_KIND,
  prefix: 'teacher-lesson',
  limit: TEACHER_LESSON_LIMIT,
  validate: validateTeacherLesson,
  parse: (value: unknown) => teacherLessonSchema.parse(value),
  immutable: (value: TeacherLesson) => ({
    id: value.id,
    profileId: value.profileId,
    request: value.request,
    createdAt: value.createdAt,
  }),
  transition: (previous: TeacherLesson | undefined, next: TeacherLesson) =>
    previous
      ? previous.status !== 'withdrawn' &&
        (next.status !== 'withdrawn' || lessonHash(previous.fields) === lessonHash(next.fields))
      : next.status === 'active' && lessonHash(next.fields) === lessonHash(next.request.fields),
};

export function listTeacherLessons(deps: LessonServiceDeps, profileId: string) {
  return safely(() => listJournal(deps, profileId, lessonJournal));
}
export function getTeacherLesson(deps: LessonServiceDeps, profileId: string, id: string) {
  return safely(async () => {
    await getTeacherStudent(deps, profileId);
    const snapshot = await readJournal(deps, profileId, lessonJournal);
    const lesson = snapshot.entries.get(id);
    if (!lesson) throw new TeacherLessonError('LESSON_NOT_FOUND');
    return lesson;
  });
}
export function getTeacherLessonHistory(deps: LessonServiceDeps, profileId: string, id: string) {
  return safely(async () => {
    await getTeacherLesson(deps, profileId, id);
    return (await readJournal(deps, profileId, lessonJournal)).records
      .map((record) => record.payload as TeacherLesson)
      .filter((lesson) => lesson.id === id);
  });
}
export function createTeacherLesson(
  deps: LessonServiceDeps,
  profileId: string,
  input: unknown,
  signal?: AbortSignal,
) {
  return safely(async () => {
    const parsed = createLessonSchema.safeParse(input);
    if (!parsed.success) throw new TeacherLessonError('LESSON_INPUT_INVALID');
    checkLessonAbort(signal);
    await writableStudent(deps, profileId);
    const request = parsed.data;
    const now = lessonTimestamp(deps);
    const lesson: TeacherLesson = {
      schemaVersion: 1,
      id: journalEntryId(deps, profileId, lessonJournal, request.requestId),
      profileId,
      request,
      requestFingerprint: lessonHash(request),
      status: 'active',
      fields: request.fields,
      createdAt: now,
      updatedAt: now,
    };
    const result = await appendJournal(deps, profileId, lessonJournal, lesson, undefined, signal);
    return { lesson: result.entry, replayed: result.replayed };
  });
}
export function updateTeacherLesson(
  deps: LessonServiceDeps,
  profileId: string,
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  return safely(async () => {
    const parsed = updateLessonSchema.safeParse(input);
    if (!parsed.success) throw new TeacherLessonError('LESSON_INPUT_INVALID');
    const request = parsed.data;
    const current = await getTeacherLesson(deps, profileId, id);
    if (current.updatedAt !== request.expectedUpdatedAt || current.status === 'withdrawn')
      lessonConflict();
    if (request.action === 'withdraw' && lessonHash(current.fields) !== lessonHash(request.fields))
      lessonConflict();
    const updated: TeacherLesson = {
      ...current,
      fields: request.fields,
      status: request.action === 'withdraw' ? 'withdrawn' : 'active',
      updatedAt: lessonTimestamp(deps, current.updatedAt),
    };
    return (
      await appendJournal(
        deps,
        profileId,
        lessonJournal,
        updated,
        request.expectedUpdatedAt,
        signal,
      )
    ).entry;
  });
}
