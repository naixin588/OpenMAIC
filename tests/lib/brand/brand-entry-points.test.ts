import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';
import { WorkspaceHome } from '@/components/workbench/workspace/WorkspaceHome';
import { WorkspaceRail } from '@/components/workbench/workspace/WorkspaceRail';
import { AccessCodeModal } from '@/components/access-code-modal';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: (key: string) => (key === 'teacher.title' ? '教师工作台' : key),
  }),
}));
vi.mock('@/components/workbench/ProLaunchPanel', () => ({ ProLaunchPanel: () => null }));
vi.mock('@/components/workbench/ProBadge', () => ({ ProBadge: () => null }));
vi.mock('@/components/settings', () => ({ SettingsDialog: () => null }));
vi.mock('@/components/language-switcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/components/site-header/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/workbench/pro-swap', () => ({ arrivedByProSwap: () => false }));

describe('teacher product entry points', () => {
  it('shows the shared identity in the course workspace with a teacher destination on mobile', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceHome, {
        composerReset: 0,
        discoveryContent: null,
        courseOptions: [],
        onOpenSession: vi.fn(),
        onExitPro: vi.fn(),
      }),
    );
    expect(html).toContain(`src="${DEFAULT_BRAND.logoSrc}"`);
    expect(html).toContain(`alt="${DEFAULT_BRAND.productName}"`);
    expect(html).toMatch(
      /<a(?=[^>]*href="\/teacher")(?=[^>]*data-testid="workspace-teacher-entry-mobile")[^>]*>/,
    );
    expect(html).toContain('教师工作台');
    expect(html).not.toContain('OpenMAIC');
  });

  it.each([false, true])(
    'keeps teacher navigation available with collapsed rail = %s',
    (collapsed) => {
      const courses = {
        classrooms: [],
        state: 'ready',
        reload: vi.fn(),
        importInput: null,
        discoveryContent: null,
        folders: [],
        openNewFolder: vi.fn(),
        moveCourse: vi.fn(),
        createAndMove: () => () => {},
        deleteCourse: vi.fn(async () => true),
      } as unknown as ComponentProps<typeof WorkspaceRail>['courses'];
      const html = renderToStaticMarkup(
        createElement(WorkspaceRail, {
          courses,
          sessions: [],
          sessionState: 'ready',
          onReloadSessions: vi.fn(),
          activeCourseId: null,
          activeSessionId: null,
          collapsed,
          onToggleCollapsed: vi.fn(),
          onOpenCourse: vi.fn(),
          onOpenSession: vi.fn(),
          onNewSession: vi.fn(),
          onGoHome: vi.fn(),
          onExitPro: vi.fn(),
          onSessionDeleted: vi.fn(),
          onRenameSession: vi.fn(async () => null),
          onDeleteCourse: vi.fn(),
          resizeHandle: null,
        }),
      );
      expect(html).toContain('href="/teacher"');
      expect(html).toContain('教师工作台');
      expect(html).toContain(`data-testid="workspace-teacher-entry${collapsed ? '-mini' : ''}"`);
      expect(html).not.toContain('OpenMAIC');
    },
  );

  it('identifies the product correctly before unlocking a protected installation', () => {
    const html = renderToStaticMarkup(
      createElement(AccessCodeModal, { open: true, onSuccess: vi.fn() }),
    );
    expect(html).toContain(DEFAULT_BRAND.productName);
    expect(html).not.toContain('OpenMAIC');
  });
});
