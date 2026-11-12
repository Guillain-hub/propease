"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AuthFormProps = { mode: "login" | "register" };
type Feedback = { kind: "success" | "error"; message: string };
type ApiError = { message?: string | string[] };

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"
).replace(/\/+$/, "");

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isRegister = mode === "register";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isRegister) setInvitationToken(params.get("invitation"));
    if (params.get("authError") === "google") {
      setFeedback({
        kind: "error",
        message:
          "Google sign-in could not be completed. Try again, or use your email and password.",
      });
    }
  }, [isRegister]);

  async function continueWithGoogle() {
    if (isSubmitting) return;
    const form = formRef.current;
    const values = form ? new FormData(form) : null;
    const currentInvitation =
      invitationToken ??
      new URLSearchParams(window.location.search).get("invitation");
    const payload = {
      flow: isRegister ? "register" : "login",
      ...(isRegister
        ? {
            name: String(values?.get("name") ?? "").trim(),
            ...(currentInvitation
              ? { invitationToken: currentInvitation }
              : {
                  organisationName: String(
                    values?.get("organisationName") ?? "",
                  ).trim(),
                  organisationType: String(
                    values?.get("organisationType") ?? "",
                  ),
                }),
          }
        : {}),
    };

    if (isRegister) {
      const requiredFields = currentInvitation
        ? ["auth-name"]
        : ["auth-name", "auth-organisation", "auth-organisation-type"];
      const invalid = requiredFields
        .map((id) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`))
        .find((field) => !field || !field.checkValidity());
      if (invalid) {
        invalid?.reportValidity();
        return;
      }
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/google/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiError & {
        authorizationUrl?: string;
      };
      if (!response.ok || !result.authorizationUrl) {
        const apiMessage = Array.isArray(result.message)
          ? result.message.join(". ")
          : result.message;
        throw new Error(
          apiMessage || "Google sign-in is currently unavailable.",
        );
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof TypeError
            ? "Couldn't reach the PropEase API. Make sure it is running and try again."
            : error instanceof Error
              ? error.message
              : "Google sign-in could not be started.",
      });
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");

    if (isRegister && password !== String(formData.get("confirmPassword") ?? "")) {
      const confirmationField =
        event.currentTarget.elements.namedItem("confirmPassword");
      if (confirmationField instanceof HTMLInputElement) {
        confirmationField.focus();
      }
      setFeedback({ kind: "error", message: "Passwords do not match." });
      return;
    }

    const payload = isRegister
      ? {
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          password,
          ...(invitationToken
            ? { invitationToken }
            : {
                organisationName: String(
                  formData.get("organisationName") ?? "",
                ).trim(),
                organisationType: String(formData.get("organisationType") ?? ""),
              }),
        }
      : {
          email: String(formData.get("email") ?? "").trim(),
          password,
        };

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/${isRegister ? "register" : "login"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      let responseBody: ApiError | undefined;
      try {
        responseBody = (await response.json()) as ApiError;
      } catch {
        responseBody = undefined;
      }

      if (!response.ok) {
        const apiMessage = Array.isArray(responseBody?.message)
          ? responseBody.message.join(". ")
          : responseBody?.message;
        throw new Error(
          apiMessage ||
            (response.status >= 500
              ? "The service is temporarily unavailable. Please try again."
              : "We couldn't complete your request. Check your details and try again."),
        );
      }

      router.replace("/dashboard");
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof TypeError
            ? "Couldn't reach the PropEase API. Make sure it is running and try again."
            : error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} ref={formRef}>
      {isRegister && (
        <>
          <div className="form-field">
            <label htmlFor="auth-name">Full name <span className="required-field-marker" aria-hidden="true">*</span></label>
            <input
              id="auth-name"
              name="name"
              autoComplete="name"
              placeholder="Your name"
              minLength={2}
              maxLength={160}
              required
            />
          </div>
          {invitationToken ? (
            <p className="auth-intro">
              You were invited to a landlord workspace. Register with the email
              address that received the invitation to join it.
            </p>
          ) : (
            <>
          <div className="form-field">
            <label htmlFor="auth-organisation">Organisation name <span className="required-field-marker" aria-hidden="true">*</span></label>
            <input
              id="auth-organisation"
              name="organisationName"
              autoComplete="organization"
              placeholder="Your business or portfolio name"
              minLength={2}
              maxLength={180}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="auth-organisation-type">I am a <span className="required-field-marker" aria-hidden="true">*</span></label>
            <select
              id="auth-organisation-type"
              name="organisationType"
              defaultValue="LANDLORD"
              required
            >
              <option value="LANDLORD">Landlord</option>
              <option value="PROPERTY_MANAGEMENT_COMPANY">
                Property management company
              </option>
            </select>
          </div>
            </>
          )}
        </>
      )}
      <button
        type="button"
        className="auth-google-button"
        disabled={isSubmitting}
        onClick={() => void continueWithGoogle()}
      >
        <span className="auth-google-mark" aria-hidden="true">G</span>
        {isSubmitting ? "Connecting to Google..." : "Continue with Google"}
      </button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <div className="form-field">
        <label htmlFor="auth-email">{invitationToken ? "Invited email address" : "Email address"} <span className="required-field-marker" aria-hidden="true">*</span></label>
        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={320}
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="auth-password">Password <span className="required-field-marker" aria-hidden="true">*</span></label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={12}
          maxLength={128}
          placeholder="At least 12 characters"
          required
        />
      </div>
      {isRegister && (
        <div className="form-field">
          <label htmlFor="auth-confirm-password">Confirm password <span className="required-field-marker" aria-hidden="true">*</span></label>
          <input
            id="auth-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            placeholder="Re-enter your password"
            required
          />
        </div>
      )}
      <button
        type="submit"
        className="button button-primary button-large"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? isRegister
            ? "Creating account..."
            : "Logging in..."
          : isRegister
            ? "Create account"
            : "Log in"}{" "}
        {!isSubmitting && <span>→</span>}
      </button>
      {feedback && (
        <p
          className={`auth-feedback auth-feedback-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
    </form>
  );
}
