import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { isNonRuntimeProjectFile } from '@/scripts/function-trace-policy.mjs';

const runNode = promisify(execFile);
const fixtures: string[] = [];

async function sandbox() {
  const directory = await mkdtemp(path.join(tmpdir(), 'naixin-runtime-resources-'));
  fixtures.push(directory);
  return directory;
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(full) : [full];
      }),
    )
  ).flat();
}

async function stageFiles(root: string, files: string[]) {
  for (const file of files) {
    if (isNonRuntimeProjectFile(file)) continue;
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.resolve(file), destination);
  }
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('runtime resources retained by lean function tracing', () => {
  it('dynamically imports the real PPTX importer after excluding its unexported UMD bundle', async () => {
    const root = await sandbox();
    const packagePath = 'packages/@openmaic/importer';
    const manifest = JSON.parse(await readFile(`${packagePath}/package.json`, 'utf8'));
    expect(manifest.exports['.'].import).toBe('./dist/index.js');
    expect(manifest.exports['.'].require).toBe('./dist/index.cjs');
    const entries = [
      `${packagePath}/package.json`,
      `${packagePath}/dist/index.js`,
      `${packagePath}/dist/index.cjs`,
      `${packagePath}/dist/index.umd.js`,
    ];
    await stageFiles(root, entries);
    await expect(readFile(path.join(root, packagePath, 'dist/index.umd.js'))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    // Use native Node loading outside the repository. Vitest transforms must
    // not hide a missing runtime export or accidentally read the source tree.
    const result = await runNode(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
        import { pathToFileURL } from 'node:url';
        import { parseHTML } from 'linkedom/worker';
        const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
        class ImportProbeXHR {
          open() {}
          send() { throw new Error('Unexpected network access during import'); }
          setRequestHeader() {}
          overrideMimeType() {}
        }
        window.XMLHttpRequest = ImportProbeXHR;
        Object.assign(globalThis, {
          XMLHttpRequest: ImportProbeXHR, document, DOMParser: window.DOMParser, HTMLElement: window.HTMLElement, Node: window.Node,
          location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost', hostname: 'localhost', port: '', pathname: '/', search: '', hash: '' },
        });
        try {
          const importer = await import(pathToFileURL(process.argv[1]).href);
          if (typeof importer.importPptx !== 'function') throw new Error('Missing importer export');
          process.stdout.write('importer-ready');
        } catch (error) {
          process.stderr.write(error.name + ': ' + error.message);
          process.exitCode = 1;
        }
      `,
        path.join(root, packagePath, 'dist/index.js'),
      ],
      { cwd: process.cwd(), timeout: 15_000, windowsHide: true },
    );
    expect(result.stdout).toContain('importer-ready');
  });

  it('loads real packaged templates, snippets and PBL prompts from the retained staging tree', async () => {
    const root = await sandbox();
    const packagePath = 'packages/@openmaic/generation';
    const resources = (
      await Promise.all(
        ['templates', 'snippets', 'prompts-pbl'].map((directory) =>
          filesUnder(path.join(packagePath, directory)),
        ),
      )
    ).flat();
    const entries = [
      `${packagePath}/package.json`,
      `${packagePath}/dist/prompts/loader.js`,
      `${packagePath}/dist/pbl/prompts/loader.js`,
      ...resources.map((file) => file.split(path.sep).join('/')),
    ];
    expect(entries.every((file) => !isNonRuntimeProjectFile(file))).toBe(true);
    await stageFiles(root, entries);
    const result = await runNode(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
        import { pathToFileURL } from 'node:url';
        import path from 'node:path';
        const root = process.argv[1];
        const prompts = await import(pathToFileURL(path.join(root, 'dist/prompts/loader.js')).href);
        const pbl = await import(pathToFileURL(path.join(root, 'dist/pbl/prompts/loader.js')).href);
        if (!prompts.loadPrompt('interactive-actions')?.systemPrompt) throw new Error('Template missing');
        if (!prompts.loadSnippet('media-safety-guidelines')) throw new Error('Snippet missing');
        if (!pbl.loadPBLV2Prompt('planner-system')) throw new Error('PBL prompt missing');
        process.stdout.write('prompts-ready');
      `,
        path.join(root, packagePath),
      ],
      { cwd: root, timeout: 15_000, windowsHide: true },
    );
    expect(result.stdout).toBe('prompts-ready');
  });

  it('keeps actual PPTX import/require exports, public assets, skills and worker paths', async () => {
    const manifest = JSON.parse(await readFile('packages/pptxgenjs/package.json', 'utf8'));
    for (const entry of [manifest.exports.import, manifest.exports.require]) {
      expect(isNonRuntimeProjectFile(`packages/pptxgenjs/${entry.replace(/^\.\//, '')}`)).toBe(
        false,
      );
    }
    for (const file of [
      'lib/server/agent-runtime/import-pptx-worker.mjs',
      'skills/agent-runtime/pptx-import/SKILL.md',
      'public/vendor/maic-importer/index.js',
    ]) {
      expect(isNonRuntimeProjectFile(file)).toBe(false);
      expect((await readFile(file)).length).toBeGreaterThan(0);
    }
  });
});
