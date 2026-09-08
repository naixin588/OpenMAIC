import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadSkills } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import { SkillDiscoveryEnv } from '@/lib/server/agent-runtime/skill-discovery-env';

describe('portable native skill discovery', () => {
  it('loads nested skills and respects ignore files from an absolute native path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'teacher-skill-discovery-'));
    const skillText = (name: string) =>
      `---\nname: ${name}\ndescription: Fictional teaching helper.\n---\n# ${name}\n`;
    try {
      await mkdir(join(root, 'nested', 'visible'), { recursive: true });
      await mkdir(join(root, 'hidden'));
      await writeFile(join(root, '.ignore'), 'hidden/\n');
      await writeFile(join(root, 'nested', 'visible', 'SKILL.md'), skillText('visible'));
      await writeFile(join(root, 'hidden', 'SKILL.md'), skillText('hidden'));
      const env = new SkillDiscoveryEnv({ cwd: root });
      const loaded = await loadSkills(env, root);

      expect(loaded.diagnostics).toEqual([]);
      expect(loaded.skills.map((skill) => skill.name)).toEqual(['visible']);
      expect(resolve(loaded.skills[0].filePath)).toBe(join(root, 'nested', 'visible', 'SKILL.md'));
      const read = await env.readTextFile(loaded.skills[0].filePath);
      expect(read.ok && read.value).toBe(skillText('visible'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves missing-path errors so an unavailable mount stays recoverable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'teacher-skill-discovery-'));
    try {
      const env = new SkillDiscoveryEnv({ cwd: root });
      expect(await loadSkills(env, join(root, 'missing'))).toEqual({ skills: [], diagnostics: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
