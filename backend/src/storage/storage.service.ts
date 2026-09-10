import { Readable } from 'node:stream';

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface CreateUploadUrlParams {
  key: string;
  contentType: string;
  expiresIn: number;
}

export interface CreateDownloadUrlParams {
  key: string;
  expiresIn: number;
  filename?: string;
}

export interface UploadObjectParams {
  key: string;
  body: Buffer | Readable;
  contentType: string;
}

export interface StorageService {
  createUploadUrl(params: CreateUploadUrlParams): Promise<string>;
  createDownloadUrl(params: CreateDownloadUrlParams): Promise<string>;
  upload(params: UploadObjectParams): Promise<void>;
  download(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
