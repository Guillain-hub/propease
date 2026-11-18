"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Send } from "lucide-react";

type JsonRecord = Record<string, unknown>;
type TenantResponse = "ACCEPTED" | "CHANGES_REQUESTED" | "DECLINED";

type LeaseReview = {
  status: string;
  response: TenantResponse | null;
  responseAt: string | null;
  expiresAt: string;
  agreementVersion: number;
  agreement: JsonRecord;
};

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/+$/, "");

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

function responseLabel(response: TenantResponse): string {
  switch (response) {
    case "ACCEPTED":
      return "You accepted this lease offer.";
    case "CHANGES_REQUESTED":
      return "You requested changes to this lease offer.";
    case "DECLINED":
      return "You declined this lease offer.";
  }
}

export function TenantLeaseReviewClient({ token }: { token: string }) {
  const [review, setReview] = useState<LeaseReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [requestingChanges, setRequestingChanges] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setReview(null);
      setError("This lease review link is missing its secure token.");
      setLoading(false);
      return () => { active = false; };
    }

    setReview(null);
    setLoading(true);
    setError("");
    fetch(`${apiBaseUrl}/tenant-lease-reviews/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined) as
            | { message?: string | string[] }
            | undefined;
          const detail = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
          throw new Error(detail || "This lease review link is invalid or has expired.");
        }
        return response.json() as Promise<LeaseReview>;
      })
      .then((data) => {
        if (active) setReview(data);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "The lease could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token]);

  async function respond(responseAction: TenantResponse, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/tenant-lease-reviews/${encodeURIComponent(token)}/response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: responseAction,
            ...(responseAction === "CHANGES_REQUESTED" ? { message: message.trim() } : {}),
          }),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as
          | { message?: string | string[] }
          | undefined;
        const detail = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
        throw new Error(detail || "Your response could not be submitted. Please try again.");
      }
      const result = await response.json() as {
        status: string;
        response: TenantResponse;
        responseAt: string;
      };
      setReview((current) => current
        ? { ...current, status: result.status, response: result.response, responseAt: result.responseAt }
        : current);
      setRequestingChanges(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Your response could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const agreement = review?.agreement ?? {};
  const tenant = isRecord(agreement.tenant) ? agreement.tenant : {};
  const property = isRecord(agreement.property) ? agreement.property : {};
  const rentalSpace = isRecord(agreement.rentalSpace) ? agreement.rentalSpace : {};
  const lease = isRecord(agreement.lease) ? agreement.lease : {};
  const tenancy = isRecord(agreement.tenancy) ? agreement.tenancy : {};
  const terms = isRecord(lease.terms) ? lease.terms : {};
  const reviewed = Boolean(review?.responseAt || review?.response);
  const reviewable = review?.status === "PENDING_TENANT_REVIEW" && !reviewed;
  const documentUrl = token
    ? `${apiBaseUrl}/tenant-lease-reviews/${encodeURIComponent(token)}/document`
    : "";

  return (
    <section className="tenant-review-page">
      <div className="tenant-review-card">
        <div className="tenant-review-brand">PROPEASE <span>LEASE REVIEW</span></div>
        {loading ? (
          <div className="tenant-review-state" role="status">
            <LoaderCircle className="tenant-review-spinner" size={24} />
            <p>Loading your lease agreement…</p>
          </div>
        ) : error && !review ? (
          <div className="tenant-review-state is-error" role="alert">
            <AlertCircle size={25} />
            <h1>Unable to open this lease</h1>
            <p>{error}</p>
          </div>
        ) : review ? (
          <>
            <header className="tenant-review-header">
              <span className="tenant-review-eyebrow">AGREEMENT VERSION {review.agreementVersion}</span>
              <h1>Review your lease</h1>
              <p>Please review the agreement details below before responding.</p>
            </header>

            {review.response && (
              <div className="tenant-review-response" role="status">
                <CheckCircle2 size={18} />
                <span>{responseLabel(review.response)}</span>
              </div>
            )}

            <section className="tenant-review-section" aria-labelledby="tenant-review-property">
              <h2 id="tenant-review-property">Property and tenant</h2>
              <dl className="tenant-review-details">
                <div><dt>Property</dt><dd>{text(property.name)}</dd></div>
                <div><dt>Address</dt><dd>{text(property.address)}</dd></div>
                <div><dt>Rental space</dt><dd>{text(rentalSpace.label, "Entire property")}</dd></div>
                <div><dt>Tenant</dt><dd>{text(tenant.legalName)}</dd></div>
                <div><dt>Email</dt><dd>{text(tenant.email)}</dd></div>
                <div><dt>Phone</dt><dd>{text(tenant.phone)}</dd></div>
                <div><dt>Emergency contact</dt><dd>{text(tenant.emergencyContactName)}</dd></div>
                <div><dt>Emergency contact phone</dt><dd>{text(tenant.emergencyContactPhone)}</dd></div>
              </dl>
            </section>

            <section className="tenant-review-section" aria-labelledby="tenant-review-terms">
              <h2 id="tenant-review-terms">Lease terms</h2>
              <dl className="tenant-review-details">
                <div><dt>Lease period</dt><dd>{formatDate(lease.startDate)} – {formatDate(lease.endDate)}</dd></div>
                <div><dt>Move-in date</dt><dd>{formatDate(tenancy.moveInDate)}</dd></div>
                <div><dt>Rent</dt><dd>{text(lease.rentAmount)}</dd></div>
                <div><dt>Security deposit</dt><dd>{text(lease.depositAmount)}</dd></div>
                <div><dt>Payment frequency</dt><dd>{text(lease.paymentFrequency)}</dd></div>
                <div><dt>Rent due day</dt><dd>{text(lease.dueDay)}</dd></div>
              </dl>
              {Object.keys(terms).length > 0 && (
                <div className="tenant-review-additional-terms">
                  <h3>Additional terms</h3>
                  <pre>{JSON.stringify(terms, null, 2)}</pre>
                </div>
              )}
            </section>

            <a className="tenant-review-document" href={documentUrl} target="_blank" rel="noopener noreferrer">
              <FileText size={17} />
              View lease document
            </a>

            {review.expiresAt && (
              <p className="tenant-review-expiry">This secure review link expires {formatDate(review.expiresAt)}.</p>
            )}

            {reviewable && !requestingChanges && (
              <div className="tenant-review-actions">
                <button type="button" className="tenant-review-accept" disabled={submitting} onClick={() => respond("ACCEPTED")}>
                  {submitting ? <LoaderCircle className="tenant-review-spinner" size={16} /> : null}
                  Accept lease
                </button>
                <button type="button" className="tenant-review-secondary" disabled={submitting} onClick={() => setRequestingChanges(true)}>
                  Request changes
                </button>
                <button type="button" className="tenant-review-decline" disabled={submitting} onClick={() => respond("DECLINED")}>
                  Decline
                </button>
              </div>
            )}

            {reviewable && requestingChanges && (
              <form className="tenant-review-change-form" onSubmit={(event) => respond("CHANGES_REQUESTED", event)}>
                <label htmlFor="tenant-review-message">What would you like changed?</label>
                <textarea
                  id="tenant-review-message"
                  required
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                />
                <div className="tenant-review-actions">
                  <button type="submit" className="tenant-review-accept" disabled={submitting || !message.trim()}>
                    {submitting ? <LoaderCircle className="tenant-review-spinner" size={16} /> : <Send size={15} />}
                    Submit request
                  </button>
                  <button type="button" className="tenant-review-secondary" disabled={submitting} onClick={() => setRequestingChanges(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!reviewed && !reviewable && (
              <p className="tenant-review-inline-error" role="status">
                This lease offer is no longer open for a response. Contact your property manager if you need help.
              </p>
            )}

            {error && <p className="tenant-review-inline-error" role="alert">{error}</p>}
            <p className="tenant-review-footnote">
              {review.response
                ? "Your property manager has been notified of your response."
                : "Accepting confirms your agreement to these terms. No rent or deposit payment is made through this page."}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
