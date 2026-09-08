import type { NextRequest } from 'next/server';
import {
  withLessonRequest,
  lessonResponse,
  readLessonRequest,
} from '@/lib/server/teacher/lesson-http';
import { createTeacherLesson, listTeacherLessons } from '@/lib/server/teacher/lesson-service';
import { defaultTeacherStudentServiceDeps } from '@/lib/server/teacher/students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ profileId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const { profileId } = await context.params;
    return lessonResponse(
      {
        lessons: await listTeacherLessons(
          await defaultTeacherStudentServiceDeps(ownerId),
          profileId,
        ),
      },
      headers,
    );
  });
}
export async function POST(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const input = await readLessonRequest(req);
    const { profileId } = await context.params;
    const result = await createTeacherLesson(
      await defaultTeacherStudentServiceDeps(ownerId),
      profileId,
      input,
      req.signal,
    );
    return lessonResponse({ lesson: result.lesson }, headers, result.replayed ? 200 : 201);
  });
}
