ALTER TABLE "plans"
  ADD CONSTRAINT "plans_prices_nonnegative"
  CHECK ("monthly_price" >= 0 AND "annual_price" >= 0),
  ADD CONSTRAINT "plans_unit_limit_positive"
  CHECK ("unit_limit" IS NULL OR "unit_limit" > 0);

ALTER TABLE "units"
  ADD CONSTRAINT "units_amounts_nonnegative"
  CHECK ("rent_amount" >= 0 AND "deposit_amount" >= 0);

ALTER TABLE "tenancies"
  ADD CONSTRAINT "tenancies_move_out_after_move_in"
  CHECK ("move_out_date" IS NULL OR "move_out_date" >= "move_in_date");

ALTER TABLE "leases"
  ADD CONSTRAINT "leases_valid_term_and_due_day"
  CHECK ("end_date" >= "start_date" AND "due_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "leases_rent_nonnegative"
  CHECK ("rent_amount" >= 0);

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_amount_nonnegative"
  CHECK ("amount" >= 0);

ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "rent_charges"
  ADD CONSTRAINT "rent_charges_amount_and_balance_valid"
  CHECK ("amount" >= 0 AND "balance" >= 0 AND "balance" <= "amount"),
  ADD CONSTRAINT "rent_charges_period_format"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive"
  CHECK ("allocated_amount" > 0);

ALTER TABLE "deposits"
  ADD CONSTRAINT "deposits_amounts_valid"
  CHECK (
    "required_amount" >= 0 AND
    "received_amount" >= 0 AND
    "held_balance" >= 0 AND
    "held_balance" <= "received_amount"
  );

ALTER TABLE "deposit_transactions"
  ADD CONSTRAINT "deposit_transactions_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_nonnegative"
  CHECK ("amount" >= 0);

ALTER TABLE "utility_bills"
  ADD CONSTRAINT "utility_bills_amount_nonnegative"
  CHECK ("total_amount" >= 0),
  ADD CONSTRAINT "utility_bills_period_format"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "utility_allocations"
  ADD CONSTRAINT "utility_allocations_amount_nonnegative"
  CHECK ("allocated_amount" >= 0);

ALTER TABLE "maintenance_expenses"
  ADD CONSTRAINT "maintenance_expenses_amount_nonnegative"
  CHECK ("amount" >= 0);

ALTER TABLE "files"
  ADD CONSTRAINT "files_size_bytes_valid"
  CHECK ("size_bytes" BETWEEN 1 AND 20971520);
