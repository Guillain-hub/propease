"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Bath,
  Banknote,
  BellRing,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  CircleDollarSign,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Eye,
  FileText,
  Home,
  Landmark,
  KeyRound,
  LoaderCircle,
  MapPin,
  Ruler,
  SlidersHorizontal,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  defaultLeaseAgreementValues,
  LeaseAgreementFields,
  leaseAgreementValuesFromSnapshot,
  serializeLeaseAgreementValues,
} from "./lease-agreement-fields";

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
type PortfolioRow = {
  property: ValueRecord;
  propertyId: string;
  leases: ValueRecord[];
  activeLeaseCount: number;
  pendingLeaseCount: number;
  inspectionRows: ValueRecord[];
  scheduledInspectionCount: number;
  completedInspectionCount: number;
  utilityBillCount: number;
  rentStatus: "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE" | "NOT_CHARGED" | "NO_TENANTS";
  missingLeaseTenancies: number;
  units: number;
  occupied: number;
  vacant: number;
  occupancy: number;
  tenants: number;
  expected: bigint;
  collected: bigint;
  outstanding: bigint;
  expenses: bigint;
  overdue: number;
  openMaintenance: number;
  expiredLeases: number;
  expiringLeases: number;
  missingInspections: number;
  attention: number;
  attentionItems: PropertyAttentionItem[];
};
type PropertyQuickFilter = "all" | "outstanding" | "vacant" | "expiring";
type ClientPortfolioSummary = {
  owner: ValueRecord;
  properties: PortfolioRow[];
  units: number;
  occupied: number;
  outstanding: bigint;
  paymentStatus:
    | "UP_TO_DATE"
    | "PAYMENT_DUE"
    | "OVERDUE"
    | "NOT_CHARGED"
    | "NO_ACTIVE_TENANTS"
    | "NO_PROPERTIES";
};
type PropertyActionTab = "overview" | "ledger" | "repairs" | "notifications";
type PropertyAttentionItem = {
  id: string;
  title: string;
  detail: string;
  section: string;
  unitId?: string;
};
type UnitLedgerDetails = {
  unit: ValueRecord;
  unitId: string;
  tenancy: ValueRecord | null;
  activeTenancy: ValueRecord | null;
  upcomingTenancy: ValueRecord | null;
  occupied: boolean;
  vacant: boolean;
  tenantName: string;
  tenantPhone: string;
  leaseStatus: string;
  leaseEndDate: string;
  expiring: boolean;
  rentAmount: bigint;
  balance: bigint;
  rentStatus: PortfolioRow["rentStatus"];
  depositHeld: bigint;
  depositRequired: bigint;
  openMaintenance: ValueRecord[];
};
type PropertyActionState =
  | { type: "add-unit"; propertyId: string }
  | { type: "manage-property"; propertyId: string; initialTab?: "overview" | "notifications" }
  | { type: "assign"; propertyId: string; unitId: string }
  | { type: "rent"; propertyId: string; unitId: string }
  | {
      type: "manage";
      propertyId: string;
      unitId: string;
      initialTab?: PropertyActionTab;
    };
type ValueRecord = Record<string, unknown>;
type Choice = { value: string; label: string };
type Field = {
  name: string;
  label: string;
  type?: "date" | "datetime-local" | "number" | "email" | "textarea" | "multi" | "image";
  step?: string;
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

function amountMinorUnits(value: unknown): bigint {
  const text = typeof value === "bigint" ? null : String(value ?? "0").trim();
  if (typeof value === "bigint") return value;
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(text ?? "");
  if (!match) throw new Error("A monetary amount from the API is invalid.");
  const minor = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return match[1] === "-" ? -minor : minor;
}

function tryAmountMinorUnits(value: string): bigint | null {
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(value.trim())) return null;
  return amountMinorUnits(value);
}

function minorUnitsInput(value: bigint, currency: string): string {
  if (currency === "RWF" && value % BigInt(100) === BigInt(0)) return (value / BigInt(100)).toString();
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / BigInt(100);
  const fraction = String(absolute % BigInt(100)).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function formatAmount(value: unknown, currency: string): string {
  const amount = amountMinorUnits(value);
  const negative = amount < BigInt(0);
  const absolute = negative ? -amount : amount;
  const whole = new Intl.NumberFormat("en").format(absolute / BigInt(100));
  const remainder = absolute % BigInt(100);
  const fraction = remainder === BigInt(0)
    ? ""
    : `.${String(remainder).padStart(2, "0").replace(/0+$/, "")}`;
  const formatted = `${negative ? "-" : ""}${whole}${fraction}`;
  return currency === "RWF" ? `RWF ${formatted}` : `${formatted} ${currency}`;
}

function propertyIdFrom(row: ValueRecord): string {
  return stringValue(
    nested(row, "property", "id") ??
      row.propertyId ??
      nested(row, "unit", "property", "id") ??
      nested(row, "tenancy", "property", "id") ??
      nested(row, "tenancy", "propertyId") ??
      nested(row, "tenancy", "unit", "property", "id"),
    "",
  );
}

function propertyScopedData(
  section: SectionName,
  data: ValueRecord,
  propertyId?: string,
  unitId?: string,
): ValueRecord {
  if (!propertyId) return data;

  const scoped: ValueRecord = { ...data };
  const propertyRows = rowsFor(data, "properties").filter((row) => row.id === propertyId);
  const unitRows = rowsFor(data, "units").filter(
    (row) =>
      propertyIdFrom(row) === propertyId &&
      (!unitId || stringValue(row.id, "") === unitId),
  );
  const unitIds = new Set(unitRows.map((row) => stringValue(row.id, "")));
  const tenancyRows = rowsFor(data, "tenancies").filter(
    (row) =>
      propertyIdFrom(row) === propertyId &&
      (!unitId || unitIds.has(stringValue(nested(row, "unit", "id"), ""))),
  );
  const tenancyIds = new Set(tenancyRows.map((row) => stringValue(row.id, "")));
  const tenantIds = new Set(
    tenancyRows.map((row) => stringValue(nested(row, "tenant", "id"), "")),
  );

  if (Array.isArray(data.properties)) scoped.properties = propertyRows;
  if (Array.isArray(data.units)) scoped.units = unitRows;
  if (Array.isArray(data.tenancies)) scoped.tenancies = tenancyRows;
  if (Array.isArray(data.tenants)) {
    scoped.tenants = rowsFor(data, "tenants").filter(
      (row) =>
        tenantIds.has(stringValue(row.id, "")) ||
        (!unitId && rowsFor(row, "tenancies").length === 0),
    );
  }
  if (Array.isArray(data.leases)) {
    scoped.leases = rowsFor(data, "leases").filter((row) =>
      tenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")),
    );
  }
  if (Array.isArray(data.inspections)) {
    scoped.inspections = rowsFor(data, "inspections").filter((row) =>
      unitIds.has(stringValue(nested(row, "unit", "id"), "")),
    );
  }
  if (Array.isArray(data.charges)) {
    scoped.charges = rowsFor(data, "charges").filter((row) =>
      tenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")),
    );
  }
  if (Array.isArray(data.deposits)) {
    scoped.deposits = rowsFor(data, "deposits").filter((row) =>
      tenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")),
    );
  }
  if (Array.isArray(data.payments)) {
    scoped.payments = rowsFor(data, "payments").filter((row) =>
      rowsFor(row, "allocations").some(
        (allocation) =>
          unitId
            ? stringValue(nested(allocation, "rentCharge", "tenancy", "unit", "id"), "") === unitId
            : stringValue(
                nested(allocation, "rentCharge", "tenancy", "unit", "propertyId"),
                "",
              ) === propertyId,
      ),
    );
  }
  if (Array.isArray(data.expenses)) {
    scoped.expenses = rowsFor(data, "expenses").filter(
      (row) =>
        propertyIdFrom(row) === propertyId &&
        (!unitId ||
          !nested(row, "unit", "id") ||
          stringValue(nested(row, "unit", "id"), "") === unitId),
    );
  }
  if (Array.isArray(data.utilityBills)) {
    scoped.utilityBills = rowsFor(data, "utilityBills").filter(
      (row) =>
        propertyIdFrom(row) === propertyId &&
        (!unitId ||
          !rowsFor(row, "allocations").length ||
          rowsFor(row, "allocations").some(
            (allocation) => stringValue(nested(allocation, "unit", "id"), "") === unitId,
          )),
    );
  }
  if (Array.isArray(data.requests)) {
    scoped.requests = rowsFor(data, "requests").filter((row) =>
      unitIds.has(stringValue(nested(row, "unit", "id"), "")),
    );
  }
  if (Array.isArray(data.notices)) {
    scoped.notices = rowsFor(data, "notices").filter((row) =>
      tenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")),
    );
  }

  return scoped;
}

function dateLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}

