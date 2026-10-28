import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ArchiveProgressTracker } from './archive-progress.js';

describe('archive progress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });
  afterEach(() => { jest.useRealTimers(); });

  it('measures read/photo percentages and interval speeds independently of upload', () => {
    const tracker = new ArchiveProgressTracker(1000, async () => undefined);
    tracker.beginPhoto('photo', 500);
    tracker.read(250);
    tracker.uploaded(100);
    jest.setSystemTime(5000);
    expect(tracker.snapshot()).toMatchObject({
      readPercent: 25,
      photoPercent: 50,
      readBytesPerSecond: 50,
      uploadBytesPerSecond: 20,
      uploadPercent: null,
    });
    tracker.totalZipBytes = 1200;
    tracker.uploaded(600);
    jest.setSystemTime(10000);
    expect(tracker.snapshot()).toMatchObject({
      uploadPercent: 50,
      readBytesPerSecond: 0,
      uploadBytesPerSecond: 100,
      readIdleSeconds: 10,
    });
  });

  it('reports idle intervals and stops the reporting timer', async () => {
    const report = jest.fn<(value: unknown) => Promise<void>>().mockResolvedValue();
    const tracker = new ArchiveProgressTracker(1000, report);
    tracker.start();
    await jest.advanceTimersByTimeAsync(5000);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ readPercent: 0, readBytesPerSecond: 0, readIdleSeconds: 5 }),
    );
    await tracker.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('does not regress confirmed uploaded bytes and caps percentages', () => {
    const tracker = new ArchiveProgressTracker(100, async () => undefined);
    tracker.uploaded(100);
    tracker.uploaded(50);
    tracker.read(120);
    expect(tracker.snapshot()).toMatchObject({ uploadedBytes: 100, readPercent: 100 });
  });
});
