"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type PasswordRecoveryFormProps = { mode: "request" | "reset" };
type Feedback = { kind: "success" | "error"; message: string };
type ApiError = { message?: string | string[] };

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"
).replace(/\/+$/, "");

export function PasswordRecoveryForm({ mode }: PasswordRecoveryFormProps) {
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (mode === "reset") {
      setToken(new URLSearchParams(window.location.search).get("token") ?? "");
    }
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const payload =
      mode === "request"
        ? { email: String(formData.get("email") ?? "").trim() }
        : {
            token,
            password: String(formData.get("password") ?? ""),
          };

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/${mode === "request" ? "forgot-password" : "reset-password"}`,
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
        throw new Error(apiMessage || "We couldn't complete your request. Please try again.");
      }

      setFeedback({
        kind: "success",
        message:
          typeof responseBody?.message === "string"
            ? responseBody.message
            : mode === "request"
              ? "If an active account exists for that email, password reset instructions will be sent."
              : "Your password has been reset. You can now log in.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof TypeError
            ? "Couldn't reach the PropEase API. Please try again."
            : error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {mode === "reset" && !token ? (
        <p className="auth-feedback auth-feedback-error" role="alert">
          This password reset link is missing or invalid. Request a new one below.
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "request" ? (
            <div className="form-field">
              <label htmlFor="recovery-email">Email address</label>
              <input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={320}
                required
              />
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="recovery-password">New password</label>
              <input
                id="recovery-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                placeholder="At least 12 characters"
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
              ? "Please wait..."
              : mode === "request"
                ? "Send reset link"
                : "Reset password"}
          </button>
        </form>
      )}
      {feedback && (
        <p
          className={`auth-feedback auth-feedback-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
      <p className="auth-switch">
        <Link href="/login">Back to log in</Link>
      </p>
    </>
  );
}