function rentPeriodLabel(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return stringValue(value, "Rent charge");
  }
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
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
  organisationType,
  currency,
  role,
  userId,
  onUpdated,
  propertyFilterId,
  unitFilterId,
  initialPropertySearch,
  portfolioPropertyId,
  onPortfolioPropertyChange,
  unitDetailsOnly = false,
}: {
  section: SectionName;
  organisationId: string;
  organisationType: "LANDLORD" | "PROPERTY_MANAGEMENT_COMPANY";
  currency: string;
  role: string;
  userId: string;
  onUpdated: () => void;
  propertyFilterId?: string;
  unitFilterId?: string;
  initialPropertySearch?: string;
  portfolioPropertyId?: string;
  onPortfolioPropertyChange?: (propertyId: string) => void;
  unitDetailsOnly?: boolean;
}) {
  const [data, setData] = useState<ValueRecord>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [paymentReviewStep, setPaymentReviewStep] = useState<0 | 1>(0);
  const [teamMemberToRemove, setTeamMemberToRemove] = useState<ValueRecord | null>(null);
  const [recordToArchive, setRecordToArchive] = useState<{
    kind: "tenant" | "unit";
    row: ValueRecord;
  } | null>(null);
  const [archivingRecord, setArchivingRecord] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rentMode, setRentMode] = useState<"charges" | "payments" | "deposits">("charges");
  const [tenantMode, setTenantMode] = useState<"tenants" | "tenancies">("tenants");
  const [propertyView, setPropertyView] = useState<"properties" | "owners" | "client-properties">("properties");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingTeamMember, setRemovingTeamMember] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [propertySetupOpen, setPropertySetupOpen] = useState(false);
  const [propertySetupContext, setPropertySetupContext] = useState<{
    property: ValueRecord;
    units: ValueRecord[];
  } | null>(null);
  const [propertyAction, setPropertyAction] = useState<PropertyActionState | null>(null);
  const [attentionReadState, setAttentionReadState] = useState<{
    key: string;
    ids: Set<string>;
  }>({ key: "", ids: new Set() });
  const [attentionReadError, setAttentionReadError] = useState<string | null>(null);
  const [tenantLeaseOnboardingOpen, setTenantLeaseOnboardingOpen] = useState(false);
  const [tenantLeaseOnboardingUnitId, setTenantLeaseOnboardingUnitId] = useState<string | null>(null);
  const [tenantLeaseAssignmentTenant, setTenantLeaseAssignmentTenant] = useState<ValueRecord | null>(null);
  const [leaseCreationOpen, setLeaseCreationOpen] = useState(false);
  const [leaseResendSelection, setLeaseResendSelection] = useState<ValueRecord | null>(null);
  const [createdTenants, setCreatedTenants] = useState<ValueRecord[]>([]);
  const [propertySearch, setPropertySearch] = useState(initialPropertySearch ?? "");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [propertyStatusFilter, setPropertyStatusFilter] = useState("all");
  const [propertyQuickFilter, setPropertyQuickFilter] =
    useState<PropertyQuickFilter>("all");
  const [expandedPropertyIds, setExpandedPropertyIds] = useState<
    Record<string, boolean>
  >({});
  const [expensePeriod, setExpensePeriod] = useState(new Date().toISOString().slice(0, 7));
  const [propertyPage, setPropertyPage] = useState(1);
  const [showAdditionalFilters, setShowAdditionalFilters] = useState(false);
  const formDialogRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const textRequestResolver = useRef<((value: string | null) => void) | null>(null);

  const base = `/organisations/${organisationId}/landlord`;
  const canManagePropertyOwners =
    organisationType === "PROPERTY_MANAGEMENT_COMPANY" &&
    ["OWNER", "ADMIN"].includes(role);
  const attentionReadStorageKey = `propease:read-property-notifications:${organisationId}:${userId}`;
  const attentionReadIds = useMemo(
    () => attentionReadState.key === attentionReadStorageKey
      ? attentionReadState.ids
      : new Set<string>(),
    [attentionReadState, attentionReadStorageKey],
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(attentionReadStorageKey);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
        throw new Error("Saved notification state is invalid.");
      }
      setAttentionReadState({ key: attentionReadStorageKey, ids: new Set(parsed) });
      setAttentionReadError(null);
    } catch {
      setAttentionReadState({ key: attentionReadStorageKey, ids: new Set() });
      setAttentionReadError("Notification read status could not be loaded from this browser.");
    }
  }, [attentionReadStorageKey]);

  function markAttentionRead(itemId: string) {
    const ids = new Set(
      attentionReadState.key === attentionReadStorageKey
        ? attentionReadState.ids
        : [],
    );
    ids.add(itemId);
    try {
      window.localStorage.setItem(attentionReadStorageKey, JSON.stringify([...ids]));
      setAttentionReadState({ key: attentionReadStorageKey, ids });
      setAttentionReadError(null);
    } catch {
      setAttentionReadError("This notification could not be marked as read in this browser.");
    }
  }

  useEffect(() => {
    if (section !== "Properties") return;
    setPropertySearch(initialPropertySearch ?? "");
    setPropertyPage(1);
  }, [initialPropertySearch, section]);

  useEffect(() => {
    if (section === "Properties") setPropertyPage(1);
  }, [portfolioPropertyId, section]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const endpoints: Record<SectionName, Array<[string, string, string?]>> = {
        Properties: role === "MAINTENANCE_STAFF"
          ? [["maintenance", "requests", "requests"]]
          : [
          ["properties", "properties", "properties"],
          ["units", "units", "units"],
          ["tenancies", "tenancies", "tenancies"],
          ["tenants", "tenants", "tenants"],
          ["leases", "leases", "leases"],
          ["inspections", "inspections", "inspections"],
          ["rent/charges", "charges", "charges"],
          ["rent/payments", "payments", "payments"],
          ["rent/deposits", "deposits", "deposits"],
          ["expenses", "expenses", "expenses"],
          ["utilities", "utilityBills", "utilityBills"],
          ["maintenance", "requests", "requests"],
          ["notices", "notices", "notices"],
          ["", "portfolio"],
          ...(canManagePropertyOwners
            ? [["property-owners", "propertyOwners", "owners"] as [string, string, string]]
            : []),
          ...(canManagePropertyOwners
            ? [["team", "members", "members"] as [string, string, string]]
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
          ...(canManagePropertyOwners
            ? [["property-owners", "propertyOwners", "owners"] as [string, string, string]]
            : []),
        ],
        Team: [["team", "members", "members"], ["properties", "properties", "properties"]],
        Subscription: [["subscription", "subscription"]],
        Settings: [["settings", "settings"]],
      };
      const entries = endpoints[section];
      const results: Array<readonly [string, unknown]> = [];
      for (const [path, key, collection] of entries) {
        const value = await apiRequest<ValueRecord>(`${base}${path ? `/${path}` : ""}`);
        results.push([key, collection ? rowsFor(value, collection) : value]);
      }
      const next = propertyScopedData(
        section,
        Object.fromEntries(results) as ValueRecord,
        propertyFilterId,
        unitFilterId,
      );
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
  }, [base, section, refreshKey, role, propertyFilterId, unitFilterId]);

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
    setPaymentReviewStep(0);
    setPropertySetupOpen(false);
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
  const leases = rowsFor(data, "leases");
  const charges = rowsFor(data, "charges");
  const deposits = rowsFor(data, "deposits");
  const portfolioRows = useMemo<PortfolioRow[]>(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const currentMonth = now.toISOString().slice(0, 7);
    const selectedExpenseMonth = expensePeriod || currentMonth;
    const inspectionRows = rowsFor(data, "inspections");
    const maintenanceRows = rowsFor(data, "requests");
    const leaseRows = rowsFor(data, "leases");
    const paymentRows = rowsFor(data, "payments");
    const expenseRows = rowsFor(data, "expenses");

    return properties
      .filter((property) =>
        propertyView !== "properties" ||
        !portfolioPropertyId ||
        stringValue(property.id, "") === portfolioPropertyId,
      )
      .map((property) => {
      const propertyId = stringValue(property.id, "");
      const propertyUnits = units.filter(
        (unit) => propertyIdFrom(unit) === propertyId && unit.status !== "ARCHIVED",
      );
      const unitIds = new Set(propertyUnits.map((unit) => stringValue(unit.id, "")));
      const activeTenancies = tenancies.filter(
        (tenancy) =>
          propertyIdFrom(tenancy) === propertyId &&
          tenancy.status === "ACTIVE" &&
          (!propertyUnits.length || unitIds.has(stringValue(nested(tenancy, "unit", "id"), ""))),
      );
      const propertyTenancyIds = new Set(
        tenancies
          .filter((tenancy) => propertyIdFrom(tenancy) === propertyId)
          .map((tenancy) => stringValue(tenancy.id, "")),
      );
      const propertyLeases = leaseRows.filter((lease) =>
        propertyTenancyIds.has(stringValue(nested(lease, "tenancy", "id"), "")),
      );
      const leaseTenancy = (lease: ValueRecord) =>
        tenancies.find((tenancy) => stringValue(tenancy.id, "") === stringValue(nested(lease, "tenancy", "id"), ""));
      const leaseUnitId = (lease: ValueRecord) =>
        stringValue(nested(lease, "tenancy", "unit", "id") ?? nested(leaseTenancy(lease), "unit", "id"), "");
      const propertyInspections = inspectionRows.filter((inspection) =>
        unitIds.has(stringValue(nested(inspection, "unit", "id"), "")),
      );
      const propertyUtilityBills = rowsFor(data, "utilityBills").filter(
        (bill) =>
          propertyIdFrom(bill) === propertyId &&
          stringValue(bill.period, "") === selectedExpenseMonth &&
          !bill.reversedAt,
      );
      const leasedTenancyIds = new Set(
        propertyLeases.map((lease) => stringValue(nested(lease, "tenancy", "id"), "")),
      );
      const missingLeaseTenancies = tenancies.filter(
        (tenancy) =>
          propertyIdFrom(tenancy) === propertyId &&
          ["ACTIVE", "UPCOMING"].includes(stringValue(tenancy.status, "")) &&
          !leasedTenancyIds.has(stringValue(tenancy.id, "")),
      ).length;
      const activeTenantIds = new Set(
        activeTenancies.map((tenancy) => stringValue(nested(tenancy, "tenant", "id"), "")),
      );
      const activeUnitIds = new Set(
        tenancies
          .filter((tenancy) => propertyIdFrom(tenancy) === propertyId && tenancy.status === "ACTIVE")
          .map((tenancy) => stringValue(nested(tenancy, "unit", "id"), ""))
          .filter(Boolean),
      );
      const reservedUnitIds = new Set(
        tenancies
          .filter((tenancy) => propertyIdFrom(tenancy) === propertyId && tenancy.status === "UPCOMING")
          .map((tenancy) => stringValue(nested(tenancy, "unit", "id"), ""))
          .filter(Boolean),
      );
      const occupied = propertyUnits.filter(
        (unit) => unit.status === "OCCUPIED" || activeUnitIds.has(stringValue(unit.id, "")),
      ).length;
      const vacant = propertyUnits.filter(
        (unit) =>
          unit.status === "AVAILABLE" &&
          !activeUnitIds.has(stringValue(unit.id, "")) &&
          !reservedUnitIds.has(stringValue(unit.id, "")),
      ).length;
      const activeTenancyIds = new Set(activeTenancies.map((tenancy) => stringValue(tenancy.id, "")));
      const currentCharges = charges.filter(
        (charge) =>
          activeTenancyIds.has(stringValue(nested(charge, "tenancy", "id"), "")) &&
          stringValue(charge.period, "") === currentMonth &&
          charge.status !== "VOID",
      );
      const currentChargeTenancyIds = new Set(
        currentCharges.map((charge) => stringValue(nested(charge, "tenancy", "id"), "")),
      );
      const currentChargeBalance = currentCharges.reduce(
        (sum, charge) => sum + amountMinorUnits(charge.balance),
        BigInt(0),
      );
      const currentChargePaid = currentCharges.reduce(
        (sum, charge) => {
          const paid = amountMinorUnits(charge.amount) - amountMinorUnits(charge.balance);
          return sum + (paid > BigInt(0) ? paid : BigInt(0));
        },
        BigInt(0),
      );
      const hasOverdueCurrentCharge = currentCharges.some(
        (charge) =>
          amountMinorUnits(charge.balance) > BigInt(0) &&
          (charge.status === "OVERDUE" ||
            (Boolean(charge.dueDate) && stringValue(charge.dueDate, "").slice(0, 10) < today)),
      );
      const rentStatus: PortfolioRow["rentStatus"] =
        activeTenancies.length === 0
          ? "NO_TENANTS"
          : currentCharges.length === 0
            ? "NOT_CHARGED"
            : currentChargeBalance <= BigInt(0)
              ? currentChargeTenancyIds.size < activeTenancies.length
                ? "NOT_CHARGED"
                : "PAID"
              : hasOverdueCurrentCharge
                ? "OVERDUE"
                : currentChargePaid > BigInt(0)
                  ? "PARTIAL"
                  : "UNPAID";
      const propertyCharges = charges.filter(
        (charge) =>
            propertyTenancyIds.has(stringValue(nested(charge, "tenancy", "id"), "")) &&
            stringValue(charge.period, "") === currentMonth &&
            charge.status !== "VOID",
      );
      const collected = paymentRows
        .filter(
          (payment) =>
            !payment.reversedAt &&
            stringValue(payment.receivedAt, "").slice(0, 7) === currentMonth,
        )
        .reduce(
            (sum, payment) => {
              const paymentPropertyId = stringValue(
                nested(payment, "tenancy", "unit", "propertyId"),
                "",
              );
              if (paymentPropertyId) {
                return paymentPropertyId === propertyId
                  ? sum + amountMinorUnits(payment.amount)
                  : sum;
              }
              return sum + rowsFor(payment, "allocations")
                .filter(
                  (allocation) =>
                    stringValue(
                      nested(allocation, "rentCharge", "tenancy", "unit", "propertyId"),
                      "",
                    ) === propertyId,
                )
                .reduce(
                  (allocationSum, allocation) =>
                    allocationSum + amountMinorUnits(allocation.allocatedAmount),
                  BigInt(0),
                );
            },
            BigInt(0),
        );
      const outstanding = propertyCharges.reduce(
          (sum, charge) => sum + amountMinorUnits(charge.balance),
          BigInt(0),
      );
      const expected = activeTenancies.reduce(
        (sum, tenancy) => {
          const currentLease = leaseRows.find(
            (lease) =>
              nested(lease, "tenancy", "id") === tenancy.id &&
              lease.status === "ACTIVE" &&
              stringValue(lease.startDate, "").slice(0, 10) <= today &&
              stringValue(lease.endDate, "").slice(0, 10) >= today,
          );
          const unit = propertyUnits.find((item) => item.id === nested(tenancy, "unit", "id"));
          return sum + amountMinorUnits(currentLease?.rentAmount ?? unit?.rentAmount);
        },
        BigInt(0),
      );
      const expenses = expenseRows
        .filter(
          (expense) =>
            propertyIdFrom(expense) === propertyId &&
            stringValue(expense.date, "").slice(0, 7) === selectedExpenseMonth &&
            !expense.reversedAt,
        )
        .reduce((sum, expense) => sum + amountMinorUnits(expense.amount), BigInt(0));
      const overdue = charges.filter(
        (charge) =>
        propertyTenancyIds.has(stringValue(nested(charge, "tenancy", "id"), "")) &&
          charge.status !== "VOID" &&
          amountMinorUnits(charge.balance) > BigInt(0) &&
          stringValue(charge.dueDate, "").slice(0, 10) < today,
      ).length;
      const openMaintenance = maintenanceRows.filter(
        (request) =>
          unitIds.has(stringValue(nested(request, "unit", "id"), "")) &&
          !["COMPLETED", "REJECTED"].includes(stringValue(request.status, "")),
      ).length;
      const expiringLeases = leaseRows.filter((lease) => {
        const endDate = stringValue(lease.endDate, "").slice(0, 10);
        const startDate = stringValue(lease.startDate, "").slice(0, 10);
        return (
          propertyTenancyIds.has(stringValue(nested(lease, "tenancy", "id"), "")) &&
          lease.status === "ACTIVE" &&
          startDate <= today &&
          endDate >= today &&
          endDate <= soon
        );
      }).length;
      const expiredLeases = leaseRows.filter(
        (lease) =>
          propertyTenancyIds.has(stringValue(nested(lease, "tenancy", "id"), "")) &&
          lease.status === "ACTIVE" &&
          stringValue(lease.endDate, "").slice(0, 10) < today,
      ).length;
      const moveInInspectedTenancies = new Set(
        inspectionRows
          .filter(
            (inspection) =>
              inspection.type === "MOVE_IN" && inspection.status === "COMPLETED",
          )
          .map((inspection) => stringValue(nested(inspection, "tenancy", "id"), "")),
      );
      const missingInspections = activeTenancies.filter((tenancy) =>
        !moveInInspectedTenancies.has(stringValue(tenancy.id, "")),
      ).length;
      const attentionItems: PropertyAttentionItem[] = [];
      const addAttention = (
        id: string,
        title: string,
        detail: string,
        section: string,
        unitId?: string,
      ) => {
        attentionItems.push({
          id,
          title,
          detail,
          section,
          ...(unitId ? { unitId } : {}),
        });
      };
      for (const unit of propertyUnits) {
        const unitId = stringValue(unit.id, "");
        if (unit.status === "AVAILABLE" && !activeUnitIds.has(unitId) && !reservedUnitIds.has(unitId)) {
          addAttention(
            `vacant-${stringValue(unit.id)}`,
            `Unit ${stringValue(unit.unitNumber)} is vacant`,
            "Add a tenant and prepare a lease.",
            "Units",
            stringValue(unit.id),
          );
        }
      }
      for (const lease of propertyLeases) {
        const tenancy = leaseTenancy(lease);
        const unitId = leaseUnitId(lease);
        const tenantName = stringValue(
          nested(lease, "tenancy", "tenant", "legalName") ?? nested(tenancy, "tenant", "legalName"),
          "Tenant",
        );
        const unitNumber = stringValue(
          nested(lease, "tenancy", "unit", "unitNumber") ?? nested(tenancy, "unit", "unitNumber"),
          "—",
        );
        const status = stringValue(lease.status, "");
        if (status === "PENDING_TENANT_REVIEW") {
          addAttention(
            `lease-review-${stringValue(lease.id)}`,
            "Lease awaiting tenant response",
            `${tenantName} · ${unitNumber}`,
            "Leases",
            unitId,
          );
        } else if (status === "CHANGES_REQUESTED") {
          addAttention(
            `lease-changes-${stringValue(lease.id)}`,
            "Tenant requested lease changes",
            `${tenantName} · Review and resend the lease.`,
            "Leases",
            unitId,
          );
        } else if (status === "TENANT_ACCEPTED") {
          addAttention(
            `lease-accepted-${stringValue(lease.id)}`,
            "Lease accepted",
            `${tenantName} · Prepare for lease activation.`,
            "Leases",
            unitId,
          );
        } else if (status === "TENANT_DECLINED") {
          addAttention(
            `lease-declined-${stringValue(lease.id)}`,
            "Tenant declined the lease",
            `${tenantName} · Review next steps.`,
            "Leases",
            unitId,
          );
        } else if (status === "DRAFT") {
          addAttention(
            `lease-draft-${stringValue(lease.id)}`,
            "Lease draft needs review",
            `${tenantName} · Finish and send the lease.`,
            "Leases",
            unitId,
          );
        }
      }
      for (const charge of charges) {
        const tenancyId = stringValue(nested(charge, "tenancy", "id"), "");
        if (
          !propertyTenancyIds.has(tenancyId) ||
          charge.status === "VOID" ||
          amountMinorUnits(charge.balance) <= BigInt(0)
        ) continue;
        const dueDate = stringValue(charge.dueDate, "").slice(0, 10);
        const unitId = stringValue(nested(charge, "tenancy", "unit", "id"), "");
        const overdueCharge = charge.status === "OVERDUE" || Boolean(dueDate && dueDate < today);
        addAttention(
          `rent-${stringValue(charge.id)}`,
          overdueCharge ? "Overdue rent" : "Outstanding rent",
          `${stringValue(nested(charge, "tenancy", "tenant", "legalName"), "Tenant")} · ${formatAmount(charge.balance, currency)}`,
          "Rent & Deposits",
          unitId,
        );
      }
      for (const deposit of deposits) {
        const tenancyId = stringValue(nested(deposit, "tenancy", "id"), "");
        if (!propertyTenancyIds.has(tenancyId)) continue;
        const tenancy = tenancies.find(
          (item) =>
            stringValue(item.id, "") === tenancyId &&
            propertyIdFrom(item) === propertyId,
        );
        const lease = propertyLeases.find(
          (item) => stringValue(nested(item, "tenancy", "id"), "") === tenancyId,
        );
        const depositStatus = stringValue(deposit.status, "");
        const required = amountMinorUnits(deposit.requiredAmount);
        const received = amountMinorUnits(deposit.receivedAmount);
        const unitId = stringValue(nested(tenancy, "unit", "id"), "");
        const tenantName = stringValue(nested(tenancy, "tenant", "legalName"), "Tenant");
        if (
          ["TENANT_ACCEPTED", "ACTIVE"].includes(stringValue(lease?.status, "")) &&
          ["NOT_RECEIVED", "PARTIALLY_RECEIVED"].includes(depositStatus) &&
          required > received
        ) {
          addAttention(
            `deposit-outstanding-${stringValue(deposit.id)}`,
            "Security deposit outstanding",
            `${tenantName} · ${formatAmount(required - received, currency)} remaining.`,
            "Rent & Deposits",
            unitId,
          );
        } else if (
          ["ENDED", "TERMINATED"].includes(stringValue(tenancy?.status, "")) &&
          ["HELD", "PARTIALLY_REFUNDED"].includes(depositStatus) &&
          amountMinorUnits(deposit.heldBalance) > BigInt(0)
        ) {
          addAttention(
            `deposit-refund-${stringValue(deposit.id)}`,
            "Deposit refund or deductions pending",
            `${tenantName} · Review the held balance of ${formatAmount(deposit.heldBalance, currency)}.`,
            "Rent & Deposits",
            unitId,
          );
        }
      }
      for (const request of maintenanceRows) {
        const unitId = stringValue(nested(request, "unit", "id"), "");
        if (!unitIds.has(unitId) || ["COMPLETED", "REJECTED"].includes(stringValue(request.status, ""))) continue;
        addAttention(
          `maintenance-${stringValue(request.id)}`,
          "Maintenance request needs attention",
          `${stringValue(nested(request, "unit", "unitNumber"), "Unit")} · ${stringValue(request.description, stringValue(request.category, "Open request"))}`,
          "Maintenance",
          unitId,
        );
      }
      for (const inspection of propertyInspections) {
        if (inspection.status !== "SCHEDULED") continue;
        const unitId = stringValue(nested(inspection, "unit", "id"), "");
        addAttention(
          `inspection-${stringValue(inspection.id)}`,
          "Inspection due",
          `Unit ${stringValue(nested(inspection, "unit", "unitNumber"), "—")} · ${dateLabel(inspection.inspectedAt)}`,
          "Inspections",
          unitId,
        );
      }
      for (const tenancy of activeTenancies) {
        if (moveInInspectedTenancies.has(stringValue(tenancy.id, ""))) continue;
        const unitId = stringValue(nested(tenancy, "unit", "id"), "");
        addAttention(
          `move-in-inspection-${stringValue(tenancy.id)}`,
          "Move-in inspection required",
          `${stringValue(nested(tenancy, "tenant", "legalName"), "Tenant")} · Unit ${stringValue(nested(tenancy, "unit", "unitNumber"), "—")}`,
          "Inspections",
          unitId,
        );
      }
      for (const lease of propertyLeases) {
        const endDate = stringValue(lease.endDate, "").slice(0, 10);
        const startDate = stringValue(lease.startDate, "").slice(0, 10);
        if (
          lease.status !== "ACTIVE" ||
          startDate > today ||
          endDate < today ||
          endDate > soon
        ) continue;
        addAttention(
          `lease-expiring-${stringValue(lease.id)}`,
          "Lease expires soon",
          `${stringValue(nested(lease, "tenancy", "tenant", "legalName"), "Tenant")} · ${dateLabel(lease.endDate)}`,
          "Leases",
          leaseUnitId(lease),
        );
      }
      const unreadAttentionItems = attentionItems.filter(
        (item) => !attentionReadIds.has(item.id),
      );
      const attention = unreadAttentionItems.length;

      return {
        property,
        propertyId,
        leases: propertyLeases,
        activeLeaseCount: propertyLeases.filter(
          (lease) =>
            lease.status === "ACTIVE" &&
            stringValue(lease.startDate, "").slice(0, 10) <= today &&
            stringValue(lease.endDate, "").slice(0, 10) >= today,
        ).length,
        pendingLeaseCount: propertyLeases.filter((lease) =>
          ["DRAFT", "PENDING_TENANT_REVIEW", "CHANGES_REQUESTED", "TENANT_ACCEPTED", "TENANT_DECLINED"].includes(
            stringValue(lease.status, ""),
          ),
        ).length,
        inspectionRows: propertyInspections,
        scheduledInspectionCount: propertyInspections.filter(
          (inspection) => inspection.status === "SCHEDULED",
        ).length,
        completedInspectionCount: propertyInspections.filter(
          (inspection) => inspection.status === "COMPLETED",
        ).length,
        utilityBillCount: propertyUtilityBills.length,
        rentStatus,
        missingLeaseTenancies,
        units: propertyUnits.length,
        occupied,
        vacant,
        occupancy: propertyUnits.length ? Math.round((occupied / propertyUnits.length) * 100) : 0,
        tenants: activeTenantIds.size,
        expected,
        collected,
        outstanding,
        expenses,
        overdue,
        openMaintenance,
        expiredLeases,
        expiringLeases,
        missingInspections,
        attention,
        attentionItems: unreadAttentionItems,
      };
      });
  }, [properties, units, tenancies, charges, data, expensePeriod, portfolioPropertyId, attentionReadIds, propertyView]);
  const clientSummaries = useMemo<ClientPortfolioSummary[]>(() => {
    return rowsFor(data, "propertyOwners").map((owner) => {
      const ownerId = stringValue(owner.id, "");
      const ownerProperties = portfolioRows.filter(
        (row) =>
          stringValue(
            nested(row.property, "propertyOwner", "id") ?? row.property.propertyOwnerId,
            "",
          ) === ownerId,
      );
      const units = ownerProperties.reduce((sum, row) => sum + row.units, 0);
      const occupied = ownerProperties.reduce((sum, row) => sum + row.occupied, 0);
      const outstanding = ownerProperties.reduce(
        (sum, row) => sum + row.outstanding,
        BigInt(0),
      );
      const paymentStatus: ClientPortfolioSummary["paymentStatus"] =
        ownerProperties.length === 0
          ? "NO_PROPERTIES"
          : ownerProperties.some(
                (row) => row.rentStatus === "OVERDUE" && row.outstanding > BigInt(0),
              )
            ? "OVERDUE"
            : outstanding > BigInt(0)
              ? "PAYMENT_DUE"
              : ownerProperties.some((row) => row.rentStatus === "NOT_CHARGED")
                ? "NOT_CHARGED"
                : occupied === 0
                  ? "NO_ACTIVE_TENANTS"
                  : "UP_TO_DATE";
      return { owner, properties: ownerProperties, units, occupied, outstanding, paymentStatus };
    });
  }, [data, portfolioRows]);
  const selectedClient = clientSummaries.find(
    (summary) => stringValue(summary.owner.id, "") === selectedClientId,
  ) ?? null;
  const filteredPropertyRows = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    return portfolioRows.filter((row) => {
      const property = row.property;
      const propertyNameAndAddress =
        `${stringValue(property.name, "")} ${stringValue(property.address, "")}`
          .toLowerCase();
      const propertyMatchesQuery = !query || propertyNameAndAddress.includes(query);
      const unitOrTenantMatchesQuery =
        Boolean(query) &&
        units.some((unit) => {
          if (
            propertyIdFrom(unit) !== row.propertyId ||
            unit.status === "ARCHIVED"
          ) {
            return false;
          }
          const unitId = stringValue(unit.id, "");
          const unitTenants = tenancies
            .filter(
              (tenancy) =>
                stringValue(nested(tenancy, "unit", "id"), "") === unitId,
            )
            .map((tenancy) => stringValue(nested(tenancy, "tenant", "legalName"), ""));
          return `${stringValue(unit.unitNumber, "")} ${unitTenants.join(" ")}`
            .toLowerCase()
            .includes(query);
        });
      const matchesSearch =
        propertyMatchesQuery || unitOrTenantMatchesQuery;
      const matchesType =
        propertyTypeFilter === "all" || property.type === propertyTypeFilter;
      const matchesOccupancy =
        occupancyFilter === "all" ||
        (occupancyFilter === "occupied" ? row.occupied > 0 : row.vacant > 0);
      const matchesStatus =
        propertyStatusFilter === "all" || property.status === propertyStatusFilter;
      const matchesQuickFilter =
        propertyQuickFilter === "all" ||
        (propertyQuickFilter === "outstanding" &&
          (row.outstanding > BigInt(0) ||
            ["OVERDUE", "PARTIAL", "UNPAID"].includes(row.rentStatus))) ||
        (propertyQuickFilter === "vacant" && row.vacant > 0) ||
        (propertyQuickFilter === "expiring" && row.expiringLeases > 0);
      return (
        matchesSearch &&
        matchesType &&
        matchesOccupancy &&
        matchesStatus &&
        matchesQuickFilter
      );
    });
  }, [
    portfolioRows,
    propertySearch,
    propertyTypeFilter,
    occupancyFilter,
    propertyStatusFilter,
    propertyQuickFilter,
    units,
    tenancies,
  ]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredPropertyRows.length / pageSize));
  const visiblePropertyRows = filteredPropertyRows.slice(
    (propertyPage - 1) * pageSize,
    propertyPage * pageSize,
  );
  const portfolioTotals = portfolioRows.reduce(
    (totals, row) => ({
      units: totals.units + row.units,
      occupied: totals.occupied + row.occupied,
      expected: totals.expected + row.expected,
      collected: totals.collected + row.collected,
      outstanding: totals.outstanding + row.outstanding,
      maintenance: totals.maintenance + row.openMaintenance,
      expiring: totals.expiring + row.expiringLeases,
    }),
    {
      units: 0,
      occupied: 0,
      expected: BigInt(0),
      collected: BigInt(0),
      outstanding: BigInt(0),
      maintenance: 0,
      expiring: 0,
    },
  );
  const occupancyRate = portfolioTotals.units
    ? Math.round((portfolioTotals.occupied / portfolioTotals.units) * 100)
    : 0;
  const collectionRate = portfolioTotals.expected > BigInt(0)
    ? Math.min(
        100,
        Number((portfolioTotals.collected * BigInt(100)) / portfolioTotals.expected),
      )
    : 100;
  const visibleMultiUnitIds = visiblePropertyRows
    .filter((row) => row.units > 1)
    .map((row) => row.propertyId);
  const allVisibleMultiUnitsExpanded =
    visibleMultiUnitIds.length > 0 &&
    visibleMultiUnitIds.every((propertyId) => expandedPropertyIds[propertyId]);

  useEffect(() => {
    if (propertyPage > pageCount) setPropertyPage(pageCount);
  }, [pageCount, propertyPage]);

  const fields: Field[] = useMemo(() => {
    const amountStep = currency === "RWF" ? "1" : "0.01";
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
    const tenantChoices = Array.from(
      new Map(
        [...tenants, ...createdTenants]
          .filter((tenant) => typeof tenant.id === "string")
          .map((tenant) => [stringValue(tenant.id, ""), tenant] as const),
      ).values(),
    );
    const tenantOptions = selectOptions(tenantChoices, (row) => stringValue(row.legalName));
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
      charges.filter((charge) =>
        charge.status !== "VOID" &&
        amountMinorUnits(charge.balance) > BigInt(0) &&
        (!form.tenantId || nested(charge, "tenancy", "tenant", "id") === form.tenantId),
      ),
      (row) =>
        `${stringValue(nested(row, "tenancy", "tenant", "legalName"))} · ${stringValue(row.period)} · balance ${formatAmount(row.balance, currency)}`,
    );
    switch (section) {
      case "Properties":
        if (propertyView === "owners") {
          return [
            { name: "name", label: organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Client name" : "Owner name", required: true },
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
          { name: "bedrooms", label: "Bedrooms", type: "number", step: "1" },
          { name: "bathrooms", label: "Bathrooms", type: "number", step: "1" },
          { name: "sizeSqm", label: "Area (m²)", type: "number" },
          { name: "rentAmount", label: `Monthly rent (${currency})`, type: "number", step: amountStep, required: true },
          { name: "depositAmount", label: `Required deposit (${currency})`, type: "number", step: amountStep, required: true },
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
          { name: "rentAmount", label: `Monthly rent (${currency})`, type: "number", step: amountStep, required: true },
          { name: "dueDay", label: "Rent due day (1–28)", type: "number", step: "1", required: true },
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
            { name: "amount", label: `Rent charge (${currency})`, type: "number", step: amountStep, required: true },
          ];
        }
        if (rentMode === "payments") {
          return [
            { name: "tenantId", label: "Tenant", required: true, options: tenantOptions },
            { name: "amount", label: `Amount received (${currency})`, type: "number", step: amountStep, required: true },
            { name: "method", label: "Payment method", required: true, options: [
              { value: "CASH", label: "Cash" },
              { value: "BANK_TRANSFER", label: "Bank transfer" },
              { value: "MTN_MOMO", label: "MTN MoMo" },
              { value: "AIRTEL_MONEY", label: "Airtel Money" },
              { value: "OTHER", label: "Other" },
            ] },
            { name: "reference", label: "Reference (optional)" },
            { name: "receivedAt", label: "Date received", type: "date", required: true },
            { name: "rentChargeId", label: "Allocate to rent charge (optional)", options: chargeOptions },
            { name: "allocationAmount", label: `Allocation amount (${currency})`, type: "number", step: amountStep },
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
          { name: "amount", label: `Amount (${currency})`, type: "number", step: amountStep, required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "reason", label: "Reason", required: true },
        ];
      case "Expenses":
        return [
          { name: "propertyId", label: "Property", required: true, options: propertyOptions },
          { name: "category", label: "Category", required: true, placeholder: "Repairs, insurance, tax..." },
          { name: "amount", label: `Amount (${currency})`, type: "number", step: amountStep, required: true },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "supplier", label: "Supplier" },
          uploadFileField("Receipt or evidence (optional)"),
        ];
      case "Utilities":
        return [
          { name: "propertyId", label: "Property", required: true, options: propertyOptions },
          { name: "utilityType", label: "Utility", required: true, placeholder: "Water, electricity..." },
          { name: "period", label: "Billing period (YYYY-MM)", required: true, placeholder: "2026-11" },
          { name: "totalAmount", label: `Total bill (${currency})`, type: "number", step: amountStep, required: true },
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
  }, [section, properties, units, tenants, createdTenants, tenancies, charges, deposits, currency, rentMode, tenantMode, propertyView, data, form, role]);
  const isRentPaymentDialog = section === "Rent & Deposits" && rentMode === "payments" && !editingId;
  const isPropertyEditDrawer =
    formOpen && section === "Properties" && propertyView === "properties" && editingId !== null;
  const paymentReviewCharge = charges.find(
    (charge) => stringValue(charge.id, "") === form.rentChargeId,
  );
  const paymentReviewAmount = paymentReviewStep === 1 ? amountMinorUnits(form.amount) : BigInt(0);
  const paymentReviewOpenBalance = paymentReviewCharge
    ? amountMinorUnits(paymentReviewCharge.balance)
    : BigInt(0);
  const paymentReviewAllocation = paymentReviewStep === 1 && form.allocationAmount
    ? amountMinorUnits(form.allocationAmount)
    : BigInt(0);
  const paymentReviewRemaining = paymentReviewOpenBalance > paymentReviewAllocation
    ? paymentReviewOpenBalance - paymentReviewAllocation
    : BigInt(0);
  const paymentReviewAdvance = paymentReviewAmount - paymentReviewAllocation;
  const paymentChannelLabel = fields
    .find((field) => field.name === "method")
    ?.options?.find((option) => option.value === form.method)?.label ?? form.method;

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
    if (
      section === "Rent & Deposits" &&
      rentMode === "payments" &&
      (name === "amount" || name === "rentChargeId")
    ) {
      const chargeId = name === "rentChargeId" ? value : form.rentChargeId;
      const amountValue = name === "amount" ? value : form.amount;
      const paymentAmount = tryAmountMinorUnits(amountValue ?? "");
      const selectedCharge = charges.find((charge) => stringValue(charge.id, "") === chargeId);
      const chargeBalance = selectedCharge ? amountMinorUnits(selectedCharge.balance) : BigInt(0);
      const allocation = paymentAmount === null
        ? ""
        : minorUnitsInput(paymentAmount < chargeBalance ? paymentAmount : chargeBalance, currency);
      setForm((current) => ({
        ...current,
        [name]: value,
        allocationAmount: allocation,
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "tenantId" ? { tenancyId: "" } : {}),
    }));
  }

  function openForm(initialValues: Record<string, string> = {}) {
    setEditingId(null);
    const today = new Date().toISOString().slice(0, 10);
    const selectedUnit = units.find(
      (unit) => stringValue(unit.id, "") === unitFilterId,
    );
    const selectedTenancy = tenancies.find(
      (tenancy) =>
        stringValue(nested(tenancy, "unit", "id"), "") === unitFilterId &&
        ["ACTIVE", "UPCOMING"].includes(stringValue(tenancy.status, "")),
    );
    const defaults: Record<string, string> = {};
    if (propertyFilterId && ["Units", "Expenses", "Utilities"].includes(section)) {
      defaults.propertyId = propertyFilterId;
    }
    if (section === "Utilities" && propertyFilterId) {
      defaults.unitIds = units
        .filter((unit) => propertyIdFrom(unit) === propertyFilterId)
        .map((unit) => stringValue(unit.id, ""))
        .filter(Boolean)
        .join(",");
    }
    if (section === "Tenants" && tenantMode === "tenancies") {
      if (selectedUnit?.status === "AVAILABLE" && unitFilterId) defaults.unitId = unitFilterId;
      defaults.moveInDate = today;
    }
    if (section === "Inspections") {
      if (unitFilterId) defaults.unitId = unitFilterId;
      defaults.inspectedAt = today;
    }
    if (section === "Maintenance" && unitFilterId) {
      defaults.unitId = unitFilterId;
      const activeTenancy = tenancies.find(
        (tenancy) =>
          stringValue(nested(tenancy, "unit", "id"), "") === unitFilterId &&
          tenancy.status === "ACTIVE",
      );
      if (activeTenancy) defaults.tenantId = stringValue(nested(activeTenancy, "tenant", "id"), "");
    }
    if (section === "Leases" && selectedTenancy) {
      defaults.tenantId = stringValue(nested(selectedTenancy, "tenant", "id"), "");
      defaults.tenancyId = stringValue(selectedTenancy.id, "");
    }
    if (section === "Notices" && selectedTenancy) {
      defaults.tenancyId = stringValue(selectedTenancy.id, "");
      defaults.issueDate = today;
    }
    if (section === "Rent & Deposits" && selectedTenancy) {
      if (rentMode === "charges") defaults.tenancyId = stringValue(selectedTenancy.id, "");
      if (rentMode === "payments") {
        defaults.tenantId = stringValue(nested(selectedTenancy, "tenant", "id"), "");
        defaults.receivedAt = today;
        const openCharge = charges
          .filter((charge) =>
            nested(charge, "tenancy", "id") === selectedTenancy.id &&
            charge.status !== "VOID" &&
            amountMinorUnits(charge.balance) > BigInt(0),
          )
          .sort((left, right) => stringValue(left.dueDate, "").localeCompare(stringValue(right.dueDate, "")))[0];
        if (openCharge) defaults.rentChargeId = stringValue(openCharge.id, "");
      }
    }
    setForm({ ...defaults, ...initialValues });
    setPaymentReviewStep(0);
    setSelectedFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setPaymentReviewStep(0);
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
    if (typeof row.id === "string") setTenantLeaseAssignmentTenant(row);
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
    if (
      section === "Rent & Deposits" &&
      rentMode === "payments" &&
      !editingId &&
      paymentReviewStep === 0
    ) {
      const receivedAmount = tryAmountMinorUnits(form.amount ?? "");
      if (!form.tenantId || !form.method || !form.receivedAt || receivedAmount === null || receivedAmount <= BigInt(0)) {
        setError("Enter a tenant, positive amount, payment channel and received date.");
        return;
      }
      if (currency === "RWF" && receivedAmount % BigInt(100) !== BigInt(0)) {
        setError("RWF payments must be entered as whole francs.");
        return;
      }
      if (form.allocationAmount) {
        const allocationAmount = tryAmountMinorUnits(form.allocationAmount);
        const selectedCharge = charges.find((charge) => stringValue(charge.id, "") === form.rentChargeId);
        if (
          allocationAmount === null ||
          allocationAmount <= BigInt(0) ||
          allocationAmount > receivedAmount ||
          !selectedCharge ||
          allocationAmount > amountMinorUnits(selectedCharge.balance)
        ) {
          setError("The allocation must be positive and cannot exceed the payment or open charge balance.");
          return;
        }
        if (currency === "RWF" && allocationAmount % BigInt(100) !== BigInt(0)) {
          setError("RWF allocations must be entered as whole francs.");
          return;
        }
      }
      setError(null);
      setPaymentReviewStep(1);
      return;
    }
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
            label = organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Client saved" : "Property owner saved";
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
            label = "User-recorded rent payment saved";
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
          const parsedTotal = tryAmountMinorUnits(form.totalAmount);
          if (parsedTotal === null || parsedTotal <= BigInt(0)) {
            throw new Error("Enter a valid utility bill total.");
          }
          if (currency === "RWF" && parsedTotal % BigInt(100) !== BigInt(0)) {
            throw new Error("RWF utility bills must be entered as whole francs.");
          }
          const totalUnits = currency === "RWF" ? parsedTotal / BigInt(100) : parsedTotal;
          const divisor = BigInt(selectedUnitIds.length);
          const baseUnits = totalUnits / divisor;
          const remainder = totalUnits % divisor;
          payload = {
            propertyId: form.propertyId,
            utilityType: form.utilityType,
            period: form.period,
            totalAmount: form.totalAmount,
            allocations: selectedUnitIds.map((unitId, index) => {
              const share = baseUnits + (BigInt(index) < remainder ? BigInt(1) : BigInt(0));
              return {
                unitId,
                amount: currency === "RWF" ? share.toString() : minorUnitsInput(share, currency),
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
        label = `${section === "Properties" ? propertyView === "owners"
          ? organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Client" : "Property owner"
          : "Property" : section === "Units" ? "Unit" : "Tenant"} updated`;
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
      if (
        section === "Tenants" &&
        tenantMode === "tenants" &&
        !editingId &&
        typeof created.id === "string"
      ) {
        setCreatedTenants((current) =>
          current.some((tenant) => tenant.id === created.id)
            ? current
            : [...current, created],
        );
      }

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
      setPaymentReviewStep(0);
      setRefreshKey((key) => key + 1);
      onUpdated();
      if (section === "Rent & Deposits" && rentMode === "payments" && routeId) {
        void downloadReceipt(routeId);
      }
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

  async function requestLeaseTermination(row: ValueRecord) {
    if (typeof row.id !== "string") return;
    const reason = await requestText({
      title: "Request lease termination",
      description: "The tenant must confirm this request using the secure link emailed to them. The lease remains active until they agree.",
      label: "Reason for termination",
      required: true,
      multiline: true,
    });
    if (!reason?.trim()) return;
    setError(null);
    try {
      await apiRequest(`${base}/leases/${row.id}/termination-requests`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setSuccess("Termination request sent to the tenant for confirmation.");
      setRefreshKey((key) => key + 1);
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The termination request could not be sent.");
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

  async function downloadSignedAgreement(leaseId: string) {
    try {
      const request = () => fetch(
        `${apiBaseUrl}/organisations/${organisationId}/landlord/leases/${leaseId}/signed-agreement`,
        { credentials: "include" },
      );
      let response = await request();
      if (response.status === 401 && await refreshSession()) response = await request();
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as ApiError | undefined;
        const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
        throw new Error(message || `Download failed (${response.status})`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "signed-lease-agreement.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The signed agreement could not be downloaded.");
    }
  }

  const canManageRecords = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const canManageFinancialRecords = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "ACCOUNTANT",
  ].includes(role);
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
      (propertyView === "properties"
        ? canCreateProperties
        : propertyView === "owners" && canManagePropertyOwners));
  const canUpdateMaintenance =
    canManageRecords || role === "MAINTENANCE_STAFF";
  const sectionItemName = section === "Properties" && propertyView === "owners"
    ? organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "client" : "property owner"
    : section.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
  const title = section === "Properties" && propertyView === "owners"
    ? organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Clients" : "Property owners"
    : section === "Properties" && propertyView === "client-properties"
      ? selectedClient ? `${stringValue(selectedClient.owner.name)} · Properties` : "Client properties"
      : section === "Rent & Deposits" ? "Rent & deposits" : section;
  const formActionLabel = section === "Properties"
    ? propertyView === "owners"
      ? organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Add client" : "Add property owner"
      : "Add property"
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
  const portfolioToday = new Date().toISOString().slice(0, 10);
  const currentRentPeriod = portfolioToday.slice(0, 7);
  const leaseExpiringCutoff = new Date(
    Date.now() + 60 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  function getUnitLedgerDetails(unit: ValueRecord): UnitLedgerDetails {
    const unitId = stringValue(unit.id, "");
    const unitTenancies = tenancies.filter(
      (tenancy) => stringValue(nested(tenancy, "unit", "id"), "") === unitId,
    );
    const activeTenancy =
      unitTenancies.find((tenancy) => tenancy.status === "ACTIVE") ?? null;
    const upcomingTenancy =
      unitTenancies.find((tenancy) => tenancy.status === "UPCOMING") ?? null;
    const tenancy = activeTenancy ?? upcomingTenancy;
    const tenancyId = stringValue(tenancy?.id, "");
    const unitLeases = leases.filter(
      (lease) =>
        stringValue(nested(lease, "tenancy", "id"), "") === tenancyId,
    );
    const activeLease = unitLeases.find(
      (lease) =>
        lease.status === "ACTIVE" &&
        stringValue(lease.startDate, "").slice(0, 10) <= portfolioToday &&
        stringValue(lease.endDate, "").slice(0, 10) >= portfolioToday,
    );
    const relevantLease =
      activeLease ??
      unitLeases.find((lease) =>
        [
          "PENDING_TENANT_REVIEW",
          "CHANGES_REQUESTED",
          "TENANT_ACCEPTED",
          "TENANT_DECLINED",
          "DRAFT",
        ].includes(stringValue(lease.status, "")),
      );
    const currentCharges = charges.filter(
      (charge) =>
        stringValue(nested(charge, "tenancy", "id"), "") === tenancyId &&
        stringValue(charge.period, "") === currentRentPeriod &&
        charge.status !== "VOID",
    );
    const balance = currentCharges.reduce(
      (sum, charge) => sum + amountMinorUnits(charge.balance),
      BigInt(0),
    );
    const paidAmount = currentCharges.reduce(
      (sum, charge) => {
        const paid = amountMinorUnits(charge.amount) - amountMinorUnits(charge.balance);
        return sum + (paid > BigInt(0) ? paid : BigInt(0));
      },
      BigInt(0),
    );
    const hasOverdueCharge = currentCharges.some(
      (charge) =>
        amountMinorUnits(charge.balance) > BigInt(0) &&
        (charge.status === "OVERDUE" ||
          stringValue(charge.dueDate, "").slice(0, 10) < portfolioToday),
    );
    const rentStatus: PortfolioRow["rentStatus"] = !activeTenancy
      ? "NO_TENANTS"
      : currentCharges.length === 0
        ? "NOT_CHARGED"
        : balance <= BigInt(0)
          ? "PAID"
          : hasOverdueCharge
            ? "OVERDUE"
            : paidAmount > BigInt(0)
              ? "PARTIAL"
              : "UNPAID";
    const deposit = deposits.find(
      (item) =>
        stringValue(nested(item, "tenancy", "id"), "") === tenancyId,
    );
    const openMaintenance = rowsFor(data, "requests").filter(
      (request) =>
        stringValue(nested(request, "unit", "id"), "") === unitId &&
        !["COMPLETED", "REJECTED"].includes(stringValue(request.status, "")),
    );
    const leaseEndDate = stringValue(relevantLease?.endDate, "");

    return {
      unit,
      unitId,
      tenancy,
      activeTenancy,
      upcomingTenancy,
      occupied: Boolean(activeTenancy) || unit.status === "OCCUPIED",
      vacant:
        unit.status === "AVAILABLE" &&
        !activeTenancy &&
        !upcomingTenancy,
      tenantName: stringValue(nested(tenancy, "tenant", "legalName"), ""),
      tenantPhone: stringValue(nested(tenancy, "tenant", "phone"), ""),
      leaseStatus: stringValue(relevantLease?.status, ""),
      leaseEndDate,
      expiring:
        Boolean(activeLease) &&
        Boolean(leaseEndDate) &&
        leaseEndDate.slice(0, 10) >= portfolioToday &&
        leaseEndDate.slice(0, 10) <= leaseExpiringCutoff,
      rentAmount: amountMinorUnits(
        activeLease?.rentAmount ??
          unitLeases.find((lease) => lease.status === "TENANT_ACCEPTED")?.rentAmount ??
          unit.rentAmount,
      ),
      balance,
      rentStatus,
      depositHeld: amountMinorUnits(deposit?.heldBalance ?? deposit?.receivedAmount),
      depositRequired: amountMinorUnits(deposit?.requiredAmount),
      openMaintenance,
    };
  }
  const actionProperty = propertyAction
    ? properties.find((property) => stringValue(property.id, "") === propertyAction.propertyId) ?? null
    : null;
  const actionUnit = propertyAction && "unitId" in propertyAction
    ? units.find((unit) => stringValue(unit.id, "") === propertyAction.unitId) ?? null
    : null;
  const actionUnitDetails = actionUnit ? getUnitLedgerDetails(actionUnit) : null;
  const actionAttentionItems = propertyAction
    ? portfolioRows
        .find((row) => row.propertyId === propertyAction.propertyId)
        ?.attentionItems.filter((item) =>
          !("unitId" in propertyAction) || item.unitId === propertyAction.unitId,
        ) ?? []
    : [];
  return (
    <div className={`landlord-section${section === "Properties" ? " is-properties-section" : ""}`}>
      {(section !== "Properties" || propertyView !== "properties") && (
      <div className="dashboard-heading-row">
        <div>
          <span className="dashboard-date">
            PROPEASE WORKSPACE
          </span>
          <h1>{title}</h1>
          {section === "Properties" && (
            <p>
              {propertyView === "client-properties"
                ? "Review this client’s property occupancy, rent collection and outstanding balances."
                : propertyView === "owners"
                  ? "Manage clients and review the performance of their managed properties."
                  : role === "MAINTENANCE_STAFF"
                ? "Review and update your assigned property maintenance requests."
                : "Manage your properties, units, tenants and financial performance."}
            </p>
          )}
        </div>
        <div className="properties-heading-actions">
          {section === "Properties" && propertyView === "client-properties" && (
            <button
              className="dashboard-secondary-button"
              type="button"
              onClick={() => setPropertyView("owners")}
            >
              <ChevronLeft size={15} /> Back to clients
            </button>
          )}
          {section === "Properties" && propertyView !== "client-properties" && canCreateCurrentRecord && (
            <button
              className="dashboard-primary-button landlord-add-record-button"
              ref={addButtonRef}
              type="button"
              onClick={() => setPropertySetupOpen(true)}
            >
              <Plus size={16} /> {propertyView === "owners"
                ? organisationType === "PROPERTY_MANAGEMENT_COMPANY" ? "Add client" : "Add property owner"
                : "Add Property"}
            </button>
          )}
          <button
            className="dashboard-secondary-button"
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>
      )}

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

      {section === "Properties" && canManagePropertyOwners && propertyView !== "client-properties" && (
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
              {view === "properties" ? "Properties" : "Clients"}
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
        <WorkspaceContentSkeleton section={section} unitDetailsOnly={unitDetailsOnly} />
      ) : section === "Properties" ? (
        role === "MAINTENANCE_STAFF" ? (
          <section className="landlord-panel landlord-records-panel">
            <div className="landlord-panel-heading">
              <div>
                <h2>Assigned maintenance requests</h2>
                <p>Review and update requests assigned to you.</p>
              </div>
            </div>
            <MaintenanceList
              rows={rowsFor(data, "requests")}
              members={[]}
              onUpdate={updateMaintenance}
              requestText={requestText}
              role={role}
            />
            {!rowsFor(data, "requests").length && (
              <p className="landlord-empty-state">No maintenance requests are assigned to you.</p>
            )}
          </section>
        ) : propertyView === "owners" ? (
          <section className="landlord-panel landlord-records-panel">
            <div className="landlord-panel-heading">
              <div><h2>Clients</h2></div>
            </div>
            <PropertyOwnerList
              rows={rowsFor(data, "propertyOwners")}
              summaries={clientSummaries}
              currency={currency}
              onManage={(owner) => {
                setSelectedClientId(stringValue(owner.id, ""));
                setPropertyView("client-properties");
              }}
              onEdit={canManagePropertyOwners ? editRecord : undefined}
            />
          </section>
        ) : propertyView === "client-properties" ? (
          selectedClient ? (
            <ClientPropertiesOverview
              summary={selectedClient}
              currency={currency}
              onManageProperty={(propertyId) => setPropertyAction({ type: "manage-property", propertyId })}
            />
          ) : (
            <div className="landlord-empty-state">
              <p>This client could not be found.</p>
              <button type="button" className="dashboard-secondary-button" onClick={() => setPropertyView("owners")}>
                <ChevronLeft size={15} /> Back to clients
              </button>
            </div>
          )
        ) : (
          <div className="properties-dashboard properties-reference-dashboard">
            <section className="property-portfolio-overview" aria-labelledby="property-portfolio-overview-title">
              <div className="property-portfolio-overview-heading">
                <div>
                  <h2 id="property-portfolio-overview-title">Portfolio Overview</h2>
                  <p>
                    {new Intl.DateTimeFormat("en", {
                      month: "long",
                      year: "numeric",
                    }).format(new Date())} Billing Cycle · All amounts in {currency}
                  </p>
                </div>
                <div className="property-portfolio-header-controls">
                  <label className="dashboard-portfolio-selector">
                    <span className="sr-only">Select portfolio property</span>
                    <select
                      aria-label="Select portfolio property"
                      value={portfolioPropertyId ?? ""}
                      onChange={(event) => onPortfolioPropertyChange?.(event.target.value)}
                    >
                      <option value="">All Properties ({properties.length})</option>
                      {properties.map((property) => (
                        <option key={stringValue(property.id, "")} value={stringValue(property.id, "")}>{stringValue(property.name)}</option>
                      ))}
                    </select>
                  </label>
                  {canCreateProperties && (
                    <button className="property-ledger-primary-action" type="button" onClick={() => setPropertySetupOpen(true)}>
                      <Plus size={15} aria-hidden="true" /> Add Property
                    </button>
                  )}
                  <button
                    className="property-ledger-refresh-action"
                    type="button"
                    aria-label="Refresh portfolio"
                    title="Refresh portfolio"
                    onClick={() => setRefreshKey((key) => key + 1)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="property-portfolio-kpis">
                <article className="property-portfolio-kpi">
                  <div className="property-portfolio-kpi-heading">
                    <span>Portfolio Occupancy</span>
                    <span className="property-portfolio-kpi-icon"><Home size={17} aria-hidden="true" /></span>
                  </div>
                  <strong>{occupancyRate}%</strong>
                  <p>{portfolioTotals.occupied} of {portfolioTotals.units} units</p>
                  <div className="property-portfolio-progress" aria-label={`${occupancyRate}% occupancy`}>
                    <span style={{ width: `${occupancyRate}%` }} />
                  </div>
                </article>
                <article className="property-portfolio-kpi">
                  <div className="property-portfolio-kpi-heading">
                    <span>Rent Collected</span>
                    <span className="property-portfolio-kpi-icon is-positive"><Banknote size={17} aria-hidden="true" /></span>
                  </div>
                  <strong>{formatAmount(portfolioTotals.collected, currency)}</strong>
                  <p>
                    of {formatAmount(portfolioTotals.expected, currency)} expected
                    <b>{collectionRate}%</b>
                  </p>
                  <div className="property-portfolio-progress is-positive" aria-label={`${collectionRate}% rent collected`}>
                    <span style={{ width: `${collectionRate}%` }} />
                  </div>
                </article>
                <article className="property-portfolio-kpi">
                  <div className="property-portfolio-kpi-heading">
                    <span>Outstanding Arrears</span>
                    <span className="property-portfolio-kpi-icon is-warning"><CalendarDays size={17} aria-hidden="true" /></span>
                  </div>
                  <strong className="is-arrears">{formatAmount(portfolioTotals.outstanding, currency)}</strong>
                  <p>
                    {portfolioRows.filter((row) => row.outstanding > BigInt(0)).length} properties with a balance
                    {portfolioTotals.outstanding > BigInt(0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPropertyQuickFilter("outstanding");
                          setPropertyPage(1);
                        }}
                      >
                        Filter
                      </button>
                    )}
                  </p>
                </article>
                <article className="property-portfolio-kpi">
                  <div className="property-portfolio-kpi-heading">
                    <span>Ops &amp; Lease Alerts</span>
                    <span className="property-portfolio-kpi-icon is-alert"><Wrench size={17} aria-hidden="true" /></span>
                  </div>
                  <strong className="property-ops-kpi-summary">
                    {portfolioTotals.maintenance}<small> tickets</small><i aria-hidden="true">|</i>{portfolioTotals.expiring}<small> expiring</small>
                  </strong>
                  <p>
                    Needs attention this month
                  </p>
                </article>
              </div>
            </section>
            <section className="properties-table-panel">
              <div className="properties-table-heading properties-ledger-heading">
                <div>
                  <h2>Properties &amp; Units Ledger <span className="properties-count-badge">{portfolioRows.length} {portfolioRows.length === 1 ? "Property" : "Properties"}</span></h2>
                  <p>Single-unit homes appear directly as flat rows; multi-unit buildings show rolled-up totals when collapsed.</p>
                </div>
                <div className="properties-controls properties-reference-controls">
                <div className="property-ledger-quick-filters" role="group" aria-label="Filter property ledger">
                  {([
                    ["all", "All"],
                    ["outstanding", "Overdue / Partial"],
                    ["vacant", "Vacant"],
                    ["expiring", "Expiring Soon"],
                  ] as const).map(([filter, label]) => (
                    <button
                      type="button"
                      key={filter}
                      className={propertyQuickFilter === filter ? "is-active" : ""}
                      aria-pressed={propertyQuickFilter === filter}
                      onClick={() => {
                        setPropertyQuickFilter(filter);
                        setPropertyPage(1);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="properties-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={propertySearch}
                    onChange={(event) => {
                      setPropertySearch(event.target.value);
                      setPropertyPage(1);
                    }}
                    placeholder="Search property, unit, tenant"
                    aria-label="Search property, unit, or tenant"
                  />
                </label>
                {visibleMultiUnitIds.length > 0 && (
                  <button
                    type="button"
                    className="property-ledger-expand-all"
                    onClick={() =>
                      setExpandedPropertyIds(
                        allVisibleMultiUnitsExpanded
                          ? {}
                          : Object.fromEntries(
                              visibleMultiUnitIds.map((propertyId) => [propertyId, true]),
                            ),
                      )
                    }
                  >
                    {allVisibleMultiUnitsExpanded ? "Collapse all" : "Expand all"}
                  </button>
                )}
                <button
                  type="button"
                  className="properties-filter-toggle"
                  aria-expanded={showAdditionalFilters}
                  onClick={() => setShowAdditionalFilters((shown) => !shown)}
                >
                  <SlidersHorizontal size={14} /> Filters
                </button>
                {showAdditionalFilters && <div className="properties-extra-filters">
                <label className="properties-filter properties-status-filter">
                  <span>Property status</span>
                  <select
                    aria-label="Filter by property status"
                    value={propertyStatusFilter}
                    onChange={(event) => {
                      setPropertyStatusFilter(event.target.value);
                      setPropertyPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    {Array.from(new Set(properties.map((property) => stringValue(property.status, ""))))
                      .filter(Boolean)
                      .map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <label className="properties-filter">
                  <span>Property type</span>
                  <select
                    value={propertyTypeFilter}
                    onChange={(event) => {
                      setPropertyTypeFilter(event.target.value);
                      setPropertyPage(1);
                    }}
                  >
                    <option value="all">All types</option>
                    {Array.from(new Set(properties.map((property) => stringValue(property.type, ""))))
                      .filter(Boolean)
                      .map((type) => <option value={type} key={type}>{type.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <label className="properties-filter">
                  <span>Occupancy</span>
                  <select
                    value={occupancyFilter}
                    onChange={(event) => {
                      setOccupancyFilter(event.target.value);
                      setPropertyPage(1);
                    }}
                  >
                    <option value="all">Any occupancy</option>
                    <option value="occupied">Has occupied units</option>
                    <option value="vacant">Has vacant units</option>
                  </select>
                </label>
                <label className="properties-period-picker">
                  <span>Reporting period</span>
                  <input
                    type="month"
                    value={expensePeriod}
                    onChange={(event) => {
                      setExpensePeriod(event.target.value);
                      setPropertyPage(1);
                    }}
                    aria-label="Reporting period"
                  />
                </label>
                <button
                  type="button"
                  className="properties-reset-button"
                  onClick={() => {
                    setPropertySearch("");
                    setPropertyTypeFilter("all");
                    setOccupancyFilter("all");
                    setPropertyStatusFilter("all");
                    setPropertyQuickFilter("all");
                    setExpensePeriod(new Date().toISOString().slice(0, 7));
                    setPropertyPage(1);
                  }}
                >
                  Reset filters
                </button>
                </div>}
                </div>
              </div>
              <div className="properties-table-scroll">
                <table className="properties-table property-ledger-table">
                  <thead>
                    <tr>
                      <th>Property / Unit</th>
                      <th>Tenant &amp; Lease</th>
                      <th>Rent &amp; Balance ({currency})</th>
                      <th>Deposit Held</th>
                      <th>Maintenance &amp; Follow-up</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePropertyRows.map((row) => {
                      const property = row.property;
                      const propertyId = row.propertyId;
                      const query = propertySearch.trim().toLowerCase();
                      const propertyMatchesQuery =
                        !query ||
                        `${stringValue(property.name, "")} ${stringValue(property.address, "")}`
                          .toLowerCase()
                          .includes(query);
                      const propertyUnits = units.filter(
                        (unit) =>
                          propertyIdFrom(unit) === propertyId &&
                          unit.status !== "ARCHIVED",
                      );
                      const unitSummaries = propertyUnits.map(getUnitLedgerDetails);
                      const visibleUnitSummaries = unitSummaries.filter((unit) => {
                        const matchesQuery =
                          propertyMatchesQuery ||
                          !query ||
                          `${stringValue(unit.unit.unitNumber, "")} ${unit.tenantName}`
                            .toLowerCase()
                            .includes(query);
                        const matchesQuickFilter =
                          propertyQuickFilter === "all" ||
                          (propertyQuickFilter === "outstanding" &&
                            (unit.balance > BigInt(0) ||
                              ["OVERDUE", "PARTIAL", "UNPAID"].includes(unit.rentStatus))) ||
                          (propertyQuickFilter === "vacant" && unit.vacant) ||
                          (propertyQuickFilter === "expiring" && unit.expiring);
                        return matchesQuery && matchesQuickFilter;
                      });
                      const isMultiUnit = propertyUnits.length > 1;
                      const isExpanded = Boolean(expandedPropertyIds[propertyId]);
                      const occupiedUnits = unitSummaries.filter((unit) => unit.occupied).length;
                      const vacantUnits = unitSummaries.filter((unit) => unit.vacant).length;
                      const heldDeposit = unitSummaries.reduce(
                        (sum, unit) => sum + unit.depositHeld,
                        BigInt(0),
                      );
                      const primaryUnit = unitSummaries[0];
                      const propertyOpenTickets = unitSummaries.flatMap((unit) =>
                        unit.openMaintenance.map((ticket) => ({ ticket, unit })),
                      );
                      const rentStatusLabels: Record<PortfolioRow["rentStatus"], string> = {
                        PAID: "Paid",
                        PARTIAL: "Partial",
                        UNPAID: "Unpaid",
                        OVERDUE: "Overdue",
                        NOT_CHARGED: "Not charged",
                        NO_TENANTS: "No active rent",
                      };
                      const propertyRentStatusType = isMultiUnit
                        ? row.rentStatus
                        : primaryUnit?.rentStatus ?? row.rentStatus;
                      const propertyRentStatusText = isMultiUnit
                        ? row.outstanding > BigInt(0)
                          ? `Balance ${formatAmount(row.outstanding, currency)}`
                          : rentStatusLabels[row.rentStatus]
                        : primaryUnit
                          ? primaryUnit.balance > BigInt(0)
                            ? `${rentStatusLabels[primaryUnit.rentStatus]} · ${formatAmount(primaryUnit.balance, currency)} due`
                            : rentStatusLabels[primaryUnit.rentStatus]
                          : rentStatusLabels[row.rentStatus];
                      return (
                        <Fragment key={propertyId}>
                          <tr
                            className={`property-ledger-property-row${isExpanded ? " is-expanded" : ""}`}
                            key={propertyId}
                          >
                            <td className="properties-property-cell" data-label="Property / Unit">
                              <div className="property-ledger-property-cell">
                                {isMultiUnit ? (
                                  <button
                                    type="button"
                                    className="property-ledger-expand-button"
                                    aria-expanded={isExpanded}
                                    aria-label={`${isExpanded ? "Collapse" : "Expand"} units for ${stringValue(property.name)}`}
                                    onClick={() =>
                                      setExpandedPropertyIds((current) => ({
                                        ...current,
                                        [propertyId]: !current[propertyId],
                                      }))
                                    }
                                  >
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </button>
                                ) : (
                                  <span className="properties-property-icon"><Building2 size={17} /></span>
                                )}
                                <span className="properties-property-info">
                                  <strong>{stringValue(property.name)}</strong>
                                  <span>{stringValue(property.address)}</span>
                                  <small>
                                    {stringValue(property.type).replaceAll("_", " ")}
                                    {isMultiUnit
                                      ? ` · ${propertyUnits.length} units`
                                      : primaryUnit
                                        ? ` · Unit ${stringValue(primaryUnit.unit.unitNumber, "—")}`
                                        : " · No units yet"}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td data-label="Tenant & Lease">
                              {isMultiUnit ? (
                                <>
                                  <strong className="property-ledger-tenant-label">
                                    {occupiedUnits} active {occupiedUnits === 1 ? "tenant" : "tenants"}
                                  </strong>
                                  <span className="property-ledger-cell-note">
                                    {vacantUnits} vacant
                                    {row.expiringLeases > 0 ? ` · ${row.expiringLeases} leases expiring` : ""}
                                  </span>
                                </>
                              ) : primaryUnit ? (
                                <>
                                  {primaryUnit.tenantName ? (
                                    <strong className="property-ledger-tenant-label">
                                      {primaryUnit.tenantName}
                                    </strong>
                                  ) : (
                                    <strong>{primaryUnit.upcomingTenancy ? "Upcoming tenancy" : "Vacant"}</strong>
                                  )}
                                  <span className="property-ledger-cell-note">
                                    {primaryUnit.leaseStatus
                                      ? primaryUnit.leaseStatus.replaceAll("_", " ")
                                      : primaryUnit.occupied ? "No active lease" : "Ready for tenant"}
                                    {primaryUnit.leaseEndDate
                                      ? ` · Ends ${primaryUnit.leaseEndDate.slice(0, 10)}`
                                      : ""}
                                  </span>
                                </>
                              ) : (
                                <span className="property-ledger-cell-note">Add a unit to get started</span>
                              )}
                            </td>
                            <td className="property-ledger-money-cell" data-label={`Rent & Balance (${currency})`}>
                              <strong>
                                {isMultiUnit
                                  ? `${formatAmount(row.collected, currency)} / ${formatAmount(row.expected, currency)}`
                                  : primaryUnit
                                    ? formatAmount(primaryUnit.rentAmount, currency)
                                    : "—"}
                              </strong>
                              <span
                                className={`property-ledger-rent-status is-${propertyRentStatusType.toLowerCase().replaceAll("_", "-")}`}
                                title={propertyRentStatusType === "NOT_CHARGED"
                                  ? "No non-void rent charge has been created for the current period. This does not mean rent is paid."
                                  : undefined}
                              >
                                {propertyRentStatusType === "NO_TENANTS" && <UserRound size={10} aria-hidden="true" />}
                                {propertyRentStatusText}
                              </span>
                            </td>
                            <td className="property-ledger-money-cell" data-label="Deposit Held">
                              <strong>{formatAmount(heldDeposit, currency)}</strong>
                              <span className="property-ledger-cell-note">
                                Across {occupiedUnits} active {occupiedUnits === 1 ? "tenancy" : "tenancies"}
                              </span>
                            </td>
                            <td data-label="Maintenance & Follow-up">
                              <div className="property-ledger-maintenance">
                                {propertyOpenTickets.length > 0 || row.attention > 0 ? (
                                  <button
                                    type="button"
                                    aria-label={[
                                      propertyOpenTickets.length
                                        ? `${propertyOpenTickets.length} open maintenance ${propertyOpenTickets.length === 1 ? "ticket" : "tickets"}`
                                        : "",
                                      row.attention
                                        ? `${row.attention} follow-up ${row.attention === 1 ? "item" : "items"}`
                                        : "",
                                    ].filter(Boolean).join(" and ") + ` for ${stringValue(property.name)}`}
                                    title={[
                                      ...propertyOpenTickets.map(({ ticket }) =>
                                        stringValue(ticket.description, stringValue(ticket.category, "Maintenance request")),
                                      ),
                                      ...row.attentionItems.map((item) => `${item.title}: ${item.detail}`),
                                    ].join("; ")}
                                    className="property-ledger-alert-button"
                                    onClick={() => {
                                      if (row.attention > 0) {
                                        setPropertyAction(!isMultiUnit && primaryUnit
                                          ? {
                                              type: "manage",
                                              propertyId,
                                              unitId: primaryUnit.unitId,
                                              initialTab: "notifications",
                                            }
                                          : { type: "manage-property", propertyId, initialTab: "notifications" });
                                      } else {
                                        const firstTicket = propertyOpenTickets[0];
                                        setPropertyAction({
                                          type: "manage",
                                          propertyId,
                                          unitId: firstTicket.unit.unitId,
                                          initialTab: "repairs",
                                        });
                                      }
                                    }}
                                  >
                                    <BellRing size={14} aria-hidden="true" />
                                  </button>
                                ) : propertyUnits.length === 0 ? (
                                  <span className="property-ledger-maintenance-clear">No units yet</span>
                                ) : (
                                  <span className="property-ledger-maintenance-clear">
                                    <span className="property-maintenance-clear-dot" aria-hidden="true" />
                                    All clear
                                  </span>
                                )}
                              </div>
                            </td>
                            <td data-label="Actions">
                              <div className="property-ledger-row-actions">
                                {isMultiUnit ? (
                                  <>
                                    <button
                                      type="button"
                                      className="property-row-action-button is-secondary"
                                      disabled={!canManageCurrentRecords}
                                      onClick={() => setPropertyAction({ type: "add-unit", propertyId })}
                                    >
                                      <Plus size={13} /> Add Unit
                                    </button>
                                    <button
                                      type="button"
                                      className="property-row-action-button is-primary"
                                      aria-expanded={isExpanded}
                                      onClick={() =>
                                        setExpandedPropertyIds((current) => ({
                                          ...current,
                                          [propertyId]: !current[propertyId],
                                        }))
                                      }
                                    >
                                      {isExpanded ? "Collapse" : `View Units (${propertyUnits.length})`}
                                    </button>
                                    <button
                                      type="button"
                                      className="property-row-action-button is-secondary"
                                      onClick={() => setPropertyAction({ type: "manage-property", propertyId })}
                                    >
                                      Manage
                                    </button>
                                  </>
                                ) : primaryUnit ? (
                                  primaryUnit.activeTenancy ? (
                                    <>
                                      <button
                                        type="button"
                                        className="property-row-action-button is-primary"
                                        disabled={!canManageCurrentRecords}
                                        onClick={() => setPropertyAction({
                                          type: "rent",
                                          propertyId,
                                          unitId: primaryUnit.unitId,
                                        })}
                                      >
                                        <Receipt size={13} /> Record Rent
                                      </button>
                                      <button
                                        type="button"
                                        className="property-row-action-button is-secondary"
                                        onClick={() => setPropertyAction({
                                          type: "manage",
                                          propertyId,
                                          unitId: primaryUnit.unitId,
                                        })}
                                      >
                                        Manage
                                      </button>
                                    </>
                                  ) : primaryUnit.upcomingTenancy ? (
                                    <button
                                      type="button"
                                      className="property-row-action-button is-secondary"
                                      onClick={() => setPropertyAction({
                                        type: "manage",
                                        propertyId,
                                        unitId: primaryUnit.unitId,
                                      })}
                                    >
                                      Manage
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="property-row-action-button is-primary"
                                        disabled={!canManageCurrentRecords}
                                        onClick={() => setPropertyAction({
                                          type: "assign",
                                          propertyId,
                                          unitId: primaryUnit.unitId,
                                        })}
                                      >
                                        Assign Tenant
                                      </button>
                                      <button
                                        type="button"
                                        className="property-row-action-button is-secondary"
                                        onClick={() => setPropertyAction({
                                          type: "manage",
                                          propertyId,
                                          unitId: primaryUnit.unitId,
                                        })}
                                      >
                                        Manage
                                      </button>
                                    </>
                                  )
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="property-row-action-button is-secondary"
                                      disabled={!canManageCurrentRecords}
                                      onClick={() => setPropertyAction({ type: "add-unit", propertyId })}
                                    >
                                      <Plus size={13} /> Add Unit
                                    </button>
                                    <button
                                      type="button"
                                      className="property-row-action-button is-secondary"
                                      onClick={() => setPropertyAction({ type: "manage-property", propertyId })}
                                    >
                                      Manage
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isMultiUnit && isExpanded && visibleUnitSummaries.map((unit) => {
                            const unitStatusLabel =
                              unit.rentStatus === "NO_TENANTS"
                                ? "No active rent"
                                : rentStatusLabels[unit.rentStatus];
                            const unitAttentionItems = row.attentionItems.filter(
                              (item) => item.unitId === unit.unitId,
                            );
                            return (
                              <tr className="property-ledger-unit-row" key={`${propertyId}-${unit.unitId}`}>
                                <td className="properties-property-cell" data-label="Property / Unit">
                                  <div className="property-ledger-unit-cell">
                                    <span className="property-ledger-tree-branch" aria-hidden="true" />
                                    <span className="properties-property-info">
                                      <strong>Unit {stringValue(unit.unit.unitNumber, "—")}</strong>
                                      <small>
                                        {unit.unit.bedrooms ? `${stringValue(unit.unit.bedrooms)} bedrooms` : "Rental unit"}
                                        {unit.unit.floor ? ` · Floor ${stringValue(unit.unit.floor)}` : ""}
                                      </small>
                                    </span>
                                  </div>
                                </td>
                                <td data-label="Tenant & Lease">
                                  {unit.tenantName ? (
                                    <strong className="property-ledger-tenant-label">
                                      {unit.tenantName}
                                    </strong>
                                  ) : (
                                    <strong>{unit.upcomingTenancy ? "Upcoming tenancy" : "Vacant"}</strong>
                                  )}
                                  <span className="property-ledger-cell-note">
                                    {unit.leaseStatus
                                      ? unit.leaseStatus.replaceAll("_", " ")
                                      : unit.occupied ? "No active lease" : "Ready for tenant"}
                                    {unit.leaseEndDate ? ` · Ends ${unit.leaseEndDate.slice(0, 10)}` : ""}
                                  </span>
                                </td>
                                <td className="property-ledger-money-cell" data-label={`Rent & Balance (${currency})`}>
                                  <strong>{formatAmount(unit.rentAmount, currency)}<small> /mo</small></strong>
                                  <span className={`property-ledger-rent-status is-${unit.rentStatus.toLowerCase().replaceAll("_", "-")}`}>
                                    {unit.rentStatus === "NO_TENANTS" && <UserRound size={10} aria-hidden="true" />}
                                    {unit.balance > BigInt(0)
                                      ? `${unitStatusLabel} · ${formatAmount(unit.balance, currency)} due`
                                      : unitStatusLabel}
                                  </span>
                                </td>
                                <td className="property-ledger-money-cell" data-label="Deposit Held">
                                  <strong>{formatAmount(unit.depositHeld, currency)}</strong>
                                  <span className="property-ledger-cell-note">
                                    {unit.depositRequired > unit.depositHeld
                                      ? `Required ${formatAmount(unit.depositRequired, currency)}`
                                      : unit.depositHeld > BigInt(0) ? "Held" : "No deposit recorded"}
                                  </span>
                                </td>
                                <td data-label="Maintenance & Follow-up">
                                  <div className="property-ledger-maintenance">
                                    {unit.openMaintenance.length > 0 || unitAttentionItems.length > 0 ? (
                                      <button
                                        type="button"
                                        className="property-ledger-alert-button"
                                        aria-label={[
                                          unit.openMaintenance.length
                                            ? `${unit.openMaintenance.length} open maintenance ${unit.openMaintenance.length === 1 ? "ticket" : "tickets"}`
                                            : "",
                                          unitAttentionItems.length
                                            ? `${unitAttentionItems.length} follow-up ${unitAttentionItems.length === 1 ? "item" : "items"}`
                                            : "",
                                        ].filter(Boolean).join(" and ") + ` for Unit ${stringValue(unit.unit.unitNumber)}`}
                                        title={[
                                          ...unit.openMaintenance.map((ticket) =>
                                            stringValue(ticket.description, stringValue(ticket.category, "Maintenance request")),
                                          ),
                                          ...unitAttentionItems.map((item) => `${item.title}: ${item.detail}`),
                                        ].join("; ")}
                                        onClick={() => setPropertyAction({
                                          type: "manage",
                                          propertyId,
                                          unitId: unit.unitId,
                                          initialTab: unitAttentionItems.length ? "notifications" : "repairs",
                                        })}
                                      >
                                        <BellRing size={14} aria-hidden="true" />
                                      </button>
                                    ) : (
                                      <span className="property-ledger-maintenance-clear">
                                        <span className="property-maintenance-clear-dot" aria-hidden="true" />
                                        All clear
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td data-label="Actions">
                                  <div className="property-ledger-row-actions">
                                    {unit.activeTenancy ? (
                                      <>
                                        <button
                                          type="button"
                                          className="property-row-action-button is-primary"
                                          disabled={!canManageCurrentRecords}
                                          onClick={() => setPropertyAction({
                                            type: "rent",
                                            propertyId,
                                            unitId: unit.unitId,
                                          })}
                                        >
                                          <Receipt size={13} /> Record Rent
                                        </button>
                                        <button
                                          type="button"
                                          className="property-row-action-button is-secondary"
                                          onClick={() => setPropertyAction({
                                            type: "manage",
                                            propertyId,
                                            unitId: unit.unitId,
                                          })}
                                        >
                                          Manage
                                        </button>
                                      </>
                                    ) : unit.upcomingTenancy ? (
                                      <button
                                        type="button"
                                        className="property-row-action-button is-secondary"
                                        onClick={() => setPropertyAction({
                                          type: "manage",
                                          propertyId,
                                          unitId: unit.unitId,
                                        })}
                                      >
                                        Manage
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="property-row-action-button is-primary"
                                          disabled={!canManageCurrentRecords}
                                          onClick={() => setPropertyAction({
                                            type: "assign",
                                            propertyId,
                                            unitId: unit.unitId,
                                          })}
                                        >
                                          Assign Tenant
                                        </button>
                                        <button
                                          type="button"
                                          className="property-row-action-button is-secondary"
                                          onClick={() => setPropertyAction({
                                            type: "manage",
                                            propertyId,
                                            unitId: unit.unitId,
                                          })}
                                        >
                                          Manage
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                    {!visiblePropertyRows.length && (
                      <tr><td className="properties-empty-cell" colSpan={6}>No properties match those filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="properties-pagination">
                <span>
                  {filteredPropertyRows.length
                    ? `Showing ${(propertyPage - 1) * pageSize + 1}–${Math.min(propertyPage * pageSize, filteredPropertyRows.length)} of ${filteredPropertyRows.length} properties`
                    : "0 properties"}
                </span>
                <div>
                  <button
                    type="button"
                    aria-label="Previous properties page"
                    disabled={propertyPage <= 1}
                    onClick={() => setPropertyPage((page) => Math.max(1, page - 1))}
                  ><ChevronLeft size={16} /></button>
                  <span>Page {Math.min(propertyPage, pageCount)} of {pageCount}</span>
                  <button
                    type="button"
                    aria-label="Next properties page"
                    disabled={propertyPage >= pageCount}
                    onClick={() => setPropertyPage((page) => Math.min(pageCount, page + 1))}
                  ><ChevronRight size={16} /></button>
                </div>
              </div>
            </section>
          </div>
        )
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
        <div className={`landlord-workspace-grid${unitDetailsOnly ? " is-unit-details-only" : ""}`}>
          <section className="landlord-panel landlord-records-panel">
            <div className="landlord-panel-heading">
              <div>
                <h2>{unitDetailsOnly ? "Unit details" : section === "Rent & Deposits" ? rentMode === "charges" ? "Rent charges" : rentMode === "payments" ? "Recorded payments" : "Deposit ledgers" : section === "Tenants" && tenantMode === "tenancies" ? "Tenancies" : section}</h2>
              </div>
              <div className="landlord-records-heading-actions">
                {loading && <LoaderCircle className="landlord-spinner" size={17} />}
                {canCreateCurrentRecord && !unitDetailsOnly && (
                  <button
                    className="dashboard-primary-button landlord-add-record-button"
                    ref={addButtonRef}
                    type="button"
                    onClick={() => {
                      if (section === "Leases") {
                        setLeaseCreationOpen(true);
                      } else if (section === "Tenants" && tenantMode === "tenancies") {
                        setTenantLeaseAssignmentTenant({});
                      } else {
                        openForm();
                      }
                    }}
                  >
                    <Plus size={16} /> {formActionLabel}
                  </button>
                )}
              </div>
            </div>
            {unitDetailsOnly && section === "Units" ? (
              <div className="property-units-table-wrap">
                <table className="property-units-table">
                  <thead>
                    <tr>
                      <th scope="col">Unit name</th>
                      <th scope="col">Area</th>
                      <th scope="col">Floor</th>
                      <th scope="col">Bedrooms</th>
                      <th scope="col">Bathrooms</th>
                      <th scope="col">Price</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsFor(data, "units").map((unit) => (
                      <tr key={stringValue(unit.id)}>
                        <td>Unit {stringValue(unit.unitNumber, "—")}</td>
                        <td>{unit.sizeSqm ? `${stringValue(unit.sizeSqm)} m²` : "—"}</td>
                        <td>{stringValue(unit.floor, "—")}</td>
                        <td>{stringValue(unit.bedrooms, "—")}</td>
                        <td>{stringValue(unit.bathrooms, "—")}</td>
                        <td>{formatAmount(unit.rentAmount, currency)}</td>
                        <td className="property-unit-details-edit-cell">
                          {canManageRecords && (
                            <button
                              className="landlord-icon-button"
                              type="button"
                              aria-label={`Edit Unit ${stringValue(unit.unitNumber)}`}
                              title="Edit unit"
                              onClick={() => editRecord(unit)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!loading && rowsFor(data, "units").length === 0 && (
                      <tr><td colSpan={7}>No unit details are available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : section === "Rent & Deposits" ? (
              <RecordList
                rows={rentMode === "charges" ? charges : rentMode === "payments" ? rowsFor(data, "payments") : deposits}
                currency={currency}
                section={section}
                rentMode={rentMode}
                onReverse={(path) => void requestReversal(path)}
                onReceipt={(id) => void downloadReceipt(id)}
                onDownload={rentMode === "payments" ? (fileId) => void downloadFile(fileId) : undefined}
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
                onSignedAgreement={canManageRecords ? (row) => void downloadSignedAgreement(stringValue(row.id, "")) : undefined}
                onLeaseStatus={canManageRecords ? (row, status) => void updateLeaseStatus(row, status) : undefined}
                onResendLease={canManageRecords ? setLeaseResendSelection : undefined}
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
            {!loading && !unitDetailsOnly && rowsFor(data, section === "Tenants" && tenantMode === "tenancies" ? "tenancies" : sectionDataKey(section, rentMode)).length === 0 && (
              <p className="landlord-empty-state">No records yet. Add your first record to get started.</p>
            )}
          </section>

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
      {formOpen && (
        <div
          className={`landlord-form-modal-backdrop${isRentPaymentDialog || isPropertyEditDrawer ? " property-setup-backdrop" : ""}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <div
            className={`landlord-form-modal${isRentPaymentDialog || isPropertyEditDrawer ? " property-setup-drawer" : ""}${isPropertyEditDrawer ? " property-form-drawer" : ""}`}
            ref={formDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="landlord-form-modal-title"
            tabIndex={-1}
          >
            <div className={`landlord-form-modal-header${isPropertyEditDrawer ? " property-form-drawer-header" : ""}`}>
              <span className="landlord-form-modal-icon" aria-hidden="true"><FormIcon size={20} /></span>
              <div>
                <span className="dashboard-date">{isRentPaymentDialog ? `RENT RECORDING · STEP ${paymentReviewStep + 1} OF 2` : "PROPEASE WORKSPACE"}</span>
                <h2 id="landlord-form-modal-title">{isRentPaymentDialog ? paymentReviewStep === 0 ? "Record rent" : "Verify payment" : formTitle}</h2>
                <p>{isRentPaymentDialog ? "User Recorded · not independently verified by a bank or payment provider." : "Complete the fields below to continue."}</p>
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
            {isRentPaymentDialog && paymentReviewStep === 1 ? (
              <form className="rent-payment-review-form" onSubmit={submit}>
                <div className="rent-payment-review-content">
                  <span className="rent-user-recorded-badge"><Check size={13} /> User Recorded</span>
                  <h3>Review the rent payment</h3>
                  <dl>
                    <div><dt>Tenant</dt><dd>{stringValue([...tenants, ...createdTenants].find((tenant) => stringValue(tenant.id, "") === form.tenantId)?.legalName, "Tenant")}</dd></div>
                    <div><dt>Payment channel</dt><dd>{paymentChannelLabel}</dd></div>
                    <div><dt>Reference</dt><dd>{form.reference || "Not provided"}</dd></div>
                    <div><dt>Date received</dt><dd>{dateLabel(form.receivedAt)}</dd></div>
                    <div><dt>Amount received</dt><dd>{formatAmount(paymentReviewAmount, currency)}</dd></div>
                    <div><dt>Current open balance</dt><dd>{paymentReviewCharge ? formatAmount(paymentReviewOpenBalance, currency) : "No rent charge selected"}</dd></div>
                    <div><dt>Allocated to rent</dt><dd>{formatAmount(paymentReviewAllocation, currency)}</dd></div>
                    <div><dt>Remaining balance</dt><dd>{paymentReviewCharge ? formatAmount(paymentReviewRemaining, currency) : "—"}</dd></div>
                    <div><dt>Advance credit carried forward</dt><dd>{formatAmount(paymentReviewAdvance, currency)}</dd></div>
                  </dl>
                  <p>The receipt will be labeled “User Recorded.” Any unapplied amount remains in the ledger as advance credit; it is not represented as a verified bank settlement.</p>
                </div>
                {error && <p className="property-onboarding-error" role="alert">{error}</p>}
                <footer className="landlord-form-actions">
                  <button className="dashboard-secondary-button" type="button" onClick={() => setPaymentReviewStep(0)} disabled={saving}>Back to details</button>
                  <button className="dashboard-primary-button" type="submit" disabled={saving || !canManageCurrentRecords}>
                    {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Receipt size={15} />}
                    {saving ? "Recording…" : "Record payment"}
                  </button>
                  <button className="landlord-form-cancel-button" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
                </footer>
              </form>
            ) : (
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
                submitLabel={isRentPaymentDialog ? "Review payment" : editingId ? "Save changes" : undefined}
                onCancel={closeForm}
                helperText={isRentPaymentDialog
                  ? "Choose an open rent charge to allocate the payment. The form suggests the oldest open balance; any unallocated amount is carried forward as advance credit."
                  : section === "Leases"
                    ? "Choose a tenant first, then select one of their active or upcoming tenancies. Tenants without a current or scheduled unit assignment cannot have a lease created yet."
                    : section === "Tenants" && tenantMode === "tenancies"
                      ? availableUnitCount > 0
                        ? "Only units marked available are suggested."
                        : "There are no units currently marked available. Update a unit's availability before assigning it."
                      : section === "Utilities"
                        ? currency === "RWF"
                          ? "RWF bills are allocated in whole francs; any remainder francs are assigned one by one."
                          : "The total is allocated exactly in minor units; any remainder units are assigned one by one."
                        : undefined}
              />
            )}
          </div>
        </div>
      )}
      {section === "Properties" && propertySetupOpen && (
        <PropertySetupDrawer
          organisationId={organisationId}
          currency={currency}
          onClose={() => setPropertySetupOpen(false)}
          onComplete={(result, assignTenant) => {
            const propertyId = stringValue(result.property.id, "");
            const initialUnitId = stringValue(result.units[0]?.id, "") || null;
            setPropertySetupOpen(false);
            setRefreshKey((key) => key + 1);
            onUpdated();
            if (assignTenant && propertyId && initialUnitId) {
              setPropertySetupContext(result);
              setTenantLeaseOnboardingUnitId(initialUnitId);
              setTenantLeaseOnboardingOpen(true);
            } else {
              setSuccess("Property and rental spaces created.");
            }
          }}
        />
      )}
      {tenantLeaseOnboardingOpen && propertySetupContext && (
        <TenantLeaseOnboardingDialog
          organisationId={organisationId}
          property={propertySetupContext.property}
          units={propertySetupContext.units}
          tenancies={tenancies}
          initialUnitId={tenantLeaseOnboardingUnitId}
          currency={currency}
          onClose={() => {
            setTenantLeaseOnboardingOpen(false);
            setPropertySetupContext(null);
          }}
          onComplete={(emailSent) => {
            setTenantLeaseOnboardingOpen(false);
            setPropertySetupContext(null);
            setTenantLeaseOnboardingUnitId(null);
            setRefreshKey((key) => key + 1);
            setSuccess(emailSent
              ? "Lease offer created and review email sent."
              : "Lease offer created, but the review email could not be delivered.");
            onUpdated();
          }}
        />
      )}
      {tenantLeaseAssignmentTenant && (
        <TenantLeaseAssignmentDialog
          organisationId={organisationId}
          tenant={tenantLeaseAssignmentTenant}
          properties={properties}
          tenants={tenants}
          units={units}
          tenancies={tenancies}
          currency={currency}
          onClose={() => setTenantLeaseAssignmentTenant(null)}
          onComplete={(emailSent) => {
            setTenantLeaseAssignmentTenant(null);
            setRefreshKey((key) => key + 1);
            setSuccess(emailSent
              ? "Lease offer created and review email sent."
              : "Lease offer created, but the review email could not be delivered.");
            onUpdated();
          }}
        />
      )}
      {leaseCreationOpen && (
        <TenantLeaseExistingTenancyDialog
          organisationId={organisationId}
          tenancies={tenancies}
          units={units}
          currency={currency}
          onClose={() => setLeaseCreationOpen(false)}
          onComplete={(emailSent) => {
            setLeaseCreationOpen(false);
            setRefreshKey((key) => key + 1);
            setSuccess(emailSent
              ? "Lease offer created and review email sent."
              : "Lease offer created, but the review email could not be delivered.");
            onUpdated();
          }}
        />
      )}
      {propertyAction?.type === "assign" && actionProperty && (
        <TenantLeaseOnboardingDialog
          organisationId={organisationId}
          property={actionProperty}
          units={units.filter((unit) => propertyIdFrom(unit) === propertyAction.propertyId)}
          tenancies={tenancies}
          initialUnitId={propertyAction.unitId}
          fixedUnitId={propertyAction.unitId}
          currency={currency}
          onClose={() => setPropertyAction(null)}
          onComplete={(emailSent) => {
            setPropertyAction(null);
            setRefreshKey((key) => key + 1);
            setSuccess(emailSent
              ? "Lease offer created and review email sent."
              : "Lease offer created, but the review email could not be delivered.");
            onUpdated();
          }}
        />
      )}
      {leaseResendSelection && (
        <TenantLeaseResendDialog
          organisationId={organisationId}
          lease={leaseResendSelection}
          tenant={tenants.find(
            (tenant) => stringValue(tenant.id, "") === stringValue(nested(leaseResendSelection, "tenancy", "tenant", "id"), ""),
          ) ?? {}}
          tenancy={tenancies.find(
            (tenancy) => stringValue(tenancy.id, "") === stringValue(nested(leaseResendSelection, "tenancy", "id"), ""),
          ) ?? {}}
          deposit={deposits.find(
            (deposit) => stringValue(nested(deposit, "tenancy", "id"), "") === stringValue(nested(leaseResendSelection, "tenancy", "id"), ""),
          ) ?? {}}
          currency={currency}
          onClose={() => setLeaseResendSelection(null)}
          onComplete={(emailSent) => {
            setLeaseResendSelection(null);
            setSuccess(emailSent
              ? "Updated lease offer sent to the tenant."
              : "Lease offer updated, but the review email could not be delivered.");
            setRefreshKey((key) => key + 1);
            onUpdated();
          }}
        />
      )}
      {propertyAction && actionProperty && propertyAction.type !== "assign" && (
        <PropertyActionDrawer
          key={`${propertyAction.type}-${propertyAction.propertyId}-${"unitId" in propertyAction ? propertyAction.unitId : ""}-${propertyAction.type === "manage" || propertyAction.type === "manage-property" ? propertyAction.initialTab ?? "overview" : ""}`}
          action={propertyAction}
          property={actionProperty}
          unit={actionUnit}
          details={actionUnitDetails}
          attentionItems={actionAttentionItems}
          attentionReadError={attentionReadError}
          data={data}
          base={base}
          currency={currency}
          onUploadFile={uploadFile}
          onOpenFile={(fileId) => void downloadFile(fileId)}
          onClose={() => setPropertyAction(null)}
          onRecordRent={() => {
            if (!("unitId" in propertyAction)) return;
            setPropertyAction({
              type: "rent",
              propertyId: propertyAction.propertyId,
              unitId: propertyAction.unitId,
            });
          }}
          onAssignTenant={() => {
            if (!("unitId" in propertyAction)) return;
            setPropertyAction({
              type: "assign",
              propertyId: propertyAction.propertyId,
              unitId: propertyAction.unitId,
            });
          }}
          onRequestTermination={(lease) => void requestLeaseTermination(lease)}
          canEdit={canManageCurrentRecords}
          onEditProperty={() => {
            setPropertyAction(null);
            editRecord(actionProperty);
          }}
          onAttentionOpen={(item) => {
            markAttentionRead(item.id);
            const nextTab: PropertyActionTab =
              item.section === "Maintenance" || item.section === "Inspections"
                ? "repairs"
                : item.section === "Rent & Deposits"
                  ? "ledger"
                  : "overview";
            setPropertyAction(item.unitId
              ? {
                  type: "manage",
                  propertyId: propertyAction.propertyId,
                  unitId: item.unitId,
                  initialTab: nextTab,
                }
              : {
                  type: "manage-property",
                  propertyId: propertyAction.propertyId,
                  initialTab: "overview",
                });
          }}
          onRefresh={() => {
            setRefreshKey((key) => key + 1);
            onUpdated();
          }}
          onTicketCompleted={(ticket) => {
            setData((current) => ({
              ...current,
              requests: rowsFor(current, "requests").map((request) =>
                stringValue(request.id, "") === stringValue(ticket.id, "")
                  ? { ...request, ...ticket, status: "COMPLETED" }
                  : request,
              ),
            }));
            setRefreshKey((key) => key + 1);
            onUpdated();
          }}
          onComplete={(message, paymentId) => {
            setPropertyAction(null);
            setSuccess(message);
            setRefreshKey((key) => key + 1);
            onUpdated();
            if (paymentId) void downloadReceipt(paymentId);
          }}
        />
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

type UnitBatchDraft = {
  unitNumber: string;
  floor: string;
  rentAmount: string;
  depositAmount: string;
  bedrooms: string;
  bathrooms: string;
};

function PropertyNotificationPanel({
  items,
  readError,
  scope,
  onOpen,
}: {
  items: PropertyAttentionItem[];
  readError: string | null;
  scope: "property" | "unit";
  onOpen: (item: PropertyAttentionItem) => void;
}) {
  return (
    <section className="property-action-review-panel" aria-label={`${scope} notifications`}>
      <h3>Notifications ({items.length})</h3>
      {readError && <p className="property-action-empty" role="alert">{readError}</p>}
      {items.length ? items.map((item) => (
        <button
          type="button"
          className="property-action-review-card"
          key={item.id}
          onClick={() => onOpen(item)}
        >
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
          <small>Open {item.section} · Mark as read</small>
        </button>
      )) : !readError && (
        <p className="property-action-empty">No unread notifications for this {scope}.</p>
      )}
    </section>
  );
}

function PropertyActionDrawer({
  action,
  property,
  unit,
  details,
  attentionItems,
  attentionReadError,
  data,
  base,
  currency,
  onUploadFile,
  onOpenFile,
  onClose,
  onRecordRent,
  onAssignTenant,
  onRequestTermination,
  canEdit,
  onEditProperty,
  onAttentionOpen,
  onRefresh,
  onTicketCompleted,
  onComplete,
}: {
  action: PropertyActionState;
  property: ValueRecord;
  unit: ValueRecord | null;
  details: UnitLedgerDetails | null;
  attentionItems: PropertyAttentionItem[];
  attentionReadError: string | null;
  data: ValueRecord;
  base: string;
  currency: string;
  onUploadFile: (file: File) => Promise<string>;
  onOpenFile: (fileId: string) => void;
  onClose: () => void;
  onRecordRent: () => void;
  onAssignTenant: () => void;
  onRequestTermination: (lease: ValueRecord) => void;
  canEdit: boolean;
  onEditProperty: () => void;
  onAttentionOpen: (item: PropertyAttentionItem) => void;
  onRefresh: () => void;
  onTicketCompleted: (ticket: ValueRecord) => void;
  onComplete: (message: string, paymentId?: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const propertyUnits = rowsFor(data, "units").filter(
    (row) => propertyIdFrom(row) === action.propertyId,
  );
  const templateUnit = propertyUnits[0];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PropertyActionTab>(
    action.type === "manage" || action.type === "manage-property"
      ? action.initialTab ?? "overview"
      : "overview",
  );
  const [rentStep, setRentStep] = useState<0 | 1>(0);
  const [selectedRentTenancyId, setSelectedRentTenancyId] = useState(() =>
    stringValue(details?.activeTenancy?.id, ""),
  );
  const [unitRows, setUnitRows] = useState<UnitBatchDraft[]>(() => [{
    unitNumber: "",
    floor: "",
    rentAmount: String(templateUnit?.rentAmount ?? ""),
    depositAmount: String(templateUnit?.depositAmount ?? "0"),
    bedrooms: "",
    bathrooms: "",
  }]);
  const [rentForm, setRentForm] = useState(() => ({
    amount: details ? minorUnitsInput(details.balance, currency) : "",
    method: "MTN_MOMO",
    reference: "",
    note: `${new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date())} Rent`,
    receivedAt: today,
  }));
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadedProofFileId, setUploadedProofFileId] = useState<string | null>(null);
  const proofFileInputRef = useRef<HTMLInputElement>(null);
  const [reversalPaymentId, setReversalPaymentId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("all");
  const [ledgerFromDate, setLedgerFromDate] = useState("");
  const [ledgerToDate, setLedgerToDate] = useState("");
  const [repairSavingId, setRepairSavingId] = useState<string | null>(null);
  const [unitEditOpen, setUnitEditOpen] = useState(false);
  const [unitEditSaving, setUnitEditSaving] = useState(false);
  const [unitEditError, setUnitEditError] = useState<string | null>(null);
  const [unitEditForm, setUnitEditForm] = useState(() => ({
    unitNumber: stringValue(unit?.unitNumber, ""),
    floor: stringValue(unit?.floor, ""),
    bedrooms: stringValue(unit?.bedrooms, ""),
    bathrooms: stringValue(unit?.bathrooms, ""),
    sizeSqm: stringValue(unit?.sizeSqm, ""),
    rentAmount: stringValue(unit?.rentAmount, ""),
    depositAmount: stringValue(unit?.depositAmount, "0"),
    utilityArrangement: stringValue(unit?.utilityArrangement, ""),
  }));
  const isHouse = stringValue(property.type, "").toUpperCase() === "HOUSE";
  const isCommercial = stringValue(property.type, "").toUpperCase() === "COMMERCIAL";
  const hasLease = Boolean(details?.activeTenancy || details?.upcomingTenancy);

  async function viewLeaseAgreement(leaseId: string) {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setError("Allow pop-ups to view the lease agreement PDF.");
      return;
    }

    setError(null);
    try {
      const request = () =>
        fetch(`${apiBaseUrl}${base}/leases/${leaseId}/agreement`, {
          credentials: "include",
        });
      let response = await request();
      if (response.status === 401 && await refreshSession()) {
        response = await request();
      }
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as ApiError | undefined;
        const message = Array.isArray(body?.message)
          ? body.message.join(". ")
          : body?.message;
        throw new Error(message || `The lease agreement could not be opened (${response.status}).`);
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (requestError) {
      previewWindow.close();
      setError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Check the API connection and try again."
          : requestError instanceof Error
            ? requestError.message
            : "The lease agreement could not be opened.",
      );
    }
  }

  async function saveUnitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unit || !canEdit || unitEditSaving) return;

    const bedrooms = Number(unitEditForm.bedrooms);
    const bathrooms = Number(unitEditForm.bathrooms);
    const sizeSqm = Number(unitEditForm.sizeSqm);
    const rentAmount = Number(unitEditForm.rentAmount);
    const depositAmount = Number(unitEditForm.depositAmount);
    const hasResidentialDetails = !isCommercial;
    if (!isHouse && !unitEditForm.unitNumber.trim()) {
      setUnitEditError("Enter a unit number or name.");
      return;
    }
    if (
      hasResidentialDetails &&
      ((isHouse && (!unitEditForm.bedrooms || !unitEditForm.bathrooms || !unitEditForm.sizeSqm)) ||
        (unitEditForm.bedrooms && (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 100)) ||
        (unitEditForm.bathrooms && (!Number.isInteger(bathrooms) || bathrooms < 0 || bathrooms > 100)))
    ) {
      setUnitEditError("Enter valid bedroom and bathroom counts (0–100); all three home details are required for a house.");
      return;
    }
    if (unitEditForm.sizeSqm && (!Number.isFinite(sizeSqm) || sizeSqm <= 0)) {
      setUnitEditError("Enter a positive area.");
      return;
    }
    if (!hasLease && (!Number.isFinite(rentAmount) || rentAmount <= 0)) {
      setUnitEditError("Enter a positive monthly asking rent.");
      return;
    }
    if (!hasLease && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
      setUnitEditError("Enter a deposit of zero or more.");
      return;
    }
    if (
      !hasLease &&
      currency === "RWF" &&
      (!Number.isInteger(rentAmount) || !Number.isInteger(depositAmount))
    ) {
      setUnitEditError("RWF rent and deposit must be entered as whole francs.");
      return;
    }

    const input: Record<string, string | number> = {
      utilityArrangement: unitEditForm.utilityArrangement.trim(),
    };
    if (!isHouse) {
      input.unitNumber = unitEditForm.unitNumber.trim();
      input.floor = unitEditForm.floor.trim();
    }
    if (hasResidentialDetails) {
      if (unitEditForm.bedrooms) input.bedrooms = bedrooms;
      if (unitEditForm.bathrooms) input.bathrooms = bathrooms;
    }
    if (unitEditForm.sizeSqm) input.sizeSqm = unitEditForm.sizeSqm;
    if (!hasLease) {
      input.rentAmount = unitEditForm.rentAmount;
      input.depositAmount = unitEditForm.depositAmount;
    }

    setUnitEditSaving(true);
    setUnitEditError(null);
    try {
      await apiRequest(`${base}/units/${stringValue(unit.id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setUnitEditOpen(false);
      onRefresh();
    } catch (requestError) {
      setUnitEditError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Check the API connection and try again."
          : requestError instanceof Error
            ? requestError.message
            : "Unit details could not be updated.",
      );
    } finally {
      setUnitEditSaving(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !unitEditSaving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving, unitEditSaving]);

  const tenancy = details?.tenancy ?? null;
  const rentTenancies = rowsFor(data, "tenancies").filter(
    (row) =>
      row.status === "ACTIVE" &&
      (action.type !== "rent" || stringValue(nested(row, "unit", "id"), "") === action.unitId),
  );
  if (
    details?.activeTenancy &&
    !rentTenancies.some((row) => stringValue(row.id, "") === stringValue(details.activeTenancy?.id, ""))
  ) {
    rentTenancies.unshift(details.activeTenancy);
  }
  const rentTenancy =
    rentTenancies.find((row) => stringValue(row.id, "") === selectedRentTenancyId) ??
    details?.activeTenancy ??
    null;
  const tenancyId = action.type === "rent"
    ? stringValue(rentTenancy?.id, "")
    : stringValue(tenancy?.id, "");
  const unitId = stringValue(unit?.id, "");
  const unitTenancyIds = new Set(
    rowsFor(data, "tenancies")
      .filter((row) => stringValue(nested(row, "unit", "id"), "") === unitId)
      .map((row) => stringValue(row.id, ""))
      .filter(Boolean),
  );
  for (const relatedTenancy of [tenancy, details?.activeTenancy, details?.upcomingTenancy]) {
    const relatedTenancyId = stringValue(relatedTenancy?.id, "");
    if (relatedTenancyId) unitTenancyIds.add(relatedTenancyId);
  }
  const currentTenant = details?.tenantName || stringValue(nested(tenancy ?? {}, "tenant", "legalName"), "");
  const unitPropertyType = stringValue(property.type, "Rental unit")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const unitBedroomCount = stringValue(unit?.bedrooms, "");
  const unitBathroomCount = stringValue(unit?.bathrooms, "");
  const unitArea = stringValue(unit?.sizeSqm, "");
  const unitOccupancyStatus = details?.activeTenancy
    ? "Occupied"
    : details?.upcomingTenancy
      ? "Upcoming"
      : "Vacant";
  const unitHeaderSubtitle = [
    stringValue(property.address, ""),
    [
      unitBedroomCount && unitBedroomCount !== "0" ? `${unitBedroomCount}BR` : "",
      unitPropertyType,
      unitBathroomCount && unitBathroomCount !== "0" ? `${unitBathroomCount} bath` : "",
      unitArea ? `${unitArea} m²` : "",
    ].filter(Boolean).join(" · "),
  ].filter(Boolean).join(" · ");
  const rentTenantName = stringValue(nested(rentTenancy ?? {}, "tenant", "legalName"), currentTenant);
  const rentPropertyName = stringValue(
    nested(rentTenancy ?? {}, "property", "name") ??
      nested(rentTenancy ?? {}, "unit", "property", "name"),
    stringValue(property.name),
  );
  const rentUnitName = stringValue(nested(rentTenancy ?? {}, "unit", "unitNumber"), stringValue(unit?.unitNumber, "Rental space"));
  const rentMonthlyRate = nested(rentTenancy ?? {}, "leases", "0", "rentAmount") ??
    (rentTenancy && stringValue(rentTenancy.id, "") === stringValue(details?.activeTenancy?.id, "")
      ? details?.rentAmount
      : nested(rentTenancy ?? {}, "unit", "rentAmount"));
  const allCharges = tenancyId
    ? rowsFor(data, "charges").filter(
        (row) =>
          stringValue(nested(row, "tenancy", "id"), "") === tenancyId &&
          row.status !== "VOID",
      )
    : [];
  const unitLedgerCharges = rowsFor(data, "charges").filter(
    (row) =>
      unitTenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")) &&
      row.status !== "VOID",
  );
  const unitOpenBalance = unitLedgerCharges.reduce(
    (total, charge) => {
      const balance = amountMinorUnits(charge.balance);
      return total + (balance > BigInt(0) ? balance : BigInt(0));
    },
    BigInt(0),
  );
  const openCharges = allCharges
    .filter((row) => amountMinorUnits(row.balance) > BigInt(0))
    .sort((left, right) =>
      stringValue(left.dueDate, "").localeCompare(stringValue(right.dueDate, "")) ||
      stringValue(left.period, "").localeCompare(stringValue(right.period, "")),
    );
  const totalOpenBalance = openCharges.reduce(
    (sum, row) => sum + amountMinorUnits(row.balance),
    BigInt(0),
  );
  const receivedAmount = tryAmountMinorUnits(rentForm.amount);
  const rentAllocations = receivedAmount === null ? [] : allocateRent(openCharges, receivedAmount, currency);
  const allocatedAmount = rentAllocations.reduce(
    (sum, allocation) => sum + amountMinorUnits(allocation.amount),
    BigInt(0),
  );
  const balanceAfterPayment = totalOpenBalance > allocatedAmount
    ? totalOpenBalance - allocatedAmount
    : BigInt(0);
  const advanceCredit = receivedAmount !== null && receivedAmount > allocatedAmount
    ? receivedAmount - allocatedAmount
    : BigInt(0);
  const unitLeases = rowsFor(data, "leases")
    .filter((row) => unitTenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")))
    .sort((left, right) =>
      stringValue(right.startDate, "").localeCompare(stringValue(left.startDate, "")),
    );
  const unitDeposits = rowsFor(data, "deposits").filter(
    (row) => unitTenancyIds.has(stringValue(nested(row, "tenancy", "id"), "")),
  );
  const unitPayments = rowsFor(data, "payments").filter((row) => {
    const directTenancyId = stringValue(nested(row, "tenancy", "id"), "");
    return (
      (directTenancyId && unitTenancyIds.has(directTenancyId)) ||
      rowsFor(row, "allocations").some((allocation) => {
        const allocationTenancyId = stringValue(
          nested(allocation, "rentCharge", "tenancy", "id"),
          "",
        );
        return allocationTenancyId !== "" && unitTenancyIds.has(allocationTenancyId);
      })
    );
  });
  const currentUnitDeposit = unitDeposits.find(
    (deposit) => stringValue(nested(deposit, "tenancy", "id"), "") === tenancyId,
  );
  const totalUnitDepositHeld = unitDeposits.length
    ? unitDeposits.reduce((total, deposit) => total + amountMinorUnits(deposit.heldBalance), BigInt(0))
    : details?.depositHeld;
  const ledgerHistory: Array<{
    id: string;
    kind: "payment" | "charge" | "deposit";
    date: string;
    title: string;
    details: string;
    amount: unknown;
    record: ValueRecord;
  }> = [
    ...unitPayments.map((payment) => {
      const periods = rowsFor(payment, "allocations")
        .map((allocation) => stringValue(nested(allocation, "rentCharge", "period"), ""))
        .filter(Boolean);
      const title = periods.length
        ? `${rentPeriodLabel(periods[0])} Rent`
        : stringValue(payment.note, "Rent payment");
      const details = [
        stringValue(payment.receivedAt, "").slice(0, 10),
        stringValue(payment.method, "").replaceAll("_", " "),
        stringValue(payment.reference, "MANUAL-ENTRY"),
      ].filter(Boolean).join(" · ");
      return {
        id: `payment-${stringValue(payment.id, "")}`,
        kind: "payment" as const,
        date: stringValue(payment.receivedAt, "").slice(0, 10),
        title,
        details,
        amount: payment.amount,
        record: payment,
      };
    }),
    ...unitLedgerCharges.map((charge) => ({
      id: `charge-${stringValue(charge.id, "")}`,
      kind: "charge" as const,
      date: stringValue(charge.dueDate, "").slice(0, 10),
      title: `${rentPeriodLabel(charge.period)} Rent Charge`,
      details: `Due ${dateLabel(charge.dueDate)} · ${stringValue(charge.status, "").replaceAll("_", " ")} · Balance ${formatAmount(charge.balance, currency)}`,
      amount: charge.amount,
      record: charge,
    })),
    ...unitDeposits.flatMap((deposit) =>
      rowsFor(deposit, "transactions").map((transaction) => {
        const type = stringValue(transaction.type, "ADJUSTMENT");
        const title = type === "RECEIPT"
          ? "Deposit received"
          : type === "REFUND"
            ? "Deposit refunded"
            : type === "DEDUCTION"
              ? "Deposit deduction"
              : "Deposit adjustment";
        const reason = stringValue(transaction.reason, "");
        return {
          id: `deposit-${stringValue(transaction.id, "")}`,
          kind: "deposit" as const,
          date: stringValue(transaction.date, "").slice(0, 10),
          title,
          details: [dateLabel(transaction.date), reason].filter(Boolean).join(" · "),
          amount: transaction.amount,
          record: transaction,
        };
      }),
    ),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const filteredLedgerHistory = ledgerHistory.filter((entry) => {
    const searchText = `${entry.title} ${entry.details} ${formatAmount(entry.amount, currency)}`.toLowerCase();
    const entryDate = entry.date.slice(0, 10);
    return (
      (ledgerTypeFilter === "all" || entry.kind === ledgerTypeFilter) &&
      (!ledgerFromDate || entryDate >= ledgerFromDate) &&
      (!ledgerToDate || entryDate <= ledgerToDate) &&
      (!ledgerSearch.trim() || searchText.includes(ledgerSearch.trim().toLowerCase()))
    );
  });
  const unitRepairs = rowsFor(data, "requests").filter(
    (row) => stringValue(nested(row, "unit", "id"), "") === unitId,
  );
  const unitInspections = rowsFor(data, "inspections").filter(
    (row) => stringValue(nested(row, "unit", "id"), "") === unitId,
  );
  function selectRentTenancy(value: string) {
    setSelectedRentTenancyId(value);
    const balance = rowsFor(data, "charges")
      .filter(
        (charge) =>
          stringValue(nested(charge, "tenancy", "id"), "") === value &&
          charge.status !== "VOID" &&
          amountMinorUnits(charge.balance) > BigInt(0),
      )
      .reduce((sum, charge) => sum + amountMinorUnits(charge.balance), BigInt(0));
    setRentForm((current) => ({
      ...current,
      amount: minorUnitsInput(balance, currency),
    }));
  }

  function updateUnitField(index: number, name: keyof UnitBatchDraft, value: string) {
    setUnitRows((current) =>
      current.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value } : row),
    );
  }

  function selectPaymentProof(file: File | null) {
    setError(null);
    if (file && file.size > 20 * 1024 * 1024) {
      setError("Payment proof must be 20 MB or smaller.");
      return;
    }
    if (
      file &&
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setError("Attach a PDF, JPEG, PNG, or WebP receipt or screenshot.");
      return;
    }
    setProofFile(file);
    setUploadedProofFileId(null);
    if (proofFileInputRef.current) proofFileInputRef.current.value = "";
  }

  async function submitBatchUnits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const units = unitRows.map((row, index) => {
        if (!row.unitNumber.trim() || !row.rentAmount.trim() || !row.depositAmount.trim()) {
          throw new Error(`Complete the unit number, rent and deposit for Unit ${index + 1}.`);
        }
        return {
          unitNumber: row.unitNumber.trim(),
          rentAmount: row.rentAmount.trim(),
          depositAmount: row.depositAmount.trim(),
          ...(row.floor.trim() ? { floor: row.floor.trim() } : {}),
          ...(row.bedrooms ? { bedrooms: Number(row.bedrooms) } : {}),
          ...(row.bathrooms ? { bathrooms: Number(row.bathrooms) } : {}),
        };
      });
      await apiRequest(`${base}/properties/${action.propertyId}/units/batch`, {
        method: "POST",
        body: JSON.stringify({ units }),
      });
      onComplete(`${units.length} ${units.length === 1 ? "unit" : "units"} added to ${stringValue(property.name)}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Units could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rentStep === 0) {
      if (
        receivedAmount === null ||
        receivedAmount <= BigInt(0) ||
        !rentForm.method ||
        !rentForm.receivedAt
      ) {
        setError("Enter a positive amount, payment channel and received date.");
        return;
      }
      if (currency === "RWF" && receivedAmount % BigInt(100) !== BigInt(0)) {
        setError("RWF payments must be entered as whole francs.");
        return;
      }
      setError(null);
      setRentStep(1);
      return;
    }
    if (receivedAmount === null || !rentTenancy) {
      setError("An active tenancy and a valid payment amount are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const proofFileId = proofFile
        ? uploadedProofFileId ?? await onUploadFile(proofFile)
        : undefined;
      if (proofFileId) setUploadedProofFileId(proofFileId);
      const result = await apiRequest<{ payment: { id: string } }>(`${base}/rent/payments`, {
        method: "POST",
        body: JSON.stringify({
          tenantId: stringValue(nested(rentTenancy, "tenant", "id"), ""),
          tenancyId: stringValue(rentTenancy.id, ""),
          allocationStrategy: "FIFO",
          amount: rentForm.amount,
          method: rentForm.method,
          ...(rentForm.reference.trim() ? { reference: rentForm.reference.trim() } : {}),
          ...(rentForm.note.trim() ? { note: rentForm.note.trim() } : {}),
          receivedAt: `${rentForm.receivedAt}T00:00:00.000Z`,
          allocations: rentAllocations,
          ...(proofFileId ? { proofFileId } : {}),
        }),
      });
      onComplete("Rent payment recorded and tagged User Recorded.", result.payment.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Payment could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function reversePayment(paymentId: string) {
    if (!reversalReason.trim()) {
      setError("Enter a reason to create an audit-safe payment reversal.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`${base}/rent/payments/${paymentId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      setReversalPaymentId(null);
      setReversalReason("");
      onRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Payment could not be reversed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteTicket(requestId: string) {
    setRepairSavingId(requestId);
    setError(null);
    try {
      const result = await apiRequest<{ request: ValueRecord }>(`${base}/maintenance/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      onTicketCompleted(result.request ?? { id: requestId, status: "COMPLETED" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Repair could not be completed.");
    } finally {
      setRepairSavingId(null);
    }
  }

  const title = action.type === "add-unit"
    ? "Add units"
    : action.type === "manage-property"
      ? "Manage property"
    : action.type === "assign"
      ? "Assign tenant"
      : action.type === "rent"
        ? "Record Rent Payment"
        : "Manage unit";
  const subtitle = action.type === "rent"
    ? "User Recorded · not independently verified by a bank or payment provider."
    : `${stringValue(property.name)}${unit ? ` · Unit ${stringValue(unit.unitNumber)}` : ""}`;

  return (
    <div
      className="landlord-form-modal-backdrop property-setup-backdrop property-create-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !unitEditSaving) onClose();
      }}
    >
      <section
        className={`landlord-form-modal property-setup-drawer property-action-drawer${action.type === "rent" ? " rent-payment-drawer" : action.type === "manage" ? " unit-manage-drawer" : action.type === "manage-property" ? " property-manage-drawer" : " property-form-drawer"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-action-drawer-title"
      >
        {action.type === "rent" ? (
          <>
            <div className="rent-payment-header">
              <div>
                <h2 id="property-action-drawer-title">
                  Record Rent Payment
                  <span className="rent-payment-user-recorded">User Recorded</span>
                </h2>
                <p>Step {rentStep + 1} of 2 · Manual payment entry &amp; automatic {currency} allocation</p>
              </div>
              <button
                className="rent-payment-close"
                type="button"
                aria-label="Close drawer"
                onClick={onClose}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </div>
            <ol className="rent-payment-steps" aria-label="Payment steps">
              <li className={rentStep === 0 ? "is-current" : "is-complete"} aria-current={rentStep === 0 ? "step" : undefined}>
                <span>1.</span> Payment Details
              </li>
              <ChevronRight size={14} aria-hidden="true" />
              <li className={rentStep === 1 ? "is-current" : ""} aria-current={rentStep === 1 ? "step" : undefined}>
                <span>2.</span> Verify Allocation &amp; Receipt
              </li>
            </ol>
          </>
        ) : action.type === "manage-property" ? (
          <div className="property-manage-header">
            <div className="property-manage-heading">
              <h2 id="property-action-drawer-title">
                {stringValue(property.name, "Property")}
                <span>{unitPropertyType}</span>
                <span className={`property-manage-status is-${stringValue(property.status, "ACTIVE").toLowerCase()}`}>
                  <i aria-hidden="true" />
                  {stringValue(property.status, "ACTIVE").replaceAll("_", " ")}
                </span>
              </h2>
              <p>
                {stringValue(property.address, "Location not provided")}
                {" · "}
                {propertyUnits.filter((row) => row.status !== "ARCHIVED").length} rental units
              </p>
            </div>
            <div className="unit-manage-header-actions">
              <button
                type="button"
                className={`unit-manage-notifications${tab === "notifications" ? " is-active" : ""}`}
                aria-label={`Notifications${attentionItems.length ? ` (${attentionItems.length})` : ""}`}
                aria-pressed={tab === "notifications"}
                onClick={() => setTab(tab === "notifications" ? "overview" : "notifications")}
              >
                <BellRing size={16} />
                {attentionItems.length > 0 && <span>{attentionItems.length}</span>}
              </button>
              <button
                className="unit-manage-close"
                type="button"
                aria-label="Close drawer"
                onClick={onClose}
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        ) : action.type === "manage" && unit ? (
          <div className="unit-manage-header">
            <div className="unit-manage-heading">
              <h2 id="property-action-drawer-title">
                Unit {stringValue(unit.unitNumber, "Rental space")}
                <span>{stringValue(property.name, "Property")}</span>
                <span className={`unit-manage-status is-${unitOccupancyStatus.toLowerCase()}`}>
                  <i aria-hidden="true" />
                  {unitOccupancyStatus} unit
                </span>
              </h2>
              <p>{unitHeaderSubtitle}</p>
            </div>
            <div className="unit-manage-header-actions">
              {tab !== "ledger" && (
                <button
                  type="button"
                  className={`unit-manage-notifications${tab === "notifications" ? " is-active" : ""}`}
                  aria-label={`Notifications${attentionItems.length ? ` (${attentionItems.length})` : ""}`}
                  aria-pressed={tab === "notifications"}
                  onClick={() => setTab(tab === "notifications" ? "overview" : "notifications")}
                >
                  <BellRing size={17} />
                  {attentionItems.length > 0 && <span>{attentionItems.length}</span>}
                </button>
              )}
              <button
                className="unit-manage-close"
                type="button"
                aria-label="Close drawer"
                onClick={onClose}
                disabled={saving || unitEditSaving}
              >
                <X size={19} />
              </button>
            </div>
          </div>
        ) : (
        <div className="rent-payment-header property-action-drawer-header">
          <div>
            <h2 id="property-action-drawer-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="rent-payment-close" type="button" aria-label="Close drawer" onClick={onClose} disabled={saving || unitEditSaving}>
            <X size={19} />
          </button>
        </div>
        )}

        {action.type === "add-unit" && (
          <form className="property-action-form" onSubmit={(event) => void submitBatchUnits(event)}>
            <div className="property-setup-content">
              <p className="property-setup-intro">The parent building is locked. Add one or more units; the full batch is created together.</p>
              <div className="property-setup-unit-list">
                {unitRows.map((row, index) => (
                  <fieldset className="property-setup-unit" key={`new-unit-${index}`}>
                    <legend>Unit {index + 1}</legend>
                    <div className="landlord-form-grid">
                      <label className="landlord-field"><span>Unit name / number</span><input required value={row.unitNumber} onChange={(event) => updateUnitField(index, "unitNumber", event.target.value)} placeholder="e.g. Unit B3" /></label>
                      <label className="landlord-field"><span>Floor</span><input value={row.floor} onChange={(event) => updateUnitField(index, "floor", event.target.value)} placeholder="Optional" /></label>
                      <label className="landlord-field"><span>Monthly rent ({currency})</span><input required inputMode="decimal" step={currency === "RWF" ? "1" : "0.01"} value={row.rentAmount} onChange={(event) => updateUnitField(index, "rentAmount", event.target.value)} /></label>
                      <label className="landlord-field"><span>Security deposit ({currency})</span><input required inputMode="decimal" step={currency === "RWF" ? "1" : "0.01"} value={row.depositAmount} onChange={(event) => updateUnitField(index, "depositAmount", event.target.value)} /></label>
                      <label className="landlord-field"><span>Bedrooms</span><input type="number" min="0" max="100" value={row.bedrooms} onChange={(event) => updateUnitField(index, "bedrooms", event.target.value)} /></label>
                      <label className="landlord-field"><span>Bathrooms</span><input type="number" min="0" max="100" value={row.bathrooms} onChange={(event) => updateUnitField(index, "bathrooms", event.target.value)} /></label>
                    </div>
                    {unitRows.length > 1 && <button className="property-setup-remove-unit" type="button" onClick={() => setUnitRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={13} /> Remove unit</button>}
                  </fieldset>
                ))}
              </div>
              <button
                className="property-setup-add-unit"
                type="button"
                onClick={() => setUnitRows((rows) => [...rows, {
                  unitNumber: "",
                  floor: "",
                  rentAmount: String(templateUnit?.rentAmount ?? ""),
                  depositAmount: String(templateUnit?.depositAmount ?? "0"),
                  bedrooms: "",
                  bathrooms: "",
                }])}
              >
                <Plus size={14} /> Add another unit
              </button>
            </div>
            {error && <p className="property-onboarding-error" role="alert">{error}</p>}
            <footer className="landlord-form-actions">
              <button className="landlord-form-cancel-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="dashboard-primary-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add units"}</button>
            </footer>
          </form>
        )}

        {action.type === "rent" && details && (
          <form className="property-action-form rent-payment-form" onSubmit={(event) => void submitRent(event)}>
            {rentStep === 0 ? (
              <div className="property-setup-content rent-payment-step-content">
                {!rentTenancies.length && (
                  <p className="rent-payment-no-tenancy" role="status">
                    This unit has no active tenancy. You can review the rent form, but a tenant must be assigned before a payment can be recorded.
                  </p>
                )}
                <label className="rent-payment-field">
                  <span>Property / Unit &amp; Tenant</span>
                  <span className="rent-payment-select-wrap">
                    <select
                      aria-label="Property, unit and tenant"
                      value={stringValue(rentTenancy?.id, "")}
                      disabled={!rentTenancies.length || saving}
                      onChange={(event) => selectRentTenancy(event.target.value)}
                    >
                      {!rentTenancies.length && <option value="">No active tenancy</option>}
                      {rentTenancies.map((option) => {
                        const optionId = stringValue(option.id, "");
                        const optionBalance = rowsFor(data, "charges")
                          .filter(
                            (charge) =>
                              stringValue(nested(charge, "tenancy", "id"), "") === optionId &&
                              charge.status !== "VOID" &&
                              amountMinorUnits(charge.balance) > BigInt(0),
                          )
                          .reduce((sum, charge) => sum + amountMinorUnits(charge.balance), BigInt(0));
                        const optionProperty = stringValue(
                          nested(option, "property", "name") ??
                            nested(option, "unit", "property", "name"),
                          "Property",
                        );
                        const optionUnit = stringValue(nested(option, "unit", "unitNumber"), "Rental space");
                        const optionTenant = stringValue(nested(option, "tenant", "legalName"), "Tenant");
                        return (
                          <option key={optionId} value={optionId}>
                            {optionProperty} — {optionUnit} — {optionTenant} [Due: {formatAmount(optionBalance, currency)}]
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </label>
                <section className="rent-payment-balance-card" aria-label="Current rent balance and monthly rate">
                  <div>
                    <span>Current Open Balance</span>
                    <strong>{formatAmount(totalOpenBalance, currency)}</strong>
                  </div>
                  <div>
                    <span>Monthly Rate</span>
                    <strong>{formatAmount(rentMonthlyRate, currency)}</strong>
                  </div>
                </section>
                <label className="rent-payment-field rent-payment-amount-field">
                  <span>Amount Received ({currency})</span>
                  <input
                    required
                    autoFocus
                    type="number"
                    min={currency === "RWF" ? "1" : "0.01"}
                    inputMode="decimal"
                    step={currency === "RWF" ? "1" : "0.01"}
                    value={rentForm.amount}
                    onChange={(event) => setRentForm((current) => ({ ...current, amount: event.target.value }))}
                  />
                </label>
                <fieldset className="rent-payment-method-field">
                  <legend>Payment Channel</legend>
                  <div role="group" aria-label="Payment channel" className="rent-payment-methods">
                    <button type="button" aria-pressed={rentForm.method === "MTN_MOMO"} className={rentForm.method === "MTN_MOMO" ? "is-selected" : ""} onClick={() => setRentForm((current) => ({ ...current, method: "MTN_MOMO" }))} disabled={saving}>
                      <Smartphone size={15} aria-hidden="true" /><span>MTN MoMo</span>
                    </button>
                    <button type="button" aria-pressed={rentForm.method === "AIRTEL_MONEY"} className={rentForm.method === "AIRTEL_MONEY" ? "is-selected" : ""} onClick={() => setRentForm((current) => ({ ...current, method: "AIRTEL_MONEY" }))} disabled={saving}>
                      <Smartphone size={15} aria-hidden="true" /><span>Airtel Money</span>
                    </button>
                    <button type="button" aria-pressed={rentForm.method === "BANK_TRANSFER"} className={rentForm.method === "BANK_TRANSFER" ? "is-selected" : ""} onClick={() => setRentForm((current) => ({ ...current, method: "BANK_TRANSFER" }))} disabled={saving}>
                      <Landmark size={15} aria-hidden="true" /><span>Bank Transfer</span>
                    </button>
                    <button type="button" aria-pressed={rentForm.method === "CASH"} className={rentForm.method === "CASH" ? "is-selected" : ""} onClick={() => setRentForm((current) => ({ ...current, method: "CASH" }))} disabled={saving}>
                      <Banknote size={15} aria-hidden="true" /><span>Cash</span>
                    </button>
                  </div>
                </fieldset>
                <div className="rent-payment-inline-fields">
                  <label className="rent-payment-field">
                    <span>Transaction Reference</span>
                    <input maxLength={160} value={rentForm.reference} onChange={(event) => setRentForm((current) => ({ ...current, reference: event.target.value }))} />
                  </label>
                  <label className="rent-payment-field">
                    <span>Date Received</span>
                    <input required type="date" value={rentForm.receivedAt} onChange={(event) => setRentForm((current) => ({ ...current, receivedAt: event.target.value }))} />
                  </label>
                </div>
                <label className="rent-payment-field">
                  <span>Charge Period Note</span>
                  <input
                    maxLength={240}
                    value={rentForm.note}
                    onChange={(event) => setRentForm((current) => ({ ...current, note: event.target.value }))}
                  />
                </label>
                <div className="rent-payment-proof">
                  <input
                    ref={proofFileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    aria-label="Attach payment receipt or screenshot"
                    onChange={(event) => selectPaymentProof(event.currentTarget.files?.[0] ?? null)}
                  />
                  <button type="button" className="rent-payment-attach-button" onClick={() => proofFileInputRef.current?.click()} disabled={saving}>
                    + Attach receipt/screenshot
                  </button>
                  {proofFile && (
                    <span>
                      {proofFile.name} · {(proofFile.size / 1024 / 1024).toFixed(1)} MB
                      <button type="button" onClick={() => selectPaymentProof(null)} disabled={saving}>Remove</button>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="property-setup-content rent-payment-review-content">
                <section className="rent-payment-verification-card" aria-label="Payment allocation summary">
                  <div>
                    <span>Tenant</span>
                    <strong>{rentTenantName || "Tenant"}</strong>
                  </div>
                  <div>
                    <span>Amount Recorded</span>
                    <strong className="is-amount-recorded">
                      {receivedAmount === null ? "—" : formatAmount(receivedAmount, currency)}
                    </strong>
                  </div>
                  <div>
                    <span>Channel &amp; Ref</span>
                    <strong>
                      {rentForm.method === "MTN_MOMO"
                        ? "MTN MoMo"
                        : rentForm.method === "AIRTEL_MONEY"
                          ? "Airtel Money"
                          : rentForm.method === "BANK_TRANSFER"
                            ? "Bank Transfer"
                            : "Cash"}
                      {" · "}
                      {rentForm.reference.trim() || "MANUAL-ENTRY"}
                    </strong>
                  </div>
                  <div>
                    <span>Remaining Rent Due</span>
                    <strong>{formatAmount(balanceAfterPayment, currency)}</strong>
                  </div>
                </section>
                <section className="rent-payment-audit-notice" aria-label="Audit and verification notice">
                  <strong>Audit &amp; Verification Notice</strong>
                  <p>
                    This receipt is tagged as <b>User Recorded</b> (confirmed manually by you, not an automated bank gateway feed).
                  </p>
                  {proofFile && <small>Supporting proof attached: {proofFile.name}</small>}
                </section>
                <details className="rent-payment-allocation-details">
                  <summary>View oldest-first allocation details</summary>
                  <div className="rent-payment-allocation-preview">
                    <h4>Automatic FIFO allocation</h4>
                    {rentAllocations.length ? rentAllocations.map((allocation) => {
                      const charge = openCharges.find((row) => stringValue(row.id, "") === allocation.rentChargeId);
                      if (!charge) return null;
                      const remaining = amountMinorUnits(charge.balance) - amountMinorUnits(allocation.amount);
                      const status = remaining === BigInt(0)
                        ? "PAID"
                        : charge.status === "OVERDUE"
                          ? "OVERDUE · PARTIAL"
                          : "PARTIAL";
                      return (
                        <div className="rent-payment-charge-row" key={allocation.rentChargeId}>
                          <span>
                            <strong>{rentPeriodLabel(charge.period)}</strong>
                            <small>{formatAmount(allocation.amount, currency)} allocated · {status}</small>
                          </span>
                          <b>{remaining === BigInt(0) ? "Settled" : `${formatAmount(remaining, currency)} remaining`}</b>
                        </div>
                      );
                    }) : (
                      <p className="property-action-empty">There are no unpaid rent charges to allocate this payment to.</p>
                    )}
                    {advanceCredit > BigInt(0) && (
                      <div className="rent-payment-advance-credit">
                        <span>Unapplied advance credit</span>
                        <strong>{formatAmount(advanceCredit, currency)}</strong>
                        <small>This credit will be applied to the tenant’s next rent charge.</small>
                      </div>
                    )}
                  </div>
                </details>
                <details className="rent-payment-entry-details">
                  <summary>View payment entry details</summary>
                  <dl>
                    <div><dt>Property / unit</dt><dd>{rentPropertyName} — {rentUnitName}</dd></div>
                    <div><dt>Date received</dt><dd>{dateLabel(rentForm.receivedAt)}</dd></div>
                    <div><dt>Charge period note</dt><dd>{rentForm.note || "Not provided"}</dd></div>
                  </dl>
                </details>
              </div>
            )}
            {error && <p className="property-onboarding-error" role="alert">{error}</p>}
            <footer className="landlord-form-actions rent-payment-actions">
              {rentStep === 1 ? (
                <button className="dashboard-secondary-button" type="button" onClick={() => setRentStep(0)} disabled={saving}>← Back</button>
              ) : (
                <button className="landlord-form-cancel-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
              )}
              <button className="dashboard-primary-button" type="submit" disabled={saving || !rentTenancy}>
                {saving
                  ? "Recording…"
                  : rentStep === 0
                    ? "Review Allocation →"
                    : <><Check size={13} aria-hidden="true" /> Confirm &amp; Generate Receipt</>}
              </button>
            </footer>
          </form>
        )}

        {action.type === "manage-property" && (
          <div className="property-action-manager property-manage-layout">
            <div className="property-action-tabs property-manage-tabs" role="tablist" aria-label="Property management">
              <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>Overview</button>
              <button type="button" role="tab" aria-selected={tab === "notifications"} className={tab === "notifications" ? "is-active" : ""} onClick={() => setTab("notifications")}>Notifications ({attentionItems.length})</button>
            </div>
            <div className="property-action-manager-content property-manage-content">
              {tab === "overview" && (
                <div className="unit-overview">
                  <section className="unit-overview-card property-manage-summary">
                    <header>
                      <h3><i className="is-indigo" /> Property Specifications</h3>
                      <button type="button" onClick={onEditProperty} disabled={!canEdit}>
                        <Pencil size={13} /> Edit Details
                      </button>
                    </header>
                    <div className="unit-spec-grid">
                      <div className="unit-spec-item">
                        <span className="unit-spec-icon is-blue"><Building2 size={18} /></span>
                        <span><small>Property Type</small><strong>{unitPropertyType}</strong></span>
                      </div>
                      <div className="unit-spec-item">
                        <span className="unit-spec-icon is-indigo"><MapPin size={18} /></span>
                        <span><small>Location</small><strong>{stringValue(property.address, "Not provided")}</strong></span>
                      </div>
                      <div className="unit-spec-item">
                        <span className="unit-spec-icon is-teal"><CircleAlert size={18} /></span>
                        <span><small>Status</small><strong>{stringValue(property.status, "ACTIVE").replaceAll("_", " ")}</strong></span>
                      </div>
                      <div className="unit-spec-item">
                        <span className="unit-spec-icon is-green"><Home size={18} /></span>
                        <span>
                          <small>Rental Units</small>
                          <strong>{propertyUnits.filter((row) => row.status !== "ARCHIVED").length}</strong>
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              )}
              {tab === "notifications" && (
                <PropertyNotificationPanel
                  items={attentionItems}
                  readError={attentionReadError}
                  scope="property"
                  onOpen={onAttentionOpen}
                />
              )}
            </div>
            <footer className="property-manage-footer">
              <button type="button" className="unit-manage-footer-close" onClick={onClose}>Close</button>
            </footer>
          </div>
        )}

        {action.type === "manage" && unit && details && (
          <div className="property-action-manager unit-management-layout">
            <div className="property-action-tabs unit-manage-tabs" role="tablist" aria-label="Unit management">
              <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>Overview &amp; Lease</button>
              <button type="button" role="tab" aria-selected={tab === "ledger"} className={tab === "ledger" ? "is-active" : ""} onClick={() => setTab("ledger")}>Rent Ledger &amp; Deposit</button>
              <button type="button" role="tab" aria-selected={tab === "repairs"} className={tab === "repairs" ? "is-active" : ""} onClick={() => setTab("repairs")}>Inspection &amp; Repairs</button>
            </div>
            <div className="property-action-manager-content">
              {tab === "notifications" && (
                <PropertyNotificationPanel
                  items={attentionItems}
                  readError={attentionReadError}
                  scope="unit"
                  onOpen={onAttentionOpen}
                />
              )}
              {tab === "overview" && (
                unitEditOpen ? (
                  <form className="property-action-form unit-edit-form" onSubmit={(event) => void saveUnitDetails(event)}>
                    <div className="property-setup-content">
                      <h3>{isHouse ? "Edit house details" : "Edit rental unit"}</h3>
                      {hasLease && (
                        <p className="property-action-empty">
                          Rent and deposit are locked while an active or upcoming lease is in place. Physical details remain editable.
                        </p>
                      )}
                      <div className="landlord-form-grid">
                        {!isHouse && (
                          <>
                            <label className="landlord-field">
                              <span>Unit name / number</span>
                              <input
                                required
                                maxLength={80}
                                value={unitEditForm.unitNumber}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, unitNumber: event.target.value }))}
                              />
                            </label>
                            <label className="landlord-field">
                              <span>Floor</span>
                              <input
                                maxLength={40}
                                value={unitEditForm.floor}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, floor: event.target.value }))}
                              />
                            </label>
                          </>
                        )}
                        {!isCommercial && (
                          <>
                            <label className="landlord-field">
                              <span>Bedrooms{isHouse ? " *" : ""}</span>
                              <input
                                required={isHouse}
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={unitEditForm.bedrooms}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, bedrooms: event.target.value }))}
                              />
                            </label>
                            <label className="landlord-field">
                              <span>Bathrooms{isHouse ? " *" : ""}</span>
                              <input
                                required={isHouse}
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={unitEditForm.bathrooms}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, bathrooms: event.target.value }))}
                              />
                            </label>
                          </>
                        )}
                        <label className="landlord-field">
                          <span>Area (m²){isHouse ? " *" : ""}</span>
                          <input
                            required={isHouse}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={unitEditForm.sizeSqm}
                            onChange={(event) => setUnitEditForm((current) => ({ ...current, sizeSqm: event.target.value }))}
                          />
                        </label>
                        {!hasLease && (
                          <>
                            <label className="landlord-field">
                              <span>Monthly asking rent ({currency})</span>
                              <input
                                required
                                type="number"
                                min={currency === "RWF" ? "1" : "0.01"}
                                step={currency === "RWF" ? "1" : "0.01"}
                                value={unitEditForm.rentAmount}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, rentAmount: event.target.value }))}
                              />
                            </label>
                            <label className="landlord-field">
                              <span>Required deposit ({currency})</span>
                              <input
                                required
                                type="number"
                                min="0"
                                step={currency === "RWF" ? "1" : "0.01"}
                                value={unitEditForm.depositAmount}
                                onChange={(event) => setUnitEditForm((current) => ({ ...current, depositAmount: event.target.value }))}
                              />
                            </label>
                          </>
                        )}
                        <label className="landlord-field">
                          <span>Utility arrangement</span>
                          <input
                            maxLength={120}
                            value={unitEditForm.utilityArrangement}
                            onChange={(event) => setUnitEditForm((current) => ({ ...current, utilityArrangement: event.target.value }))}
                          />
                        </label>
                      </div>
                      {unitEditError && <p className="property-onboarding-error" role="alert">{unitEditError}</p>}
                    </div>
                    <footer className="landlord-form-actions">
                      <button
                        className="dashboard-secondary-button"
                        type="button"
                        disabled={unitEditSaving}
                        onClick={() => {
                          setUnitEditOpen(false);
                          setUnitEditError(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button className="dashboard-primary-button" type="submit" disabled={unitEditSaving || !canEdit}>
                        {unitEditSaving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Check size={15} />}
                        {unitEditSaving ? "Saving…" : "Save details"}
                      </button>
                    </footer>
                  </form>
                ) : (
                  <div className="unit-overview">
                    {!details.activeTenancy && !details.upcomingTenancy && (
                      <section className="unit-vacancy-banner">
                        <span className="unit-vacancy-icon" aria-hidden="true"><CircleAlert size={20} /></span>
                        <div>
                          <h3>This unit is currently unoccupied</h3>
                          <p>No active tenant or billing lease is assigned. Assign a tenant to start managing rent and lease activity.</p>
                        </div>
                        <button type="button" onClick={onAssignTenant} disabled={!canEdit}>
                          <Users size={15} /> Assign Tenant Now
                        </button>
                      </section>
                    )}

                    <section className="unit-overview-card">
                      <header>
                        <h3><i className="is-indigo" /> Unit Specifications</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setUnitEditError(null);
                            setUnitEditForm({
                              unitNumber: stringValue(unit.unitNumber, ""),
                              floor: stringValue(unit.floor, ""),
                              bedrooms: stringValue(unit.bedrooms, ""),
                              bathrooms: stringValue(unit.bathrooms, ""),
                              sizeSqm: stringValue(unit.sizeSqm, ""),
                              rentAmount: stringValue(unit.rentAmount, ""),
                              depositAmount: stringValue(unit.depositAmount, "0"),
                              utilityArrangement: stringValue(unit.utilityArrangement, ""),
                            });
                            setUnitEditOpen(true);
                          }}
                          disabled={!canEdit}
                        >
                          <Pencil size={13} /> Edit Details
                        </button>
                      </header>
                      <div className="unit-spec-grid">
                        <div className="unit-spec-item">
                          <span className="unit-spec-icon is-blue"><Home size={18} /></span>
                          <span><small>Unit Type</small><strong>{isHouse ? "House" : unitPropertyType}</strong></span>
                        </div>
                        {!isCommercial && (
                          <>
                            <div className="unit-spec-item">
                              <span className="unit-spec-icon is-indigo"><BedDouble size={18} /></span>
                              <span><small>Bedrooms</small><strong>{unitBedroomCount || "Not specified"}</strong></span>
                            </div>
                            <div className="unit-spec-item">
                              <span className="unit-spec-icon is-teal"><Bath size={18} /></span>
                              <span><small>Bathrooms</small><strong>{unitBathroomCount || "Not specified"}</strong></span>
                            </div>
                          </>
                        )}
                        <div className="unit-spec-item">
                          <span className="unit-spec-icon is-green"><Ruler size={18} /></span>
                          <span><small>Floor Area</small><strong>{unitArea ? `${unitArea} m²` : "Not specified"}</strong></span>
                        </div>
                        {!isHouse && stringValue(unit.floor, "") && (
                          <div className="unit-spec-item">
                            <span className="unit-spec-icon is-slate"><Building2 size={18} /></span>
                            <span><small>Floor</small><strong>{stringValue(unit.floor)}</strong></span>
                          </div>
                        )}
                      </div>
                      {hasLease && (
                        <p className="unit-overview-note">
                          Lease rent and deposit remain controlled by the active or upcoming tenancy.
                        </p>
                      )}
                    </section>

                    <section className="unit-overview-card">
                      <header>
                        <h3><i className="is-green" /> Financial &amp; Billing Overview</h3>
                        <span>Currency: {currency}</span>
                      </header>
                      <div className="unit-financial-grid">
                        <article>
                          <small>{hasLease ? "Monthly Rent" : "Target Monthly Rent"}</small>
                          <strong>{formatAmount(details.rentAmount ?? unit.rentAmount, currency)}</strong>
                          <p>{hasLease ? "Current lease rate" : `Standard rate for ${stringValue(property.name, "this property")}`}</p>
                        </article>
                        <article className={unitOpenBalance > BigInt(0) ? "has-balance" : "is-clear"}>
                          <small>Open Balance</small>
                          <strong>
                            {formatAmount(unitOpenBalance, currency)}
                            {unitOpenBalance === BigInt(0) && <em>All Clear</em>}
                          </strong>
                          <p>{unitOpenBalance > BigInt(0) ? "Outstanding rent across this unit’s tenancies" : "No outstanding arrears"}</p>
                        </article>
                        <article>
                          <small>Security Deposit Held</small>
                          <strong>{formatAmount(totalUnitDepositHeld ?? details.depositHeld, currency)}</strong>
                          <p>
                            {formatAmount(currentUnitDeposit?.requiredAmount ?? details.depositRequired ?? unit.depositAmount, currency)} required on lease
                          </p>
                        </article>
                      </div>
                    </section>

                    <section className="unit-overview-card unit-lease-history">
                      <header>
                        <h3><i className="is-slate" /> Lease &amp; Tenancy History</h3>
                        <span>{unitTenancyIds.size} Recorded {unitTenancyIds.size === 1 ? "Tenancy" : "Tenancies"}</span>
                      </header>
                      {unitLeases.length ? (
                        <div className="unit-lease-history-list">
                          {unitLeases.map((lease) => {
                            const leaseId = stringValue(lease.id, "");
                            const tenantName = stringValue(
                              nested(lease, "tenancy", "tenant", "legalName"),
                              "Tenant",
                            );
                            const hasGeneratedAgreement = rowsFor(
                              record(lease.tenantLeaseOnboarding),
                              "snapshots",
                            ).length > 0;
                            const latestTerminationRequest = rowsFor(
                              lease,
                              "terminationRequests",
                            )[0];
                            const terminationExpiresAt = latestTerminationRequest
                              ? new Date(String(latestTerminationRequest.expiresAt ?? ""))
                              : null;
                            const terminationRequestPending = Boolean(
                              latestTerminationRequest &&
                              !latestTerminationRequest.respondedAt &&
                              terminationExpiresAt &&
                              terminationExpiresAt > new Date(),
                            );
                            const terminationRequestStatus = latestTerminationRequest
                              ? latestTerminationRequest.respondedAt
                                ? latestTerminationRequest.accepted === true
                                  ? "Tenant confirmed termination"
                                  : "Tenant declined termination"
                                : terminationRequestPending
                                  ? `Awaiting tenant confirmation until ${dateLabel(latestTerminationRequest.expiresAt)}`
                                  : "Termination request expired"
                              : null;
                            const canRequestTermination =
                              canEdit &&
                              ["ACTIVE", "TENANT_ACCEPTED"].includes(
                                stringValue(lease.status, ""),
                              ) &&
                              !terminationRequestPending;
                            return (
                              <article key={leaseId}>
                                <span className="unit-lease-history-icon"><FileText size={17} /></span>
                                <div>
                                  <strong>{tenantName}</strong>
                                  <small>
                                    {stringValue(lease.status, "Lease").replaceAll("_", " ")} · {dateLabel(lease.startDate)} – {dateLabel(lease.endDate)}
                                  </small>
                                  {hasGeneratedAgreement && (
                                    <button
                                      className="unit-lease-view-agreement"
                                      type="button"
                                      onClick={() => void viewLeaseAgreement(leaseId)}
                                      aria-label={`View lease agreement PDF for ${tenantName}`}
                                    >
                                      <Eye size={13} /> View PDF
                                    </button>
                                  )}
                                  {terminationRequestStatus && (
                                    <small className="unit-termination-request-status">
                                      {terminationRequestStatus}
                                    </small>
                                  )}
                                  {canRequestTermination && (
                                    <button
                                      className="unit-lease-view-agreement unit-lease-terminate"
                                      type="button"
                                      onClick={() => onRequestTermination(lease)}
                                    >
                                      Terminate lease
                                    </button>
                                  )}
                                </div>
                                <b>{formatAmount(lease.rentAmount, currency)}<small>/month</small></b>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="unit-lease-empty">
                          <span><FileText size={22} /></span>
                          <strong>No active or archived leases for this unit</strong>
                          <p>Once you assign a tenant, rent statements, invoices, and payment receipts will appear here automatically.</p>
                        </div>
                      )}
                    </section>
                  </div>
                )
              )}
              {tab === "ledger" && (
                <div className="unit-rent-ledger">
                  <section className="unit-deposit-held-card" aria-label="Security deposit held in escrow">
                    <span className="unit-deposit-shield" aria-hidden="true"><ShieldCheck size={18} /></span>
                    <div className="unit-deposit-held-copy">
                      <strong>Security Deposit Held (Escrow Liability)</strong>
                      <small>Tracked separately from rent · Required: {formatAmount(currentUnitDeposit?.requiredAmount ?? details.depositRequired, currency)}</small>
                    </div>
                    <b>{formatAmount(totalUnitDepositHeld ?? details.depositHeld, currency)}</b>
                  </section>
                  <div className="unit-rent-ledger-heading">
                    <h3>Rent Payment Ledger</h3>
                    <button type="button" onClick={onRecordRent} disabled={!canEdit}>+ Record Rent</button>
                  </div>
                  <div className="unit-ledger-filters" role="search">
                    <label className="unit-ledger-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        type="search"
                        value={ledgerSearch}
                        onChange={(event) => setLedgerSearch(event.target.value)}
                        placeholder="Search money history"
                        aria-label="Search money history"
                      />
                    </label>
                    <label>
                      <span>Type</span>
                      <select value={ledgerTypeFilter} onChange={(event) => setLedgerTypeFilter(event.target.value)}>
                        <option value="all">All activity</option>
                        <option value="payment">Rent payments</option>
                        <option value="charge">Rent charges</option>
                        <option value="deposit">Deposit transactions</option>
                      </select>
                    </label>
                    <label className="unit-ledger-date-filter">
                      <span>From date</span>
                      <span className="unit-ledger-date-input">
                        <input type="date" value={ledgerFromDate} onChange={(event) => setLedgerFromDate(event.target.value)} />
                        <CalendarDays size={14} aria-hidden="true" />
                      </span>
                    </label>
                    <label className="unit-ledger-date-filter">
                      <span>To date</span>
                      <span className="unit-ledger-date-input">
                        <input type="date" value={ledgerToDate} onChange={(event) => setLedgerToDate(event.target.value)} />
                        <CalendarDays size={14} aria-hidden="true" />
                      </span>
                    </label>
                  </div>
                  <div className="unit-ledger-history-list" aria-live="polite">
                    {filteredLedgerHistory.length ? filteredLedgerHistory.map((entry) => entry.kind === "payment" ? (
                    (() => {
                      const payment = entry.record;
                      const method = stringValue(payment.method);
                      const methodLabel = method === "MTN_MOMO"
                        ? "MTN MoMo"
                        : method === "AIRTEL_MONEY"
                          ? "Airtel Money"
                          : method === "BANK_TRANSFER"
                            ? "Bank Transfer"
                            : method === "CASH"
                              ? "Cash"
                              : method.replaceAll("_", " ");
                      const recorderName = stringValue(nested(payment, "recorder", "name"), "Property manager");
                      const recorderNameParts = recorderName.trim().split(/\s+/).filter(Boolean);
                      const recorderLabel = recorderNameParts.length > 1
                        ? `${recorderNameParts[0][0]}. ${recorderNameParts.slice(1).join(" ")}`
                        : recorderName;
                      const recorderRole = stringValue(nested(payment, "recorder", "memberships", "0", "role"), "")
                        .toLowerCase()
                        .replace(/\b\w/g, (letter) => letter.toUpperCase());
                      const paymentId = stringValue(payment.id, "");
                      const proofId = stringValue(nested(payment, "proofFile", "id"), "");
                      return (
                        <article className={`unit-rent-payment-card${payment.reversedAt ? " is-reversed" : ""}`} key={entry.id}>
                          <div className="unit-rent-payment-main">
                            <div>
                              <strong className="unit-rent-payment-title">{entry.title}</strong>
                            </div>
                            <strong className="unit-rent-payment-amount">{formatAmount(payment.amount, currency)}</strong>
                          </div>
                          <div className="unit-rent-payment-meta-row">
                            <small className="unit-rent-payment-meta">
                              {entry.date} · {methodLabel}
                              {payment.reference ? ` (${stringValue(payment.reference)})` : " (MANUAL-ENTRY)"}
                            </small>
                            <span className="unit-rent-user-recorded">User Recorded</span>
                          </div>
                          <div className="unit-rent-payment-bottom">
                            <div className="unit-rent-payment-attribution">
                              <small>By {recorderLabel}{recorderRole ? ` (${recorderRole})` : ""}</small>
                              {proofId && (
                                <button type="button" className="unit-rent-proof-link" onClick={() => onOpenFile(proofId)}>
                                  View proof · {stringValue(nested(payment, "proofFile", "fileName"), "attachment")}
                                </button>
                              )}
                            </div>
                            {payment.reversedAt ? (
                              <span className="unit-rent-reversed-label">Reversed</span>
                            ) : reversalPaymentId === paymentId ? (
                              <div className="property-action-reversal">
                                <input aria-label="Reversal reason" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Reason for reversal" />
                                <button type="button" disabled={saving} onClick={() => void reversePayment(paymentId)}>Confirm</button>
                                <button type="button" disabled={saving} onClick={() => { setReversalPaymentId(null); setReversalReason(""); }}>Cancel</button>
                              </div>
                            ) : (
                              <button className="unit-rent-reverse-button" type="button" onClick={() => setReversalPaymentId(paymentId)}>
                                <RotateCcw size={12} /> Reverse Entry
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })()
                    ) : (
                      <article className={`unit-ledger-activity-card is-${entry.kind}`} key={entry.id}>
                        <div>
                          <strong>{entry.title}</strong>
                          <small>{entry.details}</small>
                        </div>
                        <strong>
                          {entry.kind === "deposit" && stringValue(entry.record.type) === "RECEIPT" ? "+ " : ""}
                          {entry.kind === "deposit" && ["REFUND", "DEDUCTION"].includes(stringValue(entry.record.type)) ? "− " : ""}
                          {formatAmount(entry.amount, currency)}
                        </strong>
                      </article>
                    )) : (
                      <p className="unit-ledger-empty">
                        {ledgerHistory.length ? "No money history matches these filters." : "No financial history has been recorded for this unit yet."}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {tab === "repairs" && (
                <div>
                  <h3>Maintenance tickets</h3>
                  {unitRepairs.length ? unitRepairs.map((request) => (
                    <div className="property-action-list-row is-stacked" key={stringValue(request.id)}>
                      <span>
                        <strong>{stringValue(request.category, "Maintenance request")}</strong>
                        <small>{stringValue(request.description, "No description provided.")}</small>
                        <small>
                          Reported by {stringValue(nested(request, "tenant", "legalName"), "Reporter not linked")}
                          {" · "}
                          {stringValue(request.status).replaceAll("_", " ")}
                          {" · "}
                          {stringValue(request.priority) === "NORMAL"
                            ? "Medium"
                            : stringValue(request.priority).replaceAll("_", " ")}
                        </small>
                        <small>
                          {request.assignedToUserId ? "Technician assigned" : "Unassigned"}
                          {request.estimatedCost
                            ? ` · Estimated cost ${formatAmount(request.estimatedCost, currency)}`
                            : ""}
                        </small>
                      </span>
                      {request.status === "IN_PROGRESS" && <button className="property-row-action-button is-secondary" type="button" disabled={repairSavingId === stringValue(request.id)} onClick={() => void handleCompleteTicket(stringValue(request.id))}>{repairSavingId === stringValue(request.id) ? "Saving…" : "Mark Repair Completed"}</button>}
                    </div>
                  )) : <p className="property-action-empty">No maintenance tickets.</p>}
                  <h3>Immutable inspection records</h3>
                  {unitInspections.length ? unitInspections.map((inspection) => <div className="property-action-list-row" key={stringValue(inspection.id)}><span><strong>{stringValue(inspection.type).replaceAll("_", " ")}</strong><small>{dateLabel(inspection.inspectedAt)}</small></span><b>{rowsFor(inspection, "items").length} items</b></div>) : <p className="property-action-empty">No inspection history.</p>}
                </div>
              )}
            </div>
            {error && <p className="property-onboarding-error" role="alert">{error}</p>}
            {!unitEditOpen && (
              <footer className="unit-manage-footer">
                <button type="button" className="unit-manage-footer-close" onClick={onClose}>Close</button>
                <div className="unit-manage-footer-actions">
                  <button
                    type="button"
                    className={unitOccupancyStatus === "Vacant" ? "unit-manage-past-payment" : "unit-manage-record-rent"}
                    onClick={onRecordRent}
                    disabled={!canEdit}
                  >
                    {unitOccupancyStatus === "Vacant" ? "Record Past Payment" : "Record Rent"}
                  </button>
                  {unitOccupancyStatus === "Vacant" && (
                    <button
                      type="button"
                      className="unit-manage-assign"
                      onClick={onAssignTenant}
                      disabled={!canEdit}
                    >
                      <Plus size={15} /> Assign Tenant
                    </button>
                  )}
                </div>
              </footer>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function allocateRent(
  charges: ValueRecord[],
  paymentAmount: bigint,
  currency: string,
): Array<{ rentChargeId: string; amount: string }> {
  let remaining = paymentAmount;
  const allocations: Array<{ rentChargeId: string; amount: string }> = [];
  for (const charge of charges) {
    if (remaining <= BigInt(0)) break;
    const balance = amountMinorUnits(charge.balance);
    const amount = remaining < balance ? remaining : balance;
    if (amount <= BigInt(0)) continue;
    allocations.push({
      rentChargeId: stringValue(charge.id, ""),
      amount: minorUnitsInput(amount, currency),
    });
    remaining -= amount;
  }
  return allocations;
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

function TenantLeaseExistingTenancyDialog({
  organisationId,
  tenancies,
  units,
  currency,
  onClose,
  onComplete,
}: {
  organisationId: string;
  tenancies: ValueRecord[];
  units: ValueRecord[];
  currency: string;
  onClose: () => void;
  onComplete: (emailSent: boolean) => void;
}) {
  const [tenancyId, setTenancyId] = useState("");
  const tenancy = tenancies.find((row) => stringValue(row.id, "") === tenancyId);
  if (tenancy) {
    const property = record(
      nested(tenancy, "property") ?? nested(tenancy, "unit", "property"),
    );
    return (
      <TenantLeaseOnboardingDialog
        organisationId={organisationId}
        property={property}
        units={units.filter((unit) => propertyIdFrom(unit) === stringValue(property.id, ""))}
        tenancies={tenancies}
        initialUnitId={stringValue(nested(tenancy, "unit", "id"), "") || null}
        initialTenant={record(nested(tenancy, "tenant"))}
        existingTenancy={tenancy}
        currency={currency}
        onClose={onClose}
        onComplete={onComplete}
      />
    );
  }
  const eligibleTenancies = tenancies.filter((row) =>
    ["ACTIVE", "UPCOMING"].includes(stringValue(row.status, "")),
  );
  return (
    <div className="landlord-form-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="landlord-form-modal property-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="lease-existing-tenancy-title">
        <header className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><FileText size={20} /></span>
          <div>
            <span className="dashboard-date">LEASE SETUP</span>
            <h2 id="lease-existing-tenancy-title">Choose a tenancy</h2>
            <p>Create an agreement for an existing tenant and rental space.</p>
          </div>
          <button type="button" className="landlord-form-modal-close" aria-label="Close tenancy selection" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="property-onboarding-content">
          <label className="landlord-field">
            <span>Active or upcoming tenancy <i aria-hidden="true">*</i></span>
            <select required value={tenancyId} onChange={(event) => setTenancyId(event.target.value)}>
              <option value="">Select a tenancy</option>
              {eligibleTenancies.map((row) => (
                <option key={stringValue(row.id)} value={stringValue(row.id)}>
                  {stringValue(nested(row, "tenant", "legalName"), "Tenant")} · {stringValue(nested(row, "property", "name"), stringValue(nested(row, "unit", "property", "name"), "Property"))} · {stringValue(nested(row, "unit", "unitNumber"), "Entire property")}
                </option>
              ))}
            </select>
          </label>
          {!eligibleTenancies.length && <p className="property-onboarding-error" role="alert">Create an active or upcoming tenancy before adding a lease.</p>}
        </div>
        <footer className="landlord-form-actions">
          <button className="dashboard-secondary-button" type="button" onClick={onClose}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}

function TenantLeaseAssignmentDialog({
  organisationId,
  tenant,
  tenants,
  properties,
  units,
  tenancies,
  currency,
  onClose,
  onComplete,
}: {
  organisationId: string;
  tenant?: ValueRecord;
  tenants: ValueRecord[];
  properties: ValueRecord[];
  units: ValueRecord[];
  tenancies: ValueRecord[];
  currency: string;
  onClose: () => void;
  onComplete: (emailSent: boolean) => void;
}) {
  const [propertyId, setPropertyId] = useState(() =>
    properties.length === 1 ? stringValue(properties[0].id, "") : "",
  );
  const [tenantId, setTenantId] = useState(stringValue(tenant?.id, ""));
  const property = properties.find((row) => stringValue(row.id, "") === propertyId);
  const selectedTenant =
    (tenant?.id ? tenant : tenants.find((row) => stringValue(row.id, "") === tenantId));
  if (property && selectedTenant) {
    return (
      <TenantLeaseOnboardingDialog
        organisationId={organisationId}
        property={property}
        units={units.filter((unit) => propertyIdFrom(unit) === propertyId)}
        tenancies={tenancies}
        initialUnitId={null}
        initialTenant={selectedTenant}
        currency={currency}
        onClose={onClose}
        onComplete={onComplete}
      />
    );
  }
  return (
    <div className="landlord-form-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="landlord-form-modal property-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="tenant-lease-assignment-title">
        <header className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><Building2 size={20} /></span>
          <div>
            <span className="dashboard-date">ASSIGN TENANT</span>
            <h2 id="tenant-lease-assignment-title">Choose a property</h2>
            <p>Choose the property and tenant to start a lease offer.</p>
          </div>
          <button type="button" className="landlord-form-modal-close" aria-label="Close property selection" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="property-onboarding-content">
          <label className="landlord-field">
            <span>Property <i aria-hidden="true">*</i></span>
            <select required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">Select a property</option>
              {properties.map((row) => (
                <option key={stringValue(row.id)} value={stringValue(row.id)}>
                  {stringValue(row.name, "Property")}
                </option>
              ))}
            </select>
          </label>
          {!tenant?.id && (
            <label className="landlord-field">
              <span>Tenant <i aria-hidden="true">*</i></span>
              <select required value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
                <option value="">Select a tenant</option>
                {tenants.map((row) => (
                  <option key={stringValue(row.id)} value={stringValue(row.id)}>
                    {stringValue(row.legalName, "Tenant")} · {stringValue(row.email)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!properties.length && <p className="property-onboarding-error" role="alert">Create a property before assigning a tenant.</p>}
        </div>
        <footer className="landlord-form-actions">
          <button className="dashboard-secondary-button" type="button" onClick={onClose}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}

function TenantLeaseOnboardingDialog({
  organisationId,
  property,
  units,
  tenancies,
  initialUnitId,
  fixedUnitId = null,
  initialTenant,
  existingTenancy,
  currency,
  onClose,
  onComplete,
}: {
  organisationId: string;
  property: ValueRecord;
  units: ValueRecord[];
  tenancies: ValueRecord[];
  initialUnitId: string | null;
  fixedUnitId?: string | null;
  initialTenant?: ValueRecord;
  existingTenancy?: ValueRecord;
  currency: string;
  onClose: () => void;
  onComplete: (emailSent: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [agreementValues, setAgreementValues] = useState(() => defaultLeaseAgreementValues(currency));
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const yearAhead = `${new Date().getFullYear() + 1}-${today.slice(5)}`;
  const fixedUnit = fixedUnitId
    ? units.find((unit) => stringValue(unit.id, "") === fixedUnitId)
    : undefined;
  const isExistingTenancy = Boolean(existingTenancy?.id);
  const [values, setValues] = useState({
    unitId: initialUnitId ?? stringValue(nested(existingTenancy, "unit", "id"), ""),
    legalName: stringValue(initialTenant?.legalName, ""),
    email: stringValue(initialTenant?.email, ""),
    phone: stringValue(initialTenant?.phone, ""),
    emergencyContactName: stringValue(initialTenant?.emergencyContactName, ""),
    emergencyContactPhone: stringValue(initialTenant?.emergencyContactPhone, ""),
    moveInDate: stringValue(existingTenancy?.moveInDate, today).slice(0, 10),
    startDate: today,
    endDate: yearAhead,
    rentAmount: String(fixedUnit?.rentAmount ?? ""),
    depositAmount: String(fixedUnit?.depositAmount ?? ""),
    dueDay: "1",
    paymentFrequency: "MONTHLY",
    terms: "",
  });
  const propertyId = stringValue(property.id, "");
  const availableUnits = units.filter((unit) =>
    unit.status === "AVAILABLE" &&
    !tenancies.some(
      (tenancy) =>
        stringValue(nested(tenancy, "unit", "id"), "") === stringValue(unit.id, "") &&
        ["ACTIVE", "UPCOMING"].includes(stringValue(tenancy.status, "")),
    ),
  );
  const standalone = units.length === 0 || (isExistingTenancy && !nested(existingTenancy, "unit", "id"));
  const existingUnit = nested(existingTenancy, "unit");
  const selectedUnit = fixedUnitId
    ? fixedUnit
    : isExistingTenancy
      ? existingUnit ? record(existingUnit) : undefined
      : availableUnits.find((unit) => stringValue(unit.id, "") === values.unitId);
  const update = (name: keyof typeof values, value: string) => {
    invalidatePreview();
    setValues((current) => ({ ...current, [name]: value }));
  };
  function invalidatePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }
  function updateAgreement(name: string, value: string) {
    invalidatePreview();
    setAgreementValues((current) => ({ ...current, [name]: value }));
  }
  const tenantStep = fixedUnitId || isExistingTenancy ? 0 : 1;
  const leaseStep = tenantStep + 1;
  const agreementStep = leaseStep + 1;
  const reviewStep = agreementStep + 1;
  const steps = fixedUnitId || isExistingTenancy
    ? ["Tenant details", "Lease & finances", "Agreement details", "Preview & send"]
    : ["Rental space", "Tenant", "Lease & finances", "Agreement details", "Preview & send"];

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function continueToNextStep() {
    const invalidField = formRef.current?.querySelector<HTMLElement>(
      ".property-onboarding-content :invalid",
    );
    if (invalidField) {
      const fieldLabel = invalidField
        .closest(".landlord-field")
        ?.querySelector("span")
        ?.textContent?.replace(/\*/g, "")
        .trim();
      setError(
        `${fieldLabel || "This field"} is required or invalid. Correct it before continuing.`,
      );
      invalidField.focus();
      if (
        invalidField instanceof HTMLInputElement ||
        invalidField instanceof HTMLSelectElement ||
        invalidField instanceof HTMLTextAreaElement
      ) {
        invalidField.reportValidity();
      }
      return;
    }
    if (!fixedUnitId && !isExistingTenancy && step === 0 && !standalone && !availableUnits.some((unit) => stringValue(unit.id, "") === values.unitId)) {
      setError("Select an available rental space.");
      return;
    }
    if (fixedUnitId && (!selectedUnit || ["ARCHIVED", "UNAVAILABLE"].includes(stringValue(selectedUnit.status, "")))) {
      setError("This unit is no longer available for a tenancy.");
      return;
    }
    if (step === tenantStep && (!values.legalName.trim() || !values.email.trim() || !values.moveInDate)) {
      setError("Enter the tenant name, email and move-in date.");
      return;
    }
    if (
      step === leaseStep &&
      (!values.startDate || !values.endDate || !values.rentAmount || !values.depositAmount || !values.dueDay)
    ) {
      setError("Complete the lease dates, rent, deposit and due day.");
      return;
    }
    setError("");
    setStep((current) => Math.min(reviewStep, current + 1));
  }

  function buildLeasePayload() {
    return {
      propertyId,
      unitId: values.unitId || null,
      ...(isExistingTenancy ? { tenancyId: stringValue(existingTenancy?.id, "") } : {}),
      tenant: {
        legalName: values.legalName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        emergencyContactName: values.emergencyContactName.trim() || undefined,
        emergencyContactPhone: values.emergencyContactPhone.trim() || undefined,
      },
      moveInDate: isExistingTenancy
        ? stringValue(existingTenancy?.moveInDate, values.moveInDate).slice(0, 10)
        : values.moveInDate,
      lease: {
        startDate: values.startDate,
        endDate: values.endDate,
        rentAmount: values.rentAmount,
        depositAmount: values.depositAmount,
        dueDay: Number(values.dueDay),
        paymentFrequency: values.paymentFrequency,
        terms: values.terms.trim()
          ? { additionalTerms: values.terms.trim() }
          : undefined,
        agreement: serializeLeaseAgreementValues(agreementValues),
      },
    };
  }

  async function generatePreview() {
    setPreviewing(true);
    setError("");
    try {
      const request = () => fetch(
        `${apiBaseUrl}/organisations/${organisationId}/landlord/tenant-lease-onboardings/preview`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildLeasePayload()),
        },
      );
      let response = await request();
      if (response.status === 401 && await refreshSession()) response = await request();
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as ApiError | undefined;
        const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
        throw new Error(message || `Preview request failed (${response.status})`);
      }
      invalidatePreview();
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The agreement preview could not be generated.");
    } finally {
      setPreviewing(false);
    }
  }

  async function sendLease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previewUrl) {
      setError("Generate and review the agreement preview before sending it.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const result = await apiRequest<{ emailSent?: boolean }>(
        `/organisations/${organisationId}/landlord/tenant-lease-onboardings`,
        {
          method: "POST",
          body: JSON.stringify(buildLeasePayload()),
        },
      );
      onComplete(result.emailSent === true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The lease could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`landlord-form-modal-backdrop${fixedUnitId ? " property-setup-backdrop" : ""}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className={`landlord-form-modal property-onboarding-dialog${fixedUnitId || isExistingTenancy ? " property-setup-drawer property-create-drawer tenant-lease-assignment-drawer" : ""}`} role="dialog" aria-modal="true" aria-labelledby="tenant-lease-onboarding-title">
        <header className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><Users size={20} /></span>
          <div>
            <span className="dashboard-date">{fixedUnitId || isExistingTenancy ? "LEASE SETUP" : "TENANT & LEASE SETUP"}</span>
            <h2 id="tenant-lease-onboarding-title">{isExistingTenancy ? "Create a lease for this tenancy" : fixedUnitId ? "Offer a lease to a tenant" : "Add tenant and create lease"}</h2>
            <p>{stringValue(property.name, "Property")}{selectedUnit ? ` · Unit ${stringValue(selectedUnit.unitNumber)}` : ""} · Send a lease for review; no payment is recorded.</p>
          </div>
          <button type="button" className="landlord-form-modal-close" aria-label="Close tenant and lease setup" onClick={onClose} disabled={saving}><X size={19} /></button>
        </header>
        <nav className={`property-onboarding-steps${fixedUnitId || isExistingTenancy ? " is-compact" : ""}`} aria-label="Registration steps">
          {steps.map((label, index) => (
            <button type="button" key={label} className={index === step ? "is-current" : index < step ? "is-complete" : ""} onClick={() => index < step && setStep(index)}>
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </nav>
        <form ref={formRef} className={`property-onboarding-form${fixedUnitId || isExistingTenancy ? " tenant-lease-assignment-form" : ""}`} onSubmit={sendLease}>
          <div className="property-onboarding-content">
            {!fixedUnitId && !isExistingTenancy && step === 0 && (
              <>
                <h3>Choose a rental space</h3>
                {standalone ? (
                  <div className="property-onboarding-standalone">
                    <Building2 size={18} />
                    <span><strong>Entire property</strong><small>This property has no separate units. The tenancy will be linked directly to the property.</small></span>
                  </div>
                ) : (
                  <label className="landlord-field">
                    <span>Available unit <i aria-hidden="true">*</i></span>
                    <select
                      required
                      value={values.unitId}
                      onChange={(event) => {
                        const unit = availableUnits.find((item) => stringValue(item.id, "") === event.target.value);
                        invalidatePreview();
                        setValues((current) => ({
                          ...current,
                          unitId: event.target.value,
                          rentAmount: unit ? String(unit.rentAmount ?? "") : current.rentAmount,
                          depositAmount: unit ? String(unit.depositAmount ?? "") : current.depositAmount,
                        }));
                        setError("");
                      }}
                    >
                      <option value="">Select a vacant unit</option>
                      {availableUnits.map((unit) => (
                        <option key={stringValue(unit.id)} value={stringValue(unit.id)}>
                          Unit {stringValue(unit.unitNumber)} · {stringValue(unit.floor, "Floor not set")} · Vacant
                        </option>
                      ))}
                    </select>
                    {!availableUnits.length && <small>No vacant units are available. Mark a unit as available before registering a tenant.</small>}
                  </label>
                )}
              </>
            )}
            {step === tenantStep && (
              <>
                <h3>Tenant information</h3>
                <div className="property-onboarding-fields">
                  <label className="landlord-field"><span>Full name <i aria-hidden="true">*</i></span><input required value={values.legalName} onChange={(event) => update("legalName", event.target.value)} /></label>
                  <label className="landlord-field"><span>Email <i aria-hidden="true">*</i></span><input required type="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></label>
                  <label className="landlord-field"><span>Phone <i aria-hidden="true">*</i></span><input required value={values.phone} onChange={(event) => update("phone", event.target.value)} /></label>
                  <label className="landlord-field"><span>Move-in date <i aria-hidden="true">*</i></span><input required type="date" readOnly={isExistingTenancy} value={values.moveInDate} onChange={(event) => update("moveInDate", event.target.value)} /></label>
                  <label className="landlord-field"><span>Emergency contact</span><input value={values.emergencyContactName} onChange={(event) => update("emergencyContactName", event.target.value)} /></label>
                  <label className="landlord-field"><span>Emergency contact phone</span><input value={values.emergencyContactPhone} onChange={(event) => update("emergencyContactPhone", event.target.value)} /></label>
                </div>
              </>
            )}
            {step === leaseStep && (
              <>
                <h3>Lease and financial details</h3>
                <div className="property-onboarding-tenant-summary">
                  <span><strong>{values.legalName}</strong><small>{values.email}</small></span>
                  {values.phone && <small>{values.phone}</small>}
                </div>
                <div className="property-onboarding-fields">
                  <label className="landlord-field"><span>Lease start <i aria-hidden="true">*</i></span><input required type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
                  <label className="landlord-field"><span>Lease end <i aria-hidden="true">*</i></span><input required type="date" value={values.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
                  <label className="landlord-field"><span>Monthly rent ({currency}) <i aria-hidden="true">*</i></span><input required min="0" step={currency === "RWF" ? "1" : "0.01"} type="number" value={values.rentAmount} onChange={(event) => update("rentAmount", event.target.value)} /></label>
                  <label className="landlord-field"><span>Security deposit ({currency}) <i aria-hidden="true">*</i></span><input required min="0" step={currency === "RWF" ? "1" : "0.01"} type="number" value={values.depositAmount} onChange={(event) => update("depositAmount", event.target.value)} /></label>
                  <label className="landlord-field"><span>Rent due day <i aria-hidden="true">*</i></span><input required min="1" max="31" type="number" value={values.dueDay} onChange={(event) => update("dueDay", event.target.value)} /></label>
                  <label className="landlord-field"><span>Payment frequency <i aria-hidden="true">*</i></span><select value={values.paymentFrequency} onChange={(event) => update("paymentFrequency", event.target.value)}><option value="MONTHLY">Monthly</option></select></label>
                  <label className="landlord-field is-wide"><span>Special conditions (optional)</span><textarea rows={3} maxLength={4000} value={values.terms} onChange={(event) => update("terms", event.target.value)} /></label>
                </div>
              </>
            )}
            {step === agreementStep && (
              <>
                <h3>Agreement details</h3>
                <p className="lease-agreement-intro">Complete the agreement fields before generating the tenant's review copy. A lawyer or notary should review the final document where required by local law.</p>
                <LeaseAgreementFields values={agreementValues} onChange={updateAgreement} />
              </>
            )}
            {step === reviewStep && (
              <div className="property-onboarding-review">
                <h3>Review before sending</h3>
                {[
                  ["Rental space", standalone ? "Entire property" : `Unit ${stringValue(selectedUnit?.unitNumber, "—")}`, 0],
                  ["Tenant", `${values.legalName} · ${values.email}`, tenantStep],
                  ["Lease", `${dateLabel(values.startDate)} – ${dateLabel(values.endDate)} · ${values.paymentFrequency.toLowerCase()}`, leaseStep],
                  ["Rent & deposit", `${formatAmount(values.rentAmount, currency)} rent · ${formatAmount(values.depositAmount, currency)} deposit · Due day ${values.dueDay}`, leaseStep],
                  ["Agreement", `${agreementValues.landlordName} · ${agreementValues.currency} · ${agreementValues.paymentMethod.replace("_", " ").toLowerCase()}`, agreementStep],
                ].map(([label, detail, editStep]) => (
                  <div key={String(label)}>
                    <span><strong>{String(label)}</strong><small>{String(detail)}</small></span>
                    <button type="button" onClick={() => setStep(Number(editStep))}>Edit</button>
                  </div>
                ))}
                <p>The tenant receives the agreement only after you review the generated preview and choose to send it. A deposit marked as paid is added to the deposit ledger; sending does not activate the lease or record rent payments.</p>
                {previewUrl ? (
                  <div className="lease-agreement-preview">
                    <h4>Generated agreement preview</h4>
                    <iframe title="Generated lease agreement preview" src={previewUrl} />
                  </div>
                ) : (
                  <p className="lease-agreement-preview-notice">Generate a PDF preview to enable sending this agreement.</p>
                )}
              </div>
            )}
          </div>
          {error && <p className="property-onboarding-error" role="alert">{error}</p>}
          <footer className="landlord-form-actions">
            <button className="dashboard-secondary-button" type="button" onClick={step ? () => setStep((current) => current - 1) : onClose} disabled={saving}>{step ? "Back" : "Cancel"}</button>
            {step < reviewStep ? (
              <button className="dashboard-primary-button" type="button" onClick={continueToNextStep}>Continue</button>
            ) : (
              <>
                <button className="dashboard-secondary-button" type="button" onClick={() => void generatePreview()} disabled={saving || previewing}>
                  {previewing ? <LoaderCircle className="landlord-spinner" size={15} /> : <FileText size={15} />}
                  {previewing ? "Generating preview…" : previewUrl ? "Regenerate preview" : "Generate preview"}
                </button>
                <button className="dashboard-primary-button" type="submit" disabled={saving || previewing || !previewUrl}>
                  {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Send size={15} />}
                  {saving ? "Sending lease…" : "Send lease for review"}
                </button>
              </>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

type PropertySetupUnit = {
  unitNumber: string;
  floor: string;
  rentAmount: string;
  depositAmount: string;
  bedrooms: string;
  bathrooms: string;
  sizeSqm: string;
};

function PropertySetupDrawer({
  organisationId,
  currency,
  onClose,
  onComplete,
}: {
  organisationId: string;
  currency: string;
  onClose: () => void;
  onComplete: (
    result: { property: ValueRecord; units: ValueRecord[] },
    assignTenant: boolean,
  ) => void;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assignTenant, setAssignTenant] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [property, setProperty] = useState({
    name: "",
    type: "HOUSE",
    address: "",
    description: "",
    status: "ACTIVE",
  });
  const isSingleUnitProperty = property.type === "HOUSE";
  const [unitDefaults, setUnitDefaults] = useState({ rentAmount: "", depositAmount: "" });
  const [unitRows, setUnitRows] = useState<PropertySetupUnit[]>([
    {
      unitNumber: "Main Residence",
      floor: "",
      rentAmount: "",
      depositAmount: "",
      bedrooms: "",
      bathrooms: "",
      sizeSqm: "",
    },
  ]);
  const visibleUnitRows = isSingleUnitProperty
    ? [{
        ...(unitRows[0] ?? {
          unitNumber: "Main Residence",
          floor: "",
          rentAmount: "",
          depositAmount: "",
          bedrooms: "",
          bathrooms: "",
          sizeSqm: "",
        }),
        unitNumber: "Main Residence",
      }]
    : unitRows.map((unit, index) =>
        index === 0 && unit.unitNumber === "Main Residence"
          ? { ...unit, unitNumber: "Unit A1" }
          : unit,
      );
  const steps = ["Property basics", "Rental spaces", "Tenant setup"];
  const amountStep = currency === "RWF" ? "1" : "0.01";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  function updateUnit(index: number, field: keyof PropertySetupUnit, value: string) {
    setUnitRows((current) => current.map((unit, rowIndex) =>
      rowIndex === index ? { ...unit, [field]: value } : unit,
    ));
  }

  function addUnit() {
    setUnitRows((current) => {
      const usedNumbers = new Set(current.map((unit, index) =>
        index === 0 && unit.unitNumber === "Main Residence" ? "Unit A1" : unit.unitNumber,
      ));
      let nextNumber = 1;
      while (usedNumbers.has(`Unit A${nextNumber}`)) nextNumber += 1;
      return [...current, {
        unitNumber: `Unit A${nextNumber}`,
        floor: "",
        rentAmount: unitDefaults.rentAmount,
        depositAmount: unitDefaults.depositAmount,
        bedrooms: "",
        bathrooms: "",
        sizeSqm: "",
      }];
    });
  }

  function continueToNextStep() {
    if (step === 0 && (property.name.trim().length < 2 || !property.type || property.address.trim().length < 4)) {
      setError("Enter a property name, type and location.");
      return;
    }
    if (step === 1) {
      if (visibleUnitRows.some((unit) => !unit.unitNumber.trim() || !unit.rentAmount || !unit.depositAmount)) {
        setError("Give each rental space a name, monthly rent and security deposit.");
        return;
      }
      if (visibleUnitRows.some((unit) => Number(unit.rentAmount) <= 0 || Number(unit.depositAmount) < 0)) {
        setError("Rent must be greater than zero and the security deposit cannot be negative.");
        return;
      }
      if (isSingleUnitProperty && visibleUnitRows.some((unit) =>
        !unit.bedrooms.trim() || !unit.bathrooms.trim() || !unit.sizeSqm.trim(),
      )) {
        setError("Enter the number of bedrooms, bathrooms, and the house size.");
        return;
      }
      if (isSingleUnitProperty && visibleUnitRows.some((unit) =>
        !/^\d+$/.test(unit.bedrooms) ||
        Number(unit.bedrooms) > 100 ||
        !/^\d+$/.test(unit.bathrooms) ||
        Number(unit.bathrooms) > 100 ||
        !/^\d{1,8}(\.\d{1,2})?$/.test(unit.sizeSqm) ||
        Number(unit.sizeSqm) <= 0,
      )) {
        setError("Bedrooms and bathrooms must be whole numbers from 0 to 100, and size must be a positive number with up to two decimals.");
        return;
      }
      if (
        currency === "RWF" &&
        visibleUnitRows.some((unit) => !/^\d+$/.test(unit.rentAmount) || !/^\d+$/.test(unit.depositAmount))
      ) {
        setError("RWF rent and security deposits must be entered as whole francs.");
        return;
      }
    }
    setError("");
    setStep((current) => Math.min(2, current + 1));
  }

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await apiRequest<{ property: ValueRecord; units: ValueRecord[] }>(
        `/organisations/${organisationId}/landlord/properties`,
        {
          method: "POST",
          body: JSON.stringify({
            ...property,
            name: property.name.trim(),
            address: property.address.trim(),
            description: property.description.trim() || undefined,
            status: property.status,
            units: visibleUnitRows.map((unit) => ({
              unitNumber: unit.unitNumber.trim(),
              floor: unit.floor.trim() || undefined,
              rentAmount: unit.rentAmount,
              depositAmount: unit.depositAmount,
              ...(unit.bedrooms ? { bedrooms: Number(unit.bedrooms) } : {}),
              ...(unit.bathrooms ? { bathrooms: Number(unit.bathrooms) } : {}),
              ...(unit.sizeSqm ? { sizeSqm: unit.sizeSqm } : {}),
            })),
          }),
        },
      );
      onComplete(result, assignTenant);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The property could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="landlord-form-modal-backdrop property-setup-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="landlord-form-modal property-setup-drawer property-create-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-setup-title"
      >
        <header className="landlord-form-modal-header">
          <div>
            <h2 id="property-setup-title">Add a property</h2>
            <p>Create the property and its rental spaces together.</p>
            <span className="property-setup-step-hint" aria-live="polite">
              Step {step + 1} of 3 · {steps[step]}
            </span>
          </div>
          <button type="button" className="landlord-form-modal-close" aria-label="Close property setup" onClick={onClose} disabled={saving}><X size={19} /></button>
        </header>
        <nav className="property-onboarding-steps" aria-label="Property setup steps">
          {steps.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={index === step ? "is-current" : index < step ? "is-complete" : ""}
              disabled={index > step}
              onClick={() => index < step && setStep(index)}
            >
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </nav>
        <form className="property-setup-form" onSubmit={createProperty}>
          <div className="property-setup-content">
            {step === 0 && (
              <>
                <h3>Property basics</h3>
                <div className="property-onboarding-fields property-setup-property-fields">
                  <label className="landlord-field is-wide">
                    <span>Property name <i aria-hidden="true">*</i></span>
                    <input
                      required
                      minLength={2}
                      maxLength={180}
                      placeholder="e.g., Kigali Heights Annex"
                      value={property.name}
                      onChange={(event) => setProperty((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="landlord-field">
                    <span>Sector / location <i aria-hidden="true">*</i></span>
                    <input
                      required
                      minLength={4}
                      maxLength={500}
                      placeholder="e.g., Kimihurura, Gasabo"
                      value={property.address}
                      onChange={(event) => setProperty((current) => ({ ...current, address: event.target.value }))}
                    />
                  </label>
                  <label className="landlord-field">
                    <span>Property type <i aria-hidden="true">*</i></span>
                    <select
                      value={property.type}
                      onChange={(event) => setProperty((current) => ({ ...current, type: event.target.value }))}
                    >
                      <option value="APARTMENT_BUILDING">Apartment building</option>
                      <option value="HOUSE">House</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="MIXED_USE">Mixed use</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="landlord-field property-setup-status-field">
                    <span>Status</span>
                    <select
                      value={property.status}
                      onChange={(event) => setProperty((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </label>
                </div>
                <div className="property-setup-description">
                  <button
                    className="property-setup-description-toggle"
                    type="button"
                    aria-expanded={descriptionOpen}
                    aria-controls={descriptionOpen ? "property-description-field" : undefined}
                    onClick={() => setDescriptionOpen((open) => !open)}
                  >
                    {descriptionOpen ? "− Hide Description" : "+ Add Description"}
                  </button>
                  {descriptionOpen && (
                    <label className="landlord-field is-wide" id="property-description-field">
                      <span>Description <small>(Optional)</small></span>
                      <textarea
                        rows={3}
                        maxLength={5000}
                        value={property.description}
                        onChange={(event) => setProperty((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                  )}
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h3>{isSingleUnitProperty ? "Main Residence" : "Build your rental spaces"}</h3>
                <p className="property-setup-intro">
                  {isSingleUnitProperty
                    ? "This house will have one Main Residence rental space."
                    : "Add and price the units in this property."}
                </p>
                {!isSingleUnitProperty && unitRows.length > 1 && (
                  <div className="property-setup-quick-fill">
                    <label className="landlord-field"><span>Default rent ({currency})</span><input min="0" step={amountStep} type="number" value={unitDefaults.rentAmount} onChange={(event) => setUnitDefaults((current) => ({ ...current, rentAmount: event.target.value }))} /></label>
                    <label className="landlord-field"><span>Default deposit ({currency})</span><input min="0" step={amountStep} type="number" value={unitDefaults.depositAmount} onChange={(event) => setUnitDefaults((current) => ({ ...current, depositAmount: event.target.value }))} /></label>
                    <button type="button" className="dashboard-secondary-button" onClick={() => setUnitRows((current) => current.map((unit) => ({ ...unit, rentAmount: unitDefaults.rentAmount || unit.rentAmount, depositAmount: unitDefaults.depositAmount || unit.depositAmount })))}>Apply defaults to all</button>
                  </div>
                )}
                <div className="property-setup-unit-list">
                  {visibleUnitRows.map((unit, index) => (
                    <fieldset className={`property-setup-unit${isSingleUnitProperty ? " is-single-unit" : " is-multi-unit"}`} key={`setup-unit-${index}`}>
                      <legend>{isSingleUnitProperty ? "Main Residence" : `Rental space ${index + 1}`}</legend>
                      <div className="property-onboarding-fields">
                        {!isSingleUnitProperty && (
                          <>
                            <label className="landlord-field"><span>Unit name <i aria-hidden="true">*</i></span><input required maxLength={80} value={unit.unitNumber} onChange={(event) => updateUnit(index, "unitNumber", event.target.value)} /></label>
                            <label className="landlord-field"><span>Floor</span><input maxLength={40} value={unit.floor} onChange={(event) => updateUnit(index, "floor", event.target.value)} /></label>
                          </>
                        )}
                        <label className="landlord-field"><span>Monthly rent ({currency}) <i aria-hidden="true">*</i></span><input required min="1" step={amountStep} type="number" value={unit.rentAmount} onChange={(event) => updateUnit(index, "rentAmount", event.target.value)} /></label>
                        <label className="landlord-field"><span>Security deposit ({currency}) <i aria-hidden="true">*</i></span><input required min="0" step={amountStep} type="number" value={unit.depositAmount} onChange={(event) => updateUnit(index, "depositAmount", event.target.value)} /></label>
                        {isSingleUnitProperty && (
                          <>
                            <label className="landlord-field">
                              <span>Bedrooms <i aria-hidden="true">*</i></span>
                              <input required min="0" max="100" step="1" type="number" value={unit.bedrooms} onChange={(event) => updateUnit(index, "bedrooms", event.target.value)} />
                            </label>
                            <label className="landlord-field">
                              <span>Bathrooms <i aria-hidden="true">*</i></span>
                              <input required min="0" max="100" step="1" type="number" value={unit.bathrooms} onChange={(event) => updateUnit(index, "bathrooms", event.target.value)} />
                            </label>
                            <label className="landlord-field">
                              <span>Size (m²) <i aria-hidden="true">*</i></span>
                              <input required min="0.01" max="99999999.99" step="0.01" type="number" value={unit.sizeSqm} onChange={(event) => updateUnit(index, "sizeSqm", event.target.value)} />
                            </label>
                          </>
                        )}
                      </div>
                      {!isSingleUnitProperty && unitRows.length > 1 && <button className="property-setup-remove-unit" type="button" onClick={() => setUnitRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove unit</button>}
                    </fieldset>
                  ))}
                </div>
                {!isSingleUnitProperty && (
                  <button type="button" className="property-setup-add-unit" onClick={addUnit} disabled={unitRows.length >= 100}>
                    <Plus size={15} /> {unitRows.length >= 100 ? "Maximum units reached" : "Add another unit"}
                  </button>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <h3>Tenant setup</h3>
                <p className="property-setup-intro">You can create vacant rental spaces now, or continue directly into tenant and lease setup for the first space.</p>
                <label className={`property-setup-assign-option${assignTenant ? " is-selected" : ""}`}>
                  <input type="checkbox" checked={assignTenant} onChange={(event) => setAssignTenant(event.target.checked)} />
                  <span><strong>Set up a tenant now</strong><small>After creating the property, continue to the guided tenant, lease and finance workflow. The lease is sent for tenant review; this step does not claim that a payment has been received.</small></span>
                </label>
                <div className="property-onboarding-review">
                  <div><span><strong>Property</strong><small>{property.name} · {property.address}</small></span><button type="button" onClick={() => setStep(0)}>Edit</button></div>
                  <div><span><strong>Rental spaces</strong><small>{visibleUnitRows.length} {visibleUnitRows.length === 1 ? "space" : "spaces"} · {visibleUnitRows.map((unit) => unit.unitNumber).join(", ")}</small></span><button type="button" onClick={() => setStep(1)}>Edit</button></div>
                </div>
              </>
            )}
          </div>
          {error && <p className="property-onboarding-error" role="alert">{error}</p>}
          <footer className="landlord-form-actions">
            <button className="dashboard-secondary-button" type="button" onClick={step ? () => setStep((current) => current - 1) : onClose} disabled={saving}>{step ? "Back" : "Cancel"}</button>
            {step < 2 ? (
              <button className="dashboard-primary-button" type="button" onClick={continueToNextStep}>Continue -&gt;</button>
            ) : (
              <button className="dashboard-primary-button" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Check size={15} />}
                {saving ? "Creating…" : assignTenant ? "Create and set up tenant" : "Create property"}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

function TenantLeaseResendDialog({
  organisationId,
  lease,
  tenant,
  tenancy,
  deposit,
  currency,
  onClose,
  onComplete,
}: {
  organisationId: string;
  lease: ValueRecord;
  tenant: ValueRecord;
  tenancy: ValueRecord;
  deposit: ValueRecord;
  currency: string;
  onClose: () => void;
  onComplete: (emailSent: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const latestSnapshot = rowsFor(
    record(nested(lease, "tenantLeaseOnboarding")),
    "snapshots",
  )[0];
  const snapshotAgreement = record(
    nested(latestSnapshot, "agreement", "lease", "agreement"),
  );
  const priorTerms = record(lease.terms);
  const [values, setValues] = useState({
    legalName: stringValue(tenant.legalName, ""),
    email: stringValue(tenant.email, ""),
    phone: stringValue(tenant.phone, ""),
    emergencyContactName: stringValue(tenant.emergencyContactName, ""),
    emergencyContactPhone: stringValue(tenant.emergencyContactPhone, ""),
    moveInDate: stringValue(tenancy.moveInDate, "").slice(0, 10),
    startDate: stringValue(lease.startDate, "").slice(0, 10),
    endDate: stringValue(lease.endDate, "").slice(0, 10),
    rentAmount: stringValue(lease.rentAmount, ""),
    depositAmount: stringValue(deposit.requiredAmount, ""),
    dueDay: stringValue(lease.dueDay, "1"),
    terms: stringValue(priorTerms.additionalTerms, ""),
  });
  const [agreementValues, setAgreementValues] = useState(() =>
    leaseAgreementValuesFromSnapshot(currency, snapshotAgreement),
  );
  const propertyId = stringValue(nested(tenancy, "property", "id"), "");
  const unitId = stringValue(nested(tenancy, "unit", "id"), "");
  const update = (name: keyof typeof values, value: string) => {
    invalidatePreview();
    setValues((current) => ({ ...current, [name]: value }));
  };
  function invalidatePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }
  function updateAgreement(name: string, value: string) {
    invalidatePreview();
    setAgreementValues((current) => ({ ...current, [name]: value }));
  }
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function buildPayload() {
    return {
      propertyId,
      unitId: unitId || null,
      tenant: {
        legalName: values.legalName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        emergencyContactName: values.emergencyContactName.trim() || undefined,
        emergencyContactPhone: values.emergencyContactPhone.trim() || undefined,
      },
      moveInDate: values.moveInDate,
      lease: {
        startDate: values.startDate,
        endDate: values.endDate,
        rentAmount: values.rentAmount,
        depositAmount: values.depositAmount,
        dueDay: Number(values.dueDay),
        paymentFrequency: "MONTHLY",
        terms: values.terms.trim()
          ? { additionalTerms: values.terms.trim() }
          : undefined,
        agreement: serializeLeaseAgreementValues(agreementValues),
      },
    };
  }

  async function generatePreview() {
    setPreviewing(true);
    setError("");
    try {
      const request = () => fetch(
        `${apiBaseUrl}/organisations/${organisationId}/landlord/tenant-lease-onboardings/preview`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        },
      );
      let response = await request();
      if (response.status === 401 && await refreshSession()) response = await request();
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as ApiError | undefined;
        const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
        throw new Error(message || `Preview request failed (${response.status})`);
      }
      invalidatePreview();
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The agreement preview could not be generated.");
    } finally {
      setPreviewing(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previewUrl) {
      setError("Generate and review the updated agreement preview before resending it.");
      return;
    }
    const leaseId = stringValue(lease.id, "");
    if (!leaseId) {
      setError("The lease record could not be identified.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<{ emailSent?: boolean }>(
        `/organisations/${organisationId}/landlord/leases/${leaseId}/tenant-lease-onboardings/resend`,
        {
          method: "POST",
          body: JSON.stringify({
            tenant: {
              legalName: values.legalName.trim(),
              email: values.email.trim(),
              phone: values.phone.trim(),
              emergencyContactName: values.emergencyContactName.trim(),
              emergencyContactPhone: values.emergencyContactPhone.trim(),
            },
            moveInDate: values.moveInDate,
            lease: {
              startDate: values.startDate,
              endDate: values.endDate,
              rentAmount: values.rentAmount,
              depositAmount: values.depositAmount,
              dueDay: Number(values.dueDay),
              paymentFrequency: "MONTHLY",
              terms: values.terms.trim()
                ? { additionalTerms: values.terms.trim() }
                : {},
              agreement: serializeLeaseAgreementValues(agreementValues),
            },
          }),
        },
      );
      onComplete(result.emailSent === true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The updated lease could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="landlord-form-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="landlord-form-modal property-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="tenant-lease-resend-title">
        <header className="landlord-form-modal-header">
          <span className="landlord-form-modal-icon" aria-hidden="true"><FileText size={20} /></span>
          <div>
            <span className="dashboard-date">LEASE REVIEW FOLLOW-UP</span>
            <h2 id="tenant-lease-resend-title">Edit and resend lease</h2>
            <p>Update the agreement and send a new secure review link.</p>
          </div>
          <button type="button" className="landlord-form-modal-close" aria-label="Close lease editor" onClick={onClose} disabled={saving}><X size={19} /></button>
        </header>
        <form ref={formRef} className="property-onboarding-form" onSubmit={resend}>
          <div className="property-onboarding-content">
            <div className="property-onboarding-fields">
              <label className="landlord-field"><span>Tenant name <i aria-hidden="true">*</i></span><input required value={values.legalName} onChange={(event) => update("legalName", event.target.value)} /></label>
              <label className="landlord-field"><span>Email <i aria-hidden="true">*</i></span><input required type="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label className="landlord-field"><span>Phone <i aria-hidden="true">*</i></span><input required value={values.phone} onChange={(event) => update("phone", event.target.value)} /></label>
              <label className="landlord-field"><span>Emergency contact</span><input value={values.emergencyContactName} onChange={(event) => update("emergencyContactName", event.target.value)} /></label>
              <label className="landlord-field"><span>Emergency contact phone</span><input value={values.emergencyContactPhone} onChange={(event) => update("emergencyContactPhone", event.target.value)} /></label>
              <label className="landlord-field"><span>Move-in date <i aria-hidden="true">*</i></span><input required type="date" value={values.moveInDate} onChange={(event) => update("moveInDate", event.target.value)} /></label>
              <label className="landlord-field"><span>Lease start <i aria-hidden="true">*</i></span><input required type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
              <label className="landlord-field"><span>Lease end <i aria-hidden="true">*</i></span><input required type="date" value={values.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
              <label className="landlord-field"><span>Monthly rent ({currency}) <i aria-hidden="true">*</i></span><input required min="0" step="0.01" type="number" value={values.rentAmount} onChange={(event) => update("rentAmount", event.target.value)} /></label>
              <label className="landlord-field"><span>Security deposit ({currency}) <i aria-hidden="true">*</i></span><input required min="0" step="0.01" type="number" value={values.depositAmount} onChange={(event) => update("depositAmount", event.target.value)} /></label>
              <label className="landlord-field"><span>Rent due day <i aria-hidden="true">*</i></span><input required min="1" max="28" type="number" value={values.dueDay} onChange={(event) => update("dueDay", event.target.value)} /></label>
              <label className="landlord-field"><span>Payment frequency</span><input value="Monthly" readOnly /></label>
              <label className="landlord-field is-wide"><span>Special conditions (optional)</span><textarea rows={4} maxLength={4000} value={values.terms} onChange={(event) => update("terms", event.target.value)} /></label>
            </div>
            <h3 className="lease-agreement-resend-heading">Agreement details</h3>
            <LeaseAgreementFields values={agreementValues} onChange={updateAgreement} />
            <p className="lease-agreement-intro">Review the updated PDF before sending the new version to the tenant.</p>
            {previewUrl && (
              <div className="lease-agreement-preview">
                <h4>Updated agreement preview</h4>
                <iframe title="Updated lease agreement preview" src={previewUrl} />
              </div>
            )}
            {error && <p className="property-onboarding-error" role="alert">{error}</p>}
          </div>
          <footer className="landlord-form-actions">
            <button className="dashboard-secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="dashboard-secondary-button" type="button" onClick={() => void generatePreview()} disabled={saving || previewing}>
              {previewing ? <LoaderCircle className="landlord-spinner" size={15} /> : <FileText size={15} />}
              {previewing ? "Generating preview…" : previewUrl ? "Regenerate preview" : "Generate preview"}
            </button>
            <button className="dashboard-primary-button" type="submit" disabled={saving || previewing || !previewUrl}>
              {saving ? <LoaderCircle className="landlord-spinner" size={15} /> : <Send size={15} />}
              {saving ? "Resending lease…" : "Resend for tenant review"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function PropertyOwnerList({
  rows,
  summaries,
  currency,
  onManage,
  onEdit,
}: {
  rows: ValueRecord[];
  summaries: ClientPortfolioSummary[];
  currency: string;
  onManage: (owner: ValueRecord) => void;
  onEdit?: (row: ValueRecord) => void;
}) {
  const [search, setSearch] = useState("");
  const visibleRows = rows.filter((owner) =>
    [owner.name, owner.email, owner.phone]
      .some((value) => stringValue(value, "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
  );
  const paymentLabels: Record<ClientPortfolioSummary["paymentStatus"], string> = {
    UP_TO_DATE: "Up to date",
    PAYMENT_DUE: "Balance due",
    OVERDUE: "Overdue",
    NOT_CHARGED: "Not charged",
    NO_ACTIVE_TENANTS: "No active rent",
    NO_PROPERTIES: "No properties",
  };
  return (
    <div className="landlord-record-table-wrap">
      <div className="landlord-directory-controls">
        <label className="landlord-directory-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search clients</span>
          <input
            type="search"
            placeholder="Search client name or contact…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      </div>
      <table className="landlord-record-table">
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Contact</th>
            <th scope="col">Properties</th>
            <th scope="col">Occupancy</th>
            <th scope="col">Current payments</th>
            <th scope="col">Balance due</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr><td colSpan={7}>{rows.length === 0 ? "No clients have been added yet." : "No clients match your search."}</td></tr>
          ) : visibleRows.map((owner) => (
            (() => {
              const summary = summaries.find(
                (item) => stringValue(item.owner.id, "") === stringValue(owner.id, ""),
              );
              const paymentStatus = summary?.paymentStatus ?? "NO_PROPERTIES";
              return (
                <tr key={stringValue(owner.id)}>
                  <td><div className="landlord-record-main"><b>{stringValue(owner.name)}</b></div></td>
                  <td><div className="landlord-record-details">
                    {typeof owner.email === "string" && <small>{owner.email}</small>}
                    {typeof owner.phone === "string" && <small>{owner.phone}</small>}
                    {typeof owner.email !== "string" && typeof owner.phone !== "string" && <small>Contact details not added</small>}
                  </div></td>
                  <td>{summary?.properties.length ?? 0}</td>
                  <td>
                    {summary ? `${summary.occupied} / ${summary.units}` : "0 / 0"}
                    {summary && summary.units > 0 && (
                      <small className="client-occupancy-percent">
                        {Math.round((summary.occupied / summary.units) * 100)}%
                      </small>
                    )}
                  </td>
                  <td>
                    <span className={`property-ledger-rent-status is-${paymentStatus.toLowerCase().replaceAll("_", "-")}`}>
                      {paymentLabels[paymentStatus]}
                    </span>
                  </td>
                  <td>{formatAmount(summary?.outstanding ?? BigInt(0), currency)}</td>
                  <td className="client-action-cell">
                    <button className="landlord-text-action" type="button" onClick={() => onManage(owner)}>
                      Manage properties
                    </button>
                    {onEdit && (
                      <button className="landlord-text-action" type="button" onClick={() => onEdit(owner)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })()
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="landlord-empty-state">No clients have been added yet. Add a client and link their properties to start managing their portfolio.</p>
      )}
    </div>
  );
}

function ClientPropertiesOverview({
  summary,
  currency,
  onManageProperty,
}: {
  summary: ClientPortfolioSummary;
  currency: string;
  onManageProperty: (propertyId: string) => void;
}) {
  const paymentLabels: Record<ClientPortfolioSummary["paymentStatus"], string> = {
    UP_TO_DATE: "Up to date",
    PAYMENT_DUE: "Balance due",
    OVERDUE: "Overdue",
    NOT_CHARGED: "Not charged",
    NO_ACTIVE_TENANTS: "No active rent",
    NO_PROPERTIES: "No properties",
  };
  const occupancyPercent = summary.units
    ? Math.round((summary.occupied / summary.units) * 100)
    : 0;
  return (
    <section className="client-properties-dashboard" aria-labelledby="client-properties-title">
      <header className="client-properties-heading">
        <div>
          <span className="dashboard-date">CLIENT PORTFOLIO</span>
          <h2 id="client-properties-title">{stringValue(summary.owner.name)}</h2>
          <p>
            {stringValue(summary.owner.email, "No email address")}
            {typeof summary.owner.phone === "string" ? ` · ${summary.owner.phone}` : ""}
          </p>
        </div>
      </header>
      <div className="client-portfolio-summary-grid">
        <article><small>Properties</small><strong>{summary.properties.length}</strong></article>
        <article><small>Occupancy</small><strong>{summary.occupied} / {summary.units} units · {occupancyPercent}%</strong></article>
        <article>
          <small>Current payment status</small>
          <strong>{paymentLabels[summary.paymentStatus]}</strong>
        </article>
        <article><small>Current balance due</small><strong>{formatAmount(summary.outstanding, currency)}</strong></article>
      </div>
      <div className="landlord-record-table-wrap">
        <table className="landlord-record-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Occupancy</th>
              <th scope="col">Payment status</th>
              <th scope="col">Current balance</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {summary.properties.map((row) => {
              const paymentStatus: ClientPortfolioSummary["paymentStatus"] = row.rentStatus === "OVERDUE"
                ? "OVERDUE"
                : row.outstanding > BigInt(0)
                  ? "PAYMENT_DUE"
                  : row.rentStatus === "NOT_CHARGED"
                    ? "NOT_CHARGED"
                    : row.rentStatus === "NO_TENANTS"
                      ? "NO_ACTIVE_TENANTS"
                      : "UP_TO_DATE";
              const propertyPaymentLabel = paymentLabels[paymentStatus];
              return (
                <tr key={row.propertyId}>
                  <td>
                    <div className="landlord-record-main">
                      <b>{stringValue(row.property.name)}</b>
                      <small>{stringValue(row.property.address, "Address not added")}</small>
                    </div>
                  </td>
                  <td>
                    {row.occupied} / {row.units} units
                    {row.units > 0 && (
                      <small className="client-occupancy-percent">{row.occupancy}% occupied</small>
                    )}
                  </td>
                  <td>
                    <span className={`property-ledger-rent-status is-${paymentStatus.toLowerCase().replaceAll("_", "-")}`}>
                      {propertyPaymentLabel}
                    </span>
                  </td>
                  <td>{formatAmount(row.outstanding, currency)}</td>
                  <td>
                    <button
                      className="landlord-text-action"
                      type="button"
                      onClick={() => onManageProperty(row.propertyId)}
                    >
                      Manage property
                    </button>
                  </td>
                </tr>
              );
            })}
            {summary.properties.length === 0 && (
              <tr><td colSpan={5}>No properties are linked to this client yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
                step={field.type === "number" ? field.step ?? "0.01" : undefined}
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

function WorkspaceContentSkeleton({
  section,
  unitDetailsOnly = false,
}: {
  section: SectionName;
  unitDetailsOnly?: boolean;
}) {
  const title = section === "Rent & Deposits" ? "Rent and deposit records" : section;
  if (unitDetailsOnly && section === "Units") {
    return (
      <section
        className="landlord-panel landlord-content-skeleton property-unit-details-skeleton"
        role="status"
        aria-label="Loading unit details"
        aria-busy="true"
      >
        <span className="visually-hidden">Loading unit details…</span>
        <div className="landlord-panel-heading">
          <div><h2>Unit details</h2></div>
        </div>
        <div className="property-units-table-wrap">
          <table className="property-units-table">
            <thead>
              <tr>
                <th scope="col">Unit name</th>
                <th scope="col">Area</th>
                <th scope="col">Floor</th>
                <th scope="col">Bedrooms</th>
                <th scope="col">Bathrooms</th>
                <th scope="col">Price</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody aria-hidden="true">
              <tr>
                {Array.from({ length: 7 }, (_, index) => (
                  <td key={index}><span className="landlord-skeleton-block" /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }
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
    return <span className={`landlord-photo-placeholder ${className}-placeholder`} role="img" aria-label={message}><Building2 size={22} /></span>;
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
  onResendLease,
  onSignedAgreement,
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
  onResendLease?: (row: ValueRecord) => void;
  onSignedAgreement?: (row: ValueRecord) => void;
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
  const showActions = Boolean(onEdit || onRemove || onReverse || onReceipt || onLeaseStatus || onResendLease || onSignedAgreement || onMoveOut || onAssignUnit || onArchive || onDownload);
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
          const paymentProofId = stringValue(nested(row, "proofFile", "id"), "");
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
                  {status === "ACTIVE" && <option value="EXPIRED">Mark expired</option>}
                </select>
              )}
              {section === "Leases" && onResendLease &&
                ["PENDING_TENANT_REVIEW", "CHANGES_REQUESTED"].includes(status) && (
                  <button className="landlord-text-action" type="button" onClick={() => onResendLease(row)}>
                    Edit &amp; resend
                  </button>
                )}
              {section === "Leases" && onSignedAgreement &&
                nested(row, "tenantLeaseOnboarding", "responseAction") === "ACCEPTED" &&
                typeof nested(row, "tenantLeaseOnboarding", "responseAt") === "string" && (
                  <button
                    className="landlord-icon-button"
                    type="button"
                    aria-label="Download signed lease agreement"
                    title="Download signed lease agreement"
                    onClick={() => onSignedAgreement(row)}
                  >
                    <ArrowDownToLine size={15} />
                  </button>
                )}
              {(section === "Leases" || section === "Inspections") && onDownload && (
                <FileDownloadButtons row={row} section={section} onDownload={onDownload} />
              )}
              {section === "Rent & Deposits" && rentMode === "payments" && paymentProofId && onDownload && (
                <button className="landlord-icon-button" type="button" aria-label="Download payment proof" onClick={() => onDownload(paymentProofId)}>
                  <ArrowDownToLine size={15} />
                </button>
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
