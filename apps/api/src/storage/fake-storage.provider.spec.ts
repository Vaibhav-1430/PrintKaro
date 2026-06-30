import { FakeStorageProvider } from './fake-storage.provider';

describe('FakeStorageProvider', () => {
  it('identifies as the fake driver', () => {
    expect(new FakeStorageProvider(900).driver).toBe('fake');
  });

  it('marks an object present after a presigned PUT', async () => {
    const s = new FakeStorageProvider(900);
    await s.presignPut('k1', 'application/pdf', 1234);
    const head = await s.head('k1');
    expect(head.exists).toBe(true);
    expect(head.sizeBytes).toBe(1234);
  });

  it('reports a missing object as absent', async () => {
    const head = await new FakeStorageProvider(900).head('nope');
    expect(head.exists).toBe(false);
    expect(head.sizeBytes).toBeNull();
  });

  it('returns deterministic put/get urls with expiry', async () => {
    const s = new FakeStorageProvider(900);
    const put = await s.presignPut('k', 'application/pdf', 1);
    const get = await s.presignGet('k');
    expect(put.url).toContain('/put/');
    expect(get.url).toContain('/get/');
    expect(new Date(put.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('removes an object on delete', async () => {
    const s = new FakeStorageProvider(900);
    await s.presignPut('k', 'application/pdf', 1);
    await s.delete('k');
    expect((await s.head('k')).exists).toBe(false);
  });
});
