import { Module } from '@nestjs/common';
import { LandlordSubscriptionGuard } from './landlord-subscription.guard.js';

@Module({
  providers: [LandlordSubscriptionGuard],
  exports: [LandlordSubscriptionGuard],
})
export class LandlordSubscriptionModule {}
