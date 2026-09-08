import { describe, expect, it } from 'vitest';
import type { TeacherAnalysis } from '@/lib/teacher/analysis';
import {
  compareReviewedPapers,
  reviewedStudentTimeline,
  samePaperKey,
} from '@/lib/teacher/insights';
import { parseTeacherLocation, teacherLocation } from '@/lib/teacher/workspace';

function analysis(profileId: string, override: Partial<TeacherAnalysis> = {}): TeacherAnalysis {
  return {
    analysisId: `${profileId}-record`,
    profileId,
    status: 'reviewed',
    updatedAt: '2026-09-08T00:00:00Z',
    request: { subject: 'Math', workKind: 'monthly_exam', workDate: '2026-09-08' },
    sources: [{ role: 'question_paper', sha256: 'a'.repeat(64), name: 'Fictional paper' }],
    ...override,
  } as TeacherAnalysis;
}

describe('teacher evidence comparisons', () => {
  it('keeps only the selected student’s reviewed records in date order', () => {
    const older = analysis('a', {
      analysisId: 'older',
      request: { ...analysis('a').request, workDate: '2026-09-01' },
    });
    expect(
      reviewedStudentTimeline(
        [
          older,
          analysis('b'),
          analysis('a', { status: 'draft' }),
          analysis('a', { status: 'withdrawn' }),
          analysis('a'),
        ],
        'a',
      ).map((item) => item.analysisId),
    ).toEqual(['a-record', 'older']);
  });
  it('matches exact question paper content, never its filename or assessment label', () => {
    const a = analysis('a');
    const different = analysis('b', { sources: [{ ...a.sources[0], sha256: 'b'.repeat(64) }] });
    expect(compareReviewedPapers([a, different], ['a', 'b'])).toEqual([]);
    const renamed = analysis('b', { sources: [{ ...a.sources[0], name: 'Different filename' }] });
    expect(compareReviewedPapers([a, renamed], ['a', 'b'])).toHaveLength(1);
    expect(samePaperKey(analysis('a', { sources: [] }))).toBeNull();
    expect(
      samePaperKey(analysis('a', { request: { ...a.request, workKind: 'homework' } })),
    ).toBeNull();
  });
  it('requires all question paper attachments to match regardless of order', () => {
    const a = analysis('a');
    const second = { ...a.sources[0], sha256: 'b'.repeat(64) };
    const pair = analysis('a', { sources: [...a.sources, second] });
    expect(samePaperKey(pair)).toEqual(
      samePaperKey(analysis('b', { sources: [second, ...a.sources] })),
    );
    expect(compareReviewedPapers([pair, analysis('b')], ['a', 'b'])).toEqual([]);
  });
  it('requires distinct selected students and excludes draft or withdrawn conclusions', () => {
    const items = [
      analysis('a'),
      analysis('a', { analysisId: 'retake' }),
      analysis('b', { status: 'draft' }),
      analysis('c', { status: 'withdrawn' }),
      analysis('d'),
    ];
    expect(compareReviewedPapers(items, ['a', 'b', 'c'])).toEqual([]);
    expect(
      compareReviewedPapers(items, ['d', 'a'])[0].analyses.map((item) => item.profileId),
    ).toEqual(['d', 'a']);
  });
  it('uses latest work date per student and keeps full citations/limitations intact', () => {
    const latest = analysis('a');
    const earlier = analysis('a', {
      analysisId: 'old',
      request: { ...latest.request, workDate: '2026-01-01' },
    });
    const groups = compareReviewedPapers([latest, earlier, analysis('b')], ['a', 'b']);
    expect(groups[0].analyses[0]).toBe(latest);
  });
});

describe('teacher workspace navigation', () => {
  it('round trips a student-specific workflow without carrying arbitrary query data', () => {
    const id = `teacher-student:v1:${'a'.repeat(64)}`;
    const url = teacherLocation('feedback', id);
    expect(parseTeacherLocation(url.slice(url.indexOf('?')))).toEqual({
      view: 'feedback',
      profileId: id,
    });
    expect(teacherLocation('overview')).toBe('/teacher');
  });
  it('rejects unknown sections and malformed profile ids', () => {
    expect(parseTeacherLocation('?view=admin&student=someone')).toEqual({
      view: 'overview',
      profileId: null,
    });
  });
});
