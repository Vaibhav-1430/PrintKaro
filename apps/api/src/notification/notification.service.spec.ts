import { NotificationService } from './notification.service';
import type { NotificationRepository } from './notification.repository';
import type { NotificationProvider } from './notification.provider';

function make(sendImpl: () => Promise<void> = () => Promise.resolve()) {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 'n1', userId: 'u1' }),
    listForUser: jest.fn().mockResolvedValue([]),
    markRead: jest.fn().mockResolvedValue({ count: 1 }),
  } as unknown as NotificationRepository;
  const provider = {
    send: jest.fn().mockImplementation(sendImpl),
  } as unknown as NotificationProvider;
  return { svc: new NotificationService(repo, provider), repo, provider };
}

describe('NotificationService.notify', () => {
  it('persists then dispatches', async () => {
    const { svc, repo, provider } = make();
    await svc.notify({ userId: 'u1', type: 'ORDER_CREATED', title: 'Hi', body: 'There' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'ORDER_CREATED', channel: 'IN_APP' }),
    );
    expect(provider.send).toHaveBeenCalled();
  });

  it('does not fail the request when the provider throws', async () => {
    const { svc } = make(() => Promise.reject(new Error('smtp down')));
    await expect(
      svc.notify({ userId: 'u1', type: 'PAYMENT_FAILED', title: 'x', body: 'y' }),
    ).resolves.toBeUndefined();
  });
});

describe('NotificationService.markRead', () => {
  it('marks a notification read for the owner', async () => {
    const { svc, repo } = make();
    const res = await svc.markRead('n1', 'u1');
    expect(res).toEqual({ read: true });
    expect(repo.markRead).toHaveBeenCalledWith('n1', 'u1');
  });
});
