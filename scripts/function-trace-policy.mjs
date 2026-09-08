/**
 * Exact project-relative paths shared by Next route and instrumentation tracing.
 * Do not generalize these to recursive test, src, dist, or node_modules patterns:
 * packages may legitimately read resources from similarly named directories.
 */
export const NON_RUNTIME_TRACE_DIRECTORIES = [
  'assets',
  'tests',
  'data',
  'logs',
  'test-results',
  'e2e',
  'eval',
  // The documentation site and renderer service are separate deployments.
  'packages/docs',
  'render-service',
  'packages/@openmaic/dsl/test',
  'packages/@openmaic/editor/test',
  'packages/@openmaic/generation/test',
  'packages/@openmaic/importer/test',
  'packages/@openmaic/renderer/test',
  'packages/@openmaic/storage/test',
];

export const NON_RUNTIME_TRACE_FILES = [
  'pnpm-lock.yaml',
  // Neither file is an exported Node entry. Retain both import and require
  // entries, and all public/vendor files used by browser URL imports.
  'packages/@openmaic/importer/dist/index.umd.js',
  'packages/pptxgenjs/dist/pptxgen.js',
];

export const NON_RUNTIME_TRACE_EXCLUDES = [
  ...NON_RUNTIME_TRACE_DIRECTORIES.map((name) => `./${name}/**/*`),
  ...NON_RUNTIME_TRACE_FILES.map((name) => `./${name}`),
  './*.tsbuildinfo',
];

/** Match a normalized, project-relative POSIX path without affecting neighbors. */
export function isNonRuntimeProjectFile(file) {
  return (
    NON_RUNTIME_TRACE_DIRECTORIES.some((directory) => file.startsWith(`${directory}/`)) ||
    NON_RUNTIME_TRACE_FILES.includes(file) ||
    (!file.includes('/') && file.endsWith('.tsbuildinfo'))
  );
}
