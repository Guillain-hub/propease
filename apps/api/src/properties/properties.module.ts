import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { PropertiesController } from './properties.controller.js';

@Module({
  imports: [AuthModule, OrganisationsModule],
  controllers: [PropertiesController],
})
export class PropertiesModule {}
