import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAccessGuard } from './jwt-access.guard.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard],
  exports: [AuthService, JwtAccessGuard, JwtModule],
})
export class AuthModule {}
