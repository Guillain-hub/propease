"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Building2,
  Check,
  ClipboardCheck,
  CircleDollarSign,
  Droplets,
  FileText,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  type?: "date" | "datetime-local" | "number" | "email" | "textarea" | "multi" | "image";
  required?: boolean;
  disabled?: boolean;
  options?: Choice[];
  placeholder?: string;
};
type ApiError = { message?: string | string[] };
type SectionIcon = LucideIcon;
type TextRequest = {
  title: string;
  description: string;
  label: string;
  initialValue?: string;
  type?: "text" | "date" | "number";
  required?: boolean;
  multiline?: boolean;
};

const sectionIcons: Record<SectionName, SectionIcon> = {
  Properties: Building2,
  Units: KeyRound,
  Tenants: Users,
  Leases: FileText,
  Inspections: ClipboardCheck,
  "Rent & Deposits": CircleDollarSign,
  Expenses: Receipt,
  Utilities: Droplets,
  Maintenance: Wrench,
  Notices: FileText,
  Reports: FileText,
  Team: Users,
  Subscription: CircleDollarSign,
  Settings: FileText,
};

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"
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

function recordSearchValues(value: unknown, key = ""): string[] {
  if (/(^id$|Id$)/i.test(key)) return [];
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => recordSearchValues(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([childKey, childValue]) =>
      recordSearchValues(childValue, childKey),
    );
  }
  return [];
}

