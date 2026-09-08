export const teacherViews = [
  'overview',
  'preparation',
  'students',
  'lessons',
  'analyses',
  'insights',
  'feedback',
] as const;
export type TeacherView = (typeof teacherViews)[number];

export function parseTeacherLocation(search: string): {
  view: TeacherView;
  profileId: string | null;
} {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const profileId = params.get('student');
  return {
    view: teacherViews.includes(view as TeacherView) ? (view as TeacherView) : 'overview',
    profileId: profileId && /^teacher-student:v1:[a-f0-9]{64}$/.test(profileId) ? profileId : null,
  };
}

export function teacherLocation(view: TeacherView, profileId?: string | null): string {
  const params = new URLSearchParams();
  if (view !== 'overview') params.set('view', view);
  if (profileId) params.set('student', profileId);
  const query = params.toString();
  return `/teacher${query ? `?${query}` : ''}`;
}
