import { NextResponse, type NextRequest } from 'next/server';
import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { isSameOriginTeacherRequest } from './request-origin';
import { TeacherLessonError } from '@/lib/teacher/lessons';
import { safeLessonError } from './lesson-store';

export function lessonResponse(value: unknown, headers: Headers, status = 200) {
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Cookie');
  return NextResponse.json(value, { headers, status });
}
export async function withLessonRequest(
  req: NextRequest,
  handler: (ownerId: string, headers: Headers) => Promise<Response>,
) {
  return withRequestOwnerId(req, async (ownerId, headers) => {
    try {
      if (!isAgentRuntimeConfigured()) throw new TeacherLessonError('LESSON_UNAVAILABLE');
      if (!isSameOriginTeacherRequest(req)) throw new TeacherLessonError('LESSON_ORIGIN_REJECTED');
      return await handler(ownerId, headers);
    } catch (error) {
      const safe = safeLessonError(error);
      return lessonResponse({ errorCode: safe.code }, headers, safe.status);
    }
  });
}
export async function readLessonRequest(req: NextRequest) {
  if (
    req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' ||
    !req.body
  ) {
    throw new TeacherLessonError('LESSON_INPUT_INVALID');
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel().catch(() => undefined);
        throw new TeacherLessonError('LESSON_INPUT_INVALID');
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch {
    throw new TeacherLessonError('LESSON_INPUT_INVALID');
  } finally {
    reader.releaseLock();
  }
}
