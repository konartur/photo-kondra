import { ArchiveStatus, PhotoStatus, Prisma } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'node:stream';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ArchiveGenerationService } from './archive-generation.service.js';
import { ArchiveLeaseBusyError } from './archive-lease-busy.error.js';
import { archiveContentHash } from './archive-content.js';

const archive = {
  id: 'archive-id',
  galleryId: 'gallery-id',
  storageKey: null,
  contentHash: null,
  status: ArchiveStatus.PENDING,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  expiresAt: null,
};

const photo = {
  id: 'photo-id',
  galleryId: 'gallery-id',
  originalKey: 'galleries/gallery-id/originals/photo-id.jpg',
  previewKey: 'galleries/gallery-id/previews/photo-id.webp',
  thumbnailKey: 'galleries/gallery-id/thumbnails/photo-id.webp',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 123n,
  width: 1200,
  height: 800,
  status: PhotoStatus.READY,
  sortOrder: 0,
  processingLockId: null,
  processingLockExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ArchiveGenerationService', () => {
  const prisma = {
    $transaction: jest.fn(),
    gallery: { findUnique: jest.fn(), update: jest.fn() },
    archive: { updateMany: jest.fn(), findUnique: jest.fn() },
    photo: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const storage = {
    exists: jest.fn(),
    download: jest.fn(),
    upload: jest.fn(),
    delete: jest.fn(),
  } as unknown as StorageService;
  const service = new ArchiveGenerationService(prisma, storage, {
    lockTtlSeconds: 900,
    retentionSeconds: 86400,
    maxSize: 2147483648,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.gallery.findUnique)
      .mockResolvedValue({ status: 'DRAFT' } as NonNullable<
        Awaited<ReturnType<typeof prisma.gallery.findUnique>>
      >);
    const transaction = async (callback: unknown) =>
      (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(prisma);
    jest.mocked(prisma.$transaction).mockImplementation(transaction as typeof prisma.$transaction);
    jest.mocked(prisma.archive.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.archive.findUnique).mockResolvedValue(archive);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo]);
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest.mocked(storage.delete).mockResolvedValue();
    jest
      .mocked(storage.download)
      .mockImplementation(async () => Readable.from([Buffer.from('original image bytes')]));
    jest.mocked(storage.upload).mockImplementation(async ({ body }) => {
      for await (const chunk of body) void chunk;
    });
  });

  it('streams READY originals into private storage and marks the claimed archive ready', async () => {
    const uploaded: Buffer[] = [];
    jest
      .mocked(prisma.archive.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    jest.mocked(prisma.archive.findUnique).mockResolvedValue(archive);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo]);
    jest.mocked(storage.exists).mockResolvedValue(true);
    jest
      .mocked(storage.download)
      .mockResolvedValue(Readable.from([Buffer.from('original image bytes')]));
    jest.mocked(storage.upload).mockImplementation(async ({ body }) => {
      for await (const chunk of body) uploaded.push(Buffer.from(chunk));
    });

    await service.process({ archiveId: archive.id });

    expect(storage.download).toHaveBeenCalledWith(photo.originalKey);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^archives\/archive-id-.+\.zip$/),
        contentType: 'application/zip',
      }),
    );
    expect(Buffer.concat(uploaded).subarray(0, 2).toString()).toBe('PK');
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: archive.id, processingLockId: expect.any(String) }),
      data: expect.objectContaining({
        storageKey: expect.stringMatching(/^archives\/archive-id-.+\.zip$/),
        status: ArchiveStatus.READY,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('does not process a duplicate delivery while another worker holds the lease', async () => {
    jest.mocked(prisma.archive.updateMany).mockResolvedValue({ count: 0 });

    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      ArchiveLeaseBusyError,
    );

    expect(prisma.archive.findUnique).toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('fails a queued archive whose requested originals have changed', async () => {
    jest
      .mocked(prisma.archive.findUnique)
      .mockResolvedValue({ ...archive, contentHash: 'outdated' });
    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('does not publish ZIP output when gallery content changes during generation', async () => {
    jest
      .mocked(prisma.archive.findUnique)
      .mockResolvedValue({ ...archive, contentHash: archiveContentHash([photo]) });
    jest
      .mocked(prisma.photo.findMany)
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ ...photo, filename: 'changed.jpg' }]);
    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.upload).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('publishes final progress only after the archive is marked READY', async () => {
    const report = jest.fn<(value: unknown) => Promise<void>>().mockResolvedValue();
    await service.process({ archiveId: archive.id }, report);
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'ready', uploadPercent: 100 }),
    );
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) }),
    );
  });

  it('skips an already READY archive when its claim is rejected', async () => {
    jest.mocked(prisma.archive.updateMany).mockResolvedValue({ count: 0 });
    jest
      .mocked(prisma.archive.findUnique)
      .mockResolvedValue({ ...archive, status: ArchiveStatus.READY });
    await service.process({ archiveId: archive.id });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('marks the archive failed and cleans up when a READY original is missing', async () => {
    jest
      .mocked(prisma.archive.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    jest.mocked(prisma.archive.findUnique).mockResolvedValue(archive);
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo]);
    jest.mocked(storage.exists).mockResolvedValue(false);
    jest.mocked(storage.delete).mockResolvedValue();

    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^archives\/archive-id-.+\.zip$/),
    );
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: archive.id, processingLockId: expect.any(String) }),
      data: { status: ArchiveStatus.FAILED, processingLockId: null, processingLockExpiresAt: null },
    });
  });

  it('includes the original bytes in gallery order and sanitizes duplicate names', async () => {
    jest.mocked(prisma.photo.findMany).mockResolvedValue([
      { ...photo, filename: '../photo.jpg' },
      { ...photo, id: 'second', filename: '../photo.jpg' },
    ]);
    const chunks: Buffer[] = [];
    jest.mocked(storage.upload).mockImplementation(async ({ body }) => {
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
    });
    await service.process({ archiveId: archive.id });
    const entries = readStoredZip(Buffer.concat(chunks));
    expect(entries.map((entry) => entry.name)).toEqual(['.._photo.jpg', '.._photo (2).jpg']);
    expect(entries.map((entry) => entry.body.toString())).toEqual([
      'original image bytes',
      'original image bytes',
    ]);
    expect(prisma.photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { galleryId: archive.galleryId, status: 'READY', originalKey: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('does not open later originals while the current ZIP entry is still streaming', async () => {
    jest.mocked(prisma.photo.findMany).mockResolvedValue([photo, { ...photo, id: 'second' }]);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    jest.mocked(storage.download).mockImplementationOnce(async () =>
      Readable.from(
        (async function* () {
          started();
          yield Buffer.alloc(256 * 1024);
          await gate;
          yield Buffer.from('last chunk');
        })(),
      ),
    );
    const processing = service.process({ archiveId: archive.id });
    await firstStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(storage.download).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await processing;
    }
    expect(storage.download).toHaveBeenCalledTimes(2);
  });

  it('fails permanently when there are no READY originals', async () => {
    jest.mocked(prisma.photo.findMany).mockResolvedValue([]);
    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects oversized gallery metadata before opening streams', async () => {
    jest.mocked(prisma.photo.findMany).mockResolvedValue([{ ...photo, size: 2147483649n }]);
    await expect(service.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('enforces the byte limit even when photo size metadata is incorrect', async () => {
    const limited = new ArchiveGenerationService(prisma, storage, {
      lockTtlSeconds: 900,
      retentionSeconds: 86400,
      maxSize: 200,
    });
    jest
      .mocked(storage.download)
      .mockImplementation(async () => Readable.from([Buffer.alloc(201)]));
    await expect(limited.process({ archiveId: archive.id })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(storage.delete).toHaveBeenCalled();
  });

  it('cleans up a failed upload and permits a later retry with a separate object key', async () => {
    jest.mocked(storage.upload).mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(service.process({ archiveId: archive.id })).rejects.toThrow('S3 unavailable');
    await service.process({ archiveId: archive.id });
    const keys = jest.mocked(storage.upload).mock.calls.map(([params]) => params.key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(storage.delete).toHaveBeenCalledWith(keys[0]);
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY', storageKey: keys[1] }),
      }),
    );
  });

  it('propagates an original stream error and destroys the source', async () => {
    const source = Readable.from(
      (async function* () {
        yield Buffer.from('partial');
        throw new Error('Original read failed');
      })(),
    );
    jest.mocked(storage.download).mockResolvedValue(source);
    await expect(service.process({ archiveId: archive.id })).rejects.toThrow(
      'Original read failed',
    );
    expect(source.destroyed).toBe(true);
    expect(storage.delete).toHaveBeenCalled();
  });

  it('deletes only its attempt output when its database lease has been replaced', async () => {
    jest
      .mocked(prisma.archive.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await service.process({ archiveId: archive.id });
    expect(storage.delete).toHaveBeenCalledWith(jest.mocked(storage.upload).mock.calls[0]![0].key);
  });

  it('releases the lease when loading archive metadata fails', async () => {
    jest.mocked(prisma.archive.findUnique).mockRejectedValue(new Error('Database unavailable'));
    await expect(service.process({ archiveId: archive.id })).rejects.toThrow(
      'Database unavailable',
    );
    expect(prisma.archive.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', processingLockId: null }),
      }),
    );
  });

  it('aborts a stalled source at the processing deadline so the job can retry', async () => {
    const limited = new ArchiveGenerationService(prisma, storage, {
      lockTtlSeconds: 1,
      retentionSeconds: 86400,
      maxSize: 2147483648,
    });
    const source = new Readable({ read() {} });
    jest.mocked(storage.download).mockResolvedValue(source);
    await expect(limited.process({ archiveId: archive.id })).rejects.toThrow('timed out');
    expect(source.destroyed).toBe(true);
  });
});

// Read central-directory sizes so streaming ZIP data descriptors are handled correctly.
function readStoredZip(zip: Buffer): Array<{ name: string; body: Buffer }> {
  const entries: Array<{ name: string; body: Buffer }> = [];
  let offset = zip.readUInt32LE(zip.length - 6);
  while (zip.readUInt32LE(offset) === 0x02014b50) {
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const dataOffset =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    entries.push({
      name: zip.subarray(offset + 46, offset + 46 + nameLength).toString(),
      body: zip.subarray(dataOffset, dataOffset + size),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
