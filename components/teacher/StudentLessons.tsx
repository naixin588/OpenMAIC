'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { lessonFieldsSchema, type LessonFields, type TeacherLesson } from '@/lib/teacher/lessons';
import { createTeacherRequestId, teacherRequest } from './student-ui';
import {
  emptyLesson,
  lessonFieldLabels,
  lessonHistory,
  lessonText,
  lessonUrl,
  useLessonRequests,
  type LessonPanelProps,
} from './lesson-ui';

export { ParentFeedback } from './ParentFeedback';
export function StudentLessons(props: LessonPanelProps) {
  return <LessonContent key={props.profileId} {...props} />;
}

function LessonContent({ profileId, nickname, locale, archived = false }: LessonPanelProps) {
  const t = (zh: string, en: string) => lessonText(locale, zh, en);
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<TeacherLesson[] | null>(null);
  const { busy, error, setError, run } = useLessonRequests(locale);
  const selected = lessons.find((record) => record.id === selectedId) ?? lessons[0];
  const load = useCallback(
    () =>
      run(
        async (signal) => {
          const result = await teacherRequest<{ lessons: TeacherLesson[] }>(lessonUrl(profileId), {
            signal,
          });
          if (result.lessons.some((record) => record.profileId !== profileId))
            throw new Error('Unexpected student');
          return result.lessons;
        },
        (records) => {
          setLessons(records);
          setLoaded(true);
          setHistory(null);
        },
      ),
    [profileId, run],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function accept(lesson: TeacherLesson) {
    if (lesson.profileId !== profileId) return;
    setLessons((current) => [lesson, ...current.filter((record) => record.id !== lesson.id)]);
    setSelectedId(lesson.id);
    setCreating(false);
    setEditing(false);
    setHistory(null);
  }
  return (
    <section
      className="space-y-5"
      data-testid="teacher-student-lessons"
      aria-label={t('课堂与作业', 'Lessons and homework')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <BookOpenCheck className="size-5" />
            {t('课堂与作业', 'Lessons and homework')}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {t(
              `为 ${nickname} 保留每次课的真实记录，作业可在课后调整。`,
              `Keep dated lesson records and adjust ${nickname}’s homework after class.`,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('刷新课堂记录', 'Refresh lessons')}
            disabled={busy || editing || creating}
            onClick={() => void load()}
          >
            <RefreshCw className={busy ? 'animate-spin' : ''} />
          </Button>
          {!archived && (
            <Button
              size="sm"
              disabled={busy || editing || creating}
              onClick={() => {
                setCreating(true);
                setHistory(null);
              }}
            >
              <Plus />
              {t('记录这次课', 'Record a lesson')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {!loaded && busy && (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {t('正在读取记录…', 'Loading records…')}
        </p>
      )}
      {loaded && !lessons.length && !creating && (
        <div className="bg-muted/30 rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">{t('从今天的课堂开始', 'Start with today’s lesson')}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t(
              '记录学了什么、完成了什么、需要复习什么。后续家长反馈会使用你选定的记录。',
              'Record learning content, completed work and next practice. Select these records later for parent feedback.',
            )}
          </p>
        </div>
      )}
      {lessons.length > 0 && (
        <div
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
          aria-label={t('课堂记录列表', 'Lesson records')}
        >
          {lessons.map((lesson) => (
            <button
              type="button"
              key={lesson.id}
              disabled={editing || creating || busy}
              aria-pressed={selected?.id === lesson.id}
              className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${selected?.id === lesson.id ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30' : 'hover:bg-muted/50'}`}
              onClick={() => {
                setSelectedId(lesson.id);
                setHistory(null);
              }}
            >
              <span className="text-muted-foreground text-xs">
                {lesson.fields.lessonDate} · {lesson.fields.subject}
              </span>
              <span className="mt-1 block break-words text-sm font-medium">
                {lesson.fields.topic}
              </span>
              {lesson.status === 'withdrawn' && (
                <span className="text-muted-foreground text-xs">{t('已撤回', 'Withdrawn')}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {(creating || (selected && editing)) && !archived ? (
        <LessonForm
          key={creating ? 'new' : `${selected.id}:${selected.updatedAt}`}
          locale={locale}
          lesson={creating ? undefined : selected}
          busy={busy}
          onCancel={() => {
            setCreating(false);
            setEditing(false);
            setError('');
          }}
          onSave={(fields, requestId) =>
            void run(async (signal) => {
              const result = await teacherRequest<{ lesson: TeacherLesson }>(
                creating
                  ? lessonUrl(profileId)
                  : `${lessonUrl(profileId)}/${encodeURIComponent(selected.id)}`,
                {
                  method: creating ? 'POST' : 'PATCH',
                  signal,
                  body: JSON.stringify(
                    creating
                      ? { requestId, fields }
                      : { expectedUpdatedAt: selected.updatedAt, action: 'save', fields },
                  ),
                },
              );
              return result.lesson;
            }, accept)
          }
        />
      ) : (
        selected && (
          <article className="rounded-xl border p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="font-medium break-words">{selected.fields.topic}</h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      (signal) =>
                        lessonHistory<TeacherLesson>(
                          `${lessonUrl(profileId)}/${encodeURIComponent(selected.id)}`,
                          profileId,
                          signal,
                        ),
                      setHistory,
                    )
                  }
                >
                  {t('修改记录', 'Revision history')}
                </Button>
                {!archived && selected.status !== 'withdrawn' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      {t('编辑课堂 / 调整作业', 'Edit lesson / homework')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          async (signal) =>
                            (
                              await teacherRequest<{ lesson: TeacherLesson }>(
                                `${lessonUrl(profileId)}/${encodeURIComponent(selected.id)}`,
                                {
                                  method: 'PATCH',
                                  signal,
                                  body: JSON.stringify({
                                    expectedUpdatedAt: selected.updatedAt,
                                    action: 'withdraw',
                                    fields: selected.fields,
                                  }),
                                },
                              )
                            ).lesson,
                          accept,
                        )
                      }
                    >
                      {t('撤回记录', 'Withdraw')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {selected.fields.lessonDate} · {selected.fields.subject} ·{' '}
              {t('老师录入的观察，不直接判定掌握', 'Teacher observations do not establish mastery')}
            </p>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              {(Object.keys(lessonFieldLabels) as (keyof LessonFields)[])
                .filter((field) => !['lessonDate', 'subject', 'topic'].includes(field))
                .map((field) => (
                  <div
                    key={field}
                    className={
                      field === 'homework'
                        ? 'rounded-lg bg-amber-50/60 p-3 dark:bg-amber-950/20'
                        : ''
                    }
                  >
                    <dt className="text-muted-foreground text-xs font-medium">
                      {t(...lessonFieldLabels[field])}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                      {selected.fields[field] || t('尚未记录', 'Not recorded')}
                    </dd>
                  </div>
                ))}
            </dl>
            {history && (
              <details open className="mt-5 border-t pt-4">
                <summary className="cursor-pointer text-sm font-medium">
                  {t(
                    `共 ${history.length} 个版本（含原始记录）`,
                    `${history.length} versions, including the original`,
                  )}
                </summary>
                {history.map((version, index) => (
                  <details className="mt-3 text-sm" key={version.updatedAt}>
                    <summary className="cursor-pointer text-muted-foreground">
                      {index + 1} · {new Date(version.updatedAt).toLocaleString(locale)} ·{' '}
                      {version.status === 'withdrawn'
                        ? t('已撤回', 'Withdrawn')
                        : t('已保存', 'Saved')}
                    </summary>
                    <dl className="mt-2 space-y-3 rounded-lg bg-muted/40 p-3">
                      {(Object.keys(lessonFieldLabels) as (keyof LessonFields)[]).map((field) => (
                        <div key={field}>
                          <dt className="text-xs text-muted-foreground">
                            {t(...lessonFieldLabels[field])}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {version.fields[field] || '—'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </details>
            )}
          </article>
        )
      )}
    </section>
  );
}

function LessonForm({
  lesson,
  locale,
  busy,
  onCancel,
  onSave,
}: {
  lesson?: TeacherLesson;
  locale: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: LessonFields, requestId: string) => void;
}) {
  const [fields, setFields] = useState<LessonFields>(() => lesson?.fields ?? emptyLesson());
  const [requestId] = useState(createTeacherRequestId);
  const [invalid, setInvalid] = useState(false);
  const t = (zh: string, en: string) => lessonText(locale, zh, en);
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = lessonFieldsSchema.safeParse(fields);
        setInvalid(!parsed.success);
        if (parsed.success) onSave(parsed.data, requestId);
      }}
    >
      <h4 className="font-medium">
        {lesson ? t('修改课堂记录', 'Edit lesson record') : t('新增课堂记录', 'New lesson record')}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(lessonFieldLabels) as (keyof LessonFields)[]).map((field) => (
          <label
            key={field}
            className={`grid gap-2 text-sm ${field === 'topic' ? 'sm:col-span-2' : ''}`}
          >
            <span>
              {t(...lessonFieldLabels[field])}
              {['lessonDate', 'subject', 'topic'].includes(field) ? ' *' : ''}
            </span>
            {['lessonDate', 'subject', 'topic'].includes(field) ? (
              <Input
                type={field === 'lessonDate' ? 'date' : 'text'}
                required
                value={fields[field]}
                disabled={busy}
                maxLength={field === 'subject' ? 40 : field === 'topic' ? 160 : undefined}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            ) : (
              <Textarea
                value={fields[field]}
                maxLength={3000}
                disabled={busy}
                rows={3}
                placeholder={t(
                  '只记录实际观察；没有资料可留空',
                  'Record actual observations; leave unknown details blank',
                )}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      {invalid && (
        <p role="alert" className="text-destructive text-sm">
          {t('请填写有效日期、学科和课堂主题。', 'Enter a valid date, subject and topic.')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('取消', 'Cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {t('保存记录', 'Save record')}
        </Button>
      </div>
    </form>
  );
}
