"use client";

export type LeaseAgreementFormValues = Record<string, string>;

type FieldName = keyof LeaseAgreementFormValues;
type FieldDefinition = {
  name: FieldName;
  label: string;
  type?: "text" | "date" | "number" | "select" | "textarea" | "utility-payer";
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  readOnly?: boolean;
  options?: Array<{ value: string; label: string }>;
  wide?: boolean;
};

const yesNo = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
];
const utilityNames = [
  "water",
  "garbage",
  "electricity",
  "security",
  "internet",
  "serviceCharges",
];

const groups: Array<{ title: string; fields: FieldDefinition[] }> = [
  {
    title: "Agreement parties and payment",
    fields: [
      { name: "landlordName", label: "Landlord's full legal name", required: true },
      { name: "landlordId", label: "Landlord's ID or passport number", required: true },
      { name: "landlordIdPlace", label: "Landlord ID place of issue", required: true },
      { name: "landlordTel", label: "Landlord telephone", required: true },
      { name: "tenantId", label: "Tenant's ID or passport number", required: true },
      { name: "tenantIdPlace", label: "Tenant ID place of issue", required: true },
      {
        name: "currency",
        label: "Lease currency",
        type: "text",
        required: true,
        readOnly: true,
      },
      { name: "renewalNoticeDays", label: "Renewal notice (days)", type: "number", min: "1", max: "365", required: true },
      { name: "holdoverNoticeDays", label: "Month-to-month notice (days)", type: "number", min: "1", max: "365", required: true },
      {
        name: "paymentMethod",
        label: "Rent payment method",
        type: "select",
        required: true,
        options: [
          { value: "BANK_TRANSFER", label: "Bank transfer" },
          { value: "MOBILE_MONEY", label: "Mobile money" },
          { value: "CASH", label: "Cash" },
        ],
      },
      { name: "paymentAccount", label: "Bank account or mobile money number", required: true },
    ],
  },
  {
    title: "Advance rent and late fees",
    fields: [
      { name: "advancePaid", label: "Advance rent paid?", type: "select", required: true, options: yesNo },
      { name: "advanceAmount", label: "Advance amount", type: "number", min: "0.01", step: "0.01", required: true },
      { name: "advanceStart", label: "Advance rent period starts", type: "date", required: true },
      { name: "advanceEnd", label: "Advance rent period ends", type: "date", required: true },
      { name: "lateFeeEnabled", label: "Include late fee clause?", type: "select", required: true, options: yesNo },
      { name: "lateDays", label: "Days late before fee applies", type: "number", min: "1", max: "365", required: true },
      { name: "lateFee", label: "Late fee amount", type: "number", min: "0.01", step: "0.01", required: true },
      { name: "lateNoticeDays", label: "Late payment notice period (days)", type: "number", min: "1", max: "365", required: true },
    ],
  },
  {
    title: "Deposit, utilities and access",
    fields: [
      { name: "depositPaid", label: "Has the tenant paid the deposit?", type: "select", required: true, options: yesNo },
      { name: "depositPaidDate", label: "Deposit paid date", type: "date", required: true },
      { name: "depositReturnDays", label: "Deposit return deadline (days)", type: "number", min: "1", max: "365", required: true },
      { name: "utilityPayer", label: "Utilities and service charges payer", type: "utility-payer", required: true, wide: true },
      { name: "inspectionNoticeHours", label: "Inspection notice (hours)", type: "number", min: "1", max: "720", required: true },
      { name: "maxOccupants", label: "Maximum occupants (optional)", type: "number", min: "1", max: "100" },
      { name: "petsAllowed", label: "Pets allowed?", type: "select", options: [{ value: "", label: "Not specified" }, ...yesNo] },
      { name: "subletAllowed", label: "Subletting allowed?", type: "select", required: true, options: yesNo },
    ],
  },
  {
    title: "Termination, rent changes and notices",
    fields: [
      { name: "tenantExitNoticeDays", label: "Tenant early-exit notice (days)", type: "number", min: "1", max: "365", required: true },
      { name: "earlyExitPenalty", label: "Early-exit penalty (optional)", type: "number", min: "0", step: "0.01" },
      { name: "breachFixDays", label: "Breach remedy period (days)", type: "number", min: "1", max: "365", required: true },
      { name: "rentFixedMonths", label: "Months rent is fixed", type: "number", min: "0", max: "600", required: true },
      { name: "increaseNoticeDays", label: "Rent increase notice (days)", type: "number", min: "1", max: "365", required: true },
      { name: "witnessRequired", label: "Include witness signature block?", type: "select", required: true, options: yesNo },
    ],
  },
];

export function defaultLeaseAgreementValues(currency: string): LeaseAgreementFormValues {
  return {
    landlordName: "",
    landlordId: "",
    landlordIdPlace: "",
    landlordTel: "",
    tenantId: "",
    tenantIdPlace: "",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "RWF",
    renewalNoticeDays: "30",
    holdoverNoticeDays: "30",
    paymentMethod: "BANK_TRANSFER",
    paymentAccount: "",
    advancePaid: "false",
    advanceAmount: "",
    advanceStart: "",
    advanceEnd: "",
    lateFeeEnabled: "false",
    lateDays: "",
    lateFee: "",
    lateNoticeDays: "",
    depositPaid: "false",
    depositPaidDate: "",
    depositReturnDays: "30",
    utilityPayer: "",
    inspectionNoticeHours: "48",
    maxOccupants: "",
    petsAllowed: "",
    subletAllowed: "false",
    tenantExitNoticeDays: "30",
    earlyExitPenalty: "",
    breachFixDays: "14",
    rentFixedMonths: "12",
    increaseNoticeDays: "60",
    witnessRequired: "false",
  };
}

