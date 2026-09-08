import type { NextRequest } from 'next/server';
import {
  withLessonRequest,
  lessonResponse,
  readLessonRequest,
} from '@/lib/server/teacher/lesson-http';
import {
  getTeacherFeedbackHistory,
  updateTeacherFeedback,
} from '@/lib/server/teacher/lesson-feedback';
import { defaultTeacherStudentServiceDeps } from '@/lib/server/teacher/students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ profileId: string; feedbackId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const { profileId, feedbackId } = await context.params;
    return lessonResponse(
      {
        history: await getTeacherFeedbackHistory(
          await defaultTeacherStudentServiceDeps(ownerId),
          profileId,
          feedbackId,
        ),
      },
      headers,
    );
  });
}
export async function PATCH(req: NextRequest, context: Context) {
  return withLessonRequest(req, async (ownerId, headers) => {
    const input = await readLessonRequest(req);
    const { profileId, feedbackId } = await context.params;
    const feedback = await updateTeacherFeedback(
      await defaultTeacherStudentServiceDeps(ownerId),
      profileId,
      feedbackId,
      input,
      req.signal,
    );
    return lessonResponse({ feedback }, headers);
  });
}
