import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { basename } from 'node:path';

/**
 * pi's skill loader computes relative paths with `/`, while the Node adapter
 * returns native separators. Keep discovery paths in that portable spelling;
 * Node still resolves and reads the actual files (including on Windows).
 */
function discoveryPath(path: string): string {
  return process.platform === 'win32' ? path.replace(/\\/g, '/') : path;
}

export class SkillDiscoveryEnv extends NodeExecutionEnv {
  override async fileInfo(path: string) {
    const result = await super.fileInfo(path);
    return result.ok
      ? {
          ...result,
          value: {
            ...result.value,
            name: basename(result.value.path),
            path: discoveryPath(result.value.path),
          },
        }
      : result;
  }

  override async listDir(path: string, abortSignal?: AbortSignal) {
    const result = await super.listDir(path, abortSignal);
    return result.ok
      ? {
          ...result,
          value: result.value.map((entry) => ({
            ...entry,
            name: basename(entry.path),
            path: discoveryPath(entry.path),
          })),
        }
      : result;
  }

  override async canonicalPath(path: string) {
    const result = await super.canonicalPath(path);
    return result.ok ? { ...result, value: discoveryPath(result.value) } : result;
  }
}
