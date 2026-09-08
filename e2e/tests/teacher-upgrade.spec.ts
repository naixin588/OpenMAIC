import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.skip(process.env.TEACHER_E2E_ENABLED !== '1', 'Requires local teacher storage');

test('teacher records a lesson, adjusts homework and saves private parent feedback', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.get('/api/teacher/students');
  const created = [];
  for (const nickname of ['虚构升级甲', '虚构升级乙']) {
    const response = await page.request.post('/api/teacher/students', {
      data: { requestId: randomUUID(), nickname, grade: null, examYear: null, region: null },
    });
    expect(response.status()).toBe(201);
    created.push((await response.json()).student);
  }
  const profileId = created[0].profile.profileId;
  const path = `/api/teacher/students/${encodeURIComponent(profileId)}/lessons`;
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/teacher');
  await expect(page.getByRole('link', { name: '耐心助手', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '教学总览', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建学生', exact: true }).first()).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true });
  const navigate = async (name: string) =>
    page
      .getByRole('navigation', { name: '教师工作台', exact: true })
      .getByRole('button', { name, exact: true })
      .click();
  await navigate('课后登记');
  await page.getByRole('button', { name: /虚构升级甲/ }).click();
  await page.getByRole('button', { name: '记录这次课', exact: true }).click();
  await page.getByLabel('上课日期 *', { exact: true }).fill('2026-09-08');
  await page.getByLabel('学科 *', { exact: true }).fill('数学');
  await page.getByLabel('本课主题 *', { exact: true }).fill('虚构课堂：分式方程');
  await page.getByLabel('学了什么', { exact: true }).fill('分式方程的去分母与验根。');
  await page.getByLabel('实际完成了什么', { exact: true }).fill('独立写出两道练习的去分母步骤。');
  await page.getByLabel('课堂观察', { exact: true }).fill('能解释去分母，验根步骤仍需观察。');
  await page.getByLabel('仍需练习或验证', { exact: true }).fill('验根是否完整，下一次用新题核对。');
  await page
    .getByRole('textbox', { name: '课后作业（可调整）', exact: true })
    .fill('完成基础练习 1 至 4。');
  await page.getByLabel('老师下一步安排', { exact: true }).fill('下次先用一道迁移题核对验根。');
  await page
    .getByLabel('家庭配合动作', { exact: true })
    .fill('请孩子标出不会的步骤，保留草稿带来。');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '编辑课堂 / 调整作业', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '编辑课堂 / 调整作业', exact: true }).click();
  await page
    .getByRole('textbox', { name: '课后作业（可调整）', exact: true })
    .fill('改做基础练习 1、2，加做验根练习。');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByText('改做基础练习 1、2，加做验根练习。', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '编辑课堂 / 调整作业', exact: true }),
  ).toBeVisible();
  const storedLessons = await page.request.get(path);
  expect(storedLessons.status(), await storedLessons.text()).toBe(200);
  const lesson = (await storedLessons.json()).lessons[0];
  expect(lesson.request.fields.homework).toBe('完成基础练习 1 至 4。');
  expect(lesson.fields.homework).toBe('改做基础练习 1、2，加做验根练习。');
  await page.screenshot({ path: testInfo.outputPath('lesson-desktop.png'), fullPage: true });
  await navigate('家长反馈');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '整理反馈草稿', exact: true }).click();
  const text = page.getByRole('textbox', { name: '反馈内容', exact: true });
  await expect(text).toHaveValue(/虚构升级甲家长您好/);
  await expect(text).toHaveValue(/改做基础练习 1、2，加做验根练习/);
  expect(await text.inputValue()).not.toContain('虚构升级乙');
  const custom = `${await text.inputValue()}\n下次课会先核对验根步骤，再安排新练习。`;
  await text.fill(custom);
  await expect(page.getByRole('button', { name: '确认反馈内容', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('button', { name: '确认反馈内容', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已确认的家长反馈', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载文本', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^parent-feedback-.*\.txt$/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '反馈内容', exact: true })).toHaveValue(custom);
  await page.screenshot({ path: testInfo.outputPath('feedback-desktop.png'), fullPage: true });
  const other = await browser.newContext({ baseURL });
  try {
    expect((await other.request.get(path)).status()).toBe(404);
    expect((await other.request.get(`${path}/feedback`)).status()).toBe(404);
    expect(
      (
        await page.request.get(
          `/api/teacher/students/${encodeURIComponent(created[1].profile.profileId)}/lessons/feedback`,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await (
          await page.request.get(
            `/api/teacher/students/${encodeURIComponent(created[1].profile.profileId)}/lessons/feedback`,
          )
        ).json()
      ).feedback,
    ).toEqual([]);
  } finally {
    await other.close();
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('textbox', { name: '反馈内容', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`feedback-${width}.png`), fullPage: true });
    await navigate('教学总览');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
    await navigate('家长反馈');
  }
  await navigate('课后登记');
  await page.getByRole('button', { name: /虚构升级乙/ }).click();
  await expect(page.getByText('从今天的课堂开始', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
