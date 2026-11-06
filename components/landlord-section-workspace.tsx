"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";

type SectionName =
  | "Properties"
  | "Units"
  | "Tenants"
  | "Leases"
  | "Inspections"
  | "Rent & Deposits"
  | "Expenses"
  | "Utilities"
  | "Maintenance"
  | "Notices"
  | "Reports"
  | "Team"
  | "Subscription"
  | "Settings";
type ValueRecord = Record<string, unknown>;
type Choice = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?: "date" | "datetime-local" | "number" | "email" | "textarea" | "multi";
  required?: boolean;
  options?: Choice[];
  placeholder?: string;
};
type ApiError = { message?: string | string[] };

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/+$/, "");
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function record(value: unknown): ValueRecord {
  return value !== null && typeof value === "object"
    ? (value as ValueRecord)
    : {};
}

function stringValue(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function nested(value: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => record(current)[key], value);
}

function rowsFor(data: ValueRecord, key: string, collection?: string): ValueRecord[] {
  const value = collection ? record(data[key])[collection] : data[key];
  return Array.isArray(value) ? value.map(record) : [];
}

function formatAmount(value: unknown, currency: string): string {
  const amount = Number(value ?? 0);
  return `${Number.isFinite(amount) ? new Intl.NumberFormat("en").format(amount) : "0"} ${currency}`;
}

function dateLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const request = () =>
    fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  let response = await request();
  if (response.status === 401 && path !== "/auth/refresh" && await refreshSession()) {
    response = await request();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | ApiError
      | undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join(". ")
      : body?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function selectOptions(rows: ValueRecord[], label: (row: ValueRecord) => string): Choice[] {
  return rows.flatMap((row) =>
    typeof row.id === "string"
      ? [{ value: row.id, label: label(row) }]
      : [],
  );
}

function uploadFileField(label: string): Field {
  return { name: "file", label };
}

export function LandlordSectionWorkspace({
  section,
  organisationId,
  currency,
  role,
  onUpdated,
}: {
  section: SectionName;
  organisationId: string;
  currency: string;
  role: string;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<ValueRecord>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rentMode, setRentMode] = useState<"charges" | "payments" | "deposits">("charges");
  const [tenantMode, setTenantMode] = useState<"tenants" | "tenancies">("tenants");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const base = `/organisations/${organisationId}/landlord`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoints: Record<SectionName, Array<[string, string, string?]>> = {
        Properties: [["properties", "properties", "properties"]],
        Units: [["units", "units", "units"], ["properties", "properties", "properties"]],
        Tenants: [["tenants", "tenants", "tenants"], ["tenancies", "tenancies", "tenancies"], ["units", "units", "units"]],
        Leases: [["leases", "leases", "leases"], ["tenancies", "tenancies", "tenancies"]],
        Inspections: [["inspections", "inspections", "inspections"], ["units", "units", "units"], ["tenancies", "tenancies", "tenancies"]],
        "Rent & Deposits": [["rent/charges", "charges", "charges"], ["rent/payments", "payments", "payments"], ["rent/deposits", "deposits", "deposits"], ["tenants", "tenants", "tenants"], ["tenancies", "tenancies", "tenancies"]],
        Expenses: [["expenses", "expenses", "expenses"], ["properties", "properties", "properties"]],
        Utilities: [["utilities", "utilityBills", "utilityBills"], ["properties", "properties", "properties"], ["units", "units", "units"]],
        Maintenance: [["maintenance", "requests", "requests"], ["units", "units", "units"], ["tenants", "tenants", "tenants"], ["team", "members", "members"]],
        Notices: [["notices", "notices", "notices"], ["tenancies", "tenancies", "tenancies"]],
        Reports: [["reports/financial", "report"]],
        Team: [["team", "members", "members"]],
        Subscription: [["subscription", "subscription"]],
        Settings: [["settings", "settings"]],
      };
      const entries = endpoints[section];
      const results = await Promise.all(
        entries.map(async ([path, key, collection]) => {
          const value = await apiRequest<ValueRecord>(`${base}/${path}`);
          return [key, collection ? rowsFor(value, collection) : value] as const;
        }),
      );
      const next = Object.fromEntries(results) as ValueRecord;
      setData(next);
      if (section === "Settings") {
        const organisation = record(next.settings).organisation;
        const settings = record(organisation);
        setForm({
          name: stringValue(settings.name, ""),
          country: stringValue(settings.country, "RW"),
          currency: stringValue(settings.currency, "RWF"),
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Make sure it is running and try again."
          : requestError instanceof Error
            ? requestError.message
            : "We couldn't load this section.",
      );
    } finally {
      setLoading(false);
    }
  }, [base, section, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEditingId(null);
    setForm({});
  }, [section]);

  const properties = rowsFor(data, "properties");
  const units = rowsFor(data, "units");
  const tenants = rowsFor(data, "tenants");
  const tenancies = rowsFor(data, "tenancies");
  const charges = rowsFor(data, "charges");
  const deposits = rowsFor(data, "deposits");

  const fields: Field[] = useMemo(() => {
    const propertyOptions = selectOptions(properties, (row) => stringValue(row.name));
    const unitOptions = selectOptions(units, (row) =>
      `${stringValue(nested(row, "property", "name"))} · ${stringValue(row.unitNumber)}`,
    );
    const tenantOptions = selectOptions(tenants, (row) => stringValue(row.legalName));
    const tenancyOptions = selectOptions(tenancies, (row) =>
      `${stringValue(nested(row, "tenant", "legalName"))} · ${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))}`,
    );
    const chargeOptions = selectOptions(
      charges.filter(
        (charge) =>
          !form.tenantId ||
          nested(charge, "tenancy", "tenant", "id") === form.tenantId,
      ),
      (row) =>
        `${stringValue(nested(row, "tenancy", "tenant", "legalName"))} · ${stringValue(row.period)} · balance ${stringValue(row.balance)}`,
    );
    switch (section) {
      case "Properties":
        return [
          { name: "name", label: "Property name", required: true },
          { name: "type", label: "Property type", required: true, options: [
            { value: "APARTMENT_BUILDING", label: "Apartment building" },
            { value: "HOUSE", label: "House" },
            { value: "COMMERCIAL", label: "Commercial" },
            { value: "MIXED_USE", label: "Mixed use" },
            { value: "OTHER", label: "Other" },
          ] },
          { name: "address", label: "Address", required: true },
          { name: "description", label: "Description", type: "textarea" },
          { name: "status", label: "Status", options: [
            { value: "ACTIVE", label: "Active" },
            { value: "ARCHIVED", label: "Archived" },
          ] },
        ];
      case "Units":
        return [
          { name: "propertyId", label: "Property", required: true, options: propertyOptions },
          { name: "unitNumber", label: "Unit number", required: true },
          { name: "floor", label: "Floor" },
          { name: "bedrooms", label: "Bedrooms", type: "number" },
          { name: "bathrooms", label: "Bathrooms", type: "number" },
          { name: "sizeSqm", label: "Area (m²)", type: "number" },
          { name: "rentAmount", label: `Monthly rent (${currency})`, type: "number", required: true },
          { name: "depositAmount", label: `Required deposit (${currency})`, type: "number", required: true },
          { name: "utilityArrangement", label: "Utility arrangement" },
          { name: "status", label: "Availability", options: [
            { value: "AVAILABLE", label: "Available" },
            { value: "UNAVAILABLE", label: "Unavailable" },
            { value: "ARCHIVED", label: "Archived" },
          ] },
        ];
      case "Tenants":
        if (tenantMode === "tenancies") {
          return [
            { name: "tenantId", label: "Tenant", required: true, options: tenantOptions },
            { name: "unitId", label: "Unit", required: true, options: unitOptions },
            { name: "moveInDate", label: "Move-in date", type: "date", required: true },
            { name: "moveOutDate", label: "Move-out date (optional)", type: "date" },
          ];
        }
        return [
          { name: "legalName", label: "Tenant full name", required: true },
          { name: "phone", label: "Phone" },
          { name: "email", label: "Email", type: "email" },
          { name: "emergencyContactName", label: "Emergency contact name" },
          { name: "emergencyContactPhone", label: "Emergency contact phone" },
        ];
      case "Leases":
        return [
          { name: "tenancyId", label: "Tenancy", required: true, options: tenancyOptions },
          { name: "startDate", label: "Start date", type: "date", required: true },
          { name: "endDate", label: "End date", type: "date", required: true },
          { name: "rentAmount", label: `Monthly rent (${currency})`, type: "number", required: true },
          { name: "dueDay", label: "Rent due day (1–28)", type: "number", required: true },
          { name: "status", label: "Status", options: [
            { value: "DRAFT", label: "Draft" },
            { value: "ACTIVE", label: "Active (signed)" },
          ] },
          { name: "signedAt", label: "Signed date", type: "date" },
          uploadFileField("Agreement PDF (optional)"),
        ];
      case "Inspections":
        return [
          { name: "unitId", label: "Unit", required: true, options: unitOptions },
          { name: "tenancyId", label: "Tenancy", options: tenancyOptions },
          { name: "type", label: "Inspection type", required: true, options: [
            { value: "MOVE_IN", label: "Move-in" },
            { value: "ROUTINE", label: "Routine" },
            { value: "MOVE_OUT", label: "Move-out" },
            { value: "OTHER", label: "Other" },
          ] },
          { name: "inspectedAt", label: "Inspection date", type: "date", required: true },
          { name: "area", label: "Checklist area (optional)" },
          { name: "condition", label: "Condition (optional)", options: [
            { value: "GOOD", label: "Good" },
            { value: "FAIR", label: "Fair" },
            { value: "NEEDS_REPAIR", label: "Needs repair" },
            { value: "NOT_INSPECTED", label: "Not inspected" },
          ] },
          { name: "notes", label: "Checklist notes", type: "textarea" },
          uploadFileField("Inspection photo (optional)"),
        ];
      case "Rent & Deposits":
        if (rentMode === "charges") {
          return [
            { name: "tenancyId", label: "Tenancy", required: true, options: tenancyOptions },
            { name: "period", label: "Rent period (YYYY-MM)", required: true, placeholder: "2026-11" },
            { name: "dueDate", label: "Due date", type: "date", required: true },
            { name: "amount", label: `Rent charge (${currency})`, type: "number", required: true },
          ];
        }
        if (rentMode === "payments") {
          return [
            { name: "tenantId", label: "Tenant", required: true, options: tenantOptions },
            { name: "amount", label: `Amount received (${currency})`, type: "number", required: true },
            { name: "method", label: "Payment method", required: true, options: [
              { value: "CASH", label: "Cash" },
              { value: "BANK_TRANSFER", label: "Bank transfer" },
              { value: "MOBILE_MONEY", label: "Mobile Money" },
              { value: "CARD", label: "Card" },
              { value: "OTHER", label: "Other" },
            ] },
            { name: "reference", label: "Reference (optional)" },
            { name: "receivedAt", label: "Date received", type: "date", required: true },
            { name: "rentChargeId", label: "Allocate to rent charge (optional)", options: chargeOptions },
            { name: "allocationAmount", label: `Allocation amount (${currency})`, type: "number" },
          ];
        }
        return [
          { name: "depositId", label: "Tenancy deposit", required: true, options: selectOptions(deposits, (row) =>
            `${stringValue(nested(row, "tenancy", "tenant", "legalName"))} · ${stringValue(nested(row, "tenancy", "unit", "unitNumber"))} · held ${stringValue(row.heldBalance)}`,
          ) },
          { name: "type", label: "Transaction", required: true, options: [
            { value: "RECEIPT", label: "Deposit received" },
            { value: "REFUND", label: "Refund" },
            { value: "DEDUCTION", label: "Deduction" },
            { value: "ADJUSTMENT", label: "Adjustment" },
          ] },
          { name: "amount", label: `Amount (${currency})`, type: "number", required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "reason", label: "Reason", required: true },
        ];
      case "Expenses":
        return [
          { name: "propertyId", label: "Property", required: true, options: propertyOptions },
          { name: "category", label: "Category", required: true, placeholder: "Repairs, insurance, tax..." },
          { name: "amount", label: `Amount (${currency})`, type: "number", required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "supplier", label: "Supplier" },
          uploadFileField("Receipt or evidence (optional)"),
        ];
      case "Utilities":
        return [
          { name: "propertyId", label: "Property", required: true, options: propertyOptions },
          { name: "utilityType", label: "Utility", required: true, placeholder: "Water, electricity..." },
          { name: "period", label: "Billing period (YYYY-MM)", required: true, placeholder: "2026-11" },
          { name: "totalAmount", label: `Total bill (${currency})`, type: "number", required: true },
          { name: "unitIds", label: "Allocate across units", type: "multi", options: units
            .filter((unit) => !form.propertyId || nested(unit, "property", "id") === form.propertyId)
            .map((unit) => ({ value: stringValue(unit.id, ""), label: stringValue(unit.unitNumber) })) },
          { name: "calculationMethod", label: "Allocation method", required: true, placeholder: "Equal split, meter, floor area..." },
          uploadFileField("Utility bill evidence (optional)"),
        ];
      case "Maintenance":
        return [
          { name: "unitId", label: "Unit", required: true, options: unitOptions },
          { name: "tenantId", label: "Tenant (optional)", options: tenantOptions },
          { name: "category", label: "Category", required: true, placeholder: "Plumbing, electrical..." },
          { name: "priority", label: "Priority", required: true, options: [
            { value: "LOW", label: "Low" },
            { value: "NORMAL", label: "Normal" },
            { value: "HIGH", label: "High" },
            { value: "URGENT", label: "Urgent" },
          ] },
          { name: "description", label: "Description", type: "textarea", required: true },
        ];
      case "Notices":
        return [
          { name: "tenancyId", label: "Tenancy", required: true, options: tenancyOptions },
          { name: "type", label: "Notice type", required: true, options: [
            { value: "RENT_REMINDER", label: "Rent reminder" },
            { value: "LATE_RENT", label: "Late rent" },
            { value: "LEASE_RENEWAL", label: "Lease renewal" },
            { value: "TERMINATION", label: "Termination" },
            { value: "GENERAL", label: "General" },
            { value: "OTHER", label: "Other" },
          ] },
          { name: "issueDate", label: "Issue date", type: "date", required: true },
          { name: "effectiveDate", label: "Effective date", type: "date" },
          { name: "recipient", label: "Recipient email", type: "email" },
          { name: "deliveryMethod", label: "Intended delivery method", placeholder: "Email, hand delivery..." },
          { name: "reason", label: "Notice details", type: "textarea", required: true },
        ];
      case "Team":
        return [
          { name: "email", label: "Collaborator email", type: "email", required: true },
          { name: "role", label: "Role", required: true, options: [
            ...(role === "OWNER" ? [{ value: "ADMIN", label: "Admin" }] : []),
            ...(role === "OWNER" || role === "ADMIN" ? [{ value: "MANAGER", label: "Manager" }] : []),
            { value: "STAFF", label: "Staff" },
          ] },
        ];
      default:
        return [];
    }
  }, [section, properties, units, tenants, tenancies, charges, deposits, currency, rentMode, tenantMode, form, role]);

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function editRecord(row: ValueRecord) {
    if (typeof row.id !== "string") return;
    const values: Record<string, unknown> = section === "Properties"
      ? {
          name: row.name,
          type: row.type,
          address: row.address,
          description: row.description,
          status: row.status,
        }
      : section === "Units"
        ? {
            propertyId: nested(row, "property", "id"),
            unitNumber: row.unitNumber,
            floor: row.floor,
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            sizeSqm: row.sizeSqm,
            rentAmount: row.rentAmount,
            depositAmount: row.depositAmount,
            utilityArrangement: row.utilityArrangement,
            status: row.status,
          }
        : {
            legalName: row.legalName,
            phone: row.phone,
            email: row.email,
            emergencyContactName: row.emergencyContactName,
            emergencyContactPhone: row.emergencyContactPhone,
          };
    setEditingId(row.id);
    setForm(Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ]),
    ));
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
  }

  async function uploadFile(file: File): Promise<string> {
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      throw new Error("Files must be between 1 byte and 20 MB.");
    }
    const { fileId, uploadUrl } = await apiRequest<{
      fileId: string;
      uploadUrl: string;
    }>(`/organisations/${organisationId}/files/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) throw new Error("The file upload did not complete.");
    await apiRequest(`/organisations/${organisationId}/files/${fileId}/complete`, {
      method: "POST",
    });
    return fileId;
  }

  async function uploadAndLink(file: File, linkPath: string, linkBody: ValueRecord) {
    const fileId = await uploadFile(file);
    await apiRequest(`${base}/${linkPath}`, {
      method: "POST",
      body: JSON.stringify({ fileId, ...linkBody }),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let path = "";
      let payload: ValueRecord = {};
      let label = "Record saved";
      let routeId = "";
      switch (section) {
        case "Properties":
          path = "properties";
          payload = { ...form };
          label = "Property added";
          break;
        case "Units":
          path = `properties/${form.propertyId}/units`;
          payload = { ...form };
          delete payload.propertyId;
          for (const key of ["floor", "bedrooms", "bathrooms", "sizeSqm", "utilityArrangement"]) {
            if (!payload[key]) delete payload[key];
          }
          for (const key of ["bedrooms", "bathrooms"]) {
            if (payload[key]) payload[key] = Number(payload[key]);
          }
          label = "Unit added";
          break;
        case "Tenants":
          if (tenantMode === "tenancies") {
            path = "tenancies";
            payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
            label = "Tenancy created";
          } else {
            path = "tenants";
            payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
            label = "Tenant added";
          }
          break;
        case "Leases":
          path = "leases";
          payload = {
            tenancyId: form.tenancyId,
            startDate: form.startDate,
            endDate: form.endDate,
            rentAmount: form.rentAmount,
            dueDay: Number(form.dueDay),
            status: form.status || "DRAFT",
            ...(form.signedAt ? { signedAt: `${form.signedAt}T00:00:00.000Z` } : {}),
          };
          label = "Lease created";
          break;
        case "Inspections": {
          path = "inspections";
          const items =
            form.area && form.condition
              ? [{ area: form.area, condition: form.condition, notes: form.notes || undefined }]
              : [];
          payload = {
            unitId: form.unitId,
            ...(form.tenancyId ? { tenancyId: form.tenancyId } : {}),
            type: form.type,
            inspectedAt: `${form.inspectedAt}T00:00:00.000Z`,
            items,
          };
          label = "Inspection recorded";
          break;
        }
        case "Rent & Deposits":
          if (rentMode === "charges") {
            path = "rent/charges";
            payload = { tenancyId: form.tenancyId, period: form.period, dueDate: form.dueDate, amount: form.amount };
            label = "Rent charge created";
          } else if (rentMode === "payments") {
            path = "rent/payments";
            payload = {
              tenantId: form.tenantId,
              amount: form.amount,
              method: form.method,
              ...(form.reference ? { reference: form.reference } : {}),
              receivedAt: `${form.receivedAt}T00:00:00.000Z`,
              allocations:
                form.rentChargeId && form.allocationAmount
                  ? [{ rentChargeId: form.rentChargeId, amount: form.allocationAmount }]
                  : [],
            };
            label = "Manual payment recorded";
          } else {
            path = `rent/deposits/${form.depositId}/transactions`;
            payload = { type: form.type, amount: form.amount, date: form.date, reason: form.reason };
            label = "Deposit transaction recorded";
          }
          break;
        case "Expenses":
          path = "expenses";
          payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
          label = "Expense recorded";
          break;
        case "Utilities": {
          path = "utilities";
          const selectedUnitIds = (form.unitIds ?? "").split(",").filter(Boolean);
          if (selectedUnitIds.length === 0) {
            throw new Error("Choose at least one unit to allocate the utility bill.");
          }
          const [wholeAmount, fractionAmount = ""] = form.totalAmount.split(".");
          const totalCents =
            Number.parseInt(wholeAmount, 10) * 100 +
            Number.parseInt(fractionAmount.padEnd(2, "0").slice(0, 2) || "0", 10);
          if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
            throw new Error("Enter a valid utility bill total.");
          }
          const baseCents = Math.floor(totalCents / selectedUnitIds.length);
          const remainder = totalCents % selectedUnitIds.length;
          payload = {
            propertyId: form.propertyId,
            utilityType: form.utilityType,
            period: form.period,
            totalAmount: form.totalAmount,
            allocations: selectedUnitIds.map((unitId, index) => {
              const shareCents = baseCents + (index < remainder ? 1 : 0);
              return {
                unitId,
                amount: `${Math.floor(shareCents / 100)}.${String(shareCents % 100).padStart(2, "0")}`,
                calculationMethod: form.calculationMethod,
              };
            }),
          };
          label = "Utility bill and allocations recorded";
          break;
        }
        case "Maintenance":
          path = "maintenance";
          payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
          label = "Maintenance request created";
          break;
        case "Notices":
          path = "notices";
          payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
          label = "Notice saved as draft";
          break;
        case "Team":
          path = "team";
          payload = { email: form.email, role: form.role };
          label = "Invitation created. The collaborator must sign in and accept it.";
          break;
        case "Settings":
          path = "settings";
          payload = { ...form };
          label = "Organisation settings updated";
          break;
        default:
          return;
      }

      if (editingId) {
        const collection = section === "Properties"
          ? "properties"
          : section === "Units"
            ? "units"
            : "tenants";
        path = `${collection}/${editingId}`;
        label = `${section === "Properties" ? "Property" : section === "Units" ? "Unit" : "Tenant"} updated`;
      }
      const result = await apiRequest<ValueRecord>(`${base}/${path}`, {
        method: editingId || section === "Settings" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      const resultKey = section === "Rent & Deposits" && rentMode === "charges" ? "charge"
        : section === "Rent & Deposits" && rentMode === "payments" ? "payment"
          : section === "Properties" ? "property"
            : section === "Units" ? "unit"
              : section === "Tenants" ? tenantMode === "tenancies" ? "tenancy" : "tenant"
                : section === "Leases" ? "lease"
                  : section === "Inspections" ? "inspection"
                    : section === "Expenses" ? "expense"
                      : section === "Utilities" ? "utilityBill"
                        : section === "Maintenance" ? "request"
                          : section === "Notices" ? "notice" : "";
      const created = record(result[resultKey]);
      if (typeof created.id === "string") routeId = created.id;

      if (selectedFile && section === "Leases" && routeId) {
        await uploadAndLink(selectedFile, `leases/${routeId}/documents`, {
          documentStatus: form.status === "ACTIVE" ? "SIGNED" : "PENDING",
        });
      }
      if (selectedFile && section === "Inspections" && routeId) {
        await uploadAndLink(selectedFile, `inspections/${routeId}/media`, {
          caption: selectedFile.name,
        });
      }
      if (selectedFile && section === "Expenses" && routeId) {
        await uploadAndLink(selectedFile, `expenses/${routeId}/evidence`, {});
      }
      if (selectedFile && section === "Utilities" && routeId) {
        await uploadAndLink(selectedFile, `utilities/${routeId}/evidence`, {});
      }

      setSuccess(label);
      setForm(section === "Settings" ? form : {});
      setEditingId(null);
      setSelectedFile(null);
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Check the API connection and try again."
          : requestError instanceof Error
            ? requestError.message
            : "The change could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function choosePlan(planSlug: string, billingCycle: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`${base}/subscription/select`, {
        method: "POST",
        body: JSON.stringify({ planSlug, billingCycle }),
      });
      setSuccess("Invoice created. Your selected plan takes effect after payment verification.");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The plan could not be selected.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSubscriptionPayment(
    invoiceId: string,
    payment: { method: string; reference: string; amount: string; proof: File },
  ) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const proofFileId = await uploadFile(payment.proof);
      await apiRequest(`${base}/subscription/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          method: payment.method,
          reference: payment.reference,
          amount: payment.amount,
          proofFileId,
        }),
      });
      setSuccess("Payment proof submitted for administrator verification.");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The payment proof could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMaintenance(
    row: ValueRecord,
    status: string,
    changes: ValueRecord = {},
    invoice?: File,
  ) {
    if (typeof row.id !== "string") return;
    setError(null);
    try {
      const invoiceFileId = invoice ? await uploadFile(invoice) : undefined;
      await apiRequest(`${base}/maintenance/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...changes,
          ...(invoiceFileId ? { invoiceFileId } : {}),
        }),
      });
      setSuccess("Maintenance status updated");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Status update failed.");
    }
  }

  async function updateLeaseStatus(row: ValueRecord, status: string) {
    if (typeof row.id !== "string") return;
    const body: ValueRecord = { status };
    if (status === "ACTIVE") {
      const signedAt = window.prompt(
        "Enter the signed date (YYYY-MM-DD)",
        new Date().toISOString().slice(0, 10),
      );
      if (!signedAt) return;
      body.signedAt = `${signedAt}T00:00:00.000Z`;
    }
    if (status === "TERMINATED") {
      const terminationReason = window.prompt("Enter the reason for termination");
      if (!terminationReason?.trim()) return;
      body.terminationReason = terminationReason;
    }
    setError(null);
    try {
      await apiRequest(`${base}/leases/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSuccess("Lease status updated");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The lease status could not be updated.");
    }
  }

  async function moveOut(row: ValueRecord) {
    if (typeof row.id !== "string") return;
    const moveOutDate = window.prompt(
      "Enter the move-out date (YYYY-MM-DD)",
      new Date().toISOString().slice(0, 10),
    );
    if (!moveOutDate) return;
    setError(null);
    try {
      await apiRequest(`${base}/tenancies/${row.id}/move-out`, {
        method: "PATCH",
        body: JSON.stringify({ moveOutDate }),
      });
      setSuccess("Move-out recorded. The tenancy history has been retained.");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The move-out could not be recorded.");
    }
  }

  async function applyReport() {
    const params = new URLSearchParams();
    if (form.from) params.set("from", form.from);
    if (form.to) params.set("to", form.to);
    try {
      const query = params.toString() ? `?${params.toString()}` : "";
      const report = await apiRequest<ValueRecord>(`${base}/reports/financial${query}`);
      setData((current) => ({ ...current, report }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The report could not be loaded.");
    }
  }

  async function reverseRecord(path: string, reason: string) {
    if (!reason.trim()) return;
    setError(null);
    try {
      await apiRequest(`${base}/${path}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setSuccess("Record reversed and kept in the audit history");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The reversal failed.");
    }
  }

  async function downloadFile(fileId: string) {
    try {
      const result = await apiRequest<{ downloadUrl: string }>(
        `/organisations/${organisationId}/files/${fileId}/download-url`,
      );
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The document could not be downloaded.");
    }
  }

  const canManageRecords = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const formDisabled = saving || !canManageRecords;
  const sectionItemName = section.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
  const title = section === "Rent & Deposits" ? "Rent & deposits" : section;
  const subtitle: Record<SectionName, string> = {
    Properties: "Add and maintain the buildings in your organisation.",
    Units: "Manage rental units, rent amounts, availability, and utilities.",
    Tenants: "Keep tenant contact details and historical tenancy links together.",
    Leases: "Track lease dates and attach signed agreement versions.",
    Inspections: "Record checklist results and attach photo evidence.",
    "Rent & Deposits": "Record charges, manually entered payments, allocations, and deposits separately.",
    Expenses: "Record operating costs. Posted expenses are reversed, never deleted.",
    Utilities: "Record utility bills and allocate the full bill precisely across units.",
    Maintenance: "Track work requests, assignees, costs, and resolution.",
    Notices: "Prepare draft notices. PropEase does not send or validate legal notices.",
    Reports: "Review totals reconciled from rent charges, allocations, payments, and expenses.",
    Team: "Invite existing PropEase accounts and manage organisation access.",
    Subscription: "Review your trial, unit limits, invoices, and proposed plans.",
    Settings: "Update organisation details and review the audit trail.",
  };

  return (
    <div className="landlord-section">
      <div className="dashboard-heading-row">
        <div>
          <span className="dashboard-date">PROPEASE WORKSPACE</span>
          <h1>{title}</h1>
          <p>{subtitle[section]}</p>
        </div>
        <button
          className="dashboard-secondary-button"
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <div className="landlord-alert is-error" role="alert">{error}</div>}
      {success && <div className="landlord-alert is-success" role="status"><Check size={16} />{success}</div>}

      {section === "Rent & Deposits" && (
        <div className="landlord-tabs" role="tablist" aria-label="Rent and deposit records">
          {(["charges", "payments", "deposits"] as const).map((mode) => (
            <button
              className={rentMode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => { setRentMode(mode); setForm({}); }}
              type="button"
              role="tab"
              aria-selected={rentMode === mode}
            >
              {mode === "charges" ? "Rent charges" : mode === "payments" ? "Payments" : "Deposits"}
            </button>
          ))}
        </div>
      )}
      {section === "Tenants" && (
        <div className="landlord-tabs" role="tablist" aria-label="Tenant records">
          {(["tenants", "tenancies"] as const).map((mode) => (
            <button
              className={tenantMode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => { setTenantMode(mode); setForm({}); }}
              type="button"
              role="tab"
              aria-selected={tenantMode === mode}
            >
              {mode === "tenants" ? "Tenants" : "Tenancies"}
            </button>
          ))}
        </div>
      )}

      {section === "Reports" ? (
        <ReportView
          report={record(data.report)}
          currency={currency}
          from={form.from ?? ""}
          to={form.to ?? ""}
          onDateChange={updateField}
          onApply={() => void applyReport()}
        />
      ) : section === "Subscription" ? (
        <SubscriptionView
          data={record(data.subscription)}
          currency={currency}
          saving={saving}
          canPay={role === "OWNER"}
          onChoosePlan={choosePlan}
          onSubmitPayment={submitSubscriptionPayment}
        />
      ) : section === "Settings" ? (
        <section className="landlord-panel">
          <div className="landlord-panel-heading"><div><h2>Organisation profile</h2><p>These details are shared across this workspace.</p></div></div>
          <Form fields={[
            { name: "name", label: "Organisation name", required: true },
            { name: "country", label: "Country code (ISO 3166-1 alpha-2)", required: true },
            { name: "currency", label: "Currency code (ISO 4217)", required: true },
          ]} values={form} onChange={updateField} onSubmit={submit} disabled={formDisabled} saving={saving} submitLabel="Save settings" />
          <div className="landlord-panel-heading landlord-subheading"><div><h2>Recent audit activity</h2><p>Recent access and data changes in this organisation.</p></div></div>
          <RecordList rows={rowsFor(record(data.settings), "auditLogs")} currency={currency} section={section} />
        </section>
      ) : (
        <div className="landlord-workspace-grid">
          <section className="landlord-panel landlord-form-panel">
            <div className="landlord-panel-heading">
              <div>
                <h2>{editingId ? `Edit ${sectionItemName}` : section === "Rent & Deposits" ? rentMode === "charges" ? "Create rent charge" : rentMode === "payments" ? "Record manual payment" : "Record deposit transaction" : `Add ${sectionItemName}`}</h2>
                <p>{section === "Rent & Deposits" && rentMode === "payments" ? "Manually recorded, not independently bank-verified." : "Fields marked required must be completed."}</p>
              </div>
              <Plus size={17} />
            </div>
            <Form
              fields={fields}
              values={form}
              onChange={updateField}
              onSubmit={submit}
              disabled={formDisabled}
              saving={saving}
              selectedFile={selectedFile}
              onFile={setSelectedFile}
              submitLabel={editingId ? "Save changes" : undefined}
            />
            {editingId && (
              <button
                className="landlord-text-action"
                type="button"
                onClick={() => { setEditingId(null); setForm({}); }}
              >
                Cancel edit
              </button>
            )}
            {section === "Rent & Deposits" && rentMode === "payments" && (
              <p className="landlord-help-text">An allocation is optional; if omitted, the payment remains unapplied and the rent balance will not be reduced.</p>
            )}
            {section === "Utilities" && (
              <p className="landlord-help-text">The total is split equally across selected units using whole cents; any remainder cents are assigned one by one.</p>
            )}
          </section>

          <section className="landlord-panel landlord-records-panel">
            <div className="landlord-panel-heading">
              <div><h2>{section === "Rent & Deposits" ? rentMode === "charges" ? "Rent charges" : rentMode === "payments" ? "Recorded payments" : "Deposit ledgers" : `Current ${section.toLowerCase()}`}</h2><p>{loading ? "Loading records..." : "Most recent records appear first."}</p></div>
              {loading && <LoaderCircle className="landlord-spinner" size={17} />}
            </div>
            {section === "Rent & Deposits" ? (
              <RecordList
                rows={rentMode === "charges" ? charges : rentMode === "payments" ? rowsFor(data, "payments") : deposits}
                currency={currency}
                section={section}
                rentMode={rentMode}
                onReverse={(path) => {
                  const reason = window.prompt("Enter the reason for this reversal");
                  if (reason) void reverseRecord(path, reason);
                }}
                onReceipt={(id) => void downloadReceipt(id)}
              />
            ) : section === "Maintenance" ? (
              <MaintenanceList
                rows={rowsFor(data, "requests")}
                members={rowsFor(data, "members")}
                onUpdate={canManageRecords ? updateMaintenance : undefined}
              />
            ) : section === "Utilities" ? (
              <RecordList
                rows={rowsFor(data, "utilityBills")}
                currency={currency}
                section={section}
                onDownload={(fileId) => void downloadFile(fileId)}
                onReverse={(path) => {
                  const reason = window.prompt("Enter the reason for this reversal");
                  if (reason) void reverseRecord(path, reason);
                }}
              />
            ) : section === "Expenses" ? (
              <RecordList
                rows={rowsFor(data, "expenses")}
                currency={currency}
                section={section}
                onDownload={(fileId) => void downloadFile(fileId)}
                onReverse={(path) => {
                  const reason = window.prompt("Enter the reason for this reversal");
                  if (reason) void reverseRecord(path, reason);
                }}
              />
            ) : section === "Leases" ? (
              <RecordList
                rows={rowsFor(data, "leases")}
                currency={currency}
                section={section}
                onDownload={(fileId) => void downloadFile(fileId)}
                onLeaseStatus={canManageRecords ? (row, status) => void updateLeaseStatus(row, status) : undefined}
              />
            ) : section === "Inspections" ? (
              <RecordList rows={rowsFor(data, "inspections")} currency={currency} section={section} onDownload={(fileId) => void downloadFile(fileId)} />
            ) : section === "Team" ? (
              <RecordList rows={rowsFor(data, "members")} currency={currency} section={section} />
            ) : (
              <RecordList
                rows={section === "Tenants" && tenantMode === "tenancies" ? rowsFor(data, "tenancies") : rowsFor(data, sectionDataKey(section, rentMode))}
                currency={currency}
                section={section}
                onEdit={canManageRecords && (["Properties", "Units"].includes(section) || (section === "Tenants" && tenantMode === "tenants")) ? editRecord : undefined}
                tenantMode={tenantMode}
                onMoveOut={section === "Tenants" && tenantMode === "tenancies" ? (row) => void moveOut(row) : undefined}
              />
            )}
            {!loading && rowsFor(data, section === "Tenants" && tenantMode === "tenancies" ? "tenancies" : sectionDataKey(section, rentMode)).length === 0 && (
              <p className="landlord-empty-state">No records yet. Use the form to add the first one.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );

  async function downloadReceipt(paymentId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}${base}/rent/payments/${paymentId}/receipt`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("The receipt could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${paymentId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The receipt could not be downloaded.");
    }
  }
}

function sectionDataKey(section: SectionName, rentMode: "charges" | "payments" | "deposits"): string {
  if (section === "Rent & Deposits") return rentMode;
  const keys: Partial<Record<SectionName, string>> = {
    Properties: "properties",
    Units: "units",
    Tenants: "tenants",
    Leases: "leases",
    Inspections: "inspections",
    Expenses: "expenses",
    Utilities: "utilityBills",
    Maintenance: "requests",
    Notices: "notices",
    Team: "members",
  };
  return keys[section] ?? "";
}

function Form({
  fields,
  values,
  onChange,
  onSubmit,
  disabled,
  saving,
  submitLabel,
  selectedFile,
  onFile,
}: {
  fields: Field[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
  saving: boolean;
  submitLabel?: string;
  selectedFile?: File | null;
  onFile?: (file: File | null) => void;
}) {
  return (
    <form className="landlord-form" onSubmit={onSubmit}>
      <div className="landlord-form-fields">
        {fields.map((field) => field.name === "file" ? (
          <label className="landlord-field" key={field.name}>
            <span>{field.label}</span>
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={disabled}
              onChange={(event) => onFile?.(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
            {selectedFile && <small>{selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(1)} MB</small>}
          </label>
        ) : (
          <label className={`landlord-field${field.type === "textarea" ? " is-wide" : ""}`} key={field.name}>
            <span>{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
            {field.options ? (
              field.type === "multi" ? (
                <select
                  disabled={disabled}
                      required={field.required}
                      multiple
                  onChange={(event) => onChange(field.name, Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(","))}
                  value={(values[field.name] ?? "").split(",").filter(Boolean)}
                >
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <select
                  disabled={disabled}
                  onChange={(event) => onChange(field.name, event.currentTarget.value)}
                  required={field.required}
                  value={values[field.name] ?? ""}
                >
                  <option value="">Select…</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )
            ) : field.type === "textarea" ? (
              <textarea
                disabled={disabled}
                onChange={(event) => onChange(field.name, event.currentTarget.value)}
                required={field.required}
                rows={3}
                value={values[field.name] ?? ""}
              />
            ) : (
              <input
                disabled={disabled}
                max={field.type === "number" ? "9999999999" : undefined}
                min={field.type === "number" ? "0" : undefined}
                onChange={(event) => onChange(field.name, event.currentTarget.value)}
                placeholder={field.placeholder}
                required={field.required}
                step={field.type === "number" ? "0.01" : undefined}
                type={field.type ?? "text"}
                value={values[field.name] ?? ""}
              />
            )}
          </label>
        ))}
      </div>
      {disabled && <p className="landlord-help-text">Your role can view this section but cannot make changes.</p>}
      <button className="dashboard-primary-button" disabled={disabled || saving} type="submit">
        {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Plus size={15} />}
        {saving ? "Saving…" : submitLabel ?? "Save record"}
      </button>
    </form>
  );
}

function RecordList({
  rows,
  currency,
  section,
  rentMode,
  onReverse,
  onReceipt,
  onDownload,
  onEdit,
  onLeaseStatus,
  tenantMode,
  onMoveOut,
}: {
  rows: ValueRecord[];
  currency: string;
  section: SectionName;
  rentMode?: "charges" | "payments" | "deposits";
  onReverse?: (path: string) => void;
  onReceipt?: (id: string) => void;
  onDownload?: (fileId: string) => void;
  onEdit?: (row: ValueRecord) => void;
  onLeaseStatus?: (row: ValueRecord, status: string) => void;
  tenantMode?: "tenants" | "tenancies";
  onMoveOut?: (row: ValueRecord) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="landlord-record-list">
      {rows.map((row, index) => {
        const id = typeof row.id === "string" ? row.id : `${section}-${index}`;
        const status = stringValue(row.status ?? row.deliveryStatus ?? row.documentStatus, "");
        const lines: Array<[string, string]> = [];
        const add = (label: string, value: unknown) => {
          if (value !== undefined && value !== null && value !== "") {
            lines.push([label, String(value)]);
          }
        };
        let heading: string = section;
        let detail = "";
        let amountValue: unknown;

        if (section === "Properties") {
          heading = stringValue(row.name);
          detail = stringValue(row.address);
          add("Type", row.type);
          add("Units", nested(row, "_count", "units"));
        } else if (section === "Units") {
          heading = `${stringValue(nested(row, "property", "name"))} · ${stringValue(row.unitNumber)}`;
          detail = stringValue(nested(row, "tenancies", "0", "tenant", "legalName"), "");
          add("Floor", row.floor);
          add("Bedrooms", row.bedrooms);
          add("Size", row.sizeSqm ? `${stringValue(row.sizeSqm)} m²` : undefined);
          add("Rent", formatAmount(row.rentAmount, currency));
          amountValue = row.depositAmount;
        } else if (section === "Tenants" && tenantMode === "tenancies") {
          heading = `${stringValue(nested(row, "tenant", "legalName"))} · ${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))}`;
          detail = `${stringValue(row.status)} · ${dateLabel(row.moveInDate)}${row.moveOutDate ? ` – ${dateLabel(row.moveOutDate)}` : ""}`;
          add("Deposit held", formatAmount(nested(row, "deposit", "heldBalance"), currency));
        } else if (section === "Tenants") {
          heading = stringValue(row.legalName);
          detail = stringValue(row.email ?? row.phone, "No contact information");
          add("Emergency contact", row.emergencyContactName);
          add("Phone", row.phone);
        } else if (section === "Leases") {
          heading = stringValue(nested(row, "tenancy", "tenant", "legalName"));
          detail = `${stringValue(nested(row, "tenancy", "unit", "property", "name"))} · ${stringValue(nested(row, "tenancy", "unit", "unitNumber"))}`;
          add("Term", `${dateLabel(row.startDate)} – ${dateLabel(row.endDate)}`);
          add("Rent", formatAmount(row.rentAmount, currency));
          amountValue = undefined;
          for (const documentRow of rowsFor({ docs: row.documents }, "docs")) {
            const fileId = stringValue(documentRow.fileId, "");
            if (fileId && onDownload) {
              lines.push(["Agreement", `${stringValue(documentRow.documentStatus)} · v${stringValue(documentRow.version)}`]);
            }
          }
        } else if (section === "Inspections") {
          heading = `${stringValue(row.type)} · ${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))}`;
          detail = dateLabel(row.inspectedAt);
          add("Checklist items", Array.isArray(row.items) ? row.items.length : 0);
          add("Photos", Array.isArray(row.media) ? row.media.length : 0);
        } else if (section === "Rent & Deposits" && rentMode === "charges") {
          heading = `${stringValue(nested(row, "tenancy", "tenant", "legalName"))} · ${stringValue(row.period)}`;
          detail = `${stringValue(nested(row, "tenancy", "unit", "property", "name"))} / ${stringValue(nested(row, "tenancy", "unit", "unitNumber"))}`;
          add("Due", dateLabel(row.dueDate));
          add("Balance", formatAmount(row.balance, currency));
          amountValue = row.amount;
        } else if (section === "Rent & Deposits" && rentMode === "payments") {
          heading = stringValue(nested(row, "tenant", "legalName"), "Unassigned tenant");
          detail = `${stringValue(row.method)} · ${dateLabel(row.receivedAt)}`;
          add("Reference", row.reference);
          add("Allocation count", Array.isArray(row.allocations) ? row.allocations.length : 0);
          amountValue = row.amount;
        } else if (section === "Rent & Deposits") {
          heading = `${stringValue(nested(row, "tenancy", "tenant", "legalName"))} · ${stringValue(nested(row, "tenancy", "unit", "unitNumber"))}`;
          detail = `${stringValue(nested(row, "tenancy", "unit", "property", "name"))} · held ${formatAmount(row.heldBalance, currency)}`;
          add("Required", formatAmount(row.requiredAmount, currency));
          add("Status", row.status);
          amountValue = undefined;
        } else if (section === "Expenses") {
          heading = `${stringValue(row.category)} · ${stringValue(nested(row, "property", "name"))}`;
          detail = `${dateLabel(row.date)}${row.supplier ? ` · ${stringValue(row.supplier)}` : ""}`;
          amountValue = row.amount;
        } else if (section === "Utilities") {
          heading = `${stringValue(row.utilityType)} · ${stringValue(nested(row, "property", "name"))}`;
          detail = `${stringValue(row.period)} · ${Array.isArray(row.allocations) ? row.allocations.length : 0} unit allocations`;
          amountValue = row.totalAmount;
        } else if (section === "Maintenance") {
          heading = `${stringValue(row.category)} · ${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))}`;
          detail = stringValue(row.description);
          add("Priority", row.priority);
        } else if (section === "Notices") {
          heading = `${stringValue(row.type)} · ${stringValue(nested(row, "tenancy", "tenant", "legalName"))}`;
          detail = stringValue(row.reason);
          add("Issue date", dateLabel(row.issueDate));
          add("Effective date", dateLabel(row.effectiveDate));
        } else if (section === "Team") {
          heading = stringValue(nested(row, "user", "name"));
          detail = stringValue(nested(row, "user", "email"));
          add("Role", row.role);
          add("Invited", dateLabel(row.invitedAt));
        } else if (section === "Settings") {
          heading = stringValue(row.action);
          detail = `${stringValue(row.entityType)} · ${stringValue(nested(row, "user", "name"), "System")}`;
          add("Date", dateLabel(row.createdAt));
        }

        return (
          <article className="landlord-record-card" key={id}>
            <div className="landlord-record-main">
              <b>{heading}</b>
              {detail && <span>{detail}</span>}
              {!!lines.length && <small>{lines.map(([label, value]) => `${label}: ${value}`).join(" · ")}</small>}
              {section === "Rent & Deposits" && rentMode === "payments" && Boolean(row.reversedAt) && (
                <small className="landlord-reversal-note">Reversed: {stringValue(row.reversalReason)}</small>
              )}
              {section === "Expenses" && Boolean(row.reversedAt) && (
                <small className="landlord-reversal-note">Reversed: {stringValue(row.reversalReason)}</small>
              )}
              {section === "Utilities" && Boolean(row.reversedAt) && (
                <small className="landlord-reversal-note">Reversed: {stringValue(row.reversalReason)}</small>
              )}
              {section === "Rent & Deposits" && rentMode === "deposits" && Array.isArray(row.transactions) && (
                <small>{row.transactions.map((transaction) => `${stringValue(nested(transaction, "type"))} ${formatAmount(nested(transaction, "amount"), currency)} (${dateLabel(nested(transaction, "date"))})`).join(" · ")}</small>
              )}
              {section === "Inspections" && Array.isArray(row.items) && row.items.map((item, itemIndex) => (
                <small key={`${id}-item-${itemIndex}`}>{stringValue(nested(item, "area"))}: {stringValue(nested(item, "condition"))}{nested(item, "notes") ? ` — ${stringValue(nested(item, "notes"))}` : ""}</small>
              ))}
            </div>
            <div className="landlord-record-actions">
              {amountValue !== undefined && <strong>{formatAmount(amountValue, currency)}</strong>}
              {status && <span className={`landlord-status-pill status-${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>}
              {onEdit && typeof row.id === "string" && (
                <button className="landlord-text-action" type="button" onClick={() => onEdit(row)}>Edit</button>
              )}
              {section === "Rent & Deposits" && rentMode === "payments" && !row.reversedAt && onReverse && (
                <>
                  {onReceipt && typeof row.id === "string" && (
                    <button className="landlord-icon-button" type="button" aria-label="Download receipt" onClick={() => onReceipt(row.id as string)}><ArrowDownToLine size={15} /></button>
                  )}
                  {typeof row.id === "string" && <button className="landlord-text-action" type="button" onClick={() => onReverse(`rent/payments/${row.id}/reverse`)}>Reverse</button>}
                </>
              )}
              {section === "Rent & Deposits" && rentMode === "charges" && status !== "VOID" && onReverse && typeof row.id === "string" && (
                <button className="landlord-text-action" type="button" onClick={() => onReverse(`rent/charges/${row.id}/void`)}>Void</button>
              )}
              {section === "Expenses" && !row.reversedAt && typeof row.id === "string" && onReverse && (
                <button className="landlord-text-action" type="button" onClick={() => onReverse(`expenses/${row.id}/reverse`)}>Reverse</button>
              )}
              {section === "Utilities" && !row.reversedAt && typeof row.id === "string" && onReverse && (
                <button className="landlord-text-action" type="button" onClick={() => onReverse(`utilities/${row.id}/reverse`)}>Reverse</button>
              )}
              {section === "Tenants" && tenantMode === "tenancies" && onMoveOut && ["ACTIVE", "UPCOMING"].includes(status) && (
                <button className="landlord-text-action" type="button" onClick={() => onMoveOut(row)}>Record move-out</button>
              )}
              {section === "Leases" && onLeaseStatus && ["DRAFT", "ACTIVE"].includes(status) && (
                <select
                  aria-label="Update lease status"
                  value=""
                  onChange={(event) => {
                    if (event.currentTarget.value) onLeaseStatus(row, event.currentTarget.value);
                  }}
                >
                  <option value="">Update lease</option>
                  {status === "DRAFT" && <option value="ACTIVE">Activate (signed)</option>}
                  {status === "DRAFT" && <option value="TERMINATED">Terminate</option>}
                  {status === "ACTIVE" && <option value="EXPIRED">Mark expired</option>}
                  {status === "ACTIVE" && <option value="TERMINATED">Terminate</option>}
                </select>
              )}
              {(section === "Leases" || section === "Inspections") && onDownload && (
                <FileDownloadButtons row={row} section={section} onDownload={onDownload} />
              )}
              {(section === "Expenses" || section === "Utilities") &&
                typeof row.evidenceFileId === "string" &&
                onDownload && (
                  <button className="landlord-icon-button" type="button" aria-label="Download evidence" onClick={() => onDownload(row.evidenceFileId as string)}>
                    <ArrowDownToLine size={15} />
                  </button>
                )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FileDownloadButtons({
  row,
  section,
  onDownload,
}: {
  row: ValueRecord;
  section: "Leases" | "Inspections";
  onDownload: (fileId: string) => void;
}) {
  const fileIds = section === "Leases"
    ? rowsFor({ values: row.documents }, "values").map((documentRow) => stringValue(documentRow.fileId, ""))
    : rowsFor({ values: row.media }, "values").map((mediaRow) => stringValue(mediaRow.fileId, ""));
  return (
    <>
      {fileIds.filter(Boolean).map((fileId) => (
        <button className="landlord-icon-button" key={fileId} type="button" aria-label="Download attachment" onClick={() => onDownload(fileId)}>
          <ArrowDownToLine size={15} />
        </button>
      ))}
    </>
  );
}

function MaintenanceList({
  rows,
  members,
  onUpdate,
}: {
  rows: ValueRecord[];
  members: ValueRecord[];
  onUpdate?: (row: ValueRecord, status: string, changes?: ValueRecord, invoice?: File) => void;
}) {
  const [invoiceFiles, setInvoiceFiles] = useState<Record<string, File>>({});
  const nextStatus: Record<string, string[]> = {
    SUBMITTED: ["APPROVED", "ASSIGNED", "REJECTED"],
    APPROVED: ["ASSIGNED", "IN_PROGRESS", "REJECTED"],
    ASSIGNED: ["IN_PROGRESS", "REJECTED"],
    IN_PROGRESS: ["COMPLETED", "REJECTED"],
    COMPLETED: [],
    REJECTED: [],
  };
  if (!rows.length) return null;
  return (
    <div className="landlord-record-list">
      {rows.map((row, index) => {
        const status = stringValue(row.status);
        return (
          <article className="landlord-record-card" key={stringValue(row.id, String(index))}>
            <div className="landlord-record-main">
              <b>{stringValue(row.category)} · {stringValue(nested(row, "unit", "unitNumber"))}</b>
              <span>{stringValue(row.description)}</span>
              <small>{stringValue(row.priority)} · {dateLabel(row.createdAt)} · Assigned to: {stringValue(row.assignedToUserId, "unassigned")}</small>
              {Boolean(row.resolutionNotes) && <small>Resolution: {stringValue(row.resolutionNotes)}</small>}
            </div>
            <div className="landlord-record-actions">
              <span className={`landlord-status-pill status-${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>
              {onUpdate && (
                <select
                  aria-label="Assign maintenance request"
                  value=""
                  onChange={(event) => {
                    if (event.currentTarget.value) onUpdate(row, status, { assignedToUserId: event.currentTarget.value });
                  }}
                >
                  <option value="">Assign to team member</option>
                  {members
                    .filter((member) => member.status === "ACTIVE" && typeof member.userId === "string")
                    .map((member) => (
                      <option key={stringValue(member.userId)} value={stringValue(member.userId)}>
                        {stringValue(nested(member, "user", "name"), stringValue(nested(member, "user", "email")))}
                      </option>
                    ))}
                </select>
              )}
              {onUpdate && nextStatus[status]?.length > 0 && (
                <select aria-label="Update maintenance status" value="" onChange={(event) => {
                  if (event.currentTarget.value) onUpdate(row, event.currentTarget.value);
                }}>
                  <option value="">Update status</option>
                  {nextStatus[status].map((next) => <option key={next} value={next}>{next.replaceAll("_", " ")}</option>)}
                </select>
              )}
              {onUpdate && status !== "COMPLETED" && status !== "REJECTED" && (
                <button
                  className="landlord-text-action"
                  type="button"
                  onClick={() => {
                    const estimatedCost = window.prompt("Enter the estimated cost");
                    if (estimatedCost?.trim()) onUpdate(row, status, { estimatedCost });
                  }}
                >
                  Set estimate
                </button>
              )}
              {onUpdate && status === "IN_PROGRESS" && (
                <>
                  <label className="landlord-field landlord-maintenance-invoice">
                    <span>Invoice (optional)</span>
                    <input
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      type="file"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        const requestId = stringValue(row.id, "");
                        if (file && requestId) {
                          setInvoiceFiles((current) => ({ ...current, [requestId]: file }));
                        }
                      }}
                    />
                  </label>
                  <button
                    className="landlord-text-action"
                    type="button"
                    onClick={() => {
                      const actualCost = window.prompt("Enter the actual cost (required if attaching an invoice)");
                      if (actualCost === null) return;
                      const invoice = invoiceFiles[stringValue(row.id, "")];
                      if (invoice && !actualCost.trim()) {
                        window.alert("Enter an actual cost before attaching the invoice.");
                        return;
                      }
                      const resolutionNotes = window.prompt("Enter resolution notes (optional)") ?? "";
                      onUpdate(row, "COMPLETED", {
                        ...(actualCost.trim() ? { actualCost: actualCost.trim() } : {}),
                        ...(resolutionNotes.trim() ? { resolutionNotes: resolutionNotes.trim() } : {}),
                      }, invoice);
                    }}
                  >
                    Complete request
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReportView({
  report,
  currency,
  from,
  to,
  onDateChange,
  onApply,
}: {
  report: ValueRecord;
  currency: string;
  from: string;
  to: string;
  onDateChange: (name: string, value: string) => void;
  onApply: () => void;
}) {
  const rent = record(report.rent);
  const expenses = record(report.expenses);
  const deposits = record(report.deposits);
  const occupancy = record(report.occupancy);
  const metrics = [
    ["Rent charged", formatAmount(rent.charged, currency)],
    ["Cash recorded", formatAmount(rent.collected, currency)],
    ["Allocated to charges", formatAmount(rent.appliedToCharges, currency)],
    ["Unapplied receipts", formatAmount(rent.unapplied, currency)],
    ["Outstanding balance", formatAmount(rent.outstanding, currency)],
    ["Total expenses", formatAmount(expenses.total, currency)],
    ["Deposits held (not income)", formatAmount(deposits.held, currency)],
    ["Occupancy", `${stringValue(occupancy.occupied, "0")} / ${stringValue(occupancy.total, "0")}`],
  ];
  function downloadCsv() {
    const rows = [
      ["Metric", "Value", "Currency"],
      ["Rent charged", String(rent.charged ?? 0), currency],
      ["Cash received", String(rent.collected ?? 0), currency],
      ["Applied to rent charges", String(rent.appliedToCharges ?? 0), currency],
      ["Unapplied receipts", String(rent.unapplied ?? 0), currency],
      ["Outstanding rent", String(rent.outstanding ?? 0), currency],
      ["Expenses", String(expenses.total ?? 0), currency],
      ["Deposits held (separate liability)", String(deposits.held ?? 0), currency],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "propease-financial-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="landlord-panel">
      <div className="landlord-panel-heading">
        <div><h2>Financial summary</h2><p>Cash received and rent allocations are shown separately so totals reconcile.</p></div>
        <button className="dashboard-secondary-button" type="button" onClick={downloadCsv}><ArrowDownToLine size={15} /> Export CSV</button>
      </div>
      <div className="landlord-date-filters">
        <label className="landlord-field"><span>From</span><input type="date" value={from} onChange={(event) => onDateChange("from", event.currentTarget.value)} /></label>
        <label className="landlord-field"><span>To</span><input type="date" value={to} onChange={(event) => onDateChange("to", event.currentTarget.value)} /></label>
        <button className="dashboard-primary-button" type="button" onClick={onApply}>Apply period</button>
      </div>
      <div className="landlord-report-grid">
        {metrics.map(([label, value]) => <article className="landlord-report-card" key={label}><span>{label}</span><b>{value}</b></article>)}
      </div>
    </section>
  );
}

function SubscriptionView({
  data,
  currency,
  saving,
  canPay,
  onChoosePlan,
  onSubmitPayment,
}: {
  data: ValueRecord;
  currency: string;
  saving: boolean;
  canPay: boolean;
  onChoosePlan: (slug: string, cycle: string) => void;
  onSubmitPayment: (
    invoiceId: string,
    payment: { method: string; reference: string; amount: string; proof: File },
  ) => void;
}) {
  const subscription = record(data.subscription);
  const plan = record(subscription.plan);
  const plans = rowsFor(data, "plans");
  const invoices = rowsFor(subscription, "invoices");
  const activeUnits = Number(data.activeUnits ?? 0);
  const [cycle, setCycle] = useState("MONTHLY");
  const [paymentInvoice, setPaymentInvoice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("MOBILE_MONEY");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  return (
    <>
      <section className="landlord-panel landlord-subscription-current">
        <div className="landlord-panel-heading"><div><h2>Current subscription</h2><p>Rental unit limits apply to all non-archived units in this organisation.</p></div><CircleDollarSign size={19} /></div>
        <div className="landlord-subscription-summary">
          <div><span>Plan</span><b>{stringValue(plan.name)}</b></div>
          <div><span>Status</span><b>{stringValue(subscription.status).replaceAll("_", " ")}</b></div>
          <div><span>Active units</span><b>{activeUnits}{plan.unitLimit ? ` / ${stringValue(plan.unitLimit)}` : ""}</b></div>
          <div><span>Trial / billing date</span><b>{dateLabel(subscription.nextBillingDate)}</b></div>
        </div>
      </section>
      <section className="landlord-panel landlord-plans-panel">
        <div className="landlord-panel-heading"><div><h2>Choose a plan</h2><p>Proposed Rwanda launch prices; final pricing should be validated before launch.</p></div>
          <select aria-label="Billing cycle" value={cycle} onChange={(event) => setCycle(event.currentTarget.value)}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select>
        </div>
        <div className="landlord-plan-grid">
          {plans.filter((item) => item.slug !== "free-trial").map((item) => (
            <article className="landlord-plan-card" key={stringValue(item.id)}>
              <h3>{stringValue(item.name)}</h3>
              <b>{item.slug === "enterprise" ? "Custom" : `${formatAmount(cycle === "ANNUAL" ? item.annualPrice : item.monthlyPrice, currency)}${cycle === "ANNUAL" ? " / year" : " / month"}`}</b>
              <span>{item.unitLimit ? `Up to ${stringValue(item.unitLimit)} active units` : "For 51+ active units"}</span>
              <button className="dashboard-secondary-button" disabled={saving || item.slug === "enterprise"} onClick={() => onChoosePlan(stringValue(item.slug), cycle)} type="button">
                {item.slug === "enterprise" ? "Contact PropEase" : "Create invoice"}
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="landlord-panel">
        <div className="landlord-panel-heading"><div><h2>Invoices</h2><p>Invoices and payments for PropEase are separate from tenant rent.</p></div></div>
        {invoices.length ? invoices.map((invoice, index) => (
          <div key={stringValue(invoice.id, String(index))}>
            <article className="landlord-record-card">
              <div className="landlord-record-main"><b>{stringValue(invoice.invoiceNumber)} · {formatAmount(invoice.amount, currency)}</b><span>{stringValue(nested(invoice, "plan", "name"), "Plan")} · due {dateLabel(invoice.dueDate)}</span>
                {rowsFor({ payments: invoice.payments }, "payments").map((payment, paymentIndex) => (
                  <small key={stringValue(payment.id, String(paymentIndex))}>
                    {stringValue(payment.verificationStatus)} · {stringValue(payment.method)} · {stringValue(payment.reference)}
                  </small>
                ))}
              </div>
              <div className="landlord-record-actions">
                <span className="landlord-status-pill">{stringValue(invoice.status)}</span>
                {canPay && ["OPEN", "OVERDUE"].includes(stringValue(invoice.status)) && typeof invoice.id === "string" && (
                  <button className="landlord-text-action" type="button" onClick={() => {
                    setPaymentInvoice(invoice.id as string);
                    setPaymentAmount(stringValue(invoice.amount, ""));
                    setPaymentReference("");
                    setPaymentProof(null);
                  }}>Submit payment proof</button>
                )}
              </div>
            </article>
            {paymentInvoice === invoice.id && (
              <form className="landlord-subscription-payment" onSubmit={(event) => {
                event.preventDefault();
                if (!paymentProof || typeof invoice.id !== "string") return;
                onSubmitPayment(invoice.id, {
                  method: paymentMethod,
                  reference: paymentReference,
                  amount: paymentAmount,
                  proof: paymentProof,
                });
                setPaymentInvoice("");
              }}>
                <label className="landlord-field"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.currentTarget.value)}><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label>
                <label className="landlord-field"><span>Payment reference</span><input required value={paymentReference} onChange={(event) => setPaymentReference(event.currentTarget.value)} /></label>
                <label className="landlord-field"><span>Amount ({currency})</span><input required min="0.01" step="0.01" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.currentTarget.value)} /></label>
                <label className="landlord-field"><span>Proof (PDF or image)</span><input required accept="application/pdf,image/jpeg,image/png,image/webp" type="file" onChange={(event) => setPaymentProof(event.currentTarget.files?.[0] ?? null)} /></label>
                <button className="dashboard-primary-button" disabled={saving} type="submit">{saving ? "Submitting…" : "Submit for verification"}</button>
              </form>
            )}
          </div>
        )) : <p className="landlord-empty-state">No subscription invoices yet.</p>}
        <p className="landlord-help-text">Selecting a paid plan creates an invoice only. A platform administrator must verify payment before activating a paid subscription.</p>
      </section>
    </>
  );
}
