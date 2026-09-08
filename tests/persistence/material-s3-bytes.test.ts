import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMaterialByteStore,
  LocalMaterialByteStore,
  MaterialByteStoreError,
  setMaterialByteStoreForTests,
} from '@/lib/server/materials/bytes';
import {
  createS3MaterialByteStore,
  S3MaterialByteStore,
  type MaterialS3Client,
} from '@/lib/server/materials/s3-bytes';

type Command = Parameters<MaterialS3Client['send']>[0];
const BUCKET = 'fictional-teacher-materials';
const KEY = 'materials/v1/sessions/ses_fictional/mat_fictional/raw.bin';
const PREFIX = 'materials/v1/sessions/ses_fictional/';

function fixture(maxBytes = 1024) {
  const objects = new Map<string, Buffer>();
  const send = vi.fn(async (command: Command): Promise<unknown> => {
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key!, Buffer.from(command.input.Body as Uint8Array));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const bytes = objects.get(command.input.Key!);
      if (!bytes) throw Object.assign(new Error('private key'), { name: 'NoSuchKey' });
      return { Body: Readable.from([bytes]), ContentLength: bytes.byteLength };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!);
      return {};
    }
    if (command instanceof ListObjectsV2Command) {
      const keys = [...objects.keys()]
        .sort()
        .filter(
          (key) =>
            key.startsWith(command.input.Prefix!) &&
            (!command.input.ContinuationToken || key > command.input.ContinuationToken),
        );
      const page = keys.slice(0, 1000);
      return {
        Contents: page.map((Key) => ({ Key })),
        IsTruncated: keys.length > page.length,
        ...(keys.length > page.length ? { NextContinuationToken: page.at(-1) } : {}),
      };
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const item of command.input.Delete!.Objects!) objects.delete(item.Key!);
      return {};
    }
    throw new Error('unexpected command');
  });
  return {
    objects,
    send,
    store: new S3MaterialByteStore({ bucket: BUCKET, client: { send }, maxBytes }),
  };
}

afterEach(() => {
  setMaterialByteStoreForTests(null);
  vi.unstubAllEnvs();
});

