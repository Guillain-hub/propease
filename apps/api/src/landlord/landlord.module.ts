import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import {
  LandlordController,
  TeamInvitationController,
} from './landlord.controller.js';
import { LandlordService } from './landlord.service.js';
import { LandlordSubscriptionModule } from './landlord-subscription.module.js';

@Module({
  imports: [
    AuthModule,
    OrganisationsModule,
    DocumentsModule,
    LandlordSubscriptionModule,
  ],
  controllers: [LandlordController, TeamInvitationController],
  providers: [LandlordService],
})
export class LandlordModule {}
