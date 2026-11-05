import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganisationAccessGuard } from './organisation-access.guard.js';
import { OrganisationsController } from './organisations.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [OrganisationsController],
  providers: [OrganisationAccessGuard],
  exports: [OrganisationAccessGuard],
})
export class OrganisationsModule {}
