import { MachineAdminController } from './machine-admin.controller';
import type { MachineRegistrationService } from './machine-registration.service';
import type { MachineManagementService } from './machine-management.service';
import type { AuthPrincipal } from '../rbac/auth-context';

const actor = { userId: 'a1', role: 'ADMIN' } as AuthPrincipal;
const req = { headers: {} } as never;

function makeController() {
  const registration = {
    register: jest.fn().mockResolvedValue({ id: 'm1' }),
  } as unknown as MachineRegistrationService;
  const management = {
    list: jest.fn().mockResolvedValue([]),
    detail: jest.fn().mockResolvedValue({}),
    logs_: jest.fn().mockResolvedValue([]),
    suspend: jest.fn().mockResolvedValue({ status: 'SUSPENDED' }),
    reactivate: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    requestRestart: jest.fn().mockResolvedValue({ requested: true }),
  } as unknown as MachineManagementService;
  return {
    controller: new MachineAdminController(registration, management),
    registration,
    management,
  };
}

describe('MachineAdminController', () => {
  it('register delegates to the registration service', () => {
    const { controller, registration } = makeController();
    void controller.register(actor, { code: 'PK-1' } as never, req);
    expect(registration.register).toHaveBeenCalled();
  });

  it('list parses the limit and delegates', () => {
    const { controller, management } = makeController();
    void controller.list(actor, '25', 'cur');
    expect(management.list).toHaveBeenCalledWith(actor, 25, 'cur');
  });

  it('detail/logs/suspend/reactivate/restart delegate with the machine id', () => {
    const { controller, management } = makeController();
    void controller.detail(actor, 'm1');
    void controller.logs(actor, 'm1', undefined, undefined);
    void controller.suspend(actor, 'm1', { reason: 'r' }, req);
    void controller.reactivate(actor, 'm1', req);
    void controller.restart(actor, 'm1', req);
    expect(management.detail).toHaveBeenCalledWith(actor, 'm1');
    expect(management.suspend).toHaveBeenCalledWith(actor, 'm1', 'r', req);
    expect(management.reactivate).toHaveBeenCalledWith(actor, 'm1', req);
    expect(management.requestRestart).toHaveBeenCalledWith(actor, 'm1', req);
  });
});
