'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BookOpen, FolderOpen, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AttachButton, useComposerMaterials } from '@/components/workbench/compose-extras';
import { createWorkbenchSession, type WorkbenchMaterial } from '@/lib/workbench/session-store';
import { MAX_COMPOSER_MATERIALS } from '@/lib/workbench/material-upload-scheduling';
import {
  buildTeacherPreparationPrompt,
  teacherPreparationError,
  teacherPreparationSessionHref,
  type TeacherPreparationRole,
} from '@/lib/workbench/teacher-preparation';
import { getTeacherPreparationCopy } from '@/lib/i18n/teacher-preparation';
import { teacherRequest } from './student-ui';

interface LibraryMaterial {
  materialId: string;
  originalName?: string;
  bytes: number;
  mime?: string;
}

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border px-2 text-sm focus-visible:ring-2 disabled:opacity-50';

export function TeacherPreparation({
  locale,
  lessonPrepHref,
}: {
  locale: string;
  lessonPrepHref: string;
}) {
  const copy = getTeacherPreparationCopy(locale);
  const router = useRouter();
  const uploads = useComposerMaterials();
  const [topic, setTopic] = useState('');
  const [objectives, setObjectives] = useState('');
  const [requirements, setRequirements] = useState('');
  const [roles, setRoles] = useState<Record<string, TeacherPreparationRole>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [selectedLibrary, setSelectedLibrary] = useState<WorkbenchMaterial[]>([]);
  const [library, setLibrary] = useState<LibraryMaterial[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const startingRef = useRef(false);
  const libraryController = useRef<AbortController | null>(null);
  const selected = [...selectedLibrary, ...uploads.materials].filter(
    (material, index, all) =>
      all.findIndex((item) => item.materialId === material.materialId) === index,
  );
  const configured = lessonPrepHref.startsWith('/workspace');
  const available = library.filter(
    (material) => !selected.some((item) => item.materialId === material.materialId),
  );
  const full = selected.length + uploads.uploading.length >= MAX_COMPOSER_MATERIALS;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      libraryController.current?.abort();
    };
  }, []);

  async function loadLibrary() {
    libraryController.current?.abort();
    const controller = new AbortController();
    libraryController.current = controller;
    setLibraryOpen(true);
    setLibraryLoading(true);
    setLibraryFailed(false);
    try {
      const response = await teacherRequest<{ materials: LibraryMaterial[] }>(
        '/api/materials?scope=owner',
        { signal: controller.signal },
      );
      if (alive.current && !controller.signal.aborted) setLibrary(response.materials);
    } catch {
      if (alive.current && !controller.signal.aborted) setLibraryFailed(true);
    } finally {
      if (alive.current && !controller.signal.aborted) setLibraryLoading(false);
    }
  }

  function addFiles(files: FileList | File[]) {
    if (startingRef.current) return;
    if (selected.length + uploads.uploading.length + files.length > MAX_COMPOSER_MATERIALS) {
      setError(copy.tooManySources);
      return;
    }
    setError('');
    uploads.addFiles(files);
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (startingRef.current || uploads.busy || uploads.failed.length || !configured) return;
    const brief = {
      topic,
      objectives,
      requirements,
      sources: selected.map((material) => ({
        material,
        role: roles[material.materialId],
        location: locations[material.materialId] ?? '',
      })),
    };
    const issue = teacherPreparationError(brief);
    if (issue) {
      setError(copy[issue]);
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setError('');
    try {
      const session = await createWorkbenchSession({
        prompt: buildTeacherPreparationPrompt(brief, locale),
        materials: selected,
      });
      if (alive.current) router.push(teacherPreparationSessionHref(session.id));
    } catch {
      if (alive.current) {
        setError(copy.createFailed);
        startingRef.current = false;
        setStarting(false);
      }
    }
  }

  return (
    <section data-testid="teacher-preparation" className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-muted-foreground text-sm leading-6">{copy.description}</p>
        </div>
        <Button variant="outline" asChild className="max-w-full whitespace-normal text-left">
          <Link href={lessonPrepHref}>
            {copy.continue}
            <ArrowUpRight className="ml-2 size-4 shrink-0" />
          </Link>
        </Button>
      </div>

      <form
        onSubmit={(event) => void start(event)}
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
      >
        <div className="min-w-0 space-y-6 rounded-2xl border bg-card p-4 sm:p-6">
          <fieldset disabled={starting} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teacher-prep-topic">{copy.topic}</Label>
              <Input
                id="teacher-prep-topic"
                value={topic}
                maxLength={200}
                placeholder={copy.topicPlaceholder}
                onChange={(event) => setTopic(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-prep-objectives">{copy.objectives}</Label>
              <Textarea
                id="teacher-prep-objectives"
                rows={3}
                maxLength={2000}
                value={objectives}
                placeholder={copy.objectivesPlaceholder}
                onChange={(event) => setObjectives(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-prep-requirements">{copy.requirements}</Label>
              <Textarea
                id="teacher-prep-requirements"
                rows={4}
                maxLength={3000}
                value={requirements}
                placeholder={copy.requirementsPlaceholder}
                onChange={(event) => setRequirements(event.target.value)}
              />
            </div>
          </fieldset>

          <section className="min-w-0 space-y-3 border-t pt-5" aria-label={copy.sources}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {copy.sources}{' '}
                <span className="text-muted-foreground font-normal">
                  {selected.length} / {MAX_COMPOSER_MATERIALS}
                </span>
              </h3>
              <div className="flex items-center gap-1">
                <AttachButton
                  onFiles={addFiles}
                  disabled={starting || full}
                  label={copy.upload}
                  testId="teacher-prep-upload"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={starting || full}
                  onClick={() => void loadLibrary()}
                >
                  <FolderOpen className="mr-1 size-4" />
                  {copy.library}
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-5">{copy.sourcesHint}</p>
            {!selected.length && !uploads.busy && (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                {copy.noSources}
              </p>
            )}
            <ul className="min-w-0 space-y-3">
              {selected.map((material) => (
                <li key={material.materialId} className="min-w-0 space-y-3 rounded-xl border p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {material.name}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      aria-label={`${copy.remove}: ${material.name}`}
                      disabled={starting}
                      onClick={() => {
                        uploads.remove(material.materialId);
                        setSelectedLibrary((current) =>
                          current.filter((item) => item.materialId !== material.materialId),
                        );
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <select
                      className={selectClass}
                      aria-label={`${copy.role}: ${material.name}`}
                      disabled={starting}
                      value={roles[material.materialId] ?? ''}
                      onChange={(event) =>
                        setRoles((current) => ({
                          ...current,
                          [material.materialId]: event.target.value as TeacherPreparationRole,
                        }))
                      }
                    >
                      <option value="">{copy.chooseRole}</option>
                      {Object.entries(copy.roles).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={`${copy.location}: ${material.name}`}
                      disabled={starting}
                      maxLength={300}
                      value={locations[material.materialId] ?? ''}
                      placeholder={copy.locationPlaceholder}
                      onChange={(event) =>
                        setLocations((current) => ({
                          ...current,
                          [material.materialId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                </li>
              ))}
              {uploads.uploading.map((entry) => (
                <li key={entry.id} role="status" className="flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 shrink-0 animate-spin" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {entry.name}: {copy.uploading}
                  </span>
                </li>
              ))}
              {uploads.failed.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-destructive min-w-0 break-words [overflow-wrap:anywhere]">
                    {entry.name}: {copy.uploadFailed}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`${copy.remove}: ${entry.name}`}
                    onClick={() => uploads.removeFailed(entry.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {!!selected.length && (
              <p className="text-muted-foreground text-xs">{copy.locationHint}</p>
            )}
            {libraryOpen && (
              <div className="min-w-0 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{copy.library}</h4>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={copy.close}
                    onClick={() => setLibraryOpen(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {libraryLoading ? (
                  <p role="status" className="py-3 text-sm text-muted-foreground">
                    {copy.libraryLoading}
                  </p>
                ) : libraryFailed ? (
                  <p role="alert" className="py-3 text-sm text-destructive">
                    {copy.libraryFailed}
                  </p>
                ) : available.length ? (
                  <ul className="max-h-52 min-w-0 divide-y overflow-y-auto">
                    {available.map((material) => (
                      <li key={material.materialId}>
                        <button
                          type="button"
                          className="hover:bg-muted w-full min-w-0 break-words p-3 text-left text-sm disabled:opacity-50 [overflow-wrap:anywhere]"
                          disabled={starting || full}
                          onClick={() =>
                            setSelectedLibrary((current) =>
                              current.some((item) => item.materialId === material.materialId)
                                ? current
                                : [
                                    ...current,
                                    {
                                      materialId: material.materialId,
                                      name: material.originalName ?? material.materialId,
                                      bytes: material.bytes,
                                      mimeType: material.mime,
                                    },
                                  ],
                            )
                          }
                        >
                          {material.originalName ?? material.materialId}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">{copy.libraryEmpty}</p>
                )}
              </div>
            )}
          </section>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!configured && (
            <p role="alert" className="text-sm text-muted-foreground">
              {copy.unavailable}
            </p>
          )}
          <Button
            type="submit"
            disabled={starting || uploads.busy || !!uploads.failed.length || !configured}
            className="w-full sm:w-auto"
            data-testid="teacher-prep-start"
          >
            {starting ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {starting ? copy.starting : copy.start}
          </Button>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl bg-teal-50 p-5 dark:bg-teal-950/40">
            <BookOpen className="mb-3 size-6 text-teal-700 dark:text-teal-300" />
            <h3 className="text-sm font-semibold">{copy.outlineFirst}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.workflow}</p>
          </div>
          <p className="px-1 text-xs leading-6 text-muted-foreground">{copy.provenance}</p>
          <p className="px-1 text-xs leading-6 text-muted-foreground">{copy.privacy}</p>
        </aside>
      </form>
    </section>
  );
}
