"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AuthFormProps = { mode: "login" | "register" };
type Feedback = { kind: "success" | "error"; message: string };
type ApiError = { message?: string | string[] };

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/+$/, "");

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const payload = isRegister
      ? {
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
          organisationName: String(
            formData.get("organisationName") ?? "",
          ).trim(),
          organisationType: String(formData.get("organisationType") ?? ""),
        }
      : {
          email: String(formData.get("email") ?? "").trim(),
          password: String(formData.get("password") ?? ""),
        };

    setIsSubmitting(true);
    setFeedback(null);

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
    <form className="auth-form" onSubmit={handleSubmit}>
      {isRegister && (
        <>
          <div className="form-field">
            <label htmlFor="auth-name">Full name</label>
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
          <div className="form-field">
            <label htmlFor="auth-organisation">Organisation name</label>
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
            <label htmlFor="auth-organisation-type">I am a</label>
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
      <div className="form-field">
        <label htmlFor="auth-email">Email address</label>
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
        <label htmlFor="auth-password">Password</label>
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
