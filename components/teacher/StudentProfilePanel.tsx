'use client';
import type { ReactNode } from 'react';
import { Archive, ArchiveRestore, FilePenLine, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TeacherCopy } from '@/lib/i18n/teacher';
import type { TeacherStudent } from '@/lib/teacher/students';
import type { ObservedField } from '@/lib/zhongkao/observed-field';
import { cn } from '@/lib/utils';
import { StudentEvidenceSummary } from './StudentEvidenceSummary';
export function IconAction({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProfileField<T>({
  label,
  field,
  copy,
  format = String,
}: {
  label: string;
  field: ObservedField<T>;
  copy: TeacherCopy;
  format?: (value: T) => string;
}) {
  return (
    <div className="min-w-0 py-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="break-words [overflow-wrap:anywhere]">
          {field.value === null ? copy.unknown : format(field.value)}
        </span>
        {field.status !== 'unknown' && (
          <span
            className={cn(
              'text-xs',
              field.status === 'inferred'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground',
            )}
          >
            {copy[field.status]}
          </span>
        )}
      </dd>
    </div>
  );
}

export function StudentProfilePanel({
  student,
  copy,
  locale,
  onEdit,
  onArchive,
  busy,
}: {
  student: TeacherStudent;
  copy: TeacherCopy;
  locale: string;
  onEdit: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const { profile } = student;
  const textbooks = Object.entries(profile.textbookVersions);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <article className="min-w-0 px-4 py-6 sm:px-7 lg:px-9" aria-label={copy.profile}>
      <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-2 text-xs">{copy.profile}</p>
          <h2 className="break-words text-xl font-semibold [overflow-wrap:anywhere]">
            {profile.displayName.value ?? copy.unknown}
          </h2>
          <p className="text-muted-foreground mt-2 text-xs">
            {student.archived ? copy.archived : copy.active}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconAction label={copy.editStudent} onClick={onEdit} disabled={busy}>
            <FilePenLine />
          </IconAction>
          <IconAction
            label={student.archived ? copy.restore : copy.archive}
            onClick={onArchive}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : student.archived ? (
              <ArchiveRestore />
            ) : (
              <Archive />
            )}
          </IconAction>
        </div>
      </div>
      <section className="py-6" aria-label={copy.basicInfo}>
        <h3 className="text-sm font-semibold">{copy.basicInfo}</h3>
        <dl className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:gap-x-8">
          <ProfileField
            label={copy.grade}
            field={profile.grade}
            copy={copy}
            format={copy.gradeValue}
          />
          <ProfileField label={copy.examYear} field={profile.examYear} copy={copy} />
          <ProfileField label={copy.region} field={profile.region} copy={copy} />
        </dl>
      </section>
      <section className="border-t py-6" aria-label={copy.textbooks}>
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-sm font-semibold">{copy.textbooks}</h3>
          {!textbooks.some(([, value]) => value.status === 'confirmed') && (
            <span className="text-muted-foreground text-xs">{copy.generic}</span>
          )}
        </div>
        {textbooks.length ? (
          <dl className="divide-y">
            {textbooks.map(([subject, field]) => (
              <ProfileField
                key={subject}
                label={subject}
                field={field}
                copy={copy}
                format={(value) =>
                  [value.publisher, value.title, value.volume].filter(Boolean).join(' · ')
                }
              />
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{copy.unknown}</p>
        )}
      </section>
      <StudentEvidenceSummary
        key={profile.profileId}
        profileId={profile.profileId}
        locale={locale}
      />
      <dl className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-3 border-t pt-5 text-xs">
        <div>
          <dt className="mb-1">{copy.created}</dt>
          <dd>{dateFormat.format(new Date(profile.createdAt))}</dd>
        </div>
        <div>
          <dt className="mb-1">{copy.updated}</dt>
          <dd>{dateFormat.format(new Date(profile.updatedAt))}</dd>
        </div>
      </dl>
    </article>
  );
}
