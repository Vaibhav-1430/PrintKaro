import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminController } from './admin.controller';
import { OperatorController } from './operator.controller';

@Module({
  controllers: [AdminController, OperatorController],
  providers: [UsersService],
})
export class UsersModule {}
