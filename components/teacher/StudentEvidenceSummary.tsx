'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTeacherCopy } from '@/lib/i18n/teacher';
import { getTeacherAnalysisCopy } from '@/lib/i18n/teacher-analysis';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';
import { reviewedStudentTimeline } from '@/lib/teacher/insights';
import { teacherLocation } from '@/lib/teacher/workspace';
import { analysisCollectionUrl } from './analysis-ui';
import { teacherRequest } from './student-ui';

export function StudentEvidenceSummary({
  profileId,
  locale,
}: {
  profileId: string;
  locale: string;
}) {
  const copy = getTeacherCopy(locale);
  const analysisCopy = getTeacherAnalysisCopy(locale);
  const zh = locale.startsWith('zh');
  const [records, setRecords] = useState<TeacherAnalysis[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    teacherRequest<{ analyses: TeacherAnalysis[] }>(analysisCollectionUrl(profileId), {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.analyses.some((item) => item.profileId !== profileId))
          throw new Error('Unexpected student records');
        if (!controller.signal.aborted) {
          setRecords(response.analyses);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [profileId, revision]);
  const reviewed = reviewedStudentTimeline(records ?? [], profileId);
  const latest = reviewed[0];
  return (
    <section className="border-t py-6" aria-label={zh ? '学习记录摘要' : 'Learning record summary'}>
      {failed ? (
        <div>
          <p role="alert" className="text-destructive text-sm">
            {zh ? '学习记录暂时读取失败。' : 'Learning records could not be loaded.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw />
            {copy.retry}
          </Button>
        </div>
      ) : latest ? (
        <>
          <h3 className="text-sm font-semibold">
            {zh ? '最近一次复核的观察' : 'Latest reviewed observations'}
          </h3>
          <p className="text-muted-foreground mt-2 text-xs leading-6">
            {latest.request.workDate} · {latest.request.subject} · {latest.request.title}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {zh
              ? '以下为该次作答的分析推测，不代表长期掌握结论。'
              : 'Inferred findings from this work; these do not establish lasting mastery.'}
          </p>
          <ul className="mt-4 space-y-3">
            {latest.report.observations.slice(0, 4).map((item, index) => (
              <li key={index} className="border-l-2 border-[var(--teacher-accent)] pl-3">
                <p className="text-muted-foreground text-[11px]">
                  {analysisCopy.categories[item.category]}
                </p>
                <p className="mt-1 break-words text-sm leading-6 [overflow-wrap:anywhere]">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
          <Link
            href={teacherLocation('analyses', profileId)}
            className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--teacher-accent)]"
          >
            {zh ? '查看完整分析与原文依据' : 'Read the analysis and source evidence'}
            <ArrowRight className="size-3" />
          </Link>
        </>
      ) : (
        <>
          <h3 className="text-sm font-semibold">{copy.exploration}</h3>
          <div className="mt-4 border-l-2 border-emerald-600 pl-4 dark:border-emerald-400">
            <p className="text-sm">{copy.awaitingEvidence}</p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{copy.evidenceNeeded}</p>
          </div>
          {records && records.some((item) => item.status === 'draft') && (
            <Link
              href={teacherLocation('analyses', profileId)}
              className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--teacher-accent)]"
            >
              {zh ? '有分析草稿等待复核' : 'Analysis drafts await review'}
              <ArrowRight className="size-3" />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
