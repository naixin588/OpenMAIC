import type { NextRequest } from 'next/server';
import {
  withLessonRequest,
  lessonResponse,
  readLessonRequest,
} from '@/lib/server/teacher/lesson-http';
import { getTeacherLessonHistory, updateTeacherLesson } from '@/lib/server/teacher/lesson-service';
import { defaultTeacherStudentServiceDeps } from '@/lib/server/teacher/students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ profileId: string; lessonId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const { profileId, lessonId } = await context.params;
    return lessonResponse(
      {
        history: await getTeacherLessonHistory(
          await defaultTeacherStudentServiceDeps(ownerId),
          profileId,
          lessonId,
        ),
      },
      headers,
    );
  });
}
export async function PATCH(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const input = await readLessonRequest(req);
    const { profileId, lessonId } = await context.params;
    const lesson = await updateTeacherLesson(
      await defaultTeacherStudentServiceDeps(ownerId),
      profileId,
      lessonId,
      input,
      req.signal,
    );
    return lessonResponse({ lesson }, headers);
  });
}
