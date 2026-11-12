import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAccessGuard } from '../auth/jwt-access.guard.js';
import type { AccessTokenClaims } from '../auth/auth.types.js';
import { OrganisationAccessGuard } from '../organisations/organisation-access.guard.js';
import { PdfService } from '../documents/pdf.service.js';
import {
  ChargeInput,
  DepositTransactionInput,
  ExpenseInput,
  FileEvidenceInput,
  InspectionInput,
  InspectionMediaInput,
  LeaseDocumentInput,
  LeaseInput,
  LeaseStatusInput,
  MaintenanceInput,
  MaintenanceUpdateInput,
  MoveOutInput,
  NoticeInput,
  OrganisationSettingsInput,
  PaymentInput,
  PropertyOwnerInput,
  PropertyOwnerUpdateInput,
  PropertyInput,
  PropertyUpdateInput,
  ReversalInput,
  TeamInviteInput,
  TeamRoleInput,
  TenancyInput,
  TenantInput,
  TenantUpdateInput,
  SubscriptionPaymentInput,
  UnitInput,
  UnitUpdateInput,
  UtilityInput,
} from './dto/landlord.dto.js';
import { LandlordService } from './landlord.service.js';
import { LandlordPermissionsGuard } from './landlord-permissions.guard.js';
import { LandlordSubscriptionGuard } from './landlord-subscription.guard.js';
import { ReportQuery, SelectPlanInput } from './dto/landlord-query.dto.js';

function actorRole(request: Request): MembershipRole | undefined {
  return request.organisationRole;
}

