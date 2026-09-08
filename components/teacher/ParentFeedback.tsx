'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, FileHeart, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';
import type { TeacherFeedback, TeacherLesson } from '@/lib/teacher/lessons';
import { createTeacherRequestId, teacherRequest } from './student-ui';
import {
  downloadFeedback,
  lessonHistory,
  lessonText,
  lessonUrl,
  useLessonRequests,
  type LessonPanelProps,
} from './lesson-ui';

export function ParentFeedback(props: LessonPanelProps) {
  return <FeedbackContent key={props.profileId} {...props} />;
}

function FeedbackContent({ profileId, nickname, locale, archived = false }: LessonPanelProps) {
  const t = (zh: string, en: string) => lessonText(locale, zh, en);
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [analyses, setAnalyses] = useState<TeacherAnalysis[]>([]);
  const [feedback, setFeedback] = useState<TeacherFeedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(createTeacherRequestId);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useLessonRequests(locale);
  const selected = feedback.find((record) => record.id === selectedId) ?? feedback[0];
  const load = useCallback(
    () =>
      run(
        async (signal) => {
          const [lessonResult, analysisResult, feedbackResult] = await Promise.all([
            teacherRequest<{ lessons: TeacherLesson[] }>(lessonUrl(profileId), { signal }),
            teacherRequest<{ analyses: TeacherAnalysis[] }>(
              `/api/teacher/students/${encodeURIComponent(profileId)}/analyses`,
              { signal },
            ),
            teacherRequest<{ feedback: TeacherFeedback[] }>(`${lessonUrl(profileId)}/feedback`, {
              signal,
            }),
          ]);
          if (
            [...lessonResult.lessons, ...analysisResult.analyses, ...feedbackResult.feedback].some(
              (record) => record.profileId !== profileId,
            )
          )
            throw new Error('Unexpected student');
          return {
            lessons: lessonResult.lessons,
            analyses: analysisResult.analyses,
            feedback: feedbackResult.feedback,
          };
        },
        (result) => {
          setLessons(result.lessons);
          setAnalyses(result.analyses);
          setFeedback(result.feedback);
          setLoaded(true);
          setSources([]);
          setRequestId(createTeacherRequestId());
        },
      ),
    [profileId, run],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const eligible = [
    ...lessons
      .filter((lesson) => lesson.status === 'active')
      .map((lesson) => ({
        id: lesson.id,
        date: lesson.fields.lessonDate,
        title: lesson.fields.topic,
        subject: lesson.fields.subject,
        label: t('课堂记录', 'Lesson record'),
      })),
    ...analyses
      .filter((analysis) => analysis.status === 'reviewed')
      .map((analysis) => ({
        id: analysis.analysisId,
        date: analysis.request.workDate,
        title: analysis.request.title,
        subject: analysis.request.subject,
        label: t('已复核分析', 'Reviewed analysis'),
      })),
  ]
    .filter(
      (source) => (!fromDate || source.date >= fromDate) && (!toDate || source.date <= toDate),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  function accept(record: TeacherFeedback) {
    if (record.profileId !== profileId) return;
    setFeedback((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setSelectedId(record.id);
    setDirty(false);
    setRequestId(createTeacherRequestId());
  }
  return (
    <section
      className="space-y-5"
      data-testid="teacher-parent-feedback"
      aria-label={t('家长反馈', 'Parent feedback')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileHeart className="size-5" />
            {t('把课堂价值说清楚', 'Make learning visible')}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {t(
              `为 ${nickname} 整理可核对、可修改的反馈草稿。`,
              `Prepare an editable, verifiable feedback draft for ${nickname}.`,
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || dirty}
          aria-label={t('刷新反馈与来源', 'Refresh feedback and sources')}
          onClick={() => void load()}
        >
          <RefreshCw className={busy ? 'animate-spin' : ''} />
        </Button>
      </div>
      <p className="text-muted-foreground rounded-lg bg-muted/40 p-3 text-xs leading-5">
        {t(
          '根据你选定的课堂记录和已复核分析自动整理，不调用模型。生成后请修改并确认；不会自动发给家长。',
          'Drafts assemble your selected lesson records and reviewed analyses without calling a model. Edit and review before sharing; nothing is sent automatically.',
        )}
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {!loaded && busy && (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {t('正在读取来源…', 'Loading sources…')}
        </p>
      )}
      {!archived && (
        <details open={!feedback.length} className="rounded-xl border p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            {t('选记录，整理一份新反馈', 'Select records for a new draft')}
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              {t('开始日期（可选）', 'From date (optional)')}
              <Input
                type="date"
                value={fromDate}
                disabled={busy}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setSources([]);
                  setRequestId(createTeacherRequestId());
                }}
              />
            </label>
            <label className="grid gap-2 text-sm">
              {t('结束日期（可选）', 'To date (optional)')}
              <Input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                disabled={busy}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setSources([]);
                  setRequestId(createTeacherRequestId());
                }}
              />
            </label>
          </div>
          <p className="text-muted-foreground my-3 text-xs">
            {t(
              `已选 ${sources.length} / 10 条。仅使用当前学生的记录；未复核分析不参与。`,
              `${sources.length} / 10 selected. Only this student’s records are used; unreviewed analysis is excluded.`,
            )}
          </p>
          <div
            className="max-h-72 space-y-2 overflow-y-auto"
            aria-label={t('反馈来源', 'Feedback sources')}
          >
            {eligible.map((source) => (
              <label
                key={source.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-emerald-700"
                  checked={sources.includes(source.id)}
                  disabled={busy || (!sources.includes(source.id) && sources.length >= 10)}
                  onChange={(event) => {
                    setSources((current) =>
                      event.target.checked
                        ? [...current, source.id]
                        : current.filter((id) => id !== source.id),
                    );
                    setRequestId(createTeacherRequestId());
                  }}
                />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium">{source.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {source.date} · {source.subject} · {source.label}
                  </span>
                </span>
              </label>
            ))}
            {loaded && !eligible.length && (
              <p className="text-muted-foreground rounded-lg border border-dashed p-5 text-sm">
                {t(
                  '当前没有可选记录。请先登记课堂情况，或在作业与考试中保存并复核分析。',
                  'No eligible records. Add a lesson record or save and review an analysis first.',
                )}
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              disabled={busy || !sources.length || dirty}
              onClick={() =>
                void run(async (signal) => {
                  const result = await teacherRequest<{ feedback: TeacherFeedback }>(
                    `${lessonUrl(profileId)}/feedback`,
                    {
                      method: 'POST',
                      signal,
                      body: JSON.stringify({
                        requestId,
                        locale: locale.startsWith('zh') ? 'zh-CN' : 'en-US',
                        lessonRefs: lessons
                          .filter((lesson) => sources.includes(lesson.id))
                          .map((lesson) => ({ id: lesson.id, updatedAt: lesson.updatedAt })),
                        analysisRefs: analyses
                          .filter((analysis) => sources.includes(analysis.analysisId))
                          .map((analysis) => ({
                            id: analysis.analysisId,
                            updatedAt: analysis.updatedAt,
                          })),
                      }),
                    },
                  );
                  return result.feedback;
                }, accept)
              }
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {t('整理反馈草稿', 'Assemble feedback draft')}
            </Button>
          </div>
        </details>
      )}
      {feedback.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={t('反馈记录', 'Saved feedback')}>
          {feedback.map((record, index) => (
            <Button
              key={record.id}
              size="sm"
              variant={selected?.id === record.id ? 'secondary' : 'ghost'}
              aria-pressed={selected?.id === record.id}
              disabled={busy || dirty}
              onClick={() => setSelectedId(record.id)}
            >
              {new Date(record.createdAt).toLocaleDateString(locale)} · {index + 1} ·{' '}
              {record.status === 'reviewed'
                ? t('已确认', 'Reviewed')
                : record.status === 'withdrawn'
                  ? t('已撤回', 'Withdrawn')
                  : t('草稿', 'Draft')}
            </Button>
          ))}
        </div>
      )}
      {selected && (
        <FeedbackEditor
          key={`${selected.id}:${selected.updatedAt}`}
          feedback={selected}
          locale={locale}
          archived={archived}
          sourcesStale={selected.sources.some((source) =>
            source.kind === 'lesson'
              ? !lessons.some(
                  (lesson) =>
                    lesson.id === source.id &&
                    lesson.status === 'active' &&
                    lesson.updatedAt === source.updatedAt,
                )
              : !analyses.some(
                  (analysis) =>
                    analysis.analysisId === source.id &&
                    analysis.status === 'reviewed' &&
                    analysis.updatedAt === source.updatedAt,
                ),
          )}
          onSaved={accept}
          onDirty={setDirty}
        />
      )}
    </section>
  );
}

function FeedbackEditor({
  feedback,
  locale,
  archived,
  sourcesStale,
  onSaved,
  onDirty,
}: {
  feedback: TeacherFeedback;
  locale: string;
  archived: boolean;
  sourcesStale: boolean;
  onSaved: (value: TeacherFeedback) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const t = (zh: string, en: string) => lessonText(locale, zh, en);
  const [text, setText] = useState(feedback.text);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [history, setHistory] = useState<TeacherFeedback[] | null>(null);
  const { busy, error, run } = useLessonRequests(locale);
  const dirty = text.trim() !== feedback.text;
  const readOnly = archived || feedback.status === 'withdrawn';
  const url = `${lessonUrl(feedback.profileId)}/feedback/${encodeURIComponent(feedback.id)}`;
  useEffect(() => {
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, onDirty]);
  const save = (action: 'save_draft' | 'confirm_review' | 'withdraw') =>
    void run(async (signal) => {
      const result = await teacherRequest<{ feedback: TeacherFeedback }>(url, {
        method: 'PATCH',
        signal,
        body: JSON.stringify({ expectedUpdatedAt: feedback.updatedAt, action, text: text.trim() }),
      });
      if (result.feedback.profileId !== feedback.profileId) throw new Error('Unexpected student');
      return result.feedback;
    }, onSaved);
  return (
    <article className="space-y-4 rounded-xl border p-4 sm:p-5">
      {sourcesStale && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {t(
            '这份反馈引用的来源已修改、撤回或需要重新复核。请刷新来源，重新整理反馈后再确认、复制或下载。下方保留原来的历史快照。',
            'Evidence used by this feedback changed, was withdrawn or needs review. Refresh sources and assemble a new draft before confirming, copying or downloading. The historical snapshot remains below.',
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {feedback.status === 'reviewed'
            ? t('已确认的家长反馈', 'Reviewed parent feedback')
            : feedback.status === 'withdrawn'
              ? t('已撤回的反馈', 'Withdrawn feedback')
              : t('待修改和确认的草稿', 'Draft for editing and review')}
        </h4>
        <span className="text-muted-foreground text-xs">
          {t('依据记录整理', 'Assembled from evidence')} ·{' '}
          {new Date(feedback.updatedAt).toLocaleString(locale)}
        </span>
      </div>
      <label className="grid gap-2 text-sm">
        <span>{t('反馈内容', 'Feedback text')}</span>
        <Textarea
          rows={18}
          className="min-h-80 leading-7"
          maxLength={280000}
          value={text}
          disabled={readOnly || busy}
          onChange={(event) => {
            setText(event.target.value);
            setCopied(false);
          }}
        />
      </label>
      <p className="text-muted-foreground text-xs">
        {t(
          '修改后需先保存，再确认内容。复制与下载使用已保存版本；确认不代表已经发送。',
          'Save edits before review. Copy and download use the saved version; review does not send a message.',
        )}
      </p>
      {(error || copyError) && (
        <p role="alert" className="text-destructive text-sm">
          {error || copyError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <>
            <Button
              size="sm"
              disabled={busy || !dirty || !text.trim()}
              onClick={() => save('save_draft')}
            >
              {t('保存修改', 'Save edits')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || dirty || sourcesStale || feedback.status !== 'draft'}
              onClick={() => save('confirm_review')}
            >
              <Check />
              {t('确认反馈内容', 'Confirm feedback')}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || dirty || sourcesStale || feedback.status === 'withdrawn'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(feedback.text);
              setCopied(true);
              setCopyError('');
            } catch {
              setCopyError(
                t(
                  '当前浏览器无法复制，请下载文本文件。',
                  'Clipboard unavailable. Download the text file instead.',
                ),
              );
            }
          }}
        >
          <Copy />
          {copied ? t('已复制', 'Copied') : t('复制文本', 'Copy text')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || dirty || sourcesStale || feedback.status === 'withdrawn'}
          onClick={() => downloadFeedback(feedback.text, feedback.createdAt.slice(0, 10))}
        >
          <Download />
          {t('下载文本', 'Download text')}
        </Button>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || dirty}
            onClick={() => save('withdraw')}
          >
            {t('撤回草稿', 'Withdraw')}
          </Button>
        )}
        {dirty && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setText(feedback.text)}>
            {t('恢复已保存内容', 'Restore saved text')}
          </Button>
        )}
      </div>
      <details className="rounded-lg bg-muted/30 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t(
            `来源快照 · ${feedback.sources.length} 条`,
            `Source snapshots · ${feedback.sources.length}`,
          )}
        </summary>
        <p className="text-muted-foreground my-3 text-xs leading-5">
          {t(
            '这里保留生成时的版本。若原记录已修改或撤回，请重新整理反馈；旧反馈不会自动更新。',
            'These are the versions used when this draft was assembled. Reassemble after source edits or withdrawal; saved feedback does not update automatically.',
          )}
        </p>
        {feedback.sources.map((source, index) => (
          <details key={source.id} className="mt-3 border-t pt-3">
            <summary className="cursor-pointer break-words text-sm">
              [{index + 1}] {source.date} · {source.subject} · {source.title}
            </summary>
            <p className="text-muted-foreground mt-2 break-all text-xs">
              {t('保存版本', 'Saved version')}: {source.updatedAt}
              <br />
              {source.id}
            </p>
            {source.evidence.map((item, evidenceIndex) => (
              <div key={evidenceIndex} className="mt-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{item.text}</p>
                <p className="text-muted-foreground text-xs">
                  {item.attribution === 'teacher_record'
                    ? t('老师记录', 'Teacher record')
                    : t('已复核的推测（inferred）', 'Reviewed inference (inferred)')}
                </p>
                {item.citations.map((citation, citationIndex) => (
                  <blockquote
                    key={citationIndex}
                    className="text-muted-foreground mt-1 border-l-2 pl-3 text-xs"
                  >
                    {citation.sourceId} / {citation.blockId}: {citation.quote}
                  </blockquote>
                ))}
              </div>
            ))}
          </details>
        ))}
      </details>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || dirty}
        onClick={() =>
          void run(
            (signal) => lessonHistory<TeacherFeedback>(url, feedback.profileId, signal),
            setHistory,
          )
        }
      >
        {t('查看修改记录', 'View revision history')}
      </Button>
      {history && (
        <div className="space-y-3 border-t pt-3">
          {history.map((version, index) => (
            <details key={version.updatedAt}>
              <summary className="cursor-pointer text-sm">
                {index + 1} · {new Date(version.updatedAt).toLocaleString(locale)} ·{' '}
                {version.status === 'reviewed'
                  ? t('已确认', 'Reviewed')
                  : version.status === 'withdrawn'
                    ? t('已撤回', 'Withdrawn')
                    : t('草稿', 'Draft')}
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 font-sans text-sm leading-6">
                {version.text}
              </pre>
            </details>
          ))}
        </div>
      )}
    </article>
  );
}
