export class ArchiveLeaseBusyError extends Error {
  constructor(readonly retryAt: number) {
    super('Archive processing lease is held by another worker');
  }
}
