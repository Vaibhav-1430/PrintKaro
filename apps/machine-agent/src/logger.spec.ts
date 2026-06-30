import { describe, it, expect, vi } from 'vitest';
import { AgentLogger } from './logger';

describe('AgentLogger', () => {
  it('buffers and drains entries', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new AgentLogger();
    logger.log('HEARTBEAT', 'DEBUG');
    logger.log('RECONNECT', 'INFO', 'reconnecting');
    expect(logger.size).toBe(2);
    const drained = logger.drain(10);
    expect(drained).toHaveLength(2);
    expect(logger.size).toBe(0);
  });

  it('requeues entries on the front', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new AgentLogger();
    logger.log('HEARTBEAT', 'DEBUG');
    const drained = logger.drain(10);
    logger.requeue(drained);
    expect(logger.size).toBe(1);
  });

  it('caps the buffer at maxBuffer', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new AgentLogger(3);
    for (let i = 0; i < 10; i++) logger.log('HEARTBEAT', 'DEBUG');
    expect(logger.size).toBe(3);
  });
});
