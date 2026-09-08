import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { pruneInstrumentationTrace } from '@/scripts/prune-vercel-instrumentation-trace.mjs';
import {
  NON_RUNTIME_TRACE_DIRECTORIES,
  NON_RUNTIME_TRACE_EXCLUDES,
  NON_RUNTIME_TRACE_FILES,
  isNonRuntimeProjectFile,
} from '@/scripts/function-trace-policy.mjs';

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
      'node_modules/example/test/runtime-data.json',
      'node_modules/example/dist/index.umd.js',
      'node_modules/@openmaic/importer/dist/index.umd.js',
      'packages/@openmaic/storage/test-assets/runtime.bin',
      'packages/@openmaic/storage/src/runtime/pg.ts',
      'packages/@openmaic/storage/dist/runtime/pg.js',
      'packages/@openmaic/importer/dist/index.cjs',
      'packages/@openmaic/importer/dist/index.js',
      'packages/pptxgenjs/dist/pptxgen.cjs.js',
      'packages/pptxgenjs/dist/pptxgen.es.js',
      'public/vendor/maic-importer/index.umd.js',
      'lib/server/render-service.ts',
      'lib/prompts/templates/task-engine-outlines/system.md',
      'packages/@openmaic/generation/templates/task-engine-outlines/system.md',
      'packages/@openmaic/generation/snippets/slide-core.md',
      'packages/@openmaic/generation/prompts-pbl/plan.md',
      'skills/agent-runtime/example/test/fictional-reference.json',
      'data/../../project-neighbor/data/runtime.json',
    ].map(entry);
    await writeFile(traceFile, JSON.stringify({ version: 1, files: kept }));

    await expect(pruneInstrumentationTrace(root)).resolves.toEqual({
      removedFiles: 0,
      keptFiles: kept.length,
    });
    expect(JSON.parse(await readFile(traceFile, 'utf8')).files).toEqual(kept);
  });

  it('applies exact workspace test/documentation and unexported bundle exclusions without deleting bytes', async () => {
    const { root, traceFile, entry } = await fixture();
    const omitted = [
      'e2e/helpers/fixture.js',
      'eval/whiteboard/fixture.json',
      'packages/docs/content/docs/introduction.mdx',
      'packages/docs/pnpm-lock.yaml',
      'render-service/src/server.ts',
      ...['dsl', 'editor', 'generation', 'importer', 'renderer', 'storage'].map(
        (name) => `packages/@openmaic/${name}/test/fictional.test.ts`,
      ),
      'pnpm-lock.yaml',
      'packages/@openmaic/importer/dist/index.umd.js',
      'packages/pptxgenjs/dist/pptxgen.js',
    ];
    const kept = [
      'packages/@openmaic/importer/package.json',
      'packages/@openmaic/importer/dist/index.js',
      'packages/@openmaic/importer/dist/index.cjs',
      'lib/server/agent-runtime/import-pptx-worker.mjs',
      'public/vendor/maic-importer/index.js',
      'skills/agent-runtime/pptx-import/SKILL.md',
    ];
    for (const file of [...omitted, ...kept]) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), 'fictional retained source bytes');
    }
    await writeFile(
      traceFile,
      JSON.stringify({ version: 1, files: [...omitted, ...kept].map(entry) }),
    );

    expect(await pruneInstrumentationTrace(root)).toEqual({
      removedFiles: omitted.length,
      keptFiles: kept.length,
    });
    expect(JSON.parse(await readFile(traceFile, 'utf8')).files).toEqual(kept.map(entry));
    for (const file of omitted)
      expect(await readFile(path.join(root, file), 'utf8')).toBe('fictional retained source bytes');
  });

  it('uses the same exact policy for Next route exclusions and instrumentation', () => {
    for (const directory of NON_RUNTIME_TRACE_DIRECTORIES) {
      expect(NON_RUNTIME_TRACE_EXCLUDES).toContain(`./${directory}/**/*`);
      expect(isNonRuntimeProjectFile(`${directory}/fictional-file.txt`)).toBe(true);
      expect(isNonRuntimeProjectFile(`${directory}-runtime/fictional-file.txt`)).toBe(false);
    }
    for (const file of NON_RUNTIME_TRACE_FILES) {
      expect(NON_RUNTIME_TRACE_EXCLUDES).toContain(`./${file}`);
      expect(isNonRuntimeProjectFile(file)).toBe(true);
      expect(isNonRuntimeProjectFile(`node_modules/example/${file}`)).toBe(false);
    }
    expect(NON_RUNTIME_TRACE_EXCLUDES).toContain('./*.tsbuildinfo');
    expect(NON_RUNTIME_TRACE_EXCLUDES.some((glob) => glob.includes('node_modules'))).toBe(false);
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
