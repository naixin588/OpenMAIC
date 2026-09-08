'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LessonFields } from '@/lib/teacher/lessons';
import { TeacherRequestError, teacherRequest } from './student-ui';

export interface LessonPanelProps {
  profileId: string;
  nickname: string;
  locale: string;
  archived?: boolean;
}
export const lessonUrl = (profileId: string) =>
  `/api/teacher/students/${encodeURIComponent(profileId)}/lessons`;
export const lessonText = (locale: string, zh: string, en: string) =>
  locale.startsWith('zh') ? zh : en;
export const lessonFieldLabels: Record<keyof LessonFields, [string, string]> = {
  lessonDate: ['上课日期', 'Lesson date'],
  subject: ['学科', 'Subject'],
  topic: ['本课主题', 'Lesson topic'],
  learningContent: ['学了什么', 'Learning content'],
  completedWork: ['实际完成了什么', 'Work actually completed'],
  classroomObservations: ['课堂观察', 'Classroom observations'],
  needsPractice: ['仍需练习或验证', 'Practice or verification needed'],
  homework: ['课后作业（可调整）', 'Homework (editable)'],
  nextSteps: ['老师下一步安排', 'Next teaching actions'],
  familyActions: ['家庭配合动作', 'Family support actions'],
};
export function emptyLesson(): LessonFields {
  const now = new Date();
  const lessonDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    lessonDate,
    subject: '',
    topic: '',
    learningContent: '',
    completedWork: '',
    classroomObservations: '',
    needsPractice: '',
    homework: '',
    nextSteps: '',
    familyActions: '',
  };
}
export function lessonError(error: unknown, locale: string): string {
  const code = error instanceof TeacherRequestError ? error.code : undefined;
  const messages: Record<string, [string, string]> = {
    LESSON_INPUT_INVALID: [
      '请检查日期、必填项和内容长度；最多选择 10 条来源。',
      'Check dates, required fields and lengths; select up to 10 sources.',
    ],
    LESSON_CONFLICT: [
      '记录已被修改，请刷新后重新编辑。当前修改尚未保存。',
      'This record changed. Refresh before editing again. Your changes have not been saved.',
    ],
    LESSON_ARCHIVED: [
      '学生已归档，请恢复档案后再编辑。',
      'Restore the archived student before editing.',
    ],
    LESSON_SOURCE_CHANGED: [
      '所选来源已变更或尚未复核，请刷新来源并重新整理草稿。',
      'Selected evidence changed or is unreviewed. Refresh sources and assemble a new draft.',
    ],
    LESSON_NOT_FOUND: [
      '未找到当前学生的记录，请刷新。',
      'This student record was not found. Please refresh.',
    ],
    LESSON_LIMIT_REACHED: ['已达到当前记录数量上限。', 'The record limit has been reached.'],
  };
  const message = code ? messages[code] : undefined;
  return message
    ? lessonText(locale, ...message)
    : lessonText(
        locale,
        '暂时无法读取或保存，请重试。',
        'Unable to load or save right now. Please retry.',
      );
}

/** Abort and key callers by profile to prevent stale lists or saves appearing in another card. */
export function useLessonRequests(locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeController = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      activeController.current?.abort();
      activeController.current = null;
    };
  }, []);
  const run = useCallback(
    async <T>(work: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void) => {
      if (activeController.current) return;
      setBusy(true);
      setError('');
      const controller = new AbortController();
      activeController.current = controller;
      try {
        const value = await work(controller.signal);
        if (alive.current && activeController.current === controller && !controller.signal.aborted)
          accept(value);
      } catch (failure) {
        if (alive.current && activeController.current === controller && !controller.signal.aborted)
          setError(lessonError(failure, locale));
      } finally {
        if (activeController.current === controller) {
          activeController.current = null;
          if (alive.current) setBusy(false);
        }
      }
    },
    [locale],
  );
  return { busy, error, setError, run };
}

export async function lessonHistory<T extends { profileId: string }>(
  url: string,
  profileId: string,
  signal: AbortSignal,
) {
  const response = await teacherRequest<{ history: T[] }>(url, { signal });
  if (response.history.some((record) => record.profileId !== profileId))
    throw new Error('Unexpected student');
  return response.history;
}

export function downloadFeedback(text: string, date: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `parent-feedback-${date}.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
