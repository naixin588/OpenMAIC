import type { TeacherAnalysis } from './analysis';

export function reviewedStudentTimeline(
  analyses: readonly TeacherAnalysis[],
  profileId: string,
): TeacherAnalysis[] {
  return analyses
    .filter((item) => item.profileId === profileId && item.status === 'reviewed')
    .sort(
      (a, b) =>
        b.request.workDate.localeCompare(a.request.workDate) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.analysisId.localeCompare(b.analysisId),
    );
}

/** File names and exam labels do not establish that students sat the same paper. */
export function samePaperKey(analysis: TeacherAnalysis): string | null {
  const papers = analysis.sources
    .filter((source) => source.role === 'question_paper')
    .map((source) => source.sha256);
  if (!papers.length || analysis.request.workKind === 'homework') return null;
  return JSON.stringify([
    analysis.request.subject.trim().toLowerCase(),
    [...new Set(papers)].sort(),
  ]);
}

export interface SamePaperGroup {
  key: string;
  name: string;
  subject: string;
  analyses: TeacherAnalysis[];
}

export function compareReviewedPapers(
  analyses: readonly TeacherAnalysis[],
  selectedProfileIds: readonly string[],
): SamePaperGroup[] {
  const selected = new Set(selectedProfileIds);
  const groups = new Map<string, Map<string, TeacherAnalysis>>();
  for (const item of analyses) {
    if (item.status !== 'reviewed' || !selected.has(item.profileId)) continue;
    const key = samePaperKey(item);
    if (!key) continue;
    const byStudent = groups.get(key) ?? new Map<string, TeacherAnalysis>();
    const previous = byStudent.get(item.profileId);
    if (!previous || reviewedStudentTimeline([previous, item], item.profileId)[0] === item)
      byStudent.set(item.profileId, item);
    groups.set(key, byStudent);
  }
  return [...groups.entries()]
    .filter(([, students]) => students.size >= 2)
    .map(([key, students]) => {
      const rows = selectedProfileIds.flatMap((id) =>
        students.has(id) ? [students.get(id)!] : [],
      );
      return {
        key,
        name: rows[0].sources
          .filter((source) => source.role === 'question_paper')
          .map((source) => source.name)
          .join(' / '),
        subject: rows[0].request.subject,
        analyses: rows,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
