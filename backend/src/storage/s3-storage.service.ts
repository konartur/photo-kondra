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
import { S3_CLIENT, S3_PRESIGNED_URL_SIGNER, S3_STORAGE_CONFIG } from './s3-storage.config.js';
import type { S3StorageConfig } from './s3-storage.config.js';

export type PresignedUrlSigner = (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

@Injectable()
export class S3StorageService implements StorageService {
  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(S3_STORAGE_CONFIG) private readonly config: S3StorageConfig,
    @Inject(S3_PRESIGNED_URL_SIGNER) private readonly signUrl: PresignedUrlSigner,
  ) {}

  async createUploadUrl({ key, contentType, expiresIn }: CreateUploadUrlParams): Promise<string> {
    return this.signUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async createDownloadUrl({ key, expiresIn, filename }: CreateDownloadUrlParams): Promise<string> {
    return this.signUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(filename && { ResponseContentDisposition: contentDisposition(filename) }),
      }),
      { expiresIn },
    );
  }

  async upload({ key, body, contentType, onProgress }: UploadObjectParams): Promise<void> {
    if (body instanceof Readable) {
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
        queueSize: 2,
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      });
      if (onProgress) upload.on('httpUploadProgress', ({ loaded }) => onProgress(loaded ?? 0));
      await upload.done();
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body as Buffer | Readable,
        ContentType: contentType,
      }),
    );
    onProgress?.(body.length);
  }

  async download(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!(response.Body instanceof Readable)) {
      throw new Error('Storage object body is not a readable stream');
    }

    return response.Body;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
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
