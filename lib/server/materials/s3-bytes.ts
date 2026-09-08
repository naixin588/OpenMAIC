import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type DeleteObjectsCommandOutput,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import { agentRuntimeConfig } from '@/lib/server/agent-runtime/config';
import {
  MaterialByteStoreError,
  type MaterialByteInput,
  type MaterialByteStore,
} from './byte-store';
import { assertPortableMaterialObjectKey } from './object-keys';

type MaterialS3Command =
  | PutObjectCommand
  | GetObjectCommand
  | DeleteObjectCommand
  | ListObjectsV2Command
  | DeleteObjectsCommand;

export interface MaterialS3Client {
  send(command: MaterialS3Command): Promise<unknown>;
}

export interface S3MaterialByteStoreOptions {
  client: MaterialS3Client;
  bucket: string;
  maxBytes?: number;
}

function invalidConfig(): never {
  throw new MaterialByteStoreError(
    'MATERIAL_BYTE_CONFIG_INVALID',
    'material storage configuration is invalid',
  );
}

function assertSafeKey(key: string): void {
  try {
    assertPortableMaterialObjectKey(key);
    // S3 keys are limited to 1,024 UTF-8 bytes. Canonical material keys are ASCII.
    if (Buffer.byteLength(key, 'utf8') > 1024) throw new Error();
  } catch {
    throw new MaterialByteStoreError('MATERIAL_BYTE_INVALID_KEY', 'invalid material object key');
  }
}

function isMissingKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; Code?: string; code?: string };
  // A generic 404 can be a missing bucket or wrong endpoint, not a deleted file.
  return value.name === 'NoSuchKey' || value.Code === 'NoSuchKey' || value.code === 'NoSuchKey';
}

async function boundedBytes(body: MaterialByteInput, maxBytes: number): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) throw new Error();
    return Buffer.from(body);
  }
  const stream = body instanceof Readable ? body : Readable.fromWeb(body as never);
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > maxBytes) throw new Error();
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, length);
  } finally {
    if (!stream.destroyed) stream.destroy();
  }
}

/** Private S3-compatible bytes behind the existing Materials ownership routes. */
export class S3MaterialByteStore implements MaterialByteStore {
  private readonly client: MaterialS3Client;
  private readonly bucket: string;
  private readonly maxBytes: number;

  constructor(options: S3MaterialByteStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.maxBytes = options.maxBytes ?? agentRuntimeConfig.maxUploadBytes;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) invalidConfig();
  }

  async put(key: string, body: MaterialByteInput, mime?: string): Promise<void> {
    assertSafeKey(key);
    let bytes: Buffer;
    try {
      // Finish and bound input before PUT so a broken or oversized replacement
      // cannot replace committed bytes with a partial upload. No temp objects.
      bytes = await boundedBytes(body, this.maxBytes);
    } catch {
      throw new MaterialByteStoreError('MATERIAL_BYTE_WRITE_FAILED', 'material byte write failed');
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ...(mime ? { ContentType: mime } : {}),
        }),
      );
    } catch {
      // A lost acknowledgement can follow a successful atomic PUT. Verify the
      // intended bytes when possible; never DELETE or roll back a replacement.
      try {
        if ((await this.get(key)).equals(bytes)) return;
      } catch {
        // Keep the original uncertainty; a read outage is not proof of absence.
      }
      throw new MaterialByteStoreError(
        'MATERIAL_BYTE_WRITE_UNCERTAIN',
        'material byte write could not be confirmed',
      );
    }
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    try {
      const result = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as GetObjectCommandOutput;
      if (!result.Body) throw new Error();
      if (result.ContentLength !== undefined && result.ContentLength > this.maxBytes) {
        if (result.Body instanceof Readable) result.Body.destroy();
        throw new Error();
      }
      // The Node SDK returns a Readable; transformToWebStream also supports
      // other SDK response handlers without unbounded transformToByteArray().
      const body =
        result.Body instanceof Readable ? result.Body : result.Body.transformToWebStream();
      return await boundedBytes(body, this.maxBytes);
    } catch (error) {
      if (isMissingKey(error)) {
        throw new MaterialByteStoreError('ENOENT', 'material bytes are unavailable');
      }
      throw new MaterialByteStoreError('MATERIAL_BYTE_READ_FAILED', 'material byte read failed');
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isMissingKey(error)) return;
      throw new MaterialByteStoreError(
        'MATERIAL_BYTE_DELETE_FAILED',
        'material byte deletion failed',
      );
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (typeof prefix !== 'string' || !prefix.endsWith('/')) {
      throw new MaterialByteStoreError(
        'MATERIAL_BYTE_INVALID_KEY',
        'invalid material object prefix',
      );
    }
    assertSafeKey(prefix.slice(0, -1));
    let continuationToken: string | undefined;
    const seenTokens = new Set<string>();
    try {
      do {
        const page = (await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }),
        )) as ListObjectsV2CommandOutput;
        const keys = (page.Contents ?? []).map((item) => {
          if (!item.Key || !item.Key.startsWith(prefix)) throw new Error();
          assertSafeKey(item.Key);
          return { Key: item.Key };
        });
        // Do not move to the next page after even one per-object error. Keeping
        // the SQL cleanup pointer makes the operation retryable after recovery.
        for (let offset = 0; offset < keys.length; offset += 1000) {
          const result = (await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys.slice(offset, offset + 1000), Quiet: true },
            }),
          )) as DeleteObjectsCommandOutput;
          if (result.Errors?.some((error) => error.Code !== 'NoSuchKey')) throw new Error();
        }
        if (!page.IsTruncated) break;
        const next = page.NextContinuationToken;
        if (!next || seenTokens.has(next)) throw new Error();
        seenTokens.add(next);
        continuationToken = next;
      } while (continuationToken);
    } catch {
      throw new MaterialByteStoreError(
        'MATERIAL_BYTE_DELETE_FAILED',
        'material byte deletion failed',
      );
    }
  }
}

/** Explicit Materials credentials avoid accidentally reusing another provider's AWS identity. */
export function createS3MaterialByteStore(
  env: Record<string, string | undefined>,
): S3MaterialByteStore {
  const bucket = env.MATERIAL_S3_BUCKET?.trim();
  const endpoint = env.MATERIAL_S3_ENDPOINT?.trim();
  const region = env.MATERIAL_S3_REGION?.trim() || 'auto';
  const accessKeyId = env.MATERIAL_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.MATERIAL_S3_SECRET_ACCESS_KEY?.trim();
  if (
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    invalidConfig();
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      invalidConfig();
    }
    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      // R2 and other S3-compatible services need not support optional AWS
      // streaming-checksum encodings. Material integrity remains SHA-verified.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new S3MaterialByteStore({ client, bucket });
  } catch {
    invalidConfig();
  }
}
