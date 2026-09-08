'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  Archive,
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardPenLine,
  Database,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  UsersRound,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useBrand } from '@/lib/brand/brand-context';
import { getTeacherCopy } from '@/lib/i18n/teacher';
import { getTeacherWorkspaceCopy } from '@/lib/i18n/teacher-workspace';
import type { TeacherStudent } from '@/lib/teacher/students';
import {
  parseTeacherLocation,
  teacherLocation,
  teacherViews,
  type TeacherView,
} from '@/lib/teacher/workspace';
import { cn } from '@/lib/utils';
import { StudentEditor } from './StudentEditor';
import { TeacherIdentityDialog } from './TeacherIdentityDialog';
import { StudentAnalyses } from './StudentAnalyses';
import { StudentLessons, ParentFeedback } from './StudentLessons';
import { TeacherOverview } from './TeacherOverview';
import { TeacherPreparation } from './TeacherPreparation';
import { TeacherInsights } from './TeacherInsights';
import { StudentProfilePanel, IconAction } from './StudentProfilePanel';
import {
  createStudentDraft,
  filterStudents,
  studentDraftPayload,
  teacherRequest,
  TeacherRequestError,
} from './student-ui';
import './teacher-workspace.css';
export { StudentProfilePanel } from './StudentProfilePanel';
const SettingsDialog = dynamic(
  () => import('@/components/settings').then((module) => module.SettingsDialog),
  { ssr: false },
);
const viewIcons = {
  overview: LayoutDashboard,
  preparation: BookOpen,
  students: UsersRound,
  lessons: ClipboardPenLine,
  analyses: FileSearch,
  insights: ChartNoAxesCombined,
  feedback: MessageSquareText,
};

