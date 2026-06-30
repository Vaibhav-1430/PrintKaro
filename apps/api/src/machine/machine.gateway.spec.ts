import type { Server } from 'socket.io';
import { MachineGateway } from './machine.gateway';
import type { MachineHealthResponse } from '@print-karo/types';

describe('MachineGateway', () => {
  it('emits health updates to subscribers', () => {
    const gateway = new MachineGateway();
    const emit = jest.fn();
    gateway.server = { emit } as unknown as Server;
    const health = { machineId: 'm1', gateResult: 'READY' } as MachineHealthResponse;
    gateway.emitHealthUpdate(health);
    expect(emit).toHaveBeenCalledWith('machine.health', health);
  });

  it('emits state changes', () => {
    const gateway = new MachineGateway();
    const emit = jest.fn();
    gateway.server = { emit } as unknown as Server;
    gateway.emitStateChange('m1', 'SUSPENDED');
    expect(emit).toHaveBeenCalledWith('machine.state', {
      machineId: 'm1',
      runtimeState: 'SUSPENDED',
    });
  });

  it('afterInit runs without a server without throwing', () => {
    const gateway = new MachineGateway();
    expect(() => gateway.afterInit()).not.toThrow();
  });
});
