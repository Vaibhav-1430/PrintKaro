import { Module } from '@nestjs/common';
import { AuthHandlerController } from './auth-handler.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthHandlerController, AuthController],
  providers: [AuthService],
})
export class AuthModule {}