export function TeacherWorkbench({
  configured,
  lessonPrepHref,
}: {
  configured: boolean;
  lessonPrepHref: string;
}) {
  const { locale } = useI18n();
  const copy = getTeacherCopy(locale);
  const workspaceCopy = getTeacherWorkspaceCopy(locale);
  const brand = useBrand();
  const [view, setView] = useState<TeacherView>('overview');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ student?: TeacherStudent } | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TeacherStudent | null>(null);
  const loadSequence = useRef(0);
  const visibleStudents = filterStudents(students, archived, search);
  const selected = selectedId
    ? visibleStudents.find((student) => student.profile.profileId === selectedId)
    : visibleStudents[0];

  useEffect(() => {
    const target = students.find((student) => student.profile.profileId === selectedId);
    if (target) setArchived(target.archived);
  }, [students, selectedId]);

  const refreshStudents = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      setLoadError('');
      try {
        const response = await teacherRequest<{ students: TeacherStudent[] }>(
          '/api/teacher/students',
          { signal },
        );
        if (sequence === loadSequence.current && !signal?.aborted) setStudents(response.students);
        return response.students;
      } catch (failure) {
        if (sequence === loadSequence.current && !signal?.aborted) setLoadError(copy.loadFailed);
        throw failure;
      } finally {
        if (sequence === loadSequence.current && !signal?.aborted) setLoading(false);
      }
    },
    [copy.loadFailed],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (configured) void refreshStudents(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [configured, refreshStudents]);

  function acceptStudent(student: TeacherStudent) {
    loadSequence.current++;
    setLoading(false);
    setStudents((current) => [
      student,
      ...current.filter((item) => item.profile.profileId !== student.profile.profileId),
    ]);
    setSelectedId(student.profile.profileId);
    setArchived(student.archived);
    setSearch('');
    setEditor(null);
    navigate('students', student.profile.profileId);
    setActionError('');
  }

  async function changeArchived(student: TeacherStudent) {
    setBusy(true);
    setActionError('');
    try {
      const response = await teacherRequest<{ student: TeacherStudent }>(
        `/api/teacher/students/${encodeURIComponent(student.profile.profileId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...studentDraftPayload(createStudentDraft(student)),
            archived: !student.archived,
            expectedUpdatedAt: student.profile.updatedAt,
          }),
        },
      );
      setStudents((current) =>
        current.map((item) =>
          item.profile.profileId === student.profile.profileId ? response.student : item,
        ),
      );
      setSelectedId(null);
      setArchiveTarget(null);
    } catch (failure) {
      setArchiveTarget(null);
      setActionError(
        failure instanceof TeacherRequestError && failure.status === 409
          ? copy.conflict
          : copy.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  function navigate(next: TeacherView, profileId?: string) {
    setView(next);
    if (profileId) {
      setSelectedId(profileId);
      setSearch('');
      setArchived(students.find((item) => item.profile.profileId === profileId)?.archived ?? false);
    }
    window.history.pushState(
      null,
      '',
      teacherLocation(next, profileId ?? selected?.profile.profileId),
    );
  }
  useEffect(() => {
    function readLocation() {
      const location = parseTeacherLocation(window.location.search);
      setView(location.view);
      setSelectedId(location.profileId);
      setSearch('');
      if (!location.profileId) setArchived(false);
    }
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, []);
  const studentMode = ['students', 'lessons', 'analyses', 'feedback'].includes(view);
  const selectedProps = selected
    ? {
        profileId: selected.profile.profileId,
        nickname: selected.profile.displayName.value ?? copy.unknown,
        locale,
        archived: selected.archived,
      }
    : null;

  return (
    <main className="teacher-workspace min-h-dvh min-w-0 lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="teacher-rail border-b lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <Link
          href="/teacher"
          onClick={(event) => {
            event.preventDefault();
            navigate('overview');
          }}
          className="flex items-center gap-3 px-5 py-6"
          aria-label={brand.productName}
        >
          <Image src={brand.markSrc} width={37} height={37} alt="" />
          <span>
            <span className="block text-lg font-semibold tracking-wide">{brand.productName}</span>
            <span className="text-muted-foreground mt-1 block text-[10px] tracking-[.18em]">
              {copy.title}
            </span>
          </span>
        </Link>
        <nav
          aria-label={copy.title}
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible"
        >
          {teacherViews.map((item, index) => {
            const Icon = viewIcons[item];
            return (
              <div key={item} className="shrink-0">
                {(index === 0 || index === 2) && (
                  <p className="text-muted-foreground hidden px-3 pb-2 pt-5 text-[10px] tracking-wider lg:block">
                    {index === 0 ? workspaceCopy.work : workspaceCopy.management}
                  </p>
                )}
                <button
                  type="button"
                  aria-current={view === item ? 'page' : undefined}
                  onClick={() => navigate(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] transition-colors',
                    view === item
                      ? 'teacher-nav-active font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {workspaceCopy.views[item]}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="hidden flex-1 lg:block" />
        <div className="hidden space-y-1 border-t p-3 lg:block">
          <Button
            asChild
            variant="ghost"
            className="w-full justify-start text-xs text-muted-foreground"
          >
            <Link href={lessonPrepHref}>
              <BookOpen />
              {workspaceCopy.workspace}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
            {workspaceCopy.settings}
          </Button>
          {configured && (
            <Button
              variant="ghost"
              className="w-full justify-start text-xs text-muted-foreground"
              onClick={() => setIdentityOpen(true)}
            >
              <KeyRound />
              {copy.identity}
            </Button>
          )}
        </div>
        <div className="hidden border-t px-6 py-4 text-[10px] text-muted-foreground lg:block">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-600" />
          {workspaceCopy.local}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b bg-background/70 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="text-muted-foreground">{copy.title}</span>
            <ChevronRight className="text-muted-foreground size-3" />
            <h1 className="font-medium">{workspaceCopy.views[view]}</h1>
          </div>
          <div className="flex items-center gap-1">
            <IconAction label={workspaceCopy.settings} onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </IconAction>
            {configured && (
              <>
                <IconAction label={copy.identity} onClick={() => setIdentityOpen(true)}>
                  <KeyRound />
                </IconAction>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || busy || Boolean(loadError)}
                  onClick={() => setEditor({})}
                >
                  <Plus />
                  {copy.addStudent}
                </Button>
              </>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] min-w-0 p-4 sm:p-6 xl:p-8">
          {!configured ? (
            <section className="teacher-card mx-auto max-w-3xl p-8 sm:p-12">
              <Database className="text-muted-foreground mb-5 size-8" />
              <h2 className="text-lg font-semibold">{copy.storageTitle}</h2>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                {copy.storageDescription}
              </p>
              <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                <RefreshCw />
                {copy.checkConfiguration}
              </Button>
            </section>
          ) : (
            <>
              {(loadError || actionError) && (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-background p-4">
                  <p role="alert" className="text-destructive min-w-0 flex-1 text-sm">
                    {loadError || actionError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => {
                      setActionError('');
                      void refreshStudents().catch(() => {});
                    }}
                  >
                    <RefreshCw />
                    {copy.retry}
                  </Button>
                </div>
              )}
              {view === 'overview' && (
                <TeacherOverview
                  students={students}
                  loading={loading}
                  locale={locale}
                  onNavigate={navigate}
                  onCreate={() => setEditor({})}
                />
              )}
              {view !== 'overview' && (
                <div className="mb-6">
                  <h2 className="text-xl font-semibold">{workspaceCopy.views[view]}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {workspaceCopy.viewHints[view]}
                  </p>
                </div>
              )}
              {view === 'preparation' && (
                <TeacherPreparation locale={locale} lessonPrepHref={lessonPrepHref} />
              )}
              {view === 'insights' && (
                <TeacherInsights
                  students={students}
                  locale={locale}
                  onOpenStudent={(id) => navigate('analyses', id)}
                />
              )}
              {studentMode && (
                <div className="grid min-w-0 gap-5 xl:grid-cols-[248px_minmax(0,1fr)]">
                  <aside
                    className="teacher-card min-w-0 self-start overflow-hidden"
                    aria-label={copy.students}
                  >
                    <div className="space-y-3 border-b p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">
                          {copy.students}
                          <span className="text-muted-foreground ml-2 font-normal">
                            {students.filter((item) => item.archived === archived).length}
                          </span>
                        </h3>
                        <IconAction
                          label={copy.refresh}
                          disabled={loading || busy}
                          onClick={() => void refreshStudents().catch(() => {})}
                        >
                          <RefreshCw className={loading ? 'animate-spin' : undefined} />
                        </IconAction>
                      </div>
                      <div
                        className="flex rounded-lg bg-muted p-1"
                        role="group"
                        aria-label={copy.students}
                      >
                        {[false, true].map((value) => (
                          <button
                            key={String(value)}
                            type="button"
                            aria-pressed={archived === value}
                            className={cn(
                              'min-h-8 flex-1 rounded-md text-xs',
                              archived === value
                                ? 'bg-background font-medium shadow-sm'
                                : 'text-muted-foreground',
                            )}
                            onClick={() => {
                              setArchived(value);
                              setSelectedId(null);
                            }}
                          >
                            {value ? copy.archived : copy.active}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
                        <Input
                          type="search"
                          aria-label={copy.search}
                          placeholder={copy.search}
                          value={search}
                          onChange={(event) => {
                            setSearch(event.target.value);
                            setSelectedId(null);
                          }}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    {loading && !students.length ? (
                      <p
                        role="status"
                        className="text-muted-foreground flex items-center gap-2 p-5 text-xs"
                      >
                        <LoaderCircle className="size-4 animate-spin" />
                        {copy.loading}
                      </p>
                    ) : visibleStudents.length ? (
                      <ul className="max-h-48 overflow-y-auto p-2 xl:max-h-[calc(100dvh-24rem)]">
                        {visibleStudents.map((student) => (
                          <li key={student.profile.profileId}>
                            <button
                              type="button"
                              aria-pressed={
                                selected?.profile.profileId === student.profile.profileId
                              }
                              className={cn(
                                'flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left',
                                selected?.profile.profileId === student.profile.profileId
                                  ? 'teacher-nav-active'
                                  : 'hover:bg-muted',
                              )}
                              onClick={() => navigate(view, student.profile.profileId)}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium">
                                {Array.from(student.profile.displayName.value || '?')[0]}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">
                                  {student.profile.displayName.value ?? copy.unknown}
                                </span>
                                <span className="text-muted-foreground mt-1 block text-[11px]">
                                  {student.profile.grade.value === null
                                    ? copy.unknown
                                    : copy.gradeValue(student.profile.grade.value)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-5">
                        <p className="text-muted-foreground text-xs">
                          {search ? copy.noResults : archived ? copy.noArchived : copy.empty}
                        </p>
                        {!search && !archived && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setEditor({})}
                          >
                            <Plus />
                            {copy.addStudent}
                          </Button>
                        )}
                      </div>
                    )}
                  </aside>
                  <section className="teacher-card min-w-0 overflow-hidden">
                    {selected && selectedProps ? (
                      <>
                        {view !== 'students' && (
                          <div className="flex min-w-0 flex-wrap items-center gap-3 border-b px-5 py-4 sm:px-7">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--teacher-soft)] text-[var(--teacher-accent)]">
                              <UserRound className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-muted-foreground text-[10px]">
                                {workspaceCopy.studentContext}
                              </p>
                              <h3 className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                                {selectedProps.nickname}
                              </h3>
                            </div>
                            <Button
                              className="ml-auto"
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate('students', selected.profile.profileId)}
                            >
                              {copy.profile}
                              <ChevronRight />
                            </Button>
                          </div>
                        )}
                        {selected.archived && (
                          <p className="border-b bg-amber-50/50 px-5 py-3 text-xs leading-6 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                            {workspaceCopy.archiveNote}
                          </p>
                        )}
                        {view === 'students' ? (
                          <>
                            <StudentProfilePanel
                              student={selected}
                              copy={copy}
                              locale={locale}
                              busy={busy || loading || Boolean(loadError)}
                              onEdit={() => setEditor({ student: selected })}
                              onArchive={() =>
                                selected.archived
                                  ? void changeArchived(selected)
                                  : setArchiveTarget(selected)
                              }
                            />
                            <nav
                              className="flex flex-wrap gap-2 border-t p-5 sm:px-7"
                              aria-label={workspaceCopy.profileActions}
                            >
                              {(['lessons', 'analyses', 'feedback'] as const).map((item) => (
                                <Button
                                  key={item}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(item, selected.profile.profileId)}
                                >
                                  {workspaceCopy.views[item]}
                                  <ChevronRight />
                                </Button>
                              ))}
                            </nav>
                          </>
                        ) : (
                          <div className="min-w-0 px-4 py-2 sm:px-7">
                            {view === 'lessons' && (
                              <StudentLessons key={selectedProps.profileId} {...selectedProps} />
                            )}
                            {view === 'analyses' && (
                              <StudentAnalyses key={selectedProps.profileId} {...selectedProps} />
                            )}
                            {view === 'feedback' && (
                              <ParentFeedback key={selectedProps.profileId} {...selectedProps} />
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-6 text-center">
                        <UsersRound className="text-muted-foreground/50 size-10" />
                        <p className="text-muted-foreground text-sm">{workspaceCopy.noSelection}</p>
                        <Button variant="outline" onClick={() => setEditor({})}>
                          <Plus />
                          {copy.addStudent}
                        </Button>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {editor && (
        <StudentEditor
          copy={copy}
          student={editor.student}
          onClose={() => setEditor(null)}
          onSaved={acceptStudent}
          refreshStudents={refreshStudents}
        />
      )}
      {identityOpen && <TeacherIdentityDialog copy={copy} onClose={() => setIdentityOpen(false)} />}
      {archiveTarget && (
        <Dialog open onOpenChange={(open) => !open && !busy && setArchiveTarget(null)}>
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-md rounded-lg"
            showCloseButton={!busy}
          >
            <DialogHeader className="pr-8">
              <DialogTitle>{copy.archiveTitle}</DialogTitle>
              <DialogDescription>{copy.archiveDescription}</DialogDescription>
            </DialogHeader>
            <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
              {archiveTarget.profile.displayName.value}
            </p>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setArchiveTarget(null)}>
                {copy.cancel}
              </Button>
              <Button disabled={busy} onClick={() => void changeArchived(archiveTarget)}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Archive />}
                {copy.archive}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {settingsOpen && (
        <SettingsDialog open initialSection="providers" onOpenChange={setSettingsOpen} />
      )}
    </main>
  );
}