export function leaseAgreementValuesFromSnapshot(
  currency: string,
  value: unknown,
): LeaseAgreementFormValues {
  const defaults = defaultLeaseAgreementValues(currency);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const source = value as Record<string, unknown>;
  const utilities =
    source.utilities && typeof source.utilities === "object" && !Array.isArray(source.utilities)
      ? (source.utilities as Record<string, unknown>)
      : {};
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const saved = key in utilities ? utilities[key] : source[key];
    if (typeof saved === "string" || typeof saved === "number") {
      result[key] = String(saved);
    } else if (typeof saved === "boolean") {
      result[key] = String(saved);
    }
  }
  if (!("depositPaid" in source) && typeof source.depositPaidDate === "string" && source.depositPaidDate) {
    result.depositPaid = "true";
  }
  const savedPayers = utilityNames
    .map((key) => utilities[key])
    .filter((payer): payer is string => typeof payer === "string");
  if (
    savedPayers.length === utilityNames.length &&
    savedPayers.every((payer) => payer === savedPayers[0]) &&
    ["LANDLORD", "TENANT"].includes(savedPayers[0])
  ) {
    result.utilityPayer = savedPayers[0];
  }
  result.currency = defaults.currency;
  return result;
}

export function serializeLeaseAgreementValues(
  values: LeaseAgreementFormValues,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    ...values,
    advancePaid: values.advancePaid === "true",
    lateFeeEnabled: values.lateFeeEnabled === "true",
    depositPaid: values.depositPaid === "true",
    petsAllowed:
      values.petsAllowed === "" ? undefined : values.petsAllowed === "true",
    subletAllowed: values.subletAllowed === "true",
    witnessRequired: values.witnessRequired === "true",
    utilities: Object.fromEntries(
      utilityNames.map((name) => [name, values.utilityPayer]),
    ),
  };
  delete fields.utilityPayer;

  for (const key of [
    "renewalNoticeDays",
    "holdoverNoticeDays",
    "lateDays",
    "lateNoticeDays",
    "depositReturnDays",
    "inspectionNoticeHours",
    "maxOccupants",
    "tenantExitNoticeDays",
    "breachFixDays",
    "rentFixedMonths",
    "increaseNoticeDays",
  ]) {
    const field = values[key];
    if (field) fields[key] = Number(field);
    else delete fields[key];
  }
  for (const key of [
    "paymentAccount",
    "advanceAmount",
    "advanceStart",
    "advanceEnd",
    "lateFee",
    "earlyExitPenalty",
    "petsAllowed",
  ]) {
    if (!values[key]) delete fields[key];
  }
  if (values.paymentMethod === "CASH") delete fields.paymentAccount;
  if (values.advancePaid !== "true") {
    delete fields.advanceAmount;
    delete fields.advanceStart;
    delete fields.advanceEnd;
  }
  if (values.lateFeeEnabled !== "true") {
    delete fields.lateDays;
    delete fields.lateFee;
    delete fields.lateNoticeDays;
  }
  if (values.depositPaid !== "true") delete fields.depositPaidDate;
  return fields;
}

export function LeaseAgreementFields({
  values,
  onChange,
}: {
  values: LeaseAgreementFormValues;
  onChange: (name: FieldName, value: string) => void;
}) {
  return (
    <div className="lease-agreement-field-groups">
      {groups.map((group) => (
        <fieldset className="lease-agreement-field-group" key={group.title}>
          <legend>{group.title}</legend>
          <div className="property-onboarding-fields">
            {group.fields.map((field) => {
              if (field.name === "paymentAccount" && values.paymentMethod === "CASH") return null;
              if (["advanceAmount", "advanceStart", "advanceEnd"].includes(field.name) && values.advancePaid !== "true") return null;
              if (["lateDays", "lateFee", "lateNoticeDays"].includes(field.name) && values.lateFeeEnabled !== "true") return null;
              if (field.name === "depositPaidDate" && values.depositPaid !== "true") return null;
              const className = `landlord-field${field.wide ? " is-wide" : ""}`;
              if (field.type === "utility-payer") {
                return (
                  <div className={className} key={field.name}>
                    <span>{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
                    <div className="lease-utility-payer-field">
                      <small>Applies to water, garbage, electricity, security, internet and service charges.</small>
                      <div className="lease-utility-payer-options" role="radiogroup" aria-label={field.label}>
                        {[
                          { value: "LANDLORD", label: "Landlord" },
                          { value: "TENANT", label: "Tenant" },
                        ].map((option) => (
                          <label
                            className={`lease-utility-payer-option${values.utilityPayer === option.value ? " is-selected" : ""}`}
                            key={option.value}
                          >
                            <input
                              type="radio"
                              name="lease-utility-payer"
                              value={option.value}
                              required={field.required}
                              checked={values.utilityPayer === option.value}
                              onChange={(event) => onChange(field.name, event.target.value)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <label className={className} key={field.name}>
                  <span>{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
                  {field.type === "select" ? (
                    <select
                      required={field.required}
                      value={values[field.name] ?? ""}
                      onChange={(event) => onChange(field.name, event.target.value)}
                    >
                      {field.options?.map((option) => (
                        <option value={option.value} key={`${field.name}-${option.value}`}>{option.label}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      maxLength={4000}
                      rows={3}
                      value={values[field.name] ?? ""}
                      onChange={(event) => onChange(field.name, event.target.value)}
                    />
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      required={field.required}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      readOnly={field.readOnly}
                      value={values[field.name] ?? ""}
                      onChange={(event) => onChange(field.name, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
