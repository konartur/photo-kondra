export interface ArchiveProgress {
  phase: 'streaming' | 'publishing' | 'ready' | 'failed';
  readBytes: number;
  totalOriginalBytes: number;
  readPercent: number;
  uploadedBytes: number;
  totalZipBytes: number | null;
  uploadPercent: number | null;
  readBytesPerSecond: number;
  uploadBytesPerSecond: number;
  photoId: string | null;
  photoReadBytes: number;
  photoPercent: number;
  readIdleSeconds: number;
  uploadIdleSeconds: number;
  elapsedSeconds: number;
}

// Progress is sampled on a timer so idle periods are visible too.
export class ArchiveProgressTracker {
  private readonly started = Date.now();
  private sampled = this.started;
  private readAt = this.started;
  private uploadAt = this.started;
  private previousRead = 0;
  private previousUpload = 0;
  private pending: Promise<void> = Promise.resolve();
  private busy = false;
  private timer?: ReturnType<typeof setInterval>;
  phase: ArchiveProgress['phase'] = 'streaming';
  readBytes = 0;
  uploadedBytes = 0;
  totalZipBytes: number | null = null;
  private photoId: string | null = null;
  private photoBytes = 0;
  private photoSize = 0;

  constructor(
    private readonly total: number,
    private readonly report: (progress: ArchiveProgress) => Promise<void>,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.publish();
    }, 5000);
  }

  beginPhoto(id: string, size: number): void {
    this.photoId = id;
    this.photoBytes = 0;
    this.photoSize = size;
  }

  read(bytes: number): void {
    this.readBytes += bytes;
    this.photoBytes += bytes;
    this.readAt = Date.now();
  }

  uploaded(bytes: number): void {
    if (bytes > this.uploadedBytes) {
      this.uploadedBytes = bytes;
      this.uploadAt = Date.now();
    }
  }

  snapshot(): ArchiveProgress {
    const now = Date.now();
    const seconds = Math.max((now - this.sampled) / 1000, 0.001);
    const value: ArchiveProgress = {
      phase: this.phase,
      readBytes: this.readBytes,
      totalOriginalBytes: this.total,
      readPercent: percent(this.readBytes, this.total),
      uploadedBytes: this.uploadedBytes,
      totalZipBytes: this.totalZipBytes,
      uploadPercent:
        this.totalZipBytes === null ? null : percent(this.uploadedBytes, this.totalZipBytes),
      readBytesPerSecond: Math.round((this.readBytes - this.previousRead) / seconds),
      uploadBytesPerSecond: Math.round((this.uploadedBytes - this.previousUpload) / seconds),
      photoId: this.photoId,
      photoReadBytes: this.photoBytes,
      photoPercent: percent(this.photoBytes, this.photoSize),
      readIdleSeconds: Math.floor((now - this.readAt) / 1000),
      uploadIdleSeconds: Math.floor((now - this.uploadAt) / 1000),
      elapsedSeconds: Math.floor((now - this.started) / 1000),
    };
    this.sampled = now;
    this.previousRead = this.readBytes;
    this.previousUpload = this.uploadedBytes;
    return value;
  }

  async publish(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.pending = this.report(this.snapshot()).catch(() => undefined);
    await this.pending;
    this.busy = false;
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }
}

function percent(bytes: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((bytes / total) * 1000) / 10) : 0;
}
