"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

type TerminationReview = {
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  reason: string;
  expiresAt: string;
  respondedAt: string | null;
};

type ApiError = { message?: string | string[] };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/+$/, "");

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => undefined) as ApiError | undefined;
  const detail = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
  return new Error(detail || fallback);
}

export function TenantLeaseTerminationReviewClient({ token }: { token: string }) {
  const [review, setReview] = useState<TerminationReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setError("This termination link is missing its secure token.");
      setLoading(false);
      return () => { active = false; };
    }

    fetch(`${apiBaseUrl}/lease-termination-reviews/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await responseError(response, "This termination link is invalid or has expired.");
        }
        return response.json() as Promise<TerminationReview>;
      })
      .then((data) => {
        if (active) setReview(data);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : "The termination request could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token]);

  async function respond(accepted: boolean) {
    if (!token || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/lease-termination-reviews/${encodeURIComponent(token)}/response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accepted }),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw await responseError(response, "Your response could not be submitted. Please try again.");
      }
      const result = await response.json() as { status: "ACCEPTED" | "DECLINED"; respondedAt: string };
      setReview((current) => current
        ? { ...current, status: result.status, respondedAt: result.respondedAt }
        : current);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "Your response could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const isPending = review?.status === "PENDING";

  return (
    <main className="tenant-review-page">
      <article className="tenant-review-card">
        <div className="tenant-review-brand">
          PROPEASE <span>LEASE TERMINATION</span>
        </div>
        <header className="tenant-review-header">
          <span className="tenant-review-eyebrow">TENANT CONFIRMATION</span>
          <h1>Review lease termination request</h1>
          <p>
            Review the request carefully. Your response will be recorded and shared with your property manager.
          </p>
        </header>

        {loading ? (
          <p className="tenant-review-response"><LoaderCircle size={16} className="animate-spin" /> Loading termination request…</p>
        ) : error && !review ? (
          <p className="tenant-review-response" role="alert"><AlertCircle size={16} /> {error}</p>
        ) : review ? (
          <>
            <section className="tenant-review-section">
              <h2>Request details</h2>
              <dl className="tenant-review-details">
                <div><dt>Tenant</dt><dd>{review.tenantName}</dd></div>
                <div><dt>Property</dt><dd>{review.propertyName}</dd></div>
                <div><dt>Unit</dt><dd>{review.unitLabel}</dd></div>
                <div><dt>Respond by</dt><dd>{formatDate(review.expiresAt)}</dd></div>
              </dl>
              <div className="tenant-review-additional-terms">
                <h3>Reason provided</h3>
                <pre>{review.reason}</pre>
              </div>
            </section>

            {isPending ? (
              <>
                <p className="tenant-review-expiry">
                  If you agree, the lease ends on the date you confirm. If you decline, the lease remains active.
                </p>
                <div className="tenant-review-actions">
                  <label className="tenant-review-signature-consent">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    />
                    I understand that agreeing will terminate this lease effective today.
                  </label>
                  <button
                    className="tenant-review-accept"
                    type="button"
                    disabled={submitting || !confirmed}
                    onClick={() => void respond(true)}
                  >
                    {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Agree to termination
                  </button>
                  <button
                    className="tenant-review-decline"
                    type="button"
                    disabled={submitting}
                    onClick={() => void respond(false)}
                  >
                    Decline request
                  </button>
                </div>
              </>
            ) : (
              <p className="tenant-review-response" role="status">
                {review.status === "ACCEPTED" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {review.status === "ACCEPTED"
                  ? `You agreed to terminate this lease on ${formatDate(review.respondedAt)}.`
                  : "You declined this termination request. The lease remains active."}
              </p>
            )}
            {error && <p className="auth-feedback auth-feedback-error" role="alert">{error}</p>}
          </>
        ) : null}
      </article>
    </main>
  );
}
