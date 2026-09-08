/** Root-only, non-runtime files shared by Next route and instrumentation tracing. */
export const NON_RUNTIME_TRACE_DIRECTORIES = ['assets', 'tests', 'data', 'logs', 'test-results'];

export const NON_RUNTIME_TRACE_EXCLUDES = [
  ...NON_RUNTIME_TRACE_DIRECTORIES.map((name) => `./${name}/**/*`),
  './*.tsbuildinfo',
];