@Controller('organisations/:organisationId/landlord')
@UseGuards(
  JwtAccessGuard,
  OrganisationAccessGuard,
  LandlordSubscriptionGuard,
  LandlordPermissionsGuard,
)
export class LandlordController {
  constructor(
    private readonly landlord: LandlordService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  dashboard(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.dashboard(organisationId, actorRole(request), user.sub);
  }

  @Get('properties')
  listProperties(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listProperties(organisationId, actorRole(request), user.sub);
  }

  @Get('property-owners')
  listPropertyOwners(@Param('organisationId', ParseUUIDPipe) organisationId: string) {
    return this.landlord.listPropertyOwners(organisationId);
  }

  @Post('property-owners')
  createPropertyOwner(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: PropertyOwnerInput,
  ) {
    return this.landlord.createPropertyOwner(
      organisationId,
      user.sub,
      actorRole(request),
      input,
    );
  }

  @Patch('property-owners/:ownerId')
  updatePropertyOwner(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: PropertyOwnerUpdateInput,
  ) {
    return this.landlord.updatePropertyOwner(
      organisationId,
      user.sub,
      actorRole(request),
      ownerId,
      input,
    );
  }

  @Post('properties')
  createProperty(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: PropertyInput,
  ) {
    return this.landlord.createProperty(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('properties/:propertyId')
  updateProperty(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: PropertyUpdateInput,
  ) {
    return this.landlord.updateProperty(
      organisationId,
      user.sub,
      actorRole(request),
      propertyId,
      input,
    );
  }

  @Get('units')
  listUnits(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listUnits(organisationId, actorRole(request), user.sub);
  }

  @Post('properties/:propertyId/units')
  createUnit(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: UnitInput,
  ) {
    return this.landlord.createUnit(organisationId, user.sub, actorRole(request), propertyId, input);
  }

  @Patch('units/:unitId')
  updateUnit(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: UnitUpdateInput,
  ) {
    return this.landlord.updateUnit(
      organisationId,
      user.sub,
      actorRole(request),
      unitId,
      input,
    );
  }

  @Patch('units/:unitId/archive')
  archiveUnit(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.archiveUnit(
      organisationId,
      user.sub,
      actorRole(request),
      unitId,
    );
  }

  @Get('tenants')
  listTenants(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listTenants(organisationId, actorRole(request), user.sub);
  }

  @Post('tenants')
  createTenant(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: TenantInput,
  ) {
    return this.landlord.createTenant(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('tenants/:tenantId')
  updateTenant(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: TenantUpdateInput,
  ) {
    return this.landlord.updateTenant(
      organisationId,
      user.sub,
      actorRole(request),
      tenantId,
      input,
    );
  }

  @Patch('tenants/:tenantId/archive')
  archiveTenant(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.archiveTenant(
      organisationId,
      user.sub,
      actorRole(request),
      tenantId,
    );
  }

  @Get('tenancies')
  listTenancies(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listTenancies(organisationId, actorRole(request), user.sub);
  }

  @Post('tenancies')
  createTenancy(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: TenancyInput,
  ) {
    return this.landlord.createTenancy(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('tenancies/:tenancyId/move-out')
  moveOut(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('tenancyId', ParseUUIDPipe) tenancyId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: MoveOutInput,
  ) {
    return this.landlord.moveOut(organisationId, user.sub, actorRole(request), tenancyId, input);
  }

  @Get('leases')
  listLeases(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listLeases(organisationId, actorRole(request), user.sub);
  }

  @Post('leases')
  createLease(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: LeaseInput,
  ) {
    return this.landlord.createLease(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('leases/:leaseId/status')
  updateLeaseStatus(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('leaseId', ParseUUIDPipe) leaseId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: LeaseStatusInput,
  ) {
    return this.landlord.updateLeaseStatus(
      organisationId,
      user.sub,
      actorRole(request),
      leaseId,
      input,
    );
  }

  @Post('leases/:leaseId/documents')
  attachLeaseDocument(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('leaseId', ParseUUIDPipe) leaseId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: LeaseDocumentInput,
  ) {
    return this.landlord.attachLeaseDocument(
      organisationId,
      user.sub,
      actorRole(request),
      leaseId,
      input,
    );
  }

  @Get('inspections')
  listInspections(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listInspections(organisationId, actorRole(request), user.sub);
  }

  @Post('inspections')
  createInspection(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: InspectionInput,
  ) {
    return this.landlord.createInspection(organisationId, user.sub, actorRole(request), input);
  }

  @Post('inspections/:inspectionId/media')
  attachInspectionMedia(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('inspectionId', ParseUUIDPipe) inspectionId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: InspectionMediaInput,
  ) {
    return this.landlord.attachInspectionMedia(
      organisationId,
      user.sub,
      actorRole(request),
      inspectionId,
      input,
    );
  }

  @Get('rent/charges')
  listCharges(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listCharges(organisationId, actorRole(request), user.sub);
  }

  @Post('rent/charges')
  createCharge(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ChargeInput,
  ) {
    return this.landlord.createCharge(organisationId, user.sub, actorRole(request), input);
  }

  @Post('rent/charges/:chargeId/void')
  voidCharge(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ReversalInput,
  ) {
    return this.landlord.voidCharge(
      organisationId,
      user.sub,
      actorRole(request),
      chargeId,
      input,
    );
  }

  @Get('rent/payments')
  listPayments(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listPayments(organisationId, actorRole(request), user.sub);
  }

  @Post('rent/payments')
  createPayment(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: PaymentInput,
  ) {
    return this.landlord.createPayment(organisationId, user.sub, actorRole(request), input);
  }

  @Post('rent/payments/:paymentId/reverse')
  reversePayment(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ReversalInput,
  ) {
    return this.landlord.reversePayment(
      organisationId,
      user.sub,
      actorRole(request),
      paymentId,
      input,
    );
  }

  @Get('rent/payments/:paymentId/receipt')
  async paymentReceipt(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AccessTokenClaims,
  ) {
    const payment = await this.landlord.paymentReceipt(
      organisationId,
      user.sub,
      paymentId,
    );
    const allocations = payment.allocations.length
      ? payment.allocations.map(({ allocatedAmount, rentCharge }) =>
          `${rentCharge.tenancy.unit.property.name} / ${rentCharge.tenancy.unit.unitNumber} — ${rentCharge.period}: ${allocatedAmount.toString()} ${payment.organisation.currency}`,
        ).join('\n')
      : 'No rent charge allocation recorded';
    const content = await this.pdf.renderDocument('PropEase payment receipt', [
      {
        heading: 'Receipt details',
        body: [
          `Receipt: ${payment.id}`,
          `Organisation: ${payment.organisation.name}`,
          `Tenant: ${payment.tenant?.legalName ?? 'Unassigned'}`,
          `Amount: ${payment.amount.toString()} ${payment.organisation.currency}`,
          `Method: ${payment.method.replaceAll('_', ' ')}`,
          `Reference: ${payment.reference ?? 'Not provided'}`,
          `Received: ${payment.receivedAt.toISOString()}`,
          `Record status: ${payment.reversedAt ? 'Reversed' : 'Manually recorded; not bank-verified'}`,
        ].join('\n'),
      },
      { heading: 'Rent allocations', body: allocations },
      {
        heading: 'Important',
        body: 'This receipt confirms a payment record entered by the landlord. It is not proof of bank, card, or mobile-money settlement.',
      },
    ]);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="receipt-${payment.id}.pdf"`,
    });
  }

  @Get('rent/deposits')
  listDeposits(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listDeposits(organisationId, actorRole(request), user.sub);
  }

  @Post('rent/deposits/:depositId/transactions')
  addDepositTransaction(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('depositId', ParseUUIDPipe) depositId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: DepositTransactionInput,
  ) {
    return this.landlord.addDepositTransaction(
      organisationId,
      user.sub,
      actorRole(request),
      depositId,
      input,
    );
  }

  @Get('expenses')
  listExpenses(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listExpenses(organisationId, actorRole(request), user.sub);
  }

  @Post('expenses')
  createExpense(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ExpenseInput,
  ) {
    return this.landlord.createExpense(organisationId, user.sub, actorRole(request), input);
  }

  @Post('expenses/:expenseId/evidence')
  attachExpenseEvidence(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: FileEvidenceInput,
  ) {
    return this.landlord.attachExpenseEvidence(
      organisationId,
      user.sub,
      actorRole(request),
      expenseId,
      input,
    );
  }

  @Post('expenses/:expenseId/reverse')
  reverseExpense(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ReversalInput,
  ) {
    return this.landlord.reverseExpense(
      organisationId,
      user.sub,
      actorRole(request),
      expenseId,
      input,
    );
  }

  @Get('utilities')
  listUtilities(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listUtilities(organisationId, actorRole(request), user.sub);
  }

  @Post('utilities')
  createUtilityBill(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: UtilityInput,
  ) {
    return this.landlord.createUtilityBill(organisationId, user.sub, actorRole(request), input);
  }

  @Post('utilities/:billId/evidence')
  attachUtilityEvidence(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: FileEvidenceInput,
  ) {
    return this.landlord.attachUtilityEvidence(
      organisationId,
      user.sub,
      actorRole(request),
      billId,
      input,
    );
  }

  @Post('utilities/:billId/reverse')
  reverseUtilityBill(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: ReversalInput,
  ) {
    return this.landlord.reverseUtilityBill(
      organisationId,
      user.sub,
      actorRole(request),
      billId,
      input,
    );
  }

  @Get('maintenance')
  listMaintenance(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listMaintenance(organisationId, actorRole(request), user.sub);
  }

  @Post('maintenance')
  createMaintenance(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: MaintenanceInput,
  ) {
    return this.landlord.createMaintenance(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('maintenance/:requestId')
  updateMaintenance(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: MaintenanceUpdateInput,
  ) {
    return this.landlord.updateMaintenance(
      organisationId,
      user.sub,
      actorRole(request),
      requestId,
      input,
    );
  }

  @Get('notices')
  listNotices(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.listNotices(organisationId, actorRole(request), user.sub);
  }

  @Post('notices')
  createNotice(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: NoticeInput,
  ) {
    return this.landlord.createNotice(organisationId, user.sub, actorRole(request), input);
  }

  @Get('reports/financial')
  financialReport(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Query() query: ReportQuery,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.getFinancialReport(
      organisationId,
      query.from,
      query.to,
      query.ownerId,
      actorRole(request),
      user.sub,
    );
  }

  @Get('team')
  getTeam(@Param('organisationId', ParseUUIDPipe) organisationId: string) {
    return this.landlord.getTeam(organisationId);
  }

  @Post('team')
  inviteTeamMember(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: TeamInviteInput,
  ) {
    return this.landlord.inviteTeamMember(organisationId, user.sub, actorRole(request), input);
  }

  @Patch('team/:memberId')
  changeTeamRole(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: TeamRoleInput,
  ) {
    return this.landlord.changeTeamRole(
      organisationId,
      user.sub,
      actorRole(request),
      memberId,
      input,
    );
  }

  @Delete('team/:memberId')
  removeTeamMember(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
  ) {
    return this.landlord.removeTeamMember(
      organisationId,
      user.sub,
      actorRole(request),
      memberId,
    );
  }

  @Get('subscription')
  getSubscription(@Param('organisationId', ParseUUIDPipe) organisationId: string) {
    return this.landlord.getSubscription(organisationId);
  }

  @Post('subscription/select')
  selectPlan(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: SelectPlanInput,
  ) {
    return this.landlord.selectPlan(
      organisationId,
      user.sub,
      actorRole(request),
      input,
    );
  }

  @Post('subscription/invoices/:invoiceId/payments')
  submitSubscriptionPayment(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: SubscriptionPaymentInput,
  ) {
    return this.landlord.submitSubscriptionPayment(
      organisationId,
      user.sub,
      actorRole(request),
      invoiceId,
      input,
    );
  }

  @Get('settings')
  getSettings(@Param('organisationId', ParseUUIDPipe) organisationId: string) {
    return this.landlord.getSettings(organisationId);
  }

  @Patch('settings')
  updateSettings(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: OrganisationSettingsInput,
  ) {
    return this.landlord.updateSettings(
      organisationId,
      user.sub,
      actorRole(request),
      input,
    );
  }
}

@Controller('organisations/:organisationId/landlord/team')
@UseGuards(JwtAccessGuard)
export class TeamInvitationController {
  constructor(private readonly landlord: LandlordService) {}

  @Post('accept')
  accept(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
  ) {
    return this.landlord.acceptTeamInvitation(organisationId, user.sub);
  }
}
