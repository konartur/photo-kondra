import { describe, expect, it } from '@jest/globals';
import { archiveContentHash } from './archive-content.js';
const photo = { id: 'photo', originalKey: 'key', filename: 'a.jpg', size: 100n, sortOrder: 0 };
describe('archive content identity', () => {
  it('is stable for the same ordered originals', () =>
    expect(archiveContentHash([photo])).toBe(archiveContentHash([{ ...photo }])));
  it.each([
    { id: 'other' },
    { filename: 'b.jpg' },
    { originalKey: 'new-key' },
    { size: 101n },
    { sortOrder: 1 },
  ])('changes for changed ZIP content %s', (change) => {
    expect(archiveContentHash([{ ...photo, ...change }])).not.toBe(archiveContentHash([photo]));
  });
});
