"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Check,
  Clock3,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Droplets,
  FileText,
  KeyRound,
  LayoutDashboard,
  Menu,
  Search,
  Receipt,
  Settings,
  Users,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LandlordSectionWorkspace } from "@/components/landlord-section-workspace";

type User = { id: string; name: string; email: string };
type Organisation = {
  role: string;
  organisation: {
    id: string;
    name: string;
    type: "LANDLORD" | "PROPERTY_MANAGEMENT_COMPANY";
    country: string;
    currency: string;
  };
};
type Invitation = {
  role: string;
  invitedAt: string;
  organisation: Organisation["organisation"];
};
type Property = {
  id: string;
  name: string;
  type: string;
  address: string;
  status: string;
  _count: { units: number };
};
type TenantSearchRecord = { id: string; legalName: string; phone?: string | null; email?: string | null };
type PortfolioSummary = {
  properties: number;
  units: number;
  occupiedUnits: number;
  availableUnits: number;
  tenants: number;
  activeTenancies: number;
  outstandingRent: string;
  rentDueThisMonth: string;
  paymentsThisMonth: string;
  expensesThisMonth: string;
  openMaintenance: number;
};
type OverviewData = {
  summary: PortfolioSummary;
  upcomingLeases: Array<{
    id: string;
    endDate: string;
    tenancy: {
      tenant: { legalName: string };
      unit: { unitNumber: string; property: { name: string } };
    };
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
};
type FinancialReport = {
  period: { from: string; to: string };
  rent: {
    charged: string;
    collected: string;
    outstanding: string;
    appliedToCharges: string;
    unapplied: string;
    paymentCount: number;
  };
  expenses: {
    total: string;
    propertyExpenses: string;
    maintenanceExpenses: string;
    count: number;
  };
};
type DashboardData = {
  user: User;
  organisation: Organisation["organisation"] | null;
  role: string;
  properties: Property[];
  overview: OverviewData | null;
  invitations: Invitation[];
};
type ApiError = { message?: string | string[] };
type SectionName =
  | "Overview"
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

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/+$/, "");

