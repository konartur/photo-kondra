import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { PresignedUrlSigner } from './s3-storage.service.js';

const done = jest.fn<() => Promise<void>>();
const on = jest.fn();
const upload = jest.fn().mockImplementation(() => ({ done, on }));
jest.unstable_mockModule('@aws-sdk/lib-storage', () => ({ Upload: upload }));
const { S3StorageService } = await import('./s3-storage.service.js');

describe('S3 streaming upload', () => {
  const client = {} as S3Client;
  const service = new S3StorageService(
    client,
    { region: 'eu-central-1', bucket: 'private', forcePathStyle: false },
    jest.fn<PresignedUrlSigner>(),
  );
  beforeEach(() => {
    upload.mockClear();
    done.mockReset();
    on.mockReset();
  });

  it('uses bounded multipart upload and aborts incomplete parts on failure', async () => {
    const body = Readable.from(['zip']);
    await service.upload({ key: 'archives/id.zip', body, contentType: 'application/zip' });
    expect(upload).toHaveBeenCalledWith({
      client,
      params: {
        Bucket: 'private',
        Key: 'archives/id.zip',
        Body: body,
        ContentType: 'application/zip',
      },
      queueSize: 2,
      partSize: 5242880,
      leavePartsOnError: false,
    });
    expect(done).toHaveBeenCalledTimes(1);
    body.destroy();
  });

  it('propagates multipart upload failures to the archive processor', async () => {
    done.mockRejectedValue(new Error('Multipart failed'));
    const body = Readable.from(['zip']);
    await expect(
      service.upload({ key: 'archives/id.zip', body, contentType: 'application/zip' }),
    ).rejects.toThrow('Multipart failed');
    body.destroy();
  });

  it('forwards confirmed multipart progress through the storage abstraction', async () => {
    const progress = jest.fn();
    const body = Readable.from(['zip']);
    await service.upload({
      key: 'archives/id.zip',
      body,
      contentType: 'application/zip',
      onProgress: progress,
    });
    expect(on).toHaveBeenCalledWith('httpUploadProgress', expect.any(Function));
    const handler = on.mock.calls[0]![1] as (value: { loaded: number }) => void;
    handler({ loaded: 5242880 });
    expect(progress).toHaveBeenCalledWith(5242880);
    body.destroy();
  });
});
