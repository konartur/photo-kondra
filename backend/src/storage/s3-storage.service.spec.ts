import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ServiceUnavailableException } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it, jest } from '@jest/globals';
import type { S3StorageConfig } from './s3-storage.config.js';
import { S3StorageService } from './s3-storage.service.js';
import type { PresignedUrlSigner } from './s3-storage.service.js';

const config: S3StorageConfig = {
  region: 'eu-central-1',
  bucket: 'photo-cloud-test',
  forcePathStyle: false,
};

describe('S3StorageService', () => {
  const client = { send: jest.fn() } as unknown as S3Client;
  const signUrl = jest.fn<PresignedUrlSigner>();
  const service = new S3StorageService(client, config, signUrl);

  it('creates a presigned PUT URL without granting public access', async () => {
    signUrl.mockResolvedValue('https://signed.example/upload');

    await expect(
      service.createUploadUrl({
        key: 'galleries/id/originals/photo.jpg',
        contentType: 'image/jpeg',
        expiresIn: 900,
      }),
    ).resolves.toBe('https://signed.example/upload');

    const command = signUrl.mock.calls[0]?.[1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command?.input).toEqual({
      Bucket: 'photo-cloud-test',
      Key: 'galleries/id/originals/photo.jpg',
      ContentType: 'image/jpeg',
      IfNoneMatch: '*',
    });
  });

  it('creates a presigned download URL with an attachment filename', async () => {
    signUrl.mockResolvedValue('https://signed.example/download');

    await service.createDownloadUrl({
      key: 'galleries/id/originals/photo.jpg',
      expiresIn: 900,
      filename: 'photo 1.jpg',
    });

    const command = signUrl.mock.calls.at(-1)?.[1];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input.ResponseContentDisposition).toBe(
      "attachment; filename*=UTF-8''photo%201.jpg",
    );
  });

  it('returns false when an object is not found', async () => {
    jest.mocked(client.send).mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });

    await expect(service.exists('missing.jpg')).resolves.toBe(false);
    expect(client.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('rejects storage use when required bucket configuration is absent', async () => {
    const unconfigured = new S3StorageService(client, { forcePathStyle: false }, signUrl);

    await expect(
      unconfigured.createUploadUrl({ key: 'photo.jpg', contentType: 'image/jpeg', expiresIn: 60 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('binds browser uploads to a create-only conditional PUT', async () => {
    await service.createUploadUrl({
      key: 'galleries/id/originals/new.jpg',
      contentType: 'image/jpeg',
      expiresIn: 900,
    });
    expect(signUrl.mock.calls.at(-1)?.[1].input).toHaveProperty('IfNoneMatch', '*');
    expect(signUrl.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({ signableHeaders: new Set(['if-none-match', 'content-type']) }),
    );
  });

  it('refuses unsafe signed URL lifetimes before invoking the signer', async () => {
    await expect(service.createDownloadUrl({ key: 'private', expiresIn: 86400 })).rejects.toThrow();
  });

  it('binds portfolio Content-Length and private derivative cache policy when explicitly requested', async () => {
    await service.createUploadUrl({
      key: 'portfolio/media/test/original.jpg',
      contentType: 'image/jpeg',
      expiresIn: 900,
      contentLength: 10_000_000,
    });
    expect(signUrl.mock.calls.at(-1)?.[1].input).toHaveProperty('ContentLength', 10_000_000);
    expect(signUrl.mock.calls.at(-1)?.[2].signableHeaders).toContain('content-length');
    await service.createDownloadUrl({
      key: 'portfolio/media/test/variant.webp',
      expiresIn: 300,
      cacheControl: 'private, no-store',
    });
    expect(signUrl.mock.calls.at(-1)?.[1].input).toHaveProperty(
      'ResponseCacheControl',
      'private, no-store',
    );
  });

  it('cryptographically signs the create-only and content-type headers', async () => {
    const offlineClient = new S3Client({
      region: 'eu-central-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    try {
      const adapter = new S3StorageService(offlineClient, config, getSignedUrl);
      const url = new URL(
        await adapter.createUploadUrl({
          key: 'new.jpg',
          contentType: 'image/jpeg',
          expiresIn: 900,
        }),
      );
      const headers = url.searchParams.get('X-Amz-SignedHeaders')?.split(';');
      expect(headers).toEqual(expect.arrayContaining(['if-none-match', 'content-type', 'host']));
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    } finally {
      offlineClient.destroy();
    }
  });
});