const navigation: { label: SectionName; icon: LucideIcon }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Properties", icon: Building2 },
  { label: "Units", icon: KeyRound },
  { label: "Tenants", icon: Users },
  { label: "Leases", icon: FileText },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Rent & Deposits", icon: CircleDollarSign },
  { label: "Expenses", icon: Receipt },
  { label: "Utilities", icon: Droplets },
  { label: "Maintenance", icon: Wrench },
  { label: "Notices", icon: Bell },
  { label: "Reports", icon: BarChart3 },
  { label: "Team", icon: UsersRound },
  { label: "Subscription", icon: CreditCard },
  { label: "Settings", icon: Settings },
];
const primaryNavigation = navigation.slice(0, 11);
const accountNavigation = navigation.slice(11);

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | ApiError
      | undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join(". ")
      : body?.message;
    throw Object.assign(new Error(message || "Request failed"), {
      status: response.status,
    });
  }
  return (await response.json()) as T;
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 401
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatActivity(action: string): string {
  return action
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DashboardSearch({
  organisationId,
  properties,
  onNavigate,
}: {
  organisationId?: string;
  properties: Property[];
  onNavigate: (section: SectionName) => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [tenants, setTenants] = useState<TenantSearchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const matchingProperties = properties
    .filter((property) => `${property.name} ${property.address} ${property.type}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 4);
  const matchingTenants = tenants
    .filter((tenant) => `${tenant.legalName} ${tenant.email ?? ""} ${tenant.phone ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 4);
  const matchingSections = navigation
    .filter(({ label }) => label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 3);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!organisationId || trimmed.length < 2) {
      setTenants([]);
      setSearchError(null);
      setLoading(false);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setSearchError(null);
      void requestJson<{ tenants: TenantSearchRecord[] }>(
        `/organisations/${organisationId}/landlord/tenants`,
      ).then(({ tenants: results }) => {
        if (active) setTenants(results);
      }).catch(() => {
        if (active) setSearchError("Tenant search is temporarily unavailable.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [organisationId, query]);

  function choose(section: SectionName) {
    onNavigate(section);
    setQuery("");
  }

  return (
    <div className="dashboard-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={searchInput}
        aria-label="Search properties, tenants and workspace"
        placeholder="Search properties, tenants..."
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setQuery("");
          if (event.key === "Enter") {
            const destination = matchingProperties.length
              ? "Properties"
              : matchingTenants.length
                ? "Tenants"
                : matchingSections[0]?.label;
            if (destination) choose(destination);
          }
        }}
      />
      <kbd>⌘ K</kbd>
      {query.trim().length > 0 && (
        <div className="dashboard-search-results" role="listbox" aria-label="Search results">
          {loading && <span className="dashboard-search-message">Searching…</span>}
          {searchError && <span className="dashboard-search-message">{searchError}</span>}
          {matchingProperties.map((property) => (
            <button type="button" role="option" key={property.id} onClick={() => choose("Properties")}>
              <Building2 size={16} />
              <span><b>{property.name}</b><small>{property.address}</small></span>
              <small>Property</small>
            </button>
          ))}
          {matchingTenants.map((tenant) => (
            <button type="button" role="option" key={tenant.id} onClick={() => choose("Tenants")}>
              <Users size={16} />
              <span><b>{tenant.legalName}</b><small>{tenant.email ?? tenant.phone ?? "Tenant"}</small></span>
              <small>Tenant</small>
            </button>
          ))}
          {matchingSections.map(({ label, icon: Icon }) => (
            <button type="button" role="option" key={label} onClick={() => choose(label)}>
              <Icon size={16} />
              <span><b>{label}</b><small>Open workspace section</small></span>
              <small>Section</small>
            </button>
          ))}
          {!loading && !searchError && !matchingProperties.length && !matchingTenants.length && !matchingSections.length && (
            <span className="dashboard-search-message">No matching records found.</span>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityPopover({
  activity,
  onClose,
  onOpenSettings,
}: {
  activity: OverviewData["recentActivity"];
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="dashboard-activity-popover">
      <div className="dashboard-popover-heading">
        <div><b>Recent activity</b><small>Latest changes in your workspace</small></div>
        <button type="button" aria-label="Close activity" onClick={onClose}><X size={16} /></button>
      </div>
      {activity.length ? activity.slice(0, 5).map((item) => (
        <article className="dashboard-popover-activity" key={item.id}>
          <span><Clock3 size={14} /></span>
          <div><b>{formatActivity(item.action)}</b><small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>
        </article>
      )) : (
        <p className="dashboard-search-message">No recent activity to show.</p>
      )}
      <button className="dashboard-popover-link" type="button" onClick={onOpenSettings}>Open workspace settings</button>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionName>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        let currentUser: { user: User };
        try {
          currentUser = await requestJson<{ user: User }>("/auth/me");
        } catch (requestError) {
          if (!isUnauthorized(requestError)) throw requestError;

          const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });
          if (!refreshResponse.ok) {
            throw Object.assign(new Error("Your session has expired"), {
              status: refreshResponse.status,
            });
          }
          currentUser = await requestJson<{ user: User }>("/auth/me");
        }

        const [{ organisations }, { invitations }] = await Promise.all([
          requestJson<{ organisations: Organisation[] }>("/organisations"),
          requestJson<{ invitations: Invitation[] }>("/organisations/invitations"),
        ]);
        const membership = organisations[0] ?? null;
        const organisation = membership?.organisation ?? null;
        const [properties, overview] = organisation
          ? await Promise.all([
              requestJson<{ properties: Property[] }>(
                `/organisations/${organisation.id}/properties`,
              ),
              requestJson<OverviewData>(
                `/organisations/${organisation.id}/landlord`,
              ),
            ])
          : [{ properties: [] }, null];

        if (active) {
          setData({
            user: currentUser.user,
            organisation,
            role: membership?.role ?? "",
            properties: properties.properties,
            overview,
            invitations,
          });
        }
      } catch (requestError) {
        if (!active) return;

        if (isUnauthorized(requestError)) {
          router.replace("/login");
          return;
        }

        setError(
          requestError instanceof TypeError
            ? "Couldn't reach the PropEase API. Make sure it is running and try again."
            : requestError instanceof Error
              ? requestError.message
              : "We couldn't load your workspace. Please try again.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [router, refreshKey]);

  async function logOut() {
    setIsLoggingOut(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("We couldn't log you out. Please try again.");
      }
      router.replace("/login");
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Couldn't reach the PropEase API. Make sure it is running and try again."
          : requestError instanceof Error
            ? requestError.message
            : "We couldn't log you out. Please try again.",
      );
      setIsLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading" role="status">
        Loading your workspace...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dashboard-error">
        <section className="dashboard-error-card" role="alert">
          <h1>We couldn&apos;t load your workspace</h1>
          <p>{error ?? "Please sign in again to continue."}</p>
          <button
            className="dashboard-primary-button"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  const unitCount = data.properties.reduce(
    (total, property) => total + property._count.units,
    0,
  );

  return (
    <div className="landlord-dashboard">
      {mobileMenuOpen && (
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={`landlord-sidebar${mobileMenuOpen ? " is-open" : ""}`}
        aria-label="Landlord dashboard navigation"
      >
        <div className="landlord-brand">
          <Image
            src="/images/new logo.png"
            alt="PropEase"
            width={400}
            height={133}
            priority
          />
          <button
            className="dashboard-close-menu"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="dashboard-sidebar-label">WORKSPACE</div>
        <nav className="landlord-navigation" aria-label="Workspace">
          {primaryNavigation.map(({ label, icon: Icon }) => (
            <button
              className={`landlord-nav-item${activeSection === label ? " is-active" : ""}`}
              key={label}
              onClick={() => {
                setActiveSection(label);
                setMobileMenuOpen(false);
              }}
              type="button"
              aria-current={activeSection === label ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
          <div className="dashboard-sidebar-label dashboard-sidebar-label-secondary">ACCOUNT</div>
          {accountNavigation.map(({ label, icon: Icon }) => (
            <button
              className={`landlord-nav-item${activeSection === label ? " is-active" : ""}`}
              key={label}
              onClick={() => {
                setActiveSection(label);
                setMobileMenuOpen(false);
              }}
              type="button"
              aria-current={activeSection === label ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="dashboard-sidebar-help" type="button" onClick={() => router.push("/contact")}>
          <span>Need a hand?</span>
          <b>Help centre <span aria-hidden="true">↗</span></b>
        </button>
        <div className="dashboard-sidebar-user">
          <span className="dashboard-user-avatar">
            {data.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="dashboard-user-details">
            <b>{data.user.name}</b>
            <small>{data.organisation?.name ?? "Landlord account"}</small>
          </span>
          <ChevronDown size={15} />
        </div>
      </aside>

      <div className="landlord-main">
        <header className="landlord-topbar">
          <button
            className="dashboard-menu-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="dashboard-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <b>{activeSection}</b>
          </div>
          <DashboardSearch
            organisationId={data.organisation?.id}
            properties={data.properties}
            onNavigate={(section) => setActiveSection(section)}
          />
          <div className="dashboard-topbar-actions">
            <div className="dashboard-popover-anchor">
              <button
                className={`dashboard-icon-button${notificationsOpen ? " is-open" : ""}`}
                type="button"
                aria-label="Recent activity"
                aria-expanded={notificationsOpen}
                onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }}
              >
                <Bell size={18} />
                {!!data.overview?.recentActivity.length && <i aria-hidden="true" />}
              </button>
              {notificationsOpen && (
                <ActivityPopover
                  activity={data.overview?.recentActivity ?? []}
                  onClose={() => setNotificationsOpen(false)}
                  onOpenSettings={() => { setActiveSection("Settings"); setNotificationsOpen(false); }}
                />
              )}
            </div>
            <span className="dashboard-account-email">{data.user.email}</span>
            <div className="dashboard-popover-anchor">
              <button
                className="dashboard-profile-trigger"
                type="button"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
                onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }}
              >
                <span className="dashboard-user-avatar">{data.user.name.slice(0, 1).toUpperCase()}</span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="dashboard-profile-menu">
                  <b>{data.user.name}</b>
                  <span>{data.user.email}</span>
                  <button type="button" onClick={() => { setActiveSection("Settings"); setProfileOpen(false); }}>Account settings</button>
                  <button
                    type="button"
                    disabled={isLoggingOut}
                    onClick={() => { setProfileOpen(false); void logOut(); }}
                  >
                    {isLoggingOut ? "Logging out..." : "Log out"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="landlord-content">
          {!data.organisation ? (
            <PendingInvitations
              invitations={data.invitations}
              onAccepted={() => setRefreshKey((key) => key + 1)}
            />
          ) : activeSection === "Overview" ? (
            <Overview
              data={data}
              unitCount={unitCount}
              overview={data.overview}
              onOpenProperties={() => setActiveSection("Properties")}
              onOpenSection={setActiveSection}
            />
          ) : (
            <LandlordSectionWorkspace
              section={activeSection}
              organisationId={data.organisation?.id ?? ""}
              currency={data.organisation?.currency ?? "RWF"}
              role={data.role}
              onUpdated={() => setRefreshKey((key) => key + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PendingInvitations({
  invitations,
  onAccepted,
}: {
  invitations: Invitation[];
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function accept(organisationId: string) {
    setAccepting(organisationId);
    setMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/organisations/${organisationId}/landlord/team/accept`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as ApiError | undefined;
        throw new Error(Array.isArray(body?.message) ? body.message.join(". ") : body?.message || "Invitation could not be accepted");
      }
      onAccepted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be accepted");
    } finally {
      setAccepting(null);
    }
  }
  return (
    <section className="landlord-panel landlord-invitation-panel">
      <span className="dashboard-date">PROPEASE WORKSPACE</span>
      <h1>Organisation invitations</h1>
      <p>Accept an invitation to open your collaborator workspace.</p>
      {message && <p className="landlord-alert is-error" role="alert">{message}</p>}
      {invitations.length ? invitations.map((invitation) => (
        <article className="landlord-record-card" key={invitation.organisation.id}>
          <div className="landlord-record-main">
            <b>{invitation.organisation.name}</b>
            <span>{invitation.role} · invited {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(invitation.invitedAt))}</span>
          </div>
          <button
            className="dashboard-primary-button"
            disabled={accepting !== null}
            onClick={() => void accept(invitation.organisation.id)}
            type="button"
          >
            {accepting === invitation.organisation.id ? "Accepting…" : "Accept invitation"}
          </button>
        </article>
      )) : (
        <p className="landlord-empty-state">You don&apos;t have an active organisation or pending invitation. Ask an organisation owner to invite your account.</p>
      )}
    </section>
  );
}

function Overview({
  data,
  unitCount,
  overview,
  onOpenProperties,
  onOpenSection,
}: {
  data: DashboardData;
  unitCount: number;
  overview: OverviewData | null;
  onOpenProperties: () => void;
  onOpenSection: (section: SectionName) => void;
}) {
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const firstName = data.user.name.trim().split(/\s+/)[0];
  const summary = overview?.summary;
  const currentMonth = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`,
  );
  const [monthReport, setMonthReport] = useState<FinancialReport | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  useEffect(() => {
    if (!data.organisation) return;
    let active = true;
    const [year, month] = selectedMonth.split("-").map(Number);
    const from = `${selectedMonth}-01`;
    const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    setMonthLoading(true);
    setMonthError(null);
    void requestJson<FinancialReport>(
      `/organisations/${data.organisation.id}/landlord/reports/financial?from=${from}&to=${to}`,
    ).then((report) => {
      if (active) setMonthReport(report);
    }).catch((error: unknown) => {
      if (active) setMonthError(error instanceof Error ? error.message : "Monthly report could not be loaded.");
    }).finally(() => {
      if (active) setMonthLoading(false);
    });
    return () => { active = false; };
  }, [data.organisation, selectedMonth]);
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date),
    };
  });
  const monthlyValues = [
    { label: "Received", amount: Number(monthReport?.rent.collected ?? 0), color: "received" },
    { label: "Charged", amount: Number(monthReport?.rent.charged ?? 0), color: "charged" },
    { label: "Expenses", amount: Number(monthReport?.expenses.total ?? 0), color: "expenses" },
  ];
  const maxMonthlyAmount = Math.max(...monthlyValues.map(({ amount }) => amount), 0);
  const money = (value: string | undefined) =>
    `${new Intl.NumberFormat("en").format(Number(value ?? 0))} ${data.organisation?.currency ?? "RWF"}`;

  return (
    <>
      <div className="dashboard-heading-row">
        <div>
          <span className="dashboard-date">{date.toUpperCase()}</span>
          <h1>
            {getGreeting()}, {firstName}
          </h1>
          <p>Here&apos;s an overview of your property portfolio.</p>
        </div>
        <button
          type="button"
          className="dashboard-primary-button"
          onClick={onOpenProperties}
        >
          <Building2 size={16} />
          View properties
        </button>
        <div className="dashboard-hero-visual" aria-hidden="true">
          <Image
            src="/images/hero-modern-home.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 42vw"
          />
          <span>Property portfolio</span>
        </div>
      </div>

      <section className="dashboard-metrics" aria-label="Portfolio summary">
        <MetricCard
          label="My properties"
          value={String(summary?.properties ?? data.properties.length).padStart(2, "0")}
          note={data.organisation?.name ?? "Your portfolio"}
          icon={Building2}
          tone="blue"
          onClick={onOpenProperties}
        />
        <MetricCard
          label="Units"
          value={String(summary?.units ?? unitCount).padStart(2, "0")}
          note={`${summary?.occupiedUnits ?? 0} occupied · ${summary?.availableUnits ?? 0} available`}
          icon={LayoutDashboard}
          tone="violet"
          onClick={() => onOpenSection("Units")}
        />
        <MetricCard
          label="Tenants"
          value={String(summary?.tenants ?? 0).padStart(2, "0")}
          note={`${summary?.activeTenancies ?? 0} active tenancies`}
          icon={Users}
          tone="green"
          onClick={() => onOpenSection("Tenants")}
        />
        <MetricCard
          label="Rent to follow up"
          value={money(summary?.outstandingRent)}
          note="Outstanding across rent charges"
          icon={CircleDollarSign}
          attention
          tone="amber"
          onClick={() => onOpenSection("Rent & Deposits")}
        />
      </section>

      <div className="dashboard-overview-grid">
        <section className="dashboard-panel rent-overview-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2>Rent overview</h2>
              <p>Rent collection across your properties</p>
            </div>
            <label className="dashboard-period-select">
              <CalendarDays size={14} />
              <span className="visually-hidden">Select report month</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.currentTarget.value)}>
                {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>
          {monthError ? (
            <div className="dashboard-chart-message" role="status">{monthError}</div>
          ) : monthLoading && !monthReport ? (
            <div className="dashboard-chart-message" role="status">Loading monthly report…</div>
          ) : maxMonthlyAmount === 0 ? (
            <div className="dashboard-chart-empty">
              <span className="dashboard-empty-icon"><CircleDollarSign size={20} /></span>
              <b>No financial activity for this month</b>
              <p>Rent received, charges and expenses will appear here when recorded.</p>
            </div>
          ) : (
            <div className="dashboard-month-chart" aria-label="Monthly financial overview">
              {monthlyValues.map(({ label, amount, color }) => (
                <div className="dashboard-chart-column" key={label}>
                  <div className="dashboard-chart-track">
                    <span className={`dashboard-chart-bar is-${color}`} style={{ height: `${Math.max(amount === 0 ? 0 : 8, Math.round((amount / maxMonthlyAmount) * 100))}%` }} />
                  </div>
                  <b>{money(String(amount))}</b>
                  <small>{label}</small>
                </div>
              ))}
            </div>
          )}
          {monthReport && !monthError && (
            <div className="dashboard-rent-totals">
              <span><i className="is-received" /> {money(monthReport.rent.collected)} received</span>
              <span><i className="is-charged" /> {money(monthReport.rent.charged)} charged</span>
              <span><i className="is-expenses" /> {money(monthReport.expenses.total)} expenses</span>
            </div>
          )}
        </section>

        <section className="dashboard-panel upcoming-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2>Coming up</h2>
              <p>Reminders and recent activity</p>
            </div>
            <Bell size={16} />
          </div>
          {overview?.upcomingLeases.length ? (
            <div className="dashboard-upcoming-list">
              {overview.upcomingLeases.slice(0, 4).map((lease) => (
                <article key={lease.id}>
                  <CalendarDays size={16} />
                  <span><b>{lease.tenancy.tenant.legalName}</b><small>{lease.tenancy.unit.property.name} · {lease.tenancy.unit.unitNumber}</small></span>
                  <time>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(lease.endDate))}</time>
                </article>
              ))}
              <button type="button" onClick={() => onOpenSection("Maintenance")}>
                <Wrench size={14} />
                {summary?.openMaintenance ?? 0} open maintenance requests
              </button>
            </div>
          ) : (
            <div className="dashboard-upcoming-empty">
              <CalendarDays size={19} />
              <span>No lease expiries in the next 60 days</span>
              <button type="button" onClick={() => onOpenSection("Maintenance")}>
                <Wrench size={14} />
                {summary?.openMaintenance ?? 0} open maintenance requests
              </button>
            </div>
          )}
          {!!overview?.recentActivity.length && (
            <div className="dashboard-recent-activity">
              <h3>Recent activity</h3>
              {overview.recentActivity.slice(0, 3).map((activity) => (
                <div className="dashboard-activity-row" key={activity.id}>
                  <span><Clock3 size={14} /></span>
                  <div><b>{formatActivity(activity.action)}</b><small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(activity.createdAt))}</small></div>
                  <Check size={14} aria-label="Recorded" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel dashboard-properties-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h2>Your properties</h2>
            <p>Properties connected to your account</p>
          </div>
          <button
            className="dashboard-text-button"
            type="button"
            onClick={onOpenProperties}
          >
            View all properties <span aria-hidden="true">→</span>
          </button>
        </div>
        {data.properties.length ? (
          <div className="dashboard-property-list">
            {data.properties.slice(0, 4).map((property) => (
              <PropertyRow key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="dashboard-properties-empty">
            <Building2 size={19} />
            <span>No properties added yet</span>
            <small>
              Your properties will appear here once they are added to your
              portfolio.
            </small>
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  attention = false,
  tone = "blue",
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  attention?: boolean;
  tone?: "blue" | "violet" | "green" | "amber";
  onClick?: () => void;
}) {
  return (
    <button className={`dashboard-metric-card is-${tone}`} type="button" onClick={onClick}>
      <div className="dashboard-metric-heading">
        <span>{label}</span>
        <span className="dashboard-metric-icon"><Icon size={18} /></span>
      </div>
      <strong>{value}</strong>
      <small className={attention ? "is-attention" : ""}>
        {attention && <i aria-hidden="true" />}
        {note}
      </small>
    </button>
  );
}

function PropertyRow({ property }: { property: Property }) {
  return (
    <article className="dashboard-property-row">
      <span className="dashboard-property-thumbnail">
        <Building2 size={19} />
      </span>
      <span className="dashboard-property-info">
        <b>{property.name}</b>
        <small>{property.address}</small>
      </span>
      <span className="dashboard-property-units">
        {property._count.units} {property._count.units === 1 ? "unit" : "units"}
      </span>
      <span className="dashboard-status-pill">
        <i aria-hidden="true" />
        {property.status.toLowerCase()}
      </span>
    </article>
  );
}

function PropertiesView({ properties }: { properties: Property[] }) {
  return (
    <>
      <div className="dashboard-heading-row">
        <div>
          <span className="dashboard-date">YOUR PORTFOLIO</span>
          <h1>Properties</h1>
          <p>Manage the buildings and rental properties in your portfolio.</p>
        </div>
      </div>
      <section className="dashboard-panel properties-list-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h2>All properties</h2>
            <p>{properties.length} properties in your workspace</p>
          </div>
        </div>
        {properties.length ? (
          <div className="dashboard-property-list">
            {properties.map((property) => (
              <PropertyRow key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="dashboard-properties-empty">
            <Building2 size={22} />
            <span>No properties added yet</span>
            <small>
              Property creation is not available in this workspace yet.
            </small>
          </div>
        )}
      </section>
    </>
  );
}

function ModulePlaceholder({
  section,
  onBack,
}: {
  section: SectionName;
  onBack: () => void;
}) {
  const item = navigation.find(({ label }) => label === section);
  const Icon = item?.icon ?? Settings;

  return (
    <section className="dashboard-module-placeholder">
      <span className="dashboard-module-icon">
        <Icon size={22} />
      </span>
      <span className="dashboard-date">PROPEASE WORKSPACE</span>
      <h1>{section}</h1>
      <p>
        This section is part of your landlord workspace. Its management tools
        will be available here as the PropEase modules are connected.
      </p>
      <button
        className="dashboard-primary-button"
        onClick={onBack}
        type="button"
      >
        Back to overview
      </button>
    </section>
  );
}
