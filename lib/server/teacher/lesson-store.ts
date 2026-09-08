import { createHash, randomUUID } from 'node:crypto';
import type { RuntimeRecord, RuntimeSession } from '@openmaic/dsl';
import { RuntimeAppendConflictError } from '@openmaic/storage';
import { TeacherLessonError } from '@/lib/teacher/lessons';
import { TeacherStudentError } from '@/lib/teacher/students';
import { TeacherAnalysisError } from '@/lib/teacher/analysis';
import { zhongkaoStageId } from '@/lib/zhongkao/runtime';
import { resolveZhongkaoLearnerKeyFromOwnerId } from '@/lib/server/zhongkao/learner-identity';
import { getTeacherStudent, type TeacherStudentServiceDeps } from './students';

export type LessonServiceDeps = TeacherStudentServiceDeps;
export const lessonHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function lessonConflict(): never {
  throw new TeacherLessonError('LESSON_CONFLICT');
}
function corrupt(): never {
  throw new TeacherLessonError('LESSON_STORAGE_CORRUPT');
}
export function checkLessonAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new TeacherLessonError('LESSON_CANCELED');
}
export function lessonTimestamp(deps: LessonServiceDeps, after?: string) {
  const value = Date.parse((deps.now ?? (() => new Date().toISOString()))());
  if (!Number.isFinite(value)) throw new TeacherLessonError('LESSON_UNAVAILABLE');
  return new Date(Math.max(value, after ? Date.parse(after) + 1 : value)).toISOString();
}
export function safeLessonError(error: unknown): TeacherLessonError {
  if (error instanceof TeacherLessonError) return error;
  if (error instanceof TeacherStudentError || error instanceof TeacherAnalysisError) {
    if (error.code.endsWith('_NOT_FOUND')) return new TeacherLessonError('LESSON_NOT_FOUND');
    if (error.code.endsWith('_STORAGE_CORRUPT'))
      return new TeacherLessonError('LESSON_STORAGE_CORRUPT');
  }
  return new TeacherLessonError('LESSON_UNAVAILABLE');
}
export async function safely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw safeLessonError(error);
  }
}
export async function writableStudent(deps: LessonServiceDeps, profileId: string) {
  const student = await getTeacherStudent(deps, profileId);
  if (student.archived) throw new TeacherLessonError('LESSON_ARCHIVED');
  return student;
}

interface Entry {
  id: string;
  profileId: string;
  request: { requestId: string };
  requestFingerprint: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}
