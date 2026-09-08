import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import teacherConfig from './teacher.config';

export default defineConfig({
  ...teacherConfig,
  testMatch: 'teacher-upgrade.spec.ts',
  outputDir: resolve(__dirname, '../data/teacher-upgrade-e2e-results'),
});
