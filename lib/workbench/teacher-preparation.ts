import type { WorkbenchMaterial } from './session-store';

export type TeacherPreparationRole = 'textbook' | 'exam_objectives' | 'reference';

export interface TeacherPreparationSource {
  material: WorkbenchMaterial;
  role: TeacherPreparationRole;
  /** A teacher's pointer, not a verified page anchor. */
  location: string;
}

export interface TeacherPreparationBrief {
  topic: string;
  objectives: string;
  requirements: string;
  sources: TeacherPreparationSource[];
}

export function teacherPreparationError(
  brief: TeacherPreparationBrief,
): 'topicRequired' | 'sourcesRequired' | 'duplicateNames' | 'tooManySources' | null {
  if (!brief.topic.trim()) return 'topicRequired';
  if (!brief.sources.length || brief.sources.some((source) => !source.role))
    return 'sourcesRequired';
  if (brief.sources.length > 20) return 'tooManySources';
  const names = brief.sources.map((source) => source.material.name.trim().toLocaleLowerCase());
  // The session assigns its own material IDs. Unique displayed filenames make
  // the teacher's role/location manifest unambiguous against list_materials.
  if (new Set(names).size !== names.length) return 'duplicateNames';
  return null;
}

export { buildTeacherPreparationPrompt } from '@/lib/prompts/teacher-preparation';

export function teacherPreparationSessionHref(sessionId: string): string {
  return `/workspace?session=${encodeURIComponent(sessionId)}`;
}
