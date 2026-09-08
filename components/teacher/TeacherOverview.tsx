'use client';

import {
  ArrowRight,
  BookOpen,
  ClipboardPenLine,
  FileSearch,
  MessageSquareText,
  Plus,
  Sprout,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTeacherWorkspaceCopy } from '@/lib/i18n/teacher-workspace';
import { getTeacherCopy } from '@/lib/i18n/teacher';
import type { TeacherStudent } from '@/lib/teacher/students';
import type { TeacherView } from '@/lib/teacher/workspace';

export function TeacherOverview({
  students,
  loading,
  locale,
  onNavigate,
  onCreate,
}: {
  students: TeacherStudent[];
  loading: boolean;
  locale: string;
  onNavigate: (view: TeacherView, profileId?: string) => void;
  onCreate: () => void;
}) {
  const copy = getTeacherWorkspaceCopy(locale);
  const studentCopy = getTeacherCopy(locale);
  const active = students.filter((item) => !item.archived);
  const recent = [...active]
    .sort((a, b) => b.profile.updatedAt.localeCompare(a.profile.updatedAt))
    .slice(0, 4);
  const actions = [
    {
      view: 'preparation',
      icon: BookOpen,
      description: copy.prepDescription,
      color: 'text-teal-700 bg-teal-50 dark:bg-teal-950 dark:text-teal-300',
    },
    {
      view: 'lessons',
      icon: ClipboardPenLine,
      description: copy.lessonDescription,
      color: 'text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300',
    },
    {
      view: 'analyses',
      icon: FileSearch,
      description: copy.analysisDescription,
      color: 'text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300',
    },
    {
      view: 'feedback',
      icon: MessageSquareText,
      description: copy.feedbackDescription,
      color: 'text-rose-700 bg-rose-50 dark:bg-rose-950 dark:text-rose-300',
    },
  ] as const;
  return (
    <div className="space-y-8">
      <section className="teacher-hero relative flex min-w-0 overflow-hidden rounded-2xl border border-emerald-900/5 px-6 py-9 sm:px-9 lg:py-11">
        <div className="relative z-10 min-w-0 max-w-2xl">
          <p className="mb-5 text-xs font-medium tracking-[.16em] text-[var(--teacher-accent)]">
            {copy.eyebrow}
          </p>
          <h2 className="text-2xl leading-snug font-semibold tracking-tight sm:text-3xl lg:text-[36px]">
            {copy.hero}
            <br />
            <span className="text-[var(--teacher-accent)]">{copy.heroAccent}</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-lg text-sm leading-7">{copy.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => onNavigate('preparation')}>
              <BookOpen />
              {copy.start}
              <ArrowRight />
            </Button>
            <Button
              variant="outline"
              className="bg-background/70"
              onClick={() => onNavigate('lessons')}
            >
              <ClipboardPenLine />
              {copy.register}
            </Button>
          </div>
        </div>
        <div
          className="teacher-hero-art pointer-events-none absolute -right-8 top-0 hidden h-full w-72 items-center justify-center xl:flex"
          aria-hidden="true"
        >
          <svg viewBox="0 0 220 220" className="size-52 rotate-6" fill="none">
            <path
              d="M109 176c-25-21-51-28-80-24V65c30-4 57 5 80 22 24-17 50-26 81-22v87c-30-4-56 3-81 24Z"
              fill="#fffdf7"
              stroke="#176b60"
              strokeWidth="3"
            />
            <path
              d="M109 88v88M46 91c17 0 33 5 46 14M46 111c17 0 33 5 46 14M127 105c14-9 29-14 45-14M127 125c14-9 29-14 45-14"
              stroke="#176b60"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M105 68c-18-1-28-12-30-27 19-2 32 6 34 24m1-9c2-18 14-30 32-32 2 19-11 32-31 35"
              fill="#176b60"
            />
          </svg>
        </div>
      </section>
      <section aria-label={copy.flowTitle}>
        <div className="mb-4">
          <h2 className="text-base font-semibold">{copy.flowTitle}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{copy.flowHint}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map(({ view, icon: Icon, description, color }, i) => (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              className="teacher-card teacher-action group min-w-0 p-5 text-left"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className={`flex size-10 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="size-5" />
                </span>
                <span className="text-muted-foreground/50 text-xs tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="flex items-center justify-between gap-2 text-sm font-semibold">
                {copy.views[view]}
                <ArrowRight className="text-muted-foreground size-4" />
              </h3>
              <p className="text-muted-foreground mt-2 text-xs leading-6">{description}</p>
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="teacher-card min-w-0 p-5 sm:p-6" aria-label={copy.recent}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{copy.recent}</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('students')}>
              {copy.all}
              <ArrowRight />
            </Button>
          </div>
          {loading ? (
            <p role="status" className="text-muted-foreground text-sm">
              {studentCopy.loading}
            </p>
          ) : recent.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map(({ profile }) => (
                <button
                  key={profile.profileId}
                  type="button"
                  className="teacher-action flex min-w-0 items-center gap-3 rounded-xl border p-4 text-left"
                  onClick={() => onNavigate('students', profile.profileId)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--teacher-soft)] text-sm font-semibold text-[var(--teacher-accent)]">
                    {Array.from(profile.displayName.value || '?')[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {profile.displayName.value}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {profile.grade.value === null
                        ? studentCopy.unknown
                        : studentCopy.gradeValue(profile.grade.value)}
                    </span>
                  </span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <UsersRound className="text-muted-foreground mx-auto mb-3 size-7" />
              <h3 className="text-sm font-medium">{copy.firstTitle}</h3>
              <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-6">
                {copy.firstDescription}
              </p>
              <Button className="mt-4" variant="outline" onClick={onCreate}>
                <Plus />
                {studentCopy.addStudent}
              </Button>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="teacher-card grid grid-cols-2 divide-x p-5">
            {[
              { count: active.length, label: copy.activeCount },
              { count: students.length - active.length, label: copy.archivedCount },
            ].map(({ count, label }) => (
              <div key={label} className="px-2">
                <div className="text-muted-foreground text-xs">{label}</div>
                <div className="mt-3 text-2xl font-semibold tabular-nums">
                  {loading ? '—' : count}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    {copy.countUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-[var(--teacher-soft)] p-5">
            <Sprout className="mb-3 size-5 text-[var(--teacher-accent)]" />
            <h3 className="text-sm font-medium">{copy.guideTitle}</h3>
            <p className="text-muted-foreground mt-2 text-xs leading-6">{copy.guideDescription}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
