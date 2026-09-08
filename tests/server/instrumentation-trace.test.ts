import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { pruneInstrumentationTrace } from '@/scripts/prune-vercel-instrumentation-trace.mjs';

const fixtures: string[] = [];

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), 'naixin-instrumentation-trace-'));
  fixtures.push(base);
  const root = path.join(base, 'project');
  const traceFile = path.join(root, '.next', 'server', 'instrumentation.js.nft.json');
  await mkdir(path.dirname(traceFile), { recursive: true });
  const entry = (file: string) =>
    path.relative(path.dirname(traceFile), path.resolve(root, file)).replace(/\\/g, '/');
  return { base, root, traceFile, entry };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Vercel instrumentation trace filtering', () => {
  it('removes only root demo/test/local data references and preserves runtime files and source bytes', async () => {
    const { root, traceFile, entry } = await fixture();
    const omitted = [
      'assets/python.gif',
      'assets/interactive_mode/demo.gif',
      'tests/teacher/students.test.ts',
      'data/fictional-student/paper.pdf',
      'logs/fictional.log',
      'test-results/fictional/screenshot.png',
      'tsconfig.tsbuildinfo',
    ];
    const kept = [
      '.next/server/chunks/runner.js',
      'server-providers.yml',
      'lib/server/agent-runtime/import-pptx-worker.mjs',
      'skills/agent-runtime/pptx-import/SKILL.md',
      'skills/openmaic/SKILL.md',
      'public/vendor/maic-importer/index.js',
      'public/vendor/video-export/katex/fonts/KaTeX_Main-Regular.woff2',
      'node_modules/@aws-sdk/client-s3/dist-cjs/index.js',
      'packages/@openmaic/importer/dist/index.js',
    ];
    for (const file of [...omitted, ...kept]) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), 'fictional fixture bytes');
    }
    const manifest = {
      version: 1,
      files: [...omitted, ...kept].map(entry),
      retainedMetadata: true,
    };
    await writeFile(traceFile, JSON.stringify(manifest));

    await expect(pruneInstrumentationTrace(root)).resolves.toEqual({
      removedFiles: omitted.length,
      keptFiles: kept.length,
    });
    expect(JSON.parse(await readFile(traceFile, 'utf8'))).toEqual({
      ...manifest,
      files: kept.map(entry),
    });
    for (const file of omitted) {
      expect(await readFile(path.join(root, file), 'utf8')).toBe('fictional fixture bytes');
    }
  });

  it('preserves dependencies outside the project and similarly named runtime folders', async () => {
    const { root, traceFile, entry } = await fixture();
    const kept = [
      '../project-neighbor/assets/demo.gif',
      '../assets/shared.gif',
      'assets-runtime/runtime.bin',
      'public/assets/slide.png',
      'node_modules/example/assets/model.bin',
      'packages/example/tests/runtime-reference.json',
      'packages/example/tsconfig.tsbuildinfo',
      'data/../../project-neighbor/data/runtime.json',
    ].map(entry);
    await writeFile(traceFile, JSON.stringify({ version: 1, files: kept }));

    await expect(pruneInstrumentationTrace(root)).resolves.toEqual({
      removedFiles: 0,
      keptFiles: kept.length,
    });
    expect(JSON.parse(await readFile(traceFile, 'utf8')).files).toEqual(kept);
  });

  it('handles portable Windows separators and stays idempotent without rewriting unchanged output', async () => {
    const { root, traceFile, entry } = await fixture();
    const kept = entry('public/vendor/runtime.js').replace(/\//g, '\\');
    await writeFile(
      traceFile,
      JSON.stringify({ version: 1, files: [entry('assets/demo.gif').replace(/\//g, '\\'), kept] }),
    );
    await expect(pruneInstrumentationTrace(root)).resolves.toEqual({
      removedFiles: 1,
      keptFiles: 1,
    });
    const once = await readFile(traceFile, 'utf8');
    await expect(pruneInstrumentationTrace(root)).resolves.toEqual({
      removedFiles: 0,
      keptFiles: 1,
    });
    expect(await readFile(traceFile, 'utf8')).toBe(once);
    expect(JSON.parse(once).files).toEqual([kept]);
  });

  it.each([
    '{broken JSON',
    'null',
    '[]',
    JSON.stringify({ version: 2, files: [] }),
    JSON.stringify({ version: 1, files: 'not-an-array' }),
    JSON.stringify({ version: 1, files: ['../../assets/demo.gif', null] }),
    JSON.stringify({ version: 1, files: ['../../assets/demo.gif', ''] }),
    JSON.stringify({ version: 1, files: ['../../assets/demo.gif', '/absolute/file.js'] }),
    JSON.stringify({ version: 1, files: ['C:\\absolute\\file.js'] }),
    JSON.stringify({ version: 1, files: ['file:///absolute/file.js'] }),
    JSON.stringify({ version: 1, files: ['bad\0path'] }),
  ])('rejects malformed trace input without partially rewriting it: %s', async (original) => {
    const { root, traceFile } = await fixture();
    await writeFile(traceFile, original);
    await expect(pruneInstrumentationTrace(root)).rejects.toThrow(
      'Invalid instrumentation trace manifest',
    );
    expect(await readFile(traceFile, 'utf8')).toBe(original);
  });

  it('fails when the expected trace is absent instead of declaring success', async () => {
    const { root, traceFile } = await fixture();
    await expect(pruneInstrumentationTrace(root)).rejects.toThrow();
    await expect(readFile(traceFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
