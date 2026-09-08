'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChartNoAxesCombined, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { teacherRequest } from './student-ui';
import { analysisCollectionUrl } from './analysis-ui';
import { getTeacherAnalysisCopy } from '@/lib/i18n/teacher-analysis';
import { compareReviewedPapers, reviewedStudentTimeline } from '@/lib/teacher/insights';
import type { TeacherStudent } from '@/lib/teacher/students';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';

const zh = {
  choose: '选择要查看的学生（最多 4 位）',
  load: '读取所选记录',
  loading: '正在读取记录…',
  empty: '先选学生，再读取已复核的记录。',
  failed: '部分记录未能读取，本次未展示对照结果。请重新读取。',
  timeline: '个人记录回顾',
  same: '同卷对照',
  noTimeline: '这段时间内还没有已复核的分析。',
  noSame: '尚无可对照的同卷记录。至少两位学生需要已复核的考试分析，并附上相同的题目试卷文件。',
  range: '记录日期',
  from: '开始日期',
  to: '结束日期',
  dateError: '结束日期不能早于开始日期。',
  subject: '学科筛选',
  subjectPlaceholder: '全部学科',
  sources: '查看原文依据',
  open: '打开学生分析',
  review: '已复核 · 分析仍为推测',
  note: '按实际记录回看，不据此推断分数或掌握程度。同卷对照取每位学生最近一次已复核记录，日期和评分依据仍需核对。',
  original: '原文',
  newest: '每位学生最近一次记录',
  all: '全部日期',
  archived: '已归档',
  noStudents: '先建立学生档案，再积累作业或考试记录。',
  limit: '最多选择 4 位学生。',
  unsupported: '这项观察的原文依据不可用，请打开分析核对。',
};
const en: typeof zh = {
  choose: 'Choose students (up to 4)',
  load: 'Load selected records',
  loading: 'Loading records…',
  empty: 'Choose students, then load their reviewed records.',
  failed: 'Some records could not be loaded. Comparison is withheld. Please retry.',
  timeline: 'Individual history',
  same: 'Same-paper comparison',
  noTimeline: 'No reviewed analyses in this period.',
  noSame:
    'No matching papers yet. At least two students need reviewed exam analyses with the same question-paper files attached.',
  range: 'Record dates',
  from: 'From',
  to: 'To',
  dateError: 'End date cannot precede start date.',
  subject: 'Subject filter',
  subjectPlaceholder: 'All subjects',
  sources: 'Read source evidence',
  open: 'Open student analyses',
  review: 'Reviewed · findings remain inferred',
  note: 'Review recorded observations without inferring scores or mastery. Same-paper comparisons use each student’s latest reviewed record; check dates and marking references.',
  original: 'Source text',
  newest: 'Latest record per student',
  all: 'All dates',
  archived: 'Archived',
  noStudents: 'Create student profiles and add homework or exam records first.',
  limit: 'Choose up to 4 students.',
  unsupported: 'The source for this observation is unavailable. Open the analysis to review it.',
};

