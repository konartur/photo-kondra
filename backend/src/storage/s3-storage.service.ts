import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import {
  CreateDownloadUrlParams,
  CreateUploadUrlParams,
  UploadObjectParams,
} from './storage.service.js';
import type { StorageService } from './storage.service.js';
import { StorageObjectNotFoundError } from './storage.service.js';
import { S3_CLIENT, S3_PRESIGNED_URL_SIGNER, S3_STORAGE_CONFIG } from './s3-storage.config.js';
import type { S3StorageConfig } from './s3-storage.config.js';
import { signedUrlLimits, validateSignedUrlTtl } from './signed-url-policy.js';

export type PresignedUrlSigner = (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number; signableHeaders?: Set<string> },
) => Promise<string>;

@Injectable()
export class S3StorageService implements StorageService {
  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(S3_STORAGE_CONFIG) private readonly config: S3StorageConfig,
    @Inject(S3_PRESIGNED_URL_SIGNER) private readonly signUrl: PresignedUrlSigner,
  ) {}

  async createUploadUrl({
    key,
    contentType,
    expiresIn,
    contentLength,
  }: CreateUploadUrlParams): Promise<string> {
    validateSignedUrlTtl(expiresIn, signedUrlLimits.upload);
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 1))
      throw new ServiceUnavailableException('Invalid upload content length');
    return this.signUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        IfNoneMatch: '*',
        ...(contentLength !== undefined && { ContentLength: contentLength }),
      }),
      {
        expiresIn,
        signableHeaders: new Set([
          'if-none-match',
          'content-type',
          ...(contentLength !== undefined ? ['content-length'] : []),
        ]),
      },
    );
  }

  async createDownloadUrl({
    key,
    expiresIn,
    filename,
    cacheControl,
  }: CreateDownloadUrlParams): Promise<string> {
    validateSignedUrlTtl(expiresIn, signedUrlLimits.preview);
    return this.signUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(filename && { ResponseContentDisposition: contentDisposition(filename) }),
        ...(cacheControl && { ResponseCacheControl: cacheControl }),
      }),
      { expiresIn },
    );
  }

  async upload({
    key,
    body,
    contentType,
    onProgress,
    signal,
    cacheControl,
  }: UploadObjectParams): Promise<void> {
    signal?.throwIfAborted();
    if (body instanceof Readable) {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(cacheControl && { CacheControl: cacheControl }),
        },
        queueSize: 2,
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      });
      if (onProgress) upload.on('httpUploadProgress', ({ loaded }) => onProgress(loaded ?? 0));
      const abort = () => {
        void upload.abort().catch(() => undefined);
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (signal?.aborted) abort();
        await upload.done();
      } finally {
        signal?.removeEventListener('abort', abort);
      }
      return;
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body as Buffer | Readable,
      ContentType: contentType,
      ...(cacheControl && { CacheControl: cacheControl }),
    });
    if (signal) await this.client.send(command, { abortSignal: signal });
    else await this.client.send(command);
    onProgress?.(body.length);
  }

  async download(key: string, signal?: AbortSignal): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    let response;
    try {
      response = signal
        ? await this.client.send(command, { abortSignal: signal })
        : await this.client.send(command);
    } catch (error) {
      if (isNotFound(error)) throw new StorageObjectNotFoundError();
      throw error;
    }

    if (!(response.Body instanceof Readable)) {
      throw new Error('Storage object body is not a readable stream');
    }

    return response.Body;
  }

  async delete(key: string, signal?: AbortSignal): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    if (signal) await this.client.send(command, { abortSignal: signal });
    else await this.client.send(command);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  private get bucket(): string {
    if (!this.config.bucket || !this.config.region) {
      throw new ServiceUnavailableException('Object storage is not configured');
    }

    return this.config.bucket;
  }
}

function contentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function isNotFound(error: unknown): boolean {
  return (
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) ||
    (typeof error === 'object' &&
      error !== null &&
      '$metadata' in error &&
      (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode === 404)
  );
}
