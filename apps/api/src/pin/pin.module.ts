import { Module } from '@nestjs/common';
import { PinService } from './pin.service';
import { PinRepository } from './pin.repository';

/**
 * PIN minting/redemption. Exported for the OrderModule (mint on paid, expire on
 * complete) and the MachineModule (redeem at the machine keypad).
 */
@Module({
  providers: [PinService, PinRepository],
  exports: [PinService],
})
export class PinModule {}