function InsightRecord({
  analysis,
  nickname,
  locale,
  onOpen,
}: {
  analysis: TeacherAnalysis;
  nickname: string;
  locale: string;
  onOpen: () => void;
}) {
  const copy = locale.startsWith('zh') ? zh : en;
  const analysisCopy = getTeacherAnalysisCopy(locale);
  return (
    <article className="min-w-0 rounded-xl border bg-background p-4">
      <p className="text-xs font-medium text-[var(--teacher-accent)]">{nickname}</p>
      <h4 className="mt-2 break-words text-sm font-semibold [overflow-wrap:anywhere]">
        {analysis.request.title}
      </h4>
      <p className="text-muted-foreground mt-1 text-xs leading-5">
        {analysis.request.workDate} · {analysis.request.subject} ·{' '}
        {analysisCopy.workKinds[analysis.request.workKind]}
      </p>
      <p className="text-muted-foreground mt-2 text-[10px]">{copy.review}</p>
      <div className="mt-4 space-y-4">
        {analysis.report.observations.map((observation, index) => (
          <div key={index}>
            <p className="text-muted-foreground text-[11px]">
              {analysisCopy.categories[observation.category]}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 [overflow-wrap:anywhere]">
              {observation.text}
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-[var(--teacher-accent)]">
                {copy.sources}
              </summary>
              <div className="mt-2 space-y-2">
                {observation.citations.map((citation, i) => {
                  const source = analysis.sources.find(
                    (source) => source.sourceId === citation.sourceId,
                  );
                  const block = source?.blocks.find((block) => block.blockId === citation.blockId);
                  return (
                    <blockquote
                      key={i}
                      className="break-words border-l-2 pl-3 text-xs leading-6 [overflow-wrap:anywhere]"
                    >
                      {block?.text.includes(citation.quote) ? (
                        <>
                          <p className="text-muted-foreground">
                            {source!.name}
                            {block.pageNumber ? ` · ${analysisCopy.page} ${block.pageNumber}` : ''}
                          </p>
                          <p>{citation.quote}</p>
                        </>
                      ) : (
                        copy.unsupported
                      )}
                    </blockquote>
                  );
                })}
              </div>
            </details>
          </div>
        ))}
      </div>
      {analysis.report.recommendations.length > 0 && (
        <div className="mt-4 rounded-lg bg-[var(--teacher-soft)] p-3">
          <p className="text-xs font-medium">{analysisCopy.recommendations}</p>
          <ul className="mt-2 space-y-2">
            {analysis.report.recommendations.map((item, i) => (
              <li
                key={i}
                className="whitespace-pre-wrap break-words text-xs leading-6 [overflow-wrap:anywhere]"
              >
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="text-muted-foreground mt-4 space-y-1 text-[11px] leading-5">
        {analysis.report.limitations.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <Button className="mt-3" variant="ghost" size="sm" onClick={onOpen}>
        {copy.open}
        <ArrowRight />
      </Button>
    </article>
  );
}

export function TeacherInsights({
  students,
  locale,
  onOpenStudent,
}: {
  students: TeacherStudent[];
  locale: string;
  onOpenStudent: (profileId: string) => void;
}) {
  const copy = locale.startsWith('zh') ? zh : en;
  const [selected, setSelected] = useState<string[]>([]);
  const [records, setRecords] = useState<TeacherAnalysis[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'timeline' | 'same'>('timeline');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidDates = Boolean(from && to && from > to);
  const filtered = (records ?? []).filter(
    (item) =>
      (!from || item.request.workDate >= from) &&
      (!to || item.request.workDate <= to) &&
      (!subject.trim() ||
        item.request.subject.toLowerCase().includes(subject.trim().toLowerCase())),
  );
  const groups = compareReviewedPapers(filtered, selected);
  const name = (id: string) =>
    students.find((student) => student.profile.profileId === id)?.profile.displayName.value ?? '';
  async function load() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    setRecords(null);
    const result = await Promise.allSettled(
      selected.map(async (id) => {
        const response = await teacherRequest<{ analyses: TeacherAnalysis[] }>(
          analysisCollectionUrl(id),
          { signal: current.signal },
        );
        if (response.analyses.some((item) => item.profileId !== id))
          throw new Error('Unexpected student records');
        return response.analyses;
      }),
    );
    if (current.signal.aborted) return;
    if (result.some((item) => item.status === 'rejected')) setError(copy.failed);
    else setRecords(result.flatMap((item) => (item.status === 'fulfilled' ? item.value : [])));
    setBusy(false);
  }
  function toggle(id: string) {
    if (!selected.includes(id) && selected.length >= 4) return;
    controller.current?.abort();
    setBusy(false);
    setRecords(null);
    setError('');
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }
  return (
    <div className="space-y-5">
      <section className="teacher-card p-5 sm:p-6">
        <fieldset>
          <legend className="text-sm font-medium">{copy.choose}</legend>
          <div className="mt-4 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {students.map((student) => (
              <label
                key={student.profile.profileId}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--teacher-accent)]"
                  checked={selected.includes(student.profile.profileId)}
                  disabled={!selected.includes(student.profile.profileId) && selected.length >= 4}
                  onChange={() => toggle(student.profile.profileId)}
                />
                <span className="break-words [overflow-wrap:anywhere]">
                  {student.profile.displayName.value}
                  {student.archived ? ` · ${copy.archived}` : ''}
                </span>
              </label>
            ))}
          </div>
          {!students.length && (
            <p className="text-muted-foreground mt-4 text-sm">{copy.noStudents}</p>
          )}
        </fieldset>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-xs">
            <span>{copy.from}</span>
            <Input
              aria-label={copy.from}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-xs">
            <span>{copy.to}</span>
            <Input
              aria-label={copy.to}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-xs">
            <span>{copy.subject}</span>
            <Input
              aria-label={copy.subject}
              placeholder={copy.subjectPlaceholder}
              value={subject}
              maxLength={40}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
        </div>
        {invalidDates && (
          <p role="alert" className="text-destructive mt-3 text-xs">
            {copy.dateError}
          </p>
        )}
        <Button
          className="mt-4"
          disabled={busy || !selected.length || invalidDates}
          onClick={() => void load()}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {busy ? copy.loading : copy.load}
        </Button>
      </section>
      <p className="text-muted-foreground text-xs leading-6">{copy.note}</p>
      <div className="flex gap-2" role="group" aria-label={copy.range}>
        {(['timeline', 'same'] as const).map((value) => (
          <Button
            key={value}
            variant={value === mode ? 'default' : 'outline'}
            size="sm"
            aria-pressed={value === mode}
            onClick={() => setMode(value)}
          >
            {copy[value]}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {!records && !error && !busy && (
        <div className="teacher-card p-10 text-center">
          <ChartNoAxesCombined className="text-muted-foreground/50 mx-auto mb-4 size-9" />
          <p className="text-muted-foreground text-sm">{copy.empty}</p>
        </div>
      )}
      {records &&
        !invalidDates &&
        mode === 'timeline' &&
        selected.map((id) => {
          const timeline = reviewedStudentTimeline(filtered, id);
          return (
            <section key={id} className="space-y-3">
              <h3 className="break-words text-sm font-semibold">{name(id)}</h3>
              {timeline.length ? (
                <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {timeline.map((analysis) => (
                    <InsightRecord
                      key={analysis.analysisId}
                      analysis={analysis}
                      nickname={name(id)}
                      locale={locale}
                      onOpen={() => onOpenStudent(id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">{copy.noTimeline}</p>
              )}
            </section>
          );
        })}
      {records &&
        !invalidDates &&
        mode === 'same' &&
        (groups.length ? (
          groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div>
                <h3 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                  {group.name}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {group.subject} · {copy.newest}
                </p>
              </div>
              <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                {group.analyses.map((analysis) => (
                  <InsightRecord
                    key={analysis.analysisId}
                    analysis={analysis}
                    nickname={name(analysis.profileId)}
                    locale={locale}
                    onOpen={() => onOpenStudent(analysis.profileId)}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="teacher-card text-muted-foreground p-6 text-sm leading-7">{copy.noSame}</p>
        ))}
    </div>
  );
}
