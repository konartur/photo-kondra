import { Readable } from 'node:stream';

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface CreateUploadUrlParams {
  key: string;
  contentType: string;
  expiresIn: number;
  /** Optional exact size signed into Content-Length; browsers set it for File/Blob PUTs. */
  contentLength?: number;
}

export interface CreateDownloadUrlParams {
  key: string;
  expiresIn: number;
  filename?: string;
  cacheControl?: string;
}

export interface UploadObjectParams {
  key: string;
  body: Buffer | Readable;
  contentType: string;
  onProgress?: (uploadedBytes: number) => void;
  signal?: AbortSignal;
  cacheControl?: string;
}

export interface StorageService {
  /** Signs a create-only PUT; callers must send Content-Type and If-None-Match: *. */
  createUploadUrl(params: CreateUploadUrlParams): Promise<string>;
  createDownloadUrl(params: CreateDownloadUrlParams): Promise<string>;
  upload(params: UploadObjectParams): Promise<void>;
  download(key: string, signal?: AbortSignal): Promise<Readable>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super('Storage object not found');
  }
}