interface Journal<T extends Entry> {
  kind: string;
  prefix: string;
  limit: number;
  validate: (value: unknown) => { valid: boolean };
  parse: (value: unknown) => T;
  immutable: (value: T) => unknown;
  transition: (previous: T | undefined, next: T) => boolean;
}
function identity(deps: LessonServiceDeps, profileId: string, kind: string) {
  const learnerKey = resolveZhongkaoLearnerKeyFromOwnerId(deps.ownerId);
  return {
    id: `teacher-journal:v1:${lessonHash([kind, learnerKey, profileId])}`,
    kind,
    stageId: zhongkaoStageId(profileId),
    learnerKey,
  };
}
type Identity = ReturnType<typeof identity>;
function assertSession(session: RuntimeSession, expected: Identity) {
  if (
    session.id !== expected.id ||
    session.kind !== expected.kind ||
    session.stageId !== expected.stageId ||
    session.learnerKey !== expected.learnerKey ||
    session.status !== 'active'
  )
    corrupt();
}
export function journalEntryId<T extends Entry>(
  deps: LessonServiceDeps,
  profileId: string,
  journal: Journal<T>,
  requestId: string,
) {
  return `${journal.prefix}:v1:${lessonHash([identity(deps, profileId, journal.kind).id, requestId])}`;
}
export async function readJournal<T extends Entry>(
  deps: LessonServiceDeps,
  profileId: string,
  journal: Journal<T>,
) {
  const expected = identity(deps, profileId, journal.kind);
  const session = await deps.store.getSession(expected.id);
  const entries = new Map<string, T>();
  let records: RuntimeRecord[] = [];
  if (session) {
    assertSession(session, expected);
    records = (await deps.store.listRecords(expected.id)).sort((a, b) => a.seq - b.seq);
    for (const [index, record] of records.entries()) {
      if (
        record.sessionId !== expected.id ||
        record.seq !== index ||
        !journal.validate(record.payload).valid
      )
        corrupt();
      // JSONB does not preserve object key order. Rebuild the schema's field order before
      // checking the original request fingerprint, including nested source/citation objects.
      const next = journal.parse(record.payload);
      const previous = entries.get(next.id);
      if (
        next.profileId !== profileId ||
        next.id !== journalEntryId(deps, profileId, journal, next.request.requestId) ||
        next.requestFingerprint !== lessonHash(next.request) ||
        next.updatedAt !== record.createdAt ||
        !journal.transition(previous, next) ||
        (previous
          ? lessonHash(journal.immutable(previous)) !== lessonHash(journal.immutable(next)) ||
            Date.parse(next.updatedAt) <= Date.parse(previous.updatedAt)
          : next.updatedAt !== next.createdAt)
      )
        corrupt();
      entries.set(next.id, next);
      records[index] = { ...record, payload: next };
    }
  }
  if (entries.size > journal.limit) corrupt();
  return { identity: expected, entries, records };
}
export async function listJournal<T extends Entry>(
  deps: LessonServiceDeps,
  profileId: string,
  journal: Journal<T>,
): Promise<T[]> {
  await getTeacherStudent(deps, profileId);
  return [...(await readJournal(deps, profileId, journal)).entries.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}
async function ensureSession(deps: LessonServiceDeps, expected: Identity) {
  const existing = await deps.store.getSession(expected.id);
  if (existing) return assertSession(existing, expected);
  const now = lessonTimestamp(deps);
  try {
    assertSession(
      await deps.store.createSession({
        ...expected,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }),
      expected,
    );
  } catch (error) {
    const winner = await deps.store.getSession(expected.id);
    if (!winner) throw error;
    assertSession(winner, expected);
  }
}
export async function appendJournal<T extends Entry>(
  deps: LessonServiceDeps,
  profileId: string,
  journal: Journal<T>,
  inputEntry: T,
  expectedUpdatedAt?: string,
  signal?: AbortSignal,
): Promise<{ entry: T; replayed: boolean }> {
  if (!journal.validate(inputEntry).valid) throw new TeacherLessonError('LESSON_INPUT_INVALID');
  const entry = journal.parse(inputEntry);
  const recordId = `teacher-journal-entry:${randomUUID()}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    checkLessonAbort(signal);
    await writableStudent(deps, profileId);
    const snapshot = await readJournal(deps, profileId, journal);
    const current = snapshot.entries.get(entry.id);
    if (expectedUpdatedAt === undefined && current) {
      if (current.requestFingerprint !== entry.requestFingerprint) lessonConflict();
      return { entry: current, replayed: true };
    }
    if (expectedUpdatedAt !== undefined && current?.updatedAt !== expectedUpdatedAt)
      lessonConflict();
    if (!journal.transition(current, entry)) lessonConflict();
    if (!current && snapshot.entries.size >= journal.limit)
      throw new TeacherLessonError('LESSON_LIMIT_REACHED');
    await ensureSession(deps, snapshot.identity);
    checkLessonAbort(signal);
    try {
      await deps.store.appendRecord(
        {
          id: recordId,
          sessionId: snapshot.identity.id,
          createdAt: entry.updatedAt,
          payload: entry,
        },
        { expectedLastSeq: snapshot.records.at(-1)?.seq ?? null },
      );
      return { entry, replayed: false };
    } catch (error) {
      const recovered = await readJournal(deps, profileId, journal);
      if (recovered.records.some((record) => record.id === recordId))
        return { entry: recovered.entries.get(entry.id)!, replayed: true };
      if (!(error instanceof RuntimeAppendConflictError)) throw error;
    }
  }
  return lessonConflict();
}