describe('S3MaterialByteStore', () => {
  it.each(['buffer', 'uint8', 'node-stream', 'web-stream'])(
    'round-trips %s input through private object operations',
    async (kind) => {
      const { store, send } = fixture();
      const bytes = Buffer.from('fictional material');
      const input =
        kind === 'buffer'
          ? bytes
          : kind === 'uint8'
            ? Uint8Array.from(bytes)
            : kind === 'node-stream'
              ? Readable.from([bytes.subarray(0, 4), bytes.subarray(4)])
              : new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                  },
                });

      await store.put(KEY, input, 'application/pdf');
      await expect(store.get(KEY)).resolves.toEqual(bytes);
      const put = send.mock.calls.find(([command]) => command instanceof PutObjectCommand)![0];
      expect(put.input).toMatchObject({
        Bucket: BUCKET,
        Key: KEY,
        ContentLength: bytes.length,
        ContentType: 'application/pdf',
      });
      expect(put.input).not.toHaveProperty('ACL');
      await store.delete(KEY);
      await store.delete(KEY);
      await expect(store.get(KEY)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('bounds replacement input before PUT and preserves the committed bytes on failure', async () => {
    const { store, send } = fixture(6);
    await store.put(KEY, Buffer.from('before'));
    const broken = Readable.from(
      (async function* () {
        yield Buffer.from('new');
        throw new MaterialByteStoreError('MATERIAL_BYTE_WRITE_FAILED', 'private student data');
      })(),
    );
    const inputError = await store.put(KEY, broken).catch((error: unknown) => error);
    expect(inputError).toMatchObject({
      code: 'MATERIAL_BYTE_WRITE_FAILED',
      message: 'material byte write failed',
    });
    expect((inputError as Error).cause).toBeUndefined();
    await expect(store.put(KEY, Buffer.from('1234567'))).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_WRITE_FAILED',
    });
    const oversized = Readable.from([Buffer.from('123456'), Buffer.from('7')]);
    await expect(store.put(KEY, oversized)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_WRITE_FAILED',
    });
    expect(oversized.destroyed).toBe(true);
    expect(send.mock.calls.filter(([command]) => command instanceof PutObjectCommand)).toHaveLength(
      1,
    );
    await expect(store.get(KEY)).resolves.toEqual(Buffer.from('before'));
    await store.put(KEY, Buffer.from('123456'));
    await expect(store.get(KEY)).resolves.toEqual(Buffer.from('123456'));
  });

  it('cancels an oversized web stream before submitting any remote write', async () => {
    const { store, send } = fixture(3);
    const cancelled = vi.fn();
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('1234'));
      },
      cancel: cancelled,
    });
    await expect(store.put(KEY, input)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_WRITE_FAILED',
    });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it('recovers a lost PUT acknowledgement only when readback matches the intended bytes', async () => {
    const { store, send, objects } = fixture();
    send.mockImplementationOnce(async (command) => {
      objects.set(KEY, Buffer.from((command as PutObjectCommand).input.Body as Uint8Array));
      throw new Error('private endpoint or signing diagnostic');
    });
    await expect(store.put(KEY, Buffer.from('committed'))).resolves.toBeUndefined();
    expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(false);
  });

  it.each(['different-bytes', 'read-unavailable'])(
    'reports uncertain %s PUT without destructive rollback',
    async (mode) => {
      const { store, send, objects } = fixture();
      objects.set(KEY, Buffer.from('other committed content'));
      send.mockRejectedValueOnce(new Error('private credential'));
      if (mode === 'read-unavailable') send.mockRejectedValueOnce(new Error('private endpoint'));
      const error = await store.put(KEY, Buffer.from('attempt')).catch((value: unknown) => value);
      expect(error).toMatchObject({
        code: 'MATERIAL_BYTE_WRITE_UNCERTAIN',
        message: 'material byte write could not be confirmed',
      });
      expect((error as Error).cause).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain('private');
      expect(objects.get(KEY)).toEqual(Buffer.from('other committed content'));
      expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(
        false,
      );
    },
  );

  it.each([
    { name: 'NoSuchBucket' },
    { $metadata: { httpStatusCode: 404 } },
    { name: 'AccessDenied' },
  ])(
    'does not treat bucket, endpoint or permission failures as a missing file: %j',
    async (providerError) => {
      const { store, send } = fixture();
      send.mockRejectedValue(Object.assign(new Error('private provider detail'), providerError));
      await expect(store.get(KEY)).rejects.toMatchObject({ code: 'MATERIAL_BYTE_READ_FAILED' });
      await expect(store.delete(KEY)).rejects.toMatchObject({
        code: 'MATERIAL_BYTE_DELETE_FAILED',
      });
    },
  );

  it('bounds GET by both declared and actual bytes and closes its response stream', async () => {
    const { store, send } = fixture(3);
    const declaredOversize = Readable.from([Buffer.from('1234')]);
    send.mockResolvedValueOnce({ Body: declaredOversize, ContentLength: 4 });
    await expect(store.get(KEY)).rejects.toMatchObject({ code: 'MATERIAL_BYTE_READ_FAILED' });
    expect(declaredOversize.destroyed).toBe(true);
    const undeclaredOversize = Readable.from([Buffer.from('12'), Buffer.from('34')]);
    send.mockResolvedValueOnce({ Body: undeclaredOversize });
    await expect(store.get(KEY)).rejects.toMatchObject({ code: 'MATERIAL_BYTE_READ_FAILED' });
    expect(undeclaredOversize.destroyed).toBe(true);
  });

  it('deletes multiple pages and keeps a neighboring session untouched', async () => {
    const { store, send, objects } = fixture();
    for (let index = 0; index < 2003; index++) {
      objects.set(
        `${PREFIX}artifact_${String(index).padStart(4, '0')}.json`,
        Buffer.from('fictional'),
      );
    }
    const other = 'materials/v1/sessions/ses_other/file.json';
    objects.set(other, Buffer.from('keep'));
    await store.deletePrefix(PREFIX);
    expect([...objects.keys()]).toEqual([other]);
    const deletes = send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof DeleteObjectsCommand);
    expect(deletes.map((command) => command.input.Delete?.Objects?.length)).toEqual([
      1000, 1000, 3,
    ]);
    expect(
      send.mock.calls.filter(([command]) => command instanceof ListObjectsV2Command),
    ).toHaveLength(3);
  });

  it('stops after a batch reports partial errors instead of pretending cleanup succeeded', async () => {
    const { store, send } = fixture();
    send.mockResolvedValueOnce({
      Contents: [{ Key: KEY }],
      IsTruncated: true,
      NextContinuationToken: 'next',
    });
    send.mockResolvedValueOnce({
      Errors: [{ Key: KEY, Code: 'AccessDenied', Message: 'private error' }],
    });
    await expect(store.deletePrefix(PREFIX)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_DELETE_FAILED',
      message: 'material byte deletion failed',
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('allows an already absent object in a batch but fails a later listing outage', async () => {
    const { store, send } = fixture();
    send.mockResolvedValueOnce({
      Contents: [{ Key: KEY }],
      IsTruncated: true,
      NextContinuationToken: 'next',
    });
    send.mockResolvedValueOnce({ Errors: [{ Key: KEY, Code: 'NoSuchKey' }] });
    send.mockRejectedValueOnce(new Error('private list endpoint'));
    await expect(store.deletePrefix(PREFIX)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_DELETE_FAILED',
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it.each([
    { Contents: [{}] },
    { Contents: [{ Key: 'materials/v1/sessions/ses_other/private.pdf' }] },
    { Contents: [{ Key: `${PREFIX}../other` }] },
    { IsTruncated: true },
  ])('rejects unsafe/incomplete cleanup responses: %j', async (page) => {
    const { store, send } = fixture();
    send.mockResolvedValueOnce(page);
    await expect(store.deletePrefix(PREFIX)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_DELETE_FAILED',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a repeated continuation token instead of looping forever', async () => {
    const { store, send } = fixture();
    send.mockResolvedValue({ IsTruncated: true, NextContinuationToken: 'same' });
    await expect(store.deletePrefix(PREFIX)).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_DELETE_FAILED',
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    '../outside',
    'materials\\secret',
    'materials//secret',
    'materials/con',
    '',
    'a/'.repeat(513) + 'a',
  ])('rejects unsafe keys without issuing S3 requests: %s', async (key) => {
    const { store, send } = fixture();
    for (const operation of [
      () => store.put(key, Buffer.from('x')),
      () => store.get(key),
      () => store.delete(key),
      () => store.deletePrefix(`${key}/`),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: 'MATERIAL_BYTE_INVALID_KEY' });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an empty prefix and a prefix without a slash', async () => {
    const { store, send } = fixture();
    await expect(store.deletePrefix('/')).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_INVALID_KEY',
    });
    await expect(store.deletePrefix(PREFIX.slice(0, -1))).rejects.toMatchObject({
      code: 'MATERIAL_BYTE_INVALID_KEY',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Materials storage selection', () => {
  const config = {
    MATERIAL_S3_BUCKET: BUCKET,
    MATERIAL_S3_ENDPOINT: 'https://fictional-account.r2.cloudflarestorage.com',
    MATERIAL_S3_REGION: 'auto',
    MATERIAL_S3_ACCESS_KEY_ID: 'fictional-access-key',
    MATERIAL_S3_SECRET_ACCESS_KEY: 'fictional-secret-key',
  };

  it('keeps local storage as the default', () => {
    vi.stubEnv('MATERIAL_STORAGE_PROVIDER', '');
    expect(getMaterialByteStore()).toBeInstanceOf(LocalMaterialByteStore);
    expect(getMaterialByteStore()).toBe(getMaterialByteStore());
  });

  it('selects S3 only with explicit complete private configuration', () => {
    vi.stubEnv('MATERIAL_STORAGE_PROVIDER', 's3');
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    expect(getMaterialByteStore()).toBeInstanceOf(S3MaterialByteStore);
  });

  it('does not cache an invalid provider or silently fall back to local files', () => {
    vi.stubEnv('MATERIAL_STORAGE_PROVIDER', 'invalid-private-value');
    expect(() => getMaterialByteStore()).toThrow('material storage configuration is invalid');
    vi.stubEnv('MATERIAL_STORAGE_PROVIDER', 'local');
    expect(getMaterialByteStore()).toBeInstanceOf(LocalMaterialByteStore);
  });

  it.each([
    'MATERIAL_S3_BUCKET',
    'MATERIAL_S3_ENDPOINT',
    'MATERIAL_S3_ACCESS_KEY_ID',
    'MATERIAL_S3_SECRET_ACCESS_KEY',
  ])('requires %s without echoing configuration', (key) => {
    expect(() => createS3MaterialByteStore({ ...config, [key]: '' })).toThrow(
      'material storage configuration is invalid',
    );
  });

  it.each([
    'http://example.invalid',
    'https://user:secret@example.invalid',
    'https://example.invalid?secret=value',
    'not a URL',
  ])('rejects insecure or credential-bearing endpoints: %s', (endpoint) => {
    expect(() => createS3MaterialByteStore({ ...config, MATERIAL_S3_ENDPOINT: endpoint })).toThrow(
      'material storage configuration is invalid',
    );
  });
});
