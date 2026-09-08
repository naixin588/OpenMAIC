import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

// Use the same glob implementation shipped with Next; no production dependency.
const require = createRequire(import.meta.url);
const picomatch = require('next/dist/compiled/picomatch') as (
  patterns: string[],
  options: { dot: boolean; contains?: boolean },
) => (path: string) => boolean;

// Match Vercel's Linux path semantics, including when this test runs on Windows.
// Next resolves both glob and traced file against the project before matching.
const projectRoot = '/vercel/path0';
const matchesExclusion = picomatch(
  (nextConfig.outputFileTracingExcludes?.['/*'] ?? []).map((glob) => posix.join(projectRoot, glob)),
  { dot: true, contains: true },
);
const isExcluded = (file: string) => matchesExclusion(posix.join(projectRoot, file));
const isExplicitlyIncluded = picomatch(nextConfig.outputFileTracingIncludes?.['/*'] ?? [], {
  dot: true,
});

describe('production function file selection', () => {
  it.each([
    './assets/python.gif',
    './assets/interactive_mode/game_interactive.gif',
    './tests/teacher/students.test.ts',
    './data/fictional-student-materials/paper.pdf',
    './data/teacher-backups/fictional.dump',
    './logs/fictional-run.log',
    './test-results/fictional-classroom/screenshot.png',
    './tsconfig.tsbuildinfo',
  ])('omits repository demo media and local-only data: %s', (file) => {
    expect(isExcluded(file)).toBe(true);
  });

  it.each([
    './server-providers.yml',
    './public/vendor/maic-importer/index.js',
    './public/vendor/video-export/katex/fonts/KaTeX_Main-Regular.woff2',
    './public/brand/naixin-logo.svg',
    './packages/@openmaic/importer/dist/index.js',
    './packages/@openmaic/storage/dist/runtime/pg.js',
    './lib/server/agent-runtime/import-pptx-worker.mjs',
    './skills/agent-runtime/pptx-import/SKILL.md',
    './skills/openmaic/slide/SKILL.md',
    './node_modules/@aws-sdk/client-s3/dist-cjs/index.js',
  ])('keeps provider configuration and runtime tools eligible for tracing: %s', (file) => {
    expect(isExcluded(file)).toBe(false);
  });

  it.each([
    'lib/server/agent-runtime/import-pptx-worker.mjs',
    'skills/agent-runtime/pptx-import/SKILL.md',
    'skills/openmaic/slide/SKILL.md',
  ])('preserves explicit inclusion of dynamically discovered runtime files: %s', (file) => {
    expect(isExplicitlyIncluded(file)).toBe(true);
  });
});
