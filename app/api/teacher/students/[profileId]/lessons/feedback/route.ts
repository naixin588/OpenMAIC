import type { NextRequest } from 'next/server';
import {
  withLessonRequest,
  lessonResponse,
  readLessonRequest,
} from '@/lib/server/teacher/lesson-http';
import { createTeacherFeedback, listTeacherFeedback } from '@/lib/server/teacher/lesson-feedback';
import { defaultTeacherStudentServiceDeps } from '@/lib/server/teacher/students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ profileId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const { profileId } = await context.params;
    return lessonResponse(
      {
        feedback: await listTeacherFeedback(
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
    const result = await createTeacherFeedback(
      await defaultTeacherStudentServiceDeps(ownerId),
      profileId,
      input,
      req.signal,
    );
    return lessonResponse({ feedback: result.feedback }, headers, result.replayed ? 200 : 201);
  });
}