function relatedProperty(row: ValueRecord): ValueRecord {
  return record(
    nested(row, "property") ??
      nested(row, "unit", "property") ??
      nested(row, "tenancy", "unit", "property"),
  );
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

function tenantOccupancy(row: ValueRecord): {
  status: "current" | "upcoming" | "unassigned";
  label: string;
  propertyId: string;
} {
  const tenancies = rowsFor(row, "tenancies");
  const current = tenancies.find((tenancy) => tenancy.status === "ACTIVE");
  const upcoming = tenancies.find((tenancy) => tenancy.status === "UPCOMING");
  const tenancy = current ?? upcoming;
  const propertyName = stringValue(nested(tenancy, "unit", "property", "name"), "");
  const unitNumber = stringValue(nested(tenancy, "unit", "unitNumber"), "");
  const propertyId = stringValue(nested(tenancy, "unit", "property", "id"), "");

  if (current) {
    return {
      status: "current",
      label: `${propertyName} · ${unitNumber}`,
      propertyId,
    };
  }
  if (upcoming) {
    return {
      status: "upcoming",
      label: `Not yet · ${propertyName} · ${unitNumber}`,
      propertyId,
    };
  }
  return { status: "unassigned", label: "Not yet assigned", propertyId: "" };
}

function uploadFileField(label: string): Field {
  return { name: "file", label };
}

export function LandlordSectionWorkspace({
  section,
  organisationId,
  currency,
  role,
  userId,
  onUpdated,
}: {
  section: SectionName;
  organisationId: string;
  currency: string;
  role: string;
  userId: string;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<ValueRecord>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [teamMemberToRemove, setTeamMemberToRemove] = useState<ValueRecord | null>(null);
  const [recordToArchive, setRecordToArchive] = useState<{
    kind: "tenant" | "unit";
    row: ValueRecord;
  } | null>(null);
  const [archivingRecord, setArchivingRecord] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rentMode, setRentMode] = useState<"charges" | "payments" | "deposits">("charges");
  const [tenantMode, setTenantMode] = useState<"tenants" | "tenancies">("tenants");
  const [propertyView, setPropertyView] = useState<"properties" | "owners">("properties");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingTeamMember, setRemovingTeamMember] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const formDialogRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const textRequestResolver = useRef<((value: string | null) => void) | null>(null);

  const base = `/organisations/${organisationId}/landlord`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const endpoints: Record<SectionName, Array<[string, string, string?]>> = {
        Properties: [
          ["properties", "properties", "properties"],
          ...(role === "OWNER" || role === "ADMIN"
            ? [["property-owners", "propertyOwners", "owners"] as [string, string, string]]
            : []),
        ],
        Units: [["units", "units", "units"], ["properties", "properties", "properties"]],
        Tenants: [["tenants", "tenants", "tenants"], ["tenancies", "tenancies", "tenancies"], ["units", "units", "units"]],
        Leases: [["leases", "leases", "leases"], ["tenancies", "tenancies", "tenancies"], ["tenants", "tenants", "tenants"]],
        Inspections: [["inspections", "inspections", "inspections"], ["units", "units", "units"], ["tenancies", "tenancies", "tenancies"]],
        "Rent & Deposits": [["rent/charges", "charges", "charges"], ["rent/payments", "payments", "payments"], ["rent/deposits", "deposits", "deposits"], ["tenants", "tenants", "tenants"], ["tenancies", "tenancies", "tenancies"]],
        Expenses: [["expenses", "expenses", "expenses"], ["properties", "properties", "properties"]],
        Utilities: [["utilities", "utilityBills", "utilityBills"], ["properties", "properties", "properties"], ["units", "units", "units"]],
        Maintenance: role === "MAINTENANCE_STAFF"
          ? [["maintenance", "requests", "requests"]]
          : [["maintenance", "requests", "requests"], ["units", "units", "units"], ["tenants", "tenants", "tenants"], ["team", "members", "members"]],
        Notices: [["notices", "notices", "notices"], ["tenancies", "tenancies", "tenancies"]],
        Reports: [
          ["reports/financial", "report"],
          ...(role === "OWNER" || role === "ADMIN"
            ? [["property-owners", "propertyOwners", "owners"] as [string, string, string]]
            : []),
        ],
        Team: [["team", "members", "members"], ["properties", "properties", "properties"]],
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
      setLoadError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Make sure it is running and try again."
          : requestError instanceof Error
            ? requestError.message
            : "We couldn't load this section.",
      );
    } finally {
      setLoading(false);
    }
  }, [base, section, refreshKey, role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!error && !success) return;
    const timeout = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [error, success]);

  useEffect(() => {
    setEditingId(null);
    setFormOpen(false);
    setForm({});
  }, [section]);

  useEffect(() => {
    if (!formOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    formDialogRef.current
      ?.querySelector<HTMLElement>(".landlord-field input:not([type='file']), .landlord-field select, .landlord-field textarea")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) {
        setFormOpen(false);
        return;
      }
      if (event.key === "Tab") {
        const focusable = formDialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      addButtonRef.current?.focus();
    };
  }, [formOpen]);

  const properties = rowsFor(data, "properties");
  const units = rowsFor(data, "units");
  const availableUnitCount = units.filter((unit) => unit.status === "AVAILABLE").length;
  const tenants = rowsFor(data, "tenants");
  const tenancies = rowsFor(data, "tenancies");
  const charges = rowsFor(data, "charges");
  const deposits = rowsFor(data, "deposits");

  const fields: Field[] = useMemo(() => {
    const propertyOptions = selectOptions(properties, (row) => stringValue(row.name));
    const propertyOwnerOptions = selectOptions(
      rowsFor(data, "propertyOwners"),
      (row) => stringValue(row.name),
    );
    const unitOptions = selectOptions(units, (row) =>
      `${stringValue(nested(row, "property", "name"))} · ${stringValue(row.unitNumber)}`,
    );
    const availableUnitOptions = selectOptions(
      units.filter((row) => row.status === "AVAILABLE"),
      (row) =>
        `${stringValue(nested(row, "property", "name"))} · ${stringValue(row.unitNumber)}`,
    );
    const tenantOptions = selectOptions(tenants, (row) => stringValue(row.legalName));
    const leaseTenancies = tenancies.filter(
      (row) =>
        (row.status === "ACTIVE" || row.status === "UPCOMING") &&
        (!form.tenantId || nested(row, "tenant", "id") === form.tenantId),
    );
    const tenancyOptions = selectOptions(tenancies, (row) =>
      `${stringValue(nested(row, "tenant", "legalName"))} · ${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))}`,
    );
    const leaseTenancyOptions = selectOptions(leaseTenancies, (row) =>
      `${stringValue(nested(row, "unit", "property", "name"))} / ${stringValue(nested(row, "unit", "unitNumber"))} · ${dateLabel(row.moveInDate)}`,
    );
    const inspectionTenancies = tenancies.filter(
      (row) => !form.unitId || nested(row, "unit", "id") === form.unitId,
    );
    const inspectionTenancyOptions = selectOptions(inspectionTenancies, (row) =>
      `${stringValue(nested(row, "tenant", "legalName"))} · ${stringValue(row.status).replaceAll("_", " ")} · ${dateLabel(row.moveInDate)}`,
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
        if (propertyView === "owners") {
          return [
            { name: "name", label: "Owner name", required: true },
            { name: "email", label: "Email address", type: "email" },
            { name: "phone", label: "Phone number" },
          ];
        }
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
          ...(["OWNER", "ADMIN"].includes(role)
            ? [{ name: "propertyOwnerId", label: "Property owner", options: propertyOwnerOptions }]
            : []),
          { name: "description", label: "Description", type: "textarea" },
          ...(editingId
            ? [{ name: "status", label: "Status", options: [
                { value: "ACTIVE", label: "Active" },
                { value: "ARCHIVED", label: "Archived" },
              ] }]
            : []),
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
            { name: "unitId", label: "Available unit", required: true, options: availableUnitOptions },
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
          { name: "tenantId", label: "Tenant", required: true, options: tenantOptions },
          {
            name: "tenancyId",
            label: "Tenancy and unit",
            required: true,
            disabled: !form.tenantId || leaseTenancyOptions.length === 0,
            options: leaseTenancyOptions,
          },
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
          {
            name: "tenancyId",
            label: "Tenant / tenancy",
            disabled: !form.unitId || inspectionTenancyOptions.length === 0,
            options: inspectionTenancyOptions,
          },
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
          ...(!editingId
            ? [{ name: "email", label: "Collaborator email", type: "email" as const, required: true }]
            : []),
          { name: "role", label: "Role", required: true, options: [
            ...(role === "OWNER" ? [{ value: "ADMIN", label: "Admin" }] : []),
            ...(role === "OWNER" || role === "ADMIN" ? [{ value: "MANAGER", label: "Manager" }] : []),
            ...(role === "OWNER" || role === "ADMIN" ? [{ value: "ACCOUNTANT", label: "Accountant" }, { value: "MAINTENANCE_STAFF", label: "Maintenance staff" }] : []),
          ] },
          ...(form.role === "MANAGER"
            ? [{
                name: "propertyIds",
                label: "Assigned properties",
                type: "multi" as const,
                required: true,
                options: propertyOptions,
              }]
            : []),
        ];
      default:
        return [];
    }
  }, [section, properties, units, tenants, tenancies, charges, deposits, currency, rentMode, tenantMode, propertyView, data, form, role]);

  function updateField(name: string, value: string) {
    if (section === "Inspections" && name === "unitId") {
      const unitTenancies = tenancies.filter((tenancy) => nested(tenancy, "unit", "id") === value);
      const currentTenancy = unitTenancies.find((tenancy) => tenancy.status === "ACTIVE")
        ?? unitTenancies.find((tenancy) => tenancy.status === "UPCOMING");
      setForm((current) => ({
        ...current,
        unitId: value,
        tenancyId: currentTenancy ? stringValue(currentTenancy.id, "") : "",
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "tenantId" ? { tenancyId: "" } : {}),
    }));
  }

  function openForm() {
    setEditingId(null);
    setForm({});
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setForm({});
    setSelectedFile(null);
    setError(null);
  }

  function requestText(request: TextRequest): Promise<string | null> {
    return new Promise((resolve) => {
      textRequestResolver.current?.(null);
      textRequestResolver.current = resolve;
      setTextRequest(request);
    });
  }

  function resolveTextRequest(value: string | null) {
    const resolve = textRequestResolver.current;
    textRequestResolver.current = null;
    setTextRequest(null);
    resolve?.(value);
  }

  function editRecord(row: ValueRecord) {
    const recordId =
      section === "Team" && typeof row.userId === "string"
        ? row.userId
        : row.id;
    if (typeof recordId !== "string") return;
    const values: Record<string, unknown> = section === "Properties"
      ? propertyView === "owners"
        ? {
            name: row.name,
            email: row.email,
            phone: row.phone,
          }
        : {
          name: row.name,
          type: row.type,
          address: row.address,
          ...(canManagePropertyOwners
            ? { propertyOwnerId: nested(row, "propertyOwner", "id") }
            : {}),
          description: row.description,
          photoFileId: row.photoFileId,
          status: row.status,
        }
      : section === "Team"
        ? {
            role: row.role,
            propertyIds: rowsFor(record(row.user), "propertyAssignments")
              .map((assignment) => nested(assignment, "property", "id"))
              .filter((id): id is string => typeof id === "string"),
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
    setEditingId(recordId);
    setForm(Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ]),
    ));
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function assignUnitToTenant(row: ValueRecord) {
    if (typeof row.id !== "string") return;
    setTenantMode("tenancies");
    setEditingId(null);
    setForm({
      tenantId: row.id,
      moveInDate: new Date().toISOString().slice(0, 10),
    });
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
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
          if (propertyView === "owners") {
            path = "property-owners";
            payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
            label = "Property owner saved";
          } else {
            path = "properties";
            const { photoFileId: _photoFileId, ...propertyFields } = form;
            payload = canManagePropertyOwners
              ? { ...propertyFields, propertyOwnerId: form.propertyOwnerId || null }
              : { ...propertyFields };
            label = "Property added";
          }
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
          path = editingId ? `team/${editingId}` : "team";
          payload = editingId
            ? {
                role: form.role,
                ...(form.role === "MANAGER"
                  ? { propertyIds: form.propertyIds.split(",").filter(Boolean) }
                  : {}),
              }
            : {
                email: form.email,
                role: form.role,
                ...(form.role === "MANAGER"
                  ? { propertyIds: form.propertyIds.split(",").filter(Boolean) }
                  : {}),
              };
          label = editingId
            ? "Team member updated"
            : "Invitation email sent. The collaborator can register or sign in to join.";
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
        if (section === "Team") {
          label = "Team member updated";
        } else {
        const collection = section === "Properties"
          ? propertyView === "owners" ? "property-owners" : "properties"
          : section === "Units"
            ? "units"
            : "tenants";
        path = `${collection}/${editingId}`;
        label = `${section === "Properties" ? propertyView === "owners" ? "Property owner" : "Property" : section === "Units" ? "Unit" : "Tenant"} updated`;
        }
      }

      const result = await apiRequest<ValueRecord>(`${base}/${path}`, {
        method: editingId || section === "Settings" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      const resultKey = section === "Team" ? "member"
        : section === "Rent & Deposits" && rentMode === "charges" ? "charge"
        : section === "Rent & Deposits" && rentMode === "payments" ? "payment"
          : section === "Properties" ? propertyView === "owners" ? "owner" : "property"
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
      setFormOpen(false);
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

  async function removeTeamMember(row: ValueRecord) {
    const memberId =
      typeof row.userId === "string" ? row.userId : row.id;
    if (typeof memberId !== "string") return;
    const name = stringValue(nested(row, "user", "name"), stringValue(nested(row, "user", "email"), "this team member"));
    setRemovingTeamMember(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`${base}/team/${memberId}`, { method: "DELETE" });
      setSuccess(`${name} removed from the workspace`);
      setTeamMemberToRemove(null);
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The team member could not be removed.");
    } finally {
      setRemovingTeamMember(false);
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
      const signedAt = await requestText({
        title: "Activate lease",
        description: "Enter the date the lease was signed.",
        label: "Signed date",
        initialValue: new Date().toISOString().slice(0, 10),
        type: "date",
        required: true,
      });
      if (!signedAt) return;
      body.signedAt = `${signedAt}T00:00:00.000Z`;
    }
    if (status === "TERMINATED") {
      const terminationReason = await requestText({
        title: "Terminate lease",
        description: "Provide a reason for terminating this lease.",
        label: "Termination reason",
        required: true,
        multiline: true,
      });
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
    const moveOutDate = await requestText({
      title: "Record move-out",
      description: "Choose the date the tenant moved out.",
      label: "Move-out date",
      initialValue: new Date().toISOString().slice(0, 10),
      type: "date",
      required: true,
    });
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

  async function archiveRecord() {
    if (!recordToArchive || typeof recordToArchive.row.id !== "string") return;
    setArchivingRecord(true);
    setError(null);
    try {
      await apiRequest(
        `${base}/${recordToArchive.kind === "tenant" ? "tenants" : "units"}/${recordToArchive.row.id}/archive`,
        { method: "PATCH" },
      );
      setSuccess(
        `${recordToArchive.kind === "tenant" ? "Tenant" : "Unit"} archived. Historical records have been retained.`,
      );
      setRecordToArchive(null);
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `The ${recordToArchive.kind} could not be archived.`,
      );
    } finally {
      setArchivingRecord(false);
    }
  }

  async function applyReport() {
    const params = new URLSearchParams();
    if (form.from) params.set("from", form.from);
    if (form.to) params.set("to", form.to);
    if (form.ownerId) params.set("ownerId", form.ownerId);
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

  async function requestReversal(path: string) {
    const reason = await requestText({
      title: "Reverse record",
      description: "This action will be recorded in the audit history.",
      label: "Reason for reversal",
      required: true,
      multiline: true,
    });
    if (reason?.trim()) await reverseRecord(path, reason);
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
  const canManageFinancialRecords = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "ACCOUNTANT",
  ].includes(role);
  const canManagePropertyOwners = ["OWNER", "ADMIN"].includes(role);
  const canCreateProperties = ["OWNER", "ADMIN"].includes(role);
  const canManageCurrentRecords =
    section === "Team"
      ? ["OWNER", "ADMIN"].includes(role)
      : section === "Properties" && propertyView === "owners"
      ? canManagePropertyOwners
      : section === "Rent & Deposits" || section === "Expenses" || section === "Utilities"
        ? canManageFinancialRecords
        : canManageRecords;
  const canCreateCurrentRecord =
    canManageCurrentRecords &&
    (section !== "Properties" ||
      propertyView !== "properties" ||
      canCreateProperties);
  const canUpdateMaintenance =
    canManageRecords || role === "MAINTENANCE_STAFF";
  const sectionItemName = section === "Properties" && propertyView === "owners"
    ? "property owner"
    : section.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
  const title = section === "Rent & Deposits" ? "Rent & deposits" : section;
  const formActionLabel = section === "Properties"
    ? propertyView === "owners" ? "Add property owner" : "Add property"
    : section === "Units"
      ? "Add unit"
      : section === "Tenants"
        ? tenantMode === "tenancies" ? "Create tenancy" : "Add tenant"
        : section === "Leases"
          ? "Add lease"
          : section === "Inspections"
            ? "Record inspection"
            : section === "Rent & Deposits"
              ? rentMode === "charges" ? "Create rent charge" : rentMode === "payments" ? "Record payment" : "Record deposit transaction"
              : section === "Expenses"
                ? "Add expense"
                : section === "Utilities"
                  ? "Add utility bill"
                  : section === "Maintenance"
                    ? "Create request"
                    : section === "Notices" ? "Create notice" : `Add ${sectionItemName}`;
  const formTitle = editingId ? `Edit ${sectionItemName}` : formActionLabel;
  const FormIcon = sectionIcons[section];

  return (
    <div className="landlord-section">
      <div className="dashboard-heading-row">
        <div>
          <span className="dashboard-date">PROPEASE WORKSPACE</span>
          <h1>{title}</h1>
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

      {loadError && <div className="landlord-alert is-error" role="alert">{loadError}</div>}
      {(error || success) && (
        <div
          className={`landlord-alert landlord-feedback-toast ${error ? "is-error" : "is-success"}`}
          role={error ? "alert" : "status"}
        >
          {success && <Check size={16} aria-hidden="true" />}
          <span>{error ?? success}</span>
          <button
            type="button"
            className="landlord-feedback-dismiss"
            aria-label="Dismiss notification"
            onClick={() => {
              setError(null);
              setSuccess(null);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {section === "Properties" && canManagePropertyOwners && (
        <div className="landlord-tabs" role="tablist" aria-label="Property records">
          {(["properties", "owners"] as const).map((view) => (
            <button
              className={propertyView === view ? "is-active" : ""}
              key={view}
              onClick={() => {
                setPropertyView(view);
                setForm({});
                setFormOpen(false);
                setEditingId(null);
              }}
              type="button"
              role="tab"
              aria-selected={propertyView === view}
            >
              {view === "properties" ? "Properties" : "Owners"}
            </button>
          ))}
        </div>
      )}
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

      {loading ? (
        <WorkspaceContentSkeleton section={section} />
      ) : section === "Reports" ? (
        <ReportView
          report={record(data.report)}
          currency={currency}
          from={form.from ?? ""}
          to={form.to ?? ""}
          ownerId={form.ownerId ?? ""}
          owners={rowsFor(data, "propertyOwners")}
          canFilterByOwner={canManagePropertyOwners}
          onDateChange={updateField}
          onOwnerChange={(value) => updateField("ownerId", value)}
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
          ]} values={form} onChange={updateField} onSubmit={submit} canEdit={canManageCurrentRecords} saving={saving} submitLabel="Save settings" organisationId={organisationId} />
          <div className="landlord-panel-heading landlord-subheading"><div><h2>Recent audit activity</h2><p>Recent access and data changes in this organisation.</p></div></div>
          <RecordList rows={rowsFor(record(data.settings), "auditLogs")} currency={currency} section={section} />
        </section>
      ) : (
        <div className="landlord-workspace-grid">
          <section className="landlord-panel landlord-records-panel">
            <div className="landlord-panel-heading">
              <div>
                <h2>{section === "Rent & Deposits" ? rentMode === "charges" ? "Rent charges" : rentMode === "payments" ? "Recorded payments" : "Deposit ledgers" : section === "Tenants" && tenantMode === "tenancies" ? "Tenancies" : section}</h2>
              </div>
              <div className="landlord-records-heading-actions">
                {loading && <LoaderCircle className="landlord-spinner" size={17} />}
                {canCreateCurrentRecord && (
                  <button
                    className="dashboard-primary-button landlord-add-record-button"
                    ref={addButtonRef}
                    type="button"
                    onClick={openForm}
                  >
                    <Plus size={16} /> {formActionLabel}
                  </button>
                )}
              </div>
            </div>
            {section === "Properties" && propertyView === "owners" ? (
              <PropertyOwnerList
                rows={rowsFor(data, "propertyOwners")}
                onEdit={canManagePropertyOwners ? editRecord : undefined}
              />
            ) : section === "Rent & Deposits" ? (
              <RecordList
                rows={rentMode === "charges" ? charges : rentMode === "payments" ? rowsFor(data, "payments") : deposits}
                currency={currency}
                section={section}
                rentMode={rentMode}
                onReverse={(path) => void requestReversal(path)}
                onReceipt={(id) => void downloadReceipt(id)}
              />
            ) : section === "Maintenance" ? (
              <MaintenanceList
                rows={rowsFor(data, "requests")}
                members={rowsFor(data, "members")}
                onUpdate={canUpdateMaintenance ? updateMaintenance : undefined}
                requestText={requestText}
                role={role}
              />
            ) : section === "Utilities" ? (
              <RecordList
                rows={rowsFor(data, "utilityBills")}
                currency={currency}
                section={section}
                onDownload={(fileId) => void downloadFile(fileId)}
                onReverse={(path) => void requestReversal(path)}
              />
            ) : section === "Expenses" ? (
              <RecordList
                rows={rowsFor(data, "expenses")}
                currency={currency}
                section={section}
                onDownload={(fileId) => void downloadFile(fileId)}
                onReverse={(path) => void requestReversal(path)}
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
              <RecordList
                rows={rowsFor(data, "members")}
                currency={currency}
                section={section}
                onEdit={(row) => editRecord(row)}
                onRemove={setTeamMemberToRemove}
                canEditTeamMember={(row) =>
                  !row.expiresAt &&
                  row.status !== "SUSPENDED" &&
                  nested(row, "user", "id") !== userId &&
                  row.role !== "OWNER" &&
                  (role === "OWNER" || (role === "ADMIN" && row.role !== "ADMIN"))
                }
                canRemoveTeamMember={(row) =>
                  row.status !== "SUSPENDED" &&
                  nested(row, "user", "id") !== userId &&
                  row.role !== "OWNER" &&
                  (role === "OWNER" || (role === "ADMIN" && row.role !== "ADMIN"))
                }
              />
            ) : (
              <RecordList
                rows={section === "Tenants" && tenantMode === "tenancies" ? rowsFor(data, "tenancies") : rowsFor(data, sectionDataKey(section, rentMode))}
                currency={currency}
                section={section}
                className={section === "Units" ? "is-unit-directory" : undefined}
                organisationId={organisationId}
                onEdit={canManageRecords && (["Properties", "Units"].includes(section) || (section === "Tenants" && tenantMode === "tenants")) ? editRecord : undefined}
                tenantMode={tenantMode}
                onMoveOut={section === "Tenants" && tenantMode === "tenancies" ? (row) => void moveOut(row) : undefined}
                onAssignUnit={section === "Tenants" && tenantMode === "tenants" && canCreateCurrentRecord ? assignUnitToTenant : undefined}
                onArchive={role === "ADMIN" && section === "Units"
                  ? (row) => setRecordToArchive({ kind: "unit", row })
                  : role === "ADMIN" && section === "Tenants" && tenantMode === "tenants"
                    ? (row) => setRecordToArchive({ kind: "tenant", row })
                    : undefined}
              />
            )}
            {!loading && rowsFor(data, section === "Properties" && propertyView === "owners" ? "propertyOwners" : section === "Tenants" && tenantMode === "tenancies" ? "tenancies" : sectionDataKey(section, rentMode)).length === 0 && (
              <p className="landlord-empty-state">No records yet. Add your first record to get started.</p>
            )}
          </section>

          {formOpen && (
            <div
              className="landlord-form-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeForm();
              }}
            >
              <div
                className="landlord-form-modal"
                ref={formDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="landlord-form-modal-title"
                tabIndex={-1}
              >
                <div className="landlord-form-modal-header">
                  <span className="landlord-form-modal-icon" aria-hidden="true"><FormIcon size={20} /></span>
                  <div>
                    <span className="dashboard-date">PROPEASE WORKSPACE</span>
                    <h2 id="landlord-form-modal-title">{formTitle}</h2>
                    <p>{section === "Rent & Deposits" && rentMode === "payments" ? "Manually recorded, not independently bank-verified." : "Complete the fields below to continue."}</p>
                  </div>
                  <button
                    className="landlord-form-modal-close"
                    type="button"
                    aria-label="Close form"
                    onClick={closeForm}
                    disabled={saving}
                  >
                    <X size={19} />
                  </button>
                </div>
                <Form
                  fields={fields}
                  values={form}
                  onChange={updateField}
                  onSubmit={submit}
                  canEdit={canManageCurrentRecords}
                  saving={saving}
                  selectedFile={selectedFile}
                  organisationId={organisationId}
                  onFile={setSelectedFile}
                  submitLabel={editingId ? "Save changes" : undefined}
                  onCancel={closeForm}
                  helperText={section === "Rent & Deposits" && rentMode === "payments"
                    ? "An allocation is optional; if omitted, the payment remains unapplied and the rent balance will not be reduced."
                    : section === "Leases"
                      ? "Choose a tenant first, then select one of their active or upcoming tenancies. Tenants without a current or scheduled unit assignment cannot have a lease created yet."
                    : section === "Tenants" && tenantMode === "tenancies"
                      ? availableUnitCount > 0
                        ? "Only units marked available are suggested."
                        : "There are no units currently marked available. Update a unit's availability before assigning it."
                    : section === "Utilities"
                      ? "The total is split equally across selected units using whole cents; any remainder cents are assigned one by one."
                      : undefined}
                />
              </div>
            </div>
          )}
          {textRequest && (
            <TextEntryDialog
              key={`${textRequest.title}-${textRequest.label}`}
              request={textRequest}
              onCancel={() => resolveTextRequest(null)}
              onSubmit={resolveTextRequest}
            />
          )}
          {teamMemberToRemove && (
            <ConfirmActionDialog
              title="Remove team member?"
              description={`${stringValue(nested(teamMemberToRemove, "user", "name"), stringValue(nested(teamMemberToRemove, "user", "email"), "This team member"))} will lose access to this workspace. Their historical records will be kept.`}
              confirmLabel="Remove member"
              busy={removingTeamMember}
              error={error}
              onCancel={() => {
                if (!removingTeamMember) {
                  setTeamMemberToRemove(null);
                  setError(null);
                }
              }}
              onConfirm={() => void removeTeamMember(teamMemberToRemove)}
            />
          )}
          {recordToArchive && (
            <ConfirmActionDialog
              title={`Archive ${recordToArchive.kind}?`}
              description={
                recordToArchive.kind === "tenant"
                  ? "This tenant will be removed from the active tenant list. Their tenancy, rent, payment, and maintenance history will be retained. Tenants with a current or scheduled tenancy cannot be archived."
                  : "This unit will be marked archived and removed from available-unit suggestions. Its tenancy and maintenance history will be retained. Units with a current or scheduled tenancy cannot be archived."
              }
              confirmLabel={archivingRecord ? "Archiving…" : `Archive ${recordToArchive.kind}`}
              busy={archivingRecord}
              error={error}
              onCancel={() => {
                if (!archivingRecord) {
                  setRecordToArchive(null);
                  setError(null);
                }
              }}
              onConfirm={() => void archiveRecord()}
            />
          )}
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

function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
      } else if (event.key === "Tab") {
        const focusable = [cancelButtonRef.current, confirmButtonRef.current]
          .filter((element): element is HTMLButtonElement => element !== null && !element.disabled);
        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, []);
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
    else cancelButtonRef.current?.focus();
  }, [busy]);

  return (
    <div
      className="landlord-form-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="landlord-form-modal landlord-confirm-action-modal"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        aria-describedby="confirm-action-description"
        tabIndex={-1}
      >
        <div className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><Users size={20} /></span>
          <div>
            <span className="dashboard-date">PROPEASE WORKSPACE</span>
            <h2 id="confirm-action-title">{title}</h2>
            <p id="confirm-action-description">{description}</p>
          </div>
        </div>
        {error && <div className="landlord-alert is-error" role="alert">{error}</div>}
        <div className="landlord-form-actions">
          <button
            className="landlord-form-cancel-button"
            type="button"
            ref={cancelButtonRef}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dashboard-primary-button landlord-confirm-danger-button"
            type="button"
            ref={confirmButtonRef}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Removing…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function TextEntryDialog({
  request,
  onCancel,
  onSubmit,
}: {
  request: TextRequest;
  onCancel: () => void;
  onSubmit: (value: string | null) => void;
}) {
  const [value, setValue] = useState(request.initialValue ?? "");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    setValue(request.initialValue ?? "");
  }, [request]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (inputRef.current ?? textareaRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
      } else if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, []);

  return (
    <div
      className="landlord-form-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="landlord-form-modal landlord-text-entry-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="landlord-text-entry-title"
        tabIndex={-1}
      >
        <div className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><FileText size={20} /></span>
          <div>
            <span className="dashboard-date">PROPEASE WORKSPACE</span>
            <h2 id="landlord-text-entry-title">{request.title}</h2>
            <p>{request.description}</p>
          </div>
          <button className="landlord-form-modal-close" type="button" aria-label="Close dialog" onClick={onCancel}>
            <X size={19} />
          </button>
        </div>
        <form
          className="landlord-prompt-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <label className="landlord-field">
            <span>{request.label}{request.required && <i aria-hidden="true"> *</i>}</span>
            {request.multiline ? (
              <textarea
                onChange={(event) => setValue(event.currentTarget.value)}
                ref={textareaRef}
                required={request.required}
                rows={4}
                value={value}
              />
            ) : (
              <input
                onChange={(event) => setValue(event.currentTarget.value)}
                ref={inputRef}
                required={request.required}
                type={request.type ?? "text"}
                value={value}
              />
            )}
          </label>
          <div className="landlord-form-actions">
            <button className="dashboard-primary-button" type="submit">Continue</button>
            <button className="landlord-form-cancel-button" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PropertyOwnerList({
  rows,
  onEdit,
}: {
  rows: ValueRecord[];
  onEdit?: (row: ValueRecord) => void;
}) {
  const [search, setSearch] = useState("");
  if (!rows.length) return null;
  const visibleRows = rows.filter((owner) =>
    [owner.name, owner.email, owner.phone]
      .some((value) => stringValue(value, "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
  );
  return (
    <div className="landlord-record-table-wrap">
      <div className="landlord-directory-controls">
        <label className="landlord-directory-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search property owners</span>
          <input
            type="search"
            placeholder="Search owner name or contact…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      </div>
      <table className="landlord-record-table">
        <thead>
          <tr>
            <th scope="col">Owner</th>
            <th scope="col">Contact</th>
            <th scope="col">Properties</th>
            {onEdit && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr><td colSpan={onEdit ? 4 : 3}>No owners match your search.</td></tr>
          ) : visibleRows.map((owner) => (
            <tr key={stringValue(owner.id)}>
              <td><div className="landlord-record-main"><b>{stringValue(owner.name)}</b></div></td>
              <td><div className="landlord-record-details">
                {typeof owner.email === "string" && <small>{owner.email}</small>}
                {typeof owner.phone === "string" && <small>{owner.phone}</small>}
              </div></td>
              <td>{stringValue(nested(owner, "_count", "properties"), "0")}</td>
              {onEdit && <td><button className="landlord-text-action" type="button" onClick={() => onEdit(owner)}>Edit</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  canEdit,
  saving,
  submitLabel,
  selectedFile,
  organisationId,
  onFile,
  onCancel,
  helperText,
}: {
  fields: Field[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canEdit: boolean;
  saving: boolean;
  submitLabel?: string;
  selectedFile?: File | null;
  organisationId: string;
  onFile?: (file: File | null) => void;
  onCancel?: () => void;
  helperText?: string;
}) {
  const disabled = saving || !canEdit;
  const photoInputRef = useRef<HTMLInputElement>(null);
  return (
    <form className="landlord-form" onSubmit={onSubmit}>
      <div className="landlord-form-fields">
        {fields.map((field) => field.type === "image" ? (
          <label className="landlord-field landlord-photo-field" key={field.name}>
            <span>{field.label}</span>
            <div className="landlord-photo-preview">
              {selectedFile ? (
                <SelectedPhoto file={selectedFile} />
              ) : values[field.name] ? (
                <OrganisationFileImage
                  organisationId={organisationId}
                  fileId={values[field.name]}
                  alt="Current property photo"
                  className="landlord-photo-image"
                />
              ) : (
                <span className="landlord-photo-placeholder"><Building2 size={26} /><small>Property photo preview</small></span>
              )}
            </div>
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled}
              ref={photoInputRef}
              onChange={(event) => onFile?.(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
            <small>JPG, PNG, or WebP · up to 20 MB</small>
            {(selectedFile || values[field.name]) && (
              <button
                className="landlord-text-action"
                type="button"
                disabled={disabled}
                onClick={() => {
                  onFile?.(null);
                  onChange(field.name, "");
                  if (photoInputRef.current) photoInputRef.current.value = "";
                }}
              >
                Remove photo
              </button>
            )}
          </label>
        ) : field.name === "file" ? (
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
                  disabled={disabled || field.disabled}
                      required={field.required}
                      multiple
                  onChange={(event) => onChange(field.name, Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(","))}
                  value={(values[field.name] ?? "").split(",").filter(Boolean)}
                >
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <select
                  disabled={disabled || field.disabled}
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
      {!canEdit && <p className="landlord-help-text">Your role can view this section but cannot make changes.</p>}
      {helperText && <p className="landlord-form-helper">{helperText}</p>}
      <div className="landlord-form-actions">
        <button className="dashboard-primary-button" disabled={disabled || saving} type="submit">
          {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Plus size={15} />}
          {saving ? "Saving…" : submitLabel ?? "Save record"}
        </button>
        {onCancel && (
          <button className="landlord-form-cancel-button" disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function SelectedPhoto({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return previewUrl
    ? <img className="landlord-photo-image" src={previewUrl} alt="Selected property photo preview" />
    : <span className="landlord-photo-placeholder">Preparing photo preview…</span>;
}

function WorkspaceContentSkeleton({ section }: { section: SectionName }) {
  const title = section === "Rent & Deposits" ? "Rent and deposit records" : section;
  return (
    <section
      className="landlord-panel landlord-content-skeleton"
      role="status"
      aria-label={`Loading ${title.toLocaleLowerCase()}`}
      aria-busy="true"
    >
      <span className="visually-hidden">Loading {title.toLocaleLowerCase()}…</span>
      <div className="landlord-skeleton-heading" aria-hidden="true">
        <span className="landlord-skeleton-block is-heading" />
        <span className="landlord-skeleton-block is-description" />
      </div>
      <div className="landlord-skeleton-controls" aria-hidden="true">
        <span className="landlord-skeleton-block" />
        <span className="landlord-skeleton-block" />
        <span className="landlord-skeleton-block" />
      </div>
      <div className="landlord-skeleton-table" aria-hidden="true">
        <div className="landlord-skeleton-table-header">
          {[0, 1, 2, 3].map((column) => (
            <span className="landlord-skeleton-block" key={column} />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="landlord-skeleton-table-row" key={row}>
            {[0, 1, 2, 3].map((column) => (
              <span
                className={`landlord-skeleton-block${column === 0 ? " is-primary" : ""}`}
                key={column}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function OrganisationFileImage({
  organisationId,
  fileId,
  alt,
  className,
}: {
  organisationId: string;
  fileId: unknown;
  alt: string;
  className: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof fileId !== "string" || !fileId) {
      setImageUrl("");
      setFailed(false);
      return;
    }
    let active = true;
    setImageUrl("");
    setFailed(false);
    void apiRequest<{ downloadUrl: string }>(
      `/organisations/${organisationId}/files/${fileId}/preview-url`,
    ).then(
      ({ downloadUrl }) => {
        if (active) setImageUrl(downloadUrl);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [fileId, organisationId]);

  if (failed || !imageUrl) {
    const message = failed
      ? "Property photo unavailable"
      : typeof fileId === "string" && fileId
        ? "Loading property photo"
        : "No property photo";
    return <span className="landlord-photo-placeholder" role="img" aria-label={message}><Building2 size={22} /></span>;
  }
  return <img className={className} src={imageUrl} alt={alt} onError={() => setFailed(true)} />;
}

function RecordList({
  rows,
  currency,
  section,
  className,
  organisationId,
  rentMode,
  onReverse,
  onReceipt,
  onDownload,
  onEdit,
  onRemove,
  canEditTeamMember,
  canRemoveTeamMember,
  onLeaseStatus,
  tenantMode,
  onMoveOut,
  onAssignUnit,
  onArchive,
}: {
  rows: ValueRecord[];
  currency: string;
  section: SectionName;
  className?: string;
  organisationId?: string;
  rentMode?: "charges" | "payments" | "deposits";
  onReverse?: (path: string) => void;
  onReceipt?: (id: string) => void;
  onDownload?: (fileId: string) => void;
  onEdit?: (row: ValueRecord) => void;
  onRemove?: (row: ValueRecord) => void;
  canEditTeamMember?: (row: ValueRecord) => boolean;
  canRemoveTeamMember?: (row: ValueRecord) => boolean;
  onLeaseStatus?: (row: ValueRecord, status: string) => void;
  tenantMode?: "tenants" | "tenancies";
  onMoveOut?: (row: ValueRecord) => void;
  onAssignUnit?: (row: ValueRecord) => void;
  onArchive?: (row: ValueRecord) => void;
}) {
  const recordHeadings: Partial<Record<SectionName, string>> = {
    Leases: "Lease",
    Inspections: "Inspection",
    Expenses: "Expense",
    Utilities: "Utility bill",
    Maintenance: "Request",
    Notices: "Notice",
    Team: "Member",
    Settings: "Activity",
  };
  const recordHeading = section === "Properties"
    ? "Property"
    : section === "Units"
      ? "Unit"
      : section === "Tenants"
        ? tenantMode === "tenancies" ? "Tenancy" : "Tenant"
        : section === "Rent & Deposits"
          ? rentMode === "charges" ? "Rent charge" : rentMode === "payments" ? "Payment" : "Deposit"
          : recordHeadings[section] ?? section;
  const amountHeading = section === "Units"
    ? "Deposit"
    : section === "Rent & Deposits"
      ? rentMode === "charges" ? "Charge" : rentMode === "payments" ? "Payment" : "Amount"
      : section === "Utilities" ? "Total"
        : "Amount";
  const showAmount = section === "Units"
    || section === "Expenses"
    || section === "Utilities"
    || (section === "Rent & Deposits" && rentMode !== "deposits");
  const showStatus = section === "Properties"
    || section === "Units"
    || (section === "Tenants" && tenantMode === "tenancies")
    || section === "Team"
    || section === "Leases"
    || section === "Notices"
    || section === "Rent & Deposits"
    || section === "Expenses"
    || section === "Utilities";
  const showOccupancy = section === "Tenants" && tenantMode === "tenants";
  const showTenancyLocation = section === "Tenants" && tenantMode === "tenancies";
  const showActions = Boolean(onEdit || onRemove || onReverse || onReceipt || onLeaseStatus || onMoveOut || onAssignUnit || onArchive || onDownload);
  const isPropertyDirectory = section === "Properties";
  const isTenantDirectory = showOccupancy;
  const isTenancyDirectory = showTenancyLocation;
  const isUnitDirectory = section === "Units";
  const isLeaseDirectory = section === "Leases";
  const isSearchableDirectory = section !== "Settings";
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStatusFilter, setRecordStatusFilter] = useState("all");
  const [recordPropertyFilter, setRecordPropertyFilter] = useState("all");
  const [sortState, setSortState] = useState<{
    key: "name" | "details" | "location" | "status" | "dates";
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });

  useEffect(() => {
    setRecordSearch("");
    setRecordStatusFilter("all");
    setRecordPropertyFilter("all");
    setSortState({ key: "name", direction: "asc" });
  }, [section, tenantMode]);

  const directoryProperties = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      if (isTenantDirectory) {
        const occupancy = tenantOccupancy(row);
        if (occupancy.propertyId) {
          options.set(
            occupancy.propertyId,
            stringValue(nested(
              rowsFor(row, "tenancies").find((tenancy) =>
                nested(tenancy, "unit", "property", "id") === occupancy.propertyId,
              ),
              "unit",
              "property",
              "name",
            )),
          );
        }
      } else if (isUnitDirectory) {
        const propertyId = stringValue(nested(row, "property", "id"), "");
        if (propertyId) {
          options.set(propertyId, stringValue(nested(row, "property", "name")));
        }
      } else if (isTenancyDirectory) {
        const propertyId = stringValue(nested(row, "unit", "property", "id"), "");
        if (propertyId) {
          options.set(
            propertyId,
            stringValue(nested(row, "unit", "property", "name")),
          );
        }
      } else {
        const property = relatedProperty(row);
        const propertyId = stringValue(property.id, "");
        if (propertyId) {
          options.set(propertyId, stringValue(property.name));
        }
      }
    }
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [isTenantDirectory, isTenancyDirectory, isUnitDirectory, rows]);
  const propertyTypes = useMemo(
    () => [...new Set(rows.map((row) => stringValue(row.type, "")).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
    [rows],
  );
  const statusOptions = useMemo(
    () => [...new Set(rows.map((row) =>
      stringValue(
        row.status ??
          (row.reversedAt ? "REVERSED" : ["Expenses", "Utilities"].includes(section) ||
            (section === "Rent & Deposits" && rentMode === "charges")
            ? "POSTED"
            : ""),
        "",
      ),
    ).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
    [rentMode, rows, section],
  );
  const visibleRows = useMemo(() => {
    const search = recordSearch.trim().toLocaleLowerCase();
    return rows
      .filter((row) => {
        if (isPropertyDirectory) {
          if (recordStatusFilter !== "all" && row.status !== recordStatusFilter) {
            return false;
          }
          if (recordPropertyFilter !== "all" && row.type !== recordPropertyFilter) {
            return false;
          }
          const searchable = [
            row.name,
            row.address,
            row.type,
            row.description,
            nested(row, "propertyOwner", "name"),
          ].map((value) => stringValue(value, "").toLocaleLowerCase());
          return !search || searchable.some((value) => value.includes(search));
        }
        if (isTenantDirectory) {
          const occupancy = tenantOccupancy(row);
          if (recordStatusFilter !== "all" && occupancy.status !== recordStatusFilter) {
            return false;
          }
          if (recordPropertyFilter !== "all" && occupancy.propertyId !== recordPropertyFilter) {
            return false;
          }
          const searchable = [
            row.legalName,
            row.email,
            row.phone,
            occupancy.label,
          ].map((value) => stringValue(value, "").toLocaleLowerCase());
          return !search || searchable.some((value) => value.includes(search));
        }
        if (isUnitDirectory) {
          if (recordStatusFilter !== "all" && row.status !== recordStatusFilter) {
            return false;
          }
          if (
            recordPropertyFilter !== "all" &&
            nested(row, "property", "id") !== recordPropertyFilter
          ) {
            return false;
          }
          const searchable = [
            row.unitNumber,
            nested(row, "property", "name"),
            nested(row, "tenancies", "0", "tenant", "legalName"),
            row.floor,
          ].map((value) => stringValue(value, "").toLocaleLowerCase());
          return !search || searchable.some((value) => value.includes(search));
        }
        if (isTenancyDirectory) {
          if (recordStatusFilter !== "all" && row.status !== recordStatusFilter) {
            return false;
          }
          if (
            recordPropertyFilter !== "all" &&
            nested(row, "unit", "property", "id") !== recordPropertyFilter
          ) {
            return false;
          }
          const searchable = [
            nested(row, "tenant", "legalName"),
            nested(row, "unit", "property", "name"),
            nested(row, "unit", "unitNumber"),
            row.moveInDate,
            row.moveOutDate,
            dateLabel(row.moveInDate),
            dateLabel(row.moveOutDate),
            row.status,
          ].map((value) => stringValue(value, "").toLocaleLowerCase());
          return !search || searchable.some((value) => value.includes(search));
        }
        if (showStatus && recordStatusFilter !== "all") {
          const status = stringValue(
            row.status ??
              (row.reversedAt ? "REVERSED" : ["Expenses", "Utilities"].includes(section) ||
                (section === "Rent & Deposits" && rentMode === "charges")
                ? "POSTED"
                : ""),
            "",
          );
          if (status !== recordStatusFilter) return false;
        }
        if (
          recordPropertyFilter !== "all" &&
          stringValue(relatedProperty(row).id, "") !== recordPropertyFilter
        ) {
          return false;
        }
        const searchable = recordSearchValues(row)
          .map((value) => value.toLocaleLowerCase());
        return !search || searchable.some((value) => value.includes(search));
      })
      .sort((left, right) => {
        const direction = sortState.direction === "asc" ? 1 : -1;
        const sortValue = (row: ValueRecord): string => {
          if (isPropertyDirectory) {
            if (sortState.key === "name") return stringValue(row.name, "");
            if (sortState.key === "details") return stringValue(row.address, "");
            if (sortState.key === "status") return stringValue(row.status, "");
          }
          if (isTenantDirectory) {
            if (sortState.key === "name") return stringValue(row.legalName, "");
            if (sortState.key === "details") return stringValue(row.email ?? row.phone, "");
            if (sortState.key === "location") return tenantOccupancy(row).label;
            return tenantOccupancy(row).status;
          }
          if (isUnitDirectory) {
            if (sortState.key === "name") {
              return `${stringValue(nested(row, "property", "name"), "")} ${stringValue(row.unitNumber, "")}`;
            }
            if (sortState.key === "details") {
              return stringValue(nested(row, "tenancies", "0", "tenant", "legalName"), "");
            }
            if (sortState.key === "status") return stringValue(row.status, "");
          }
          if (isTenancyDirectory) {
            if (sortState.key === "name") {
              return stringValue(nested(row, "tenant", "legalName"), "");
            }
            if (sortState.key === "details" || sortState.key === "dates") {
              return stringValue(row.moveInDate, "");
            }
            if (sortState.key === "location") {
              return `${stringValue(nested(row, "unit", "property", "name"), "")} ${stringValue(nested(row, "unit", "unitNumber"), "")}`;
            }
            return stringValue(row.status, "");
          }
          if (isLeaseDirectory) {
            if (sortState.key === "name") {
              return stringValue(nested(row, "tenancy", "tenant", "legalName"), "");
            }
            if (sortState.key === "details" || sortState.key === "dates") {
              return stringValue(row.startDate, "");
            }
            if (sortState.key === "status") return stringValue(row.status, "");
          }
          return "";
        };
        return sortValue(left).localeCompare(sortValue(right), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * direction;
      });
  }, [
    isPropertyDirectory,
    isTenantDirectory,
    isTenancyDirectory,
    isUnitDirectory,
    isLeaseDirectory,
    recordPropertyFilter,
    recordSearch,
    recordStatusFilter,
    rentMode,
    rows,
    sortState,
    showStatus,
    section,
  ]);

  function sortBy(key: typeof sortState.key) {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function sortableHeader(label: string, key: typeof sortState.key) {
    const active = sortState.key === key;
    return (
      <th scope="col" aria-sort={active ? sortState.direction === "asc" ? "ascending" : "descending" : "none"}>
        <button className="landlord-sort-button" type="button" onClick={() => sortBy(key)}>
          {label}
          <span aria-hidden="true">{active ? sortState.direction === "asc" ? " ↑" : " ↓" : " ↕"}</span>
        </button>
      </th>
    );
  }

  if (!rows.length) return null;
  return (
    <div className="landlord-record-table-wrap">
      {isSearchableDirectory && (
        <div className="landlord-directory-controls">
          <label className="landlord-directory-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">
              Search {isPropertyDirectory
                ? "properties"
                : isTenantDirectory
                  ? "tenants"
                  : isTenancyDirectory
                    ? "tenancies"
                    : isUnitDirectory
                      ? "units"
                      : section === "Rent & Deposits"
                        ? rentMode
                        : section.toLocaleLowerCase()}
            </span>
            <input
              type="search"
              placeholder={
                isPropertyDirectory
                  ? "Search name, address, type, or owner…"
                  : isTenantDirectory
                  ? "Search tenants…"
                  : isTenancyDirectory
                    ? "Search tenant, property, unit, or date…"
                      : isUnitDirectory
                        ? "Search units…"
                        : section === "Leases"
                          ? "Search tenant, property, unit, or lease dates…"
                          : "Search records…"
              }
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.currentTarget.value)}
            />
          </label>
          {showStatus && (
            <label className="landlord-directory-filter">
              <span>{isTenantDirectory ? "Occupancy" : isTenancyDirectory ? "Tenancy status" : isUnitDirectory ? "Availability" : "Status"}</span>
              <select
                value={recordStatusFilter}
                onChange={(event) => setRecordStatusFilter(event.currentTarget.value)}
              >
                <option value="all">
                  {isTenantDirectory ? "All tenants" : isTenancyDirectory ? "All tenancies" : "All statuses"}
                </option>
                {isPropertyDirectory ? (
                  <>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ARCHIVED">Archived</option>
                  </>
                ) : isTenantDirectory ? (
                  <>
                    <option value="current">Current</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="unassigned">Not assigned</option>
                  </>
                ) : isTenancyDirectory ? (
                  <>
                    <option value="UPCOMING">Upcoming</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ENDED">Ended</option>
                    <option value="TERMINATED">Terminated</option>
                  </>
                ) : isUnitDirectory ? (
                  <>
                    <option value="AVAILABLE">Available</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                    <option value="ARCHIVED">Archived</option>
                  </>
                ) : statusOptions.map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          )}
          {isPropertyDirectory ? (
            <label className="landlord-directory-filter">
              <span>Type</span>
              <select
                value={recordPropertyFilter}
                onChange={(event) => setRecordPropertyFilter(event.currentTarget.value)}
              >
                <option value="all">All types</option>
                {propertyTypes.map((type) => (
                  <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          ) : directoryProperties.length > 0 && (
            <label className="landlord-directory-filter">
              <span>Property</span>
              <select
                value={recordPropertyFilter}
                onChange={(event) => setRecordPropertyFilter(event.currentTarget.value)}
              >
                <option value="all">All properties</option>
                {directoryProperties.map((property) => (
                  <option key={property.value} value={property.value}>{property.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <table className={`landlord-record-table${section === "Team" ? " is-team-table" : ""}${showOccupancy ? " is-tenant-directory" : ""}${isTenancyDirectory ? " is-tenancy-directory" : ""}${className ? ` ${className}` : ""}${showAmount ? " has-amount" : ""}${showStatus ? " has-status" : ""}${showActions ? " has-actions" : ""}`}>
        <thead>
          <tr>
            {(isPropertyDirectory || isTenantDirectory || isTenancyDirectory || isUnitDirectory || isLeaseDirectory)
              ? sortableHeader(recordHeading, "name")
              : <th scope="col">{recordHeading}</th>}
            {(isPropertyDirectory || isTenantDirectory || isUnitDirectory)
              ? sortableHeader("Details", "details")
              : isTenancyDirectory
                ? sortableHeader("Dates", "dates")
                : isLeaseDirectory
                  ? sortableHeader("Dates", "dates")
              : <th scope="col">Details</th>}
            {showOccupancy && sortableHeader("Current unit", "location")}
            {isTenancyDirectory && sortableHeader("Unit", "location")}
            {showAmount && <th scope="col">{amountHeading}</th>}
            {showStatus && (isPropertyDirectory || isUnitDirectory || isTenancyDirectory || isLeaseDirectory
              ? sortableHeader("Status", "status")
              : <th scope="col">Status</th>)}
            {showActions && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={2 + (showOccupancy || isTenancyDirectory ? 1 : 0) + (showAmount ? 1 : 0) + (showStatus ? 1 : 0) + (showActions ? 1 : 0)}>
                No records match your search and filters.
              </td>
            </tr>
          ) : visibleRows.map((row, index) => {
        const id = typeof row.id === "string" ? row.id : `${section}-${index}`;
          const actionId =
            section === "Team" && typeof row.userId === "string"
              ? row.userId
              : typeof row.id === "string"
                ? row.id
                : null;
          const status = stringValue(row.status ?? row.deliveryStatus ?? row.documentStatus, "");
        const displayStatus = status || (
          section === "Expenses" || section === "Utilities"
            ? row.reversedAt ? "REVERSED" : "POSTED"
            : ""
        );
        const lines: Array<[string, string]> = [];
        const add = (label: string, value: unknown) => {
          if (value !== undefined && value !== null && value !== "") {
            lines.push([label, String(value)]);
          }
        };
        let heading: string = section;
        let detail = "";
        let occupancy = "Not yet assigned";
        let amountValue: unknown;

        if (section === "Properties") {
          heading = stringValue(row.name);
          detail = stringValue(row.address);
          add("Type", row.type);
          add("Owner", nested(row, "propertyOwner", "name"));
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
          heading = stringValue(nested(row, "tenant", "legalName"));
          detail = `${dateLabel(row.moveInDate)}${row.moveOutDate ? ` – ${dateLabel(row.moveOutDate)}` : ""}`;
          add("Deposit held", formatAmount(nested(row, "deposit", "heldBalance"), currency));
        } else if (section === "Tenants") {
          heading = stringValue(row.legalName);
          detail = stringValue(row.email ?? row.phone, "No contact information");
          occupancy = tenantOccupancy(row).label;
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
          <tr key={id}>
            <td>
              <div className={`landlord-record-main${section === "Properties" ? " is-property-record" : ""}`}>
                {section === "Properties" && organisationId && (
                  <OrganisationFileImage
                    organisationId={organisationId}
                    fileId={row.photoFileId}
                    alt={`${heading} property photo`}
                    className="landlord-record-photo-image"
                  />
                )}
                <b>{heading}</b>
                {detail && !isTenancyDirectory && <span>{detail}</span>}
              </div>
            </td>
            {showOccupancy && <td>{occupancy}</td>}
            <td>
              <div className="landlord-record-details">
                {isTenancyDirectory && <small>{detail}</small>}
                {lines.map(([label, value]) => <small key={label}>{label}: {value}</small>)}
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
            </td>
            {isTenancyDirectory && (
              <td>
                {stringValue(nested(row, "unit", "property", "name"))}
                {" · "}
                {stringValue(nested(row, "unit", "unitNumber"))}
              </td>
            )}
            {showAmount && (
              <td className="landlord-record-amount">
                {amountValue !== undefined ? formatAmount(amountValue, currency) : "—"}
              </td>
            )}
            {showStatus && (
              <td>
                {displayStatus
                  ? <span className={`landlord-status-pill status-${displayStatus.toLowerCase()}`}>{displayStatus.replaceAll("_", " ")}</span>
                  : "—"}
              </td>
            )}
            {showActions && <td>
              <div className="landlord-record-actions">
              {section === "Team" && actionId && canEditTeamMember?.(row) && onEdit && (
                <button
                  className="landlord-icon-button"
                  type="button"
                  aria-label={`Edit ${stringValue(nested(row, "user", "name"), "team member")}`}
                  title="Edit team member"
                  onClick={() => onEdit(row)}
                >
                  <Pencil size={15} />
                </button>
              )}
              {section === "Team" && actionId && canRemoveTeamMember?.(row) && onRemove && (
                <button
                  className="landlord-icon-button landlord-team-remove-button"
                  type="button"
                  aria-label={`Remove ${stringValue(nested(row, "user", "name"), "team member")}`}
                  title="Remove team member"
                  onClick={() => onRemove(row)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              {onEdit && typeof row.id === "string" && (
                (section === "Tenants" && tenantMode === "tenants") || section === "Units" ? (
                  <button
                    className="landlord-icon-button"
                    type="button"
                    aria-label={`Edit ${section === "Units" ? stringValue(row.unitNumber, "unit") : stringValue(row.legalName, "tenant")}`}
                    title={`Edit ${section === "Units" ? "unit" : "tenant"}`}
                    onClick={() => onEdit(row)}
                  >
                    <Pencil size={15} />
                  </button>
                ) : section !== "Team" ? (
                  <button className="landlord-text-action" type="button" onClick={() => onEdit(row)}>Edit</button>
                ) : null
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
              {section === "Tenants" && tenantMode === "tenants" && onAssignUnit &&
                rowsFor(row, "tenancies").length === 0 && (
                  <button
                    className="landlord-icon-button"
                    type="button"
                    aria-label={`Find an available unit for ${stringValue(row.legalName, "tenant")}`}
                    title="Find an available unit"
                    onClick={() => onAssignUnit(row)}
                  >
                    <Search size={15} />
                  </button>
                )}
              {onArchive && typeof row.id === "string" &&
                ((section === "Units" && row.status !== "ARCHIVED") ||
                  (section === "Tenants" && tenantMode === "tenants" &&
                    rowsFor(row, "tenancies").length === 0)) && (
                  <button
                    className="landlord-icon-button landlord-team-remove-button"
                    type="button"
                    aria-label={`Archive ${section === "Units" ? stringValue(row.unitNumber, "unit") : stringValue(row.legalName, "tenant")}`}
                    title={`Archive ${section === "Units" ? "unit" : "tenant"}`}
                    onClick={() => onArchive(row)}
                  >
                    <Trash2 size={15} />
                  </button>
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
            </td>}
          </tr>
        );
      })}
        </tbody>
      </table>
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
  requestText,
  role,
}: {
  rows: ValueRecord[];
  members: ValueRecord[];
  onUpdate?: (row: ValueRecord, status: string, changes?: ValueRecord, invoice?: File) => void;
  requestText: (request: TextRequest) => Promise<string | null>;
  role: string;
}) {
  const [invoiceFiles, setInvoiceFiles] = useState<Record<string, File>>({});
  const [recordSearch, setRecordSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const nextStatus: Record<string, string[]> = role === "MAINTENANCE_STAFF"
    ? { ASSIGNED: ["IN_PROGRESS"], IN_PROGRESS: ["COMPLETED"] }
    : {
    SUBMITTED: ["APPROVED", "ASSIGNED", "REJECTED"],
    APPROVED: ["ASSIGNED", "IN_PROGRESS", "REJECTED"],
    ASSIGNED: ["IN_PROGRESS", "REJECTED"],
    IN_PROGRESS: ["COMPLETED", "REJECTED"],
    COMPLETED: [],
    REJECTED: [],
    };
  if (!rows.length) return null;
  const properties = [...new Map(rows.flatMap((row) => {
    const property = relatedProperty(row);
    const id = stringValue(property.id, "");
    return id ? [[id, stringValue(property.name)] as const] : [];
  })).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const statuses = [...new Set(rows.map((row) => stringValue(row.status, "")))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const search = recordSearch.trim().toLocaleLowerCase();
  const visibleRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (propertyFilter !== "all" && stringValue(relatedProperty(row).id, "") !== propertyFilter) return false;
    return !search || recordSearchValues(row).some((value) => value.toLocaleLowerCase().includes(search));
  });
  return (
    <div className="landlord-record-table-wrap">
      <div className="landlord-directory-controls">
        <label className="landlord-directory-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search maintenance requests</span>
          <input
            type="search"
            placeholder="Search request, unit, tenant, or description…"
            value={recordSearch}
            onChange={(event) => setRecordSearch(event.currentTarget.value)}
          />
        </label>
        <label className="landlord-directory-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
            <option value="all">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        {properties.length > 0 && (
          <label className="landlord-directory-filter">
            <span>Property</span>
            <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.currentTarget.value)}>
              <option value="all">All properties</option>
              {properties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      <table className="landlord-record-table landlord-maintenance-table">
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Details</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr><td colSpan={4}>No requests match your search and filters.</td></tr>
          ) : visibleRows.map((row, index) => {
        const status = stringValue(row.status);
        return (
          <tr key={stringValue(row.id, String(index))}>
            <td>
              <div className="landlord-record-main">
                <b>{stringValue(row.category)} · {stringValue(nested(row, "unit", "unitNumber"))}</b>
                <span>{stringValue(row.description)}</span>
              </div>
            </td>
            <td>
              <div className="landlord-record-details">
                <small>{stringValue(row.priority)} · {dateLabel(row.createdAt)} · Assigned to: {stringValue(row.assignedToUserId, "unassigned")}</small>
                {Boolean(row.resolutionNotes) && <small>Resolution: {stringValue(row.resolutionNotes)}</small>}
              </div>
            </td>
            <td><span className={`landlord-status-pill status-${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span></td>
            <td>
              <div className="landlord-record-actions">
              {onUpdate && role !== "MAINTENANCE_STAFF" && (
                <select
                  aria-label="Assign maintenance request"
                  value=""
                  onChange={(event) => {
                    if (event.currentTarget.value) onUpdate(row, status, { assignedToUserId: event.currentTarget.value });
                  }}
                >
                  <option value="">Assign to team member</option>
                  {members
                    .filter((member) => member.status === "ACTIVE" && member.role === "MAINTENANCE_STAFF" && typeof member.userId === "string")
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
              {onUpdate && role !== "MAINTENANCE_STAFF" && status !== "COMPLETED" && status !== "REJECTED" && (
                <button
                  className="landlord-text-action"
                  type="button"
                  onClick={async () => {
                    if (role === "MAINTENANCE_STAFF") {
                      const resolutionNotes = await requestText({
                        title: "Complete maintenance request",
                        description: "Add a summary of the work completed.",
                        label: "Resolution notes",
                      });
                      if (resolutionNotes !== null) {
                        onUpdate(row, "COMPLETED", {
                          ...(resolutionNotes.trim() ? { resolutionNotes: resolutionNotes.trim() } : {}),
                        });
                      }
                      return;
                    }
                    const estimatedCost = await requestText({
                      title: "Set repair estimate",
                      description: "Enter the estimated cost for this maintenance request.",
                      label: "Estimated cost",
                      type: "number",
                    });
                    if (estimatedCost?.trim()) onUpdate(row, status, { estimatedCost });
                  }}
                >
                  Set estimate
                </button>
              )}
              {onUpdate && role !== "MAINTENANCE_STAFF" && status === "IN_PROGRESS" && (
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
                    onClick={async () => {
                      const invoice = invoiceFiles[stringValue(row.id, "")];
                      const actualCost = await requestText({
                        title: "Complete maintenance request",
                        description: "Enter the final repair cost and resolution details.",
                        label: "Actual cost",
                        type: "number",
                        required: !!invoice,
                      });
                      if (actualCost === null) return;
                      const resolutionNotes = await requestText({
                        title: "Resolution notes",
                        description: "Add an optional summary of the completed work.",
                        label: "Resolution notes",
                        multiline: true,
                      });
                      if (resolutionNotes === null) return;
                      onUpdate(row, "COMPLETED", {
                        ...(actualCost.trim() ? { actualCost: actualCost.trim() } : {}),
                        ...(resolutionNotes?.trim() ? { resolutionNotes: resolutionNotes.trim() } : {}),
                      }, invoice);
                    }}
                  >
                    Complete request
                  </button>
                </>
              )}
            </div>
            </td>
          </tr>
        );
      })}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({
  report,
  currency,
  from,
  to,
  ownerId,
  owners,
  canFilterByOwner,
  onDateChange,
  onOwnerChange,
  onApply,
}: {
  report: ValueRecord;
  currency: string;
  from: string;
  to: string;
  ownerId: string;
  owners: ValueRecord[];
  canFilterByOwner: boolean;
  onDateChange: (name: string, value: string) => void;
  onOwnerChange: (value: string) => void;
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
        {canFilterByOwner && (
          <label className="landlord-field">
            <span>Property owner</span>
            <select value={ownerId} onChange={(event) => onOwnerChange(event.currentTarget.value)}>
              <option value="">All owners</option>
              {owners.map((owner) => (
                <option key={stringValue(owner.id)} value={stringValue(owner.id)}>
                  {stringValue(owner.name)}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <label className="landlord-field landlord-billing-cycle"><span>Billing cycle</span><select aria-label="Billing cycle" value={cycle} onChange={(event) => setCycle(event.currentTarget.value)}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
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
                <label className="landlord-field"><span>Payment reference <i aria-hidden="true"> *</i></span><input required value={paymentReference} onChange={(event) => setPaymentReference(event.currentTarget.value)} /></label>
                <label className="landlord-field"><span>Amount ({currency}) <i aria-hidden="true"> *</i></span><input required min="0.01" step="0.01" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.currentTarget.value)} /></label>
                <label className="landlord-field"><span>Proof (PDF or image) <i aria-hidden="true"> *</i></span><input required accept="application/pdf,image/jpeg,image/png,image/webp" type="file" onChange={(event) => setPaymentProof(event.currentTarget.files?.[0] ?? null)} /></label>
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
