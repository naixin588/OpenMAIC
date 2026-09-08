// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentEvidenceSummary } from '@/components/teacher/StudentEvidenceSummary';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';
import { teacherLocation } from '@/lib/teacher/workspace';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const profileA = `teacher-student:v1:${'a'.repeat(64)}`;
const profileB = `teacher-student:v1:${'b'.repeat(64)}`;

function record(
  text: string,
  date: string,
  status: TeacherAnalysis['status'] = 'reviewed',
  profileId = profileA,
): TeacherAnalysis {
  const report: TeacherAnalysis['report'] = {
    readiness: 'insufficient',
    observations: [
      {
        category: 'needs_verification',
        text,
        citations: [
          { sourceId: 'source-1', blockId: 'block-1', quote: 'Fictional independent response' },
        ],
      },
    ],
    recommendations: [],
    limitations: ['One response does not establish lasting mastery.'],
  };
  return {
    schemaVersion: 1,
    analysisId: `teacher-analysis:v1:${date.replaceAll('-', '').padEnd(64, '0')}`,
    profileId,
    request: {
      requestId: '11111111-1111-4111-8111-111111111111',
      workKind: 'monthly_exam',
      subject: 'Mathematics',
      title: `Fictional paper ${date}`,
      workDate: date,
      teacherNotes: '',
      materials: [{ materialId: 'mat_fictional', role: 'student_work' }],
    },
    requestFingerprint: 'd'.repeat(64),
    status,
    sources: [],
    report,
    originalReport: structuredClone(report),
    model: { providerId: 'fictional', modelId: 'test-model' },
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    teacherComment: '',
  };
}

async function mount(profileId = profileA) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(createElement(StudentEvidenceSummary, { key: profileId, profileId, locale: 'en' })),
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('student evidence summary', () => {
  it('shows the latest reviewed work only, with an evidence link and an inference boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          analyses: [
            record('Fictional old reviewed finding', '2026-08-01'),
            record('Fictional newest draft finding', '2026-09-08', 'draft'),
            record('Fictional latest reviewed finding', '2026-09-01'),
            record('Fictional withdrawn finding', '2026-09-07', 'withdrawn'),
          ],
        }),
      ),
    );
    await mount();
    expect(document.body.textContent).toContain('Fictional latest reviewed finding');
    expect(document.body.textContent).not.toContain('Fictional old reviewed finding');
    expect(document.body.textContent).not.toContain('Fictional newest draft finding');
    expect(document.body.textContent).not.toContain('Fictional withdrawn finding');
    expect(document.body.textContent).toContain('do not establish lasting mastery');
    expect(document.querySelector('a')?.getAttribute('href')).toBe(
      teacherLocation('analyses', profileA),
    );
  });

  it('keeps draft and withdrawn work out of learning conclusions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          analyses: [
            record('Fictional unreviewed conclusion', '2026-09-08', 'draft'),
            record('Fictional withdrawn conclusion', '2026-09-07', 'withdrawn'),
          ],
        }),
      ),
    );
    await mount();
    expect(document.body.textContent).toContain('Exploration plan');
    expect(document.body.textContent).toContain('Analysis drafts await review');
    expect(document.body.textContent).not.toContain('Fictional unreviewed conclusion');
    expect(document.body.textContent).not.toContain('Fictional withdrawn conclusion');
  });

  it('rejects foreign student records instead of exposing their findings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          analyses: [record('Fictional private B finding', '2026-09-08', 'reviewed', profileB)],
        }),
      ),
    );
    await mount();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Fictional private B finding');
    expect(document.body.textContent).not.toContain('Learning evidence pending');
  });

  it('reports source loading failure and retries without claiming there are no records', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ analyses: [record('Fictional recovered finding', '2026-09-08')] }),
      );
    vi.stubGlobal('fetch', fetch);
    await mount();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(document.body.textContent).not.toContain('Exploration plan');
    expect(document.body.textContent).not.toContain('Learning evidence pending');
    await act(async () => (document.querySelector('button') as HTMLButtonElement).click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain('Fictional recovered finding');
  });

  it('aborts the previous student request and ignores its late response after a student switch', async () => {
    let resolveA!: (response: Response) => void;
    let signalA: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes(encodeURIComponent(profileA))) {
          signalA = init?.signal;
          return new Promise<Response>((done) => {
            resolveA = done;
          });
        }
        return Promise.resolve(
          Response.json({
            analyses: [record('Fictional B reviewed finding', '2026-09-08', 'reviewed', profileB)],
          }),
        );
      }),
    );
    const root = await mount();
    expect(signalA?.aborted).toBe(false);
    await act(async () =>
      root.render(
        createElement(StudentEvidenceSummary, { key: profileB, profileId: profileB, locale: 'en' }),
      ),
    );
    expect(signalA?.aborted).toBe(true);
    await act(async () =>
      resolveA(Response.json({ analyses: [record('Fictional stale A finding', '2026-09-08')] })),
    );
    expect(document.body.textContent).toContain('Fictional B reviewed finding');
    expect(document.body.textContent).not.toContain('Fictional stale A finding');
    expect(document.querySelector('a')?.getAttribute('href')).toBe(
      teacherLocation('analyses', profileB),
    );
  });
});
