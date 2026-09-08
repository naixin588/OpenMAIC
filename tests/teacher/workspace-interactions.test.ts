// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherWorkbench } from '@/components/teacher/TeacherWorkbench';
import type { TeacherStudent } from '@/lib/teacher/students';
import { createInitialStudentProfile } from '@/lib/zhongkao/profile';
import { createUnknownField } from '@/lib/zhongkao/observed-field';
import { teacherLocation, type TeacherView } from '@/lib/teacher/workspace';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'en-US' }) }));
vi.mock('@/lib/brand/brand-context', () => ({
  useBrand: () => ({ productName: 'Fictional teaching assistant', markSrc: '/fictional-mark.svg' }),
}));
vi.mock('@/components/teacher/StudentEditor', () => ({ StudentEditor: () => null }));
vi.mock('@/components/teacher/TeacherIdentityDialog', () => ({
  TeacherIdentityDialog: () => null,
}));
vi.mock('@/components/teacher/TeacherPreparation', () => ({
  TeacherPreparation: () => createElement('div', { 'data-testid': 'preparation-panel' }),
}));
vi.mock('@/components/teacher/TeacherOverview', () => ({
  TeacherOverview: () => createElement('div', { 'data-testid': 'overview-panel' }),
}));
vi.mock('@/components/teacher/TeacherInsights', () => ({ TeacherInsights: () => null }));
vi.mock('@/components/teacher/StudentProfilePanel', () => ({
  StudentProfilePanel: ({ student }: { student: TeacherStudent }) =>
    createElement(
      'article',
      { 'data-testid': 'profile-panel', 'data-student': student.profile.profileId },
      student.profile.displayName.value,
    ),
  IconAction: ({
    label,
    onClick,
    disabled,
    children,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: ReactNode;
  }) =>
    createElement('button', { 'aria-label': label, onClick, disabled, type: 'button' }, children),
}));
vi.mock('@/components/teacher/StudentAnalyses', () => ({
  StudentAnalyses: ({ profileId }: { profileId: string }) =>
    createElement('textarea', {
      'aria-label': 'Fictional analysis draft',
      'data-student': profileId,
      defaultValue: '',
    }),
}));
vi.mock('@/components/teacher/StudentLessons', () => ({
  StudentLessons: ({ profileId }: { profileId: string }) =>
    createElement('textarea', {
      'aria-label': 'Fictional lesson draft',
      'data-student': profileId,
      defaultValue: '',
    }),
  ParentFeedback: ({ profileId }: { profileId: string }) =>
    createElement('textarea', {
      'aria-label': 'Fictional feedback draft',
      'data-student': profileId,
      defaultValue: '',
    }),
}));

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const createdAt = '2026-09-08T10:00:00.000Z';
const id = (value: string) => `teacher-student:v1:${value.repeat(64)}`;

function student(value: string, archived = false): TeacherStudent {
  const profile = createInitialStudentProfile({ profileId: id(value), createdAt });
  profile.displayName = {
    ...createUnknownField<string>(createdAt),
    value: `Fictional student ${value.toUpperCase()}`,
    status: 'confirmed',
    confidence: 1,
    evidence: [{ type: 'user_input', createdAt }],
  };
  profile.grade = createUnknownField(createdAt);
  profile.examYear = createUnknownField(createdAt);
  return { profile, archived };
}

const roster = [student('a'), student('b'), student('c', true)];

async function mount(view: TeacherView, profileId?: string) {
  window.history.replaceState(null, '', teacherLocation(view, profileId));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(
      createElement(TeacherWorkbench, { configured: true, lessonPrepHref: '/workspace' }),
    ),
  );
  return root;
}

function findButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  expect(button, label).toBeDefined();
  return button!;
}

async function clickStudent(value: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(`Fictional student ${value.toUpperCase()}`),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function popTo(view: TeacherView, profileId: string) {
  await act(async () => {
    window.history.replaceState(null, '', teacherLocation(view, profileId));
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url !== '/api/teacher/students') throw new Error(`Unexpected request: ${url}`);
      return Response.json({ students: roster });
    }),
  );
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/teacher');
  vi.unstubAllGlobals();
});

describe('teacher workspace section and student navigation', () => {
  it('restores an archived student from a refreshed deep link without selecting an active student', async () => {
    await mount('students', id('c'));
    expect(
      document.querySelector('[data-testid="profile-panel"]')?.getAttribute('data-student'),
    ).toBe(id('c'));
    expect(findButton('Archived').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-testid="profile-panel"]')?.textContent).not.toContain(
      'Fictional student A',
    );
  });

  it('keeps the same archived student selected when history changes only the section', async () => {
    await mount('analyses', id('c'));
    expect(document.querySelector('textarea')?.getAttribute('data-student')).toBe(id('c'));
    await popTo('students', id('c'));
    expect(findButton('Archived').getAttribute('aria-pressed')).toBe('true');
    expect(
      document.querySelector('[data-testid="profile-panel"]')?.getAttribute('data-student'),
    ).toBe(id('c'));
    await popTo('feedback', id('c'));
    expect(document.querySelector('textarea')?.getAttribute('data-student')).toBe(id('c'));
  });

  it('restores the correct filter when browser history moves between active and archived students', async () => {
    await mount('students', id('a'));
    await popTo('students', id('c'));
    expect(
      document.querySelector('[data-testid="profile-panel"]')?.getAttribute('data-student'),
    ).toBe(id('c'));
    expect(findButton('Archived').getAttribute('aria-pressed')).toBe('true');
    await popTo('students', id('b'));
    expect(
      document.querySelector('[data-testid="profile-panel"]')?.getAttribute('data-student'),
    ).toBe(id('b'));
    expect(findButton('Active').getAttribute('aria-pressed')).toBe('true');
  });

  it('does not substitute another student for a valid but unavailable student ID in the URL', async () => {
    await mount('analyses', id('d'));
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.querySelector('[data-testid="profile-panel"]')).toBeNull();
    expect(document.body.textContent).toContain('Select or create a student to continue.');
    expect(new URLSearchParams(window.location.search).get('student')).toBe(id('d'));
    await clickStudent('b');
    expect(document.querySelector('textarea')?.getAttribute('data-student')).toBe(id('b'));
  });

  it.each(['lessons', 'analyses', 'feedback'] as const)(
    'isolates unsaved %s content when changing students',
    async (view) => {
      await mount(view, id('a'));
      const before = document.querySelector('textarea')!;
      before.value = 'Fictional A-only draft';
      await clickStudent('b');
      const after = document.querySelector('textarea')!;
      expect(after).not.toBe(before);
      expect(after.getAttribute('data-student')).toBe(id('b'));
      expect(after.value).toBe('');
      expect(new URLSearchParams(window.location.search).get('student')).toBe(id('b'));
      expect(document.body.textContent).not.toContain('Fictional A-only draft');
    },
  );

  it('keeps the selected student while moving between teaching sections', async () => {
    await mount('analyses', id('b'));
    await act(async () => findButton('After class').click());
    expect(new URLSearchParams(window.location.search).get('view')).toBe('lessons');
    expect(document.querySelector('textarea')?.getAttribute('data-student')).toBe(id('b'));
    await act(async () => findButton('Lesson preparation').click());
    expect(document.querySelector('[data-testid="preparation-panel"]')).not.toBeNull();
    await act(async () => findButton('Homework & exams').click());
    expect(document.querySelector('textarea')?.getAttribute('data-student')).toBe(id('b'));
  });
});
