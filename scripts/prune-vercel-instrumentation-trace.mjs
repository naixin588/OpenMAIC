import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { NON_RUNTIME_TRACE_DIRECTORIES } from './function-trace-policy.mjs';

const excludedDirectories = new Set(NON_RUNTIME_TRACE_DIRECTORIES);

function validRelativeFile(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !file.includes('\0') &&
    !path.posix.isAbsolute(file) &&
    !path.win32.isAbsolute(file) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(file)
  );
}

function isNonRuntimeFile(projectRoot, traceDirectory, file) {
  const resolved = path.resolve(traceDirectory, file.replace(/\\/g, '/'));
  const relative = path.relative(projectRoot, resolved);
  // A monorepo may legitimately trace dependencies above the project directory.
  // Exclude only this project's root folders, never similarly named neighbors.
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }
  const parts = relative.split(path.sep);
  return (
    (parts.length > 1 && excludedDirectories.has(parts[0])) ||
    (parts.length === 1 && parts[0].endsWith('.tsbuildinfo'))
  );
}

/**
 * Next 16.1 applies outputFileTracingExcludes to routes, but skips this shared
 * instrumentation trace. Vercel attaches it to functions, so apply the same
 * narrow policy before Vercel builds its bundles. Never delete source files.
 */
export async function pruneInstrumentationTrace(projectDirectory) {
  const projectRoot = path.resolve(projectDirectory);
  const traceFile = path.join(projectRoot, '.next', 'server', 'instrumentation.js.nft.json');
  const original = await readFile(traceFile, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(original);
  } catch {
    throw new Error('Invalid instrumentation trace manifest');
  }
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    !manifest.files.every(validRelativeFile)
  ) {
    throw new Error('Invalid instrumentation trace manifest');
  }

  const files = manifest.files.filter(
    (file) => !isNonRuntimeFile(projectRoot, path.dirname(traceFile), file),
  );
  const removedFiles = manifest.files.length - files.length;
  if (removedFiles === 0) return { removedFiles: 0, keptFiles: files.length };

  const pending = `${traceFile}.pending-${randomUUID()}`;
  try {
    await writeFile(pending, JSON.stringify({ ...manifest, files }), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(pending, traceFile);
  } finally {
    await rm(pending, { force: true });
  }
  return { removedFiles, keptFiles: files.length };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await pruneInstrumentationTrace(process.cwd());
    console.log(
      `Instrumentation trace: omitted ${result.removedFiles} non-runtime files; kept ${result.keptFiles} files.`,
    );
  } catch {
    // Do not echo malformed manifests, filesystem paths or local file content.
    console.error(
      'Instrumentation trace validation failed; refusing to publish unfiltered bundles.',
    );
    process.exitCode = 1;
  }
}
