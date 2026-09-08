import type { Readable } from 'node:stream';

export type MaterialByteInput = Buffer | Uint8Array | Readable | ReadableStream<Uint8Array>;

export type MaterialByteStoreErrorCode =
  | 'MATERIAL_BYTE_CONFIG_INVALID'
  | 'MATERIAL_BYTE_INVALID_KEY'
  | 'MATERIAL_BYTE_WRITE_FAILED'
  | 'MATERIAL_BYTE_WRITE_UNCERTAIN'
  | 'MATERIAL_BYTE_READ_FAILED'
  | 'MATERIAL_BYTE_DELETE_FAILED'
  | 'ENOENT';

/** Closed storage error: provider diagnostics, keys and credentials never escape. */
export class MaterialByteStoreError extends Error {
  override readonly name = 'MaterialByteStoreError';

  constructor(
    readonly code: MaterialByteStoreErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface MaterialByteStore {
  /**
   * Rejected input must preserve an existing object. Remote writes whose commit
   * cannot be confirmed report WRITE_UNCERTAIN; callers must retain a cleanup
   * reference until they can read or delete the object, never assume it is absent.
   */
  put(key: string, body: MaterialByteInput, mime?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Idempotently remove the object and any backend-owned incomplete replacement. */
  delete(key: string): Promise<void>;
  /** Optional backend capability used to reclaim crash-orphaned session objects. */
  deletePrefix?(prefix: string): Promise<void>;
}
