import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import {
  LandlordController,
  TenantLeaseTerminationReviewController,
  TenantLeaseReviewController,
  TeamInvitationController,
} from './landlord.controller.js';
import { LandlordService } from './landlord.service.js';
import { LeaseTerminationService } from './lease-termination.service.js';
import { TenantLeaseOnboardingService } from './tenant-lease-onboarding.service.js';
import { LandlordPermissionsGuard } from './landlord-permissions.guard.js';
import { LandlordSubscriptionModule } from './landlord-subscription.module.js';

@Module({
  imports: [
    AuthModule,
    EmailModule,
    OrganisationsModule,
    DocumentsModule,
    LandlordSubscriptionModule,
  ],
  controllers: [
    LandlordController,
    TenantLeaseReviewController,
    TenantLeaseTerminationReviewController,
    TeamInvitationController,
  ],
  providers: [
    LandlordService,
    LeaseTerminationService,
    TenantLeaseOnboardingService,
    LandlordPermissionsGuard,
  ],
})
export class LandlordModule {}
