const secretLength = 32;

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const required = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing = required.filter(
    (key) => typeof environment[key] !== "string" || !environment[key],
  );

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const accessSecret = environment.JWT_ACCESS_SECRET;
  const refreshSecret = environment.JWT_REFRESH_SECRET;
  if (typeof accessSecret !== "string" || typeof refreshSecret !== "string") {
    throw new Error("JWT access and refresh secrets are required");
  }
  for (const [key, secret] of [
    ["JWT_ACCESS_SECRET", accessSecret],
    ["JWT_REFRESH_SECRET", refreshSecret],
  ]) {
    if (secret.length < secretLength) {
      throw new Error(`${key} must be at least ${secretLength} characters long`);
    }
  }
  if (accessSecret === refreshSecret) {
    throw new Error("JWT access and refresh secrets must be different");
  }

  const databaseUrl = new URL(String(environment.DATABASE_URL));
  if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }

  const port = Number(environment.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const nodeEnv = environment.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(String(nodeEnv))) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const origins = String(environment.APP_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          (url.protocol !== "http:" && url.protocol !== "https:")
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("APP_ORIGINS must be a comma-separated list of exact HTTP(S) origins");
  }

  const redisUrl = new URL(String(environment.REDIS_URL ?? "redis://localhost:6379"));
  if (
    (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") ||
    !redisUrl.hostname
  ) {
    throw new Error("REDIS_URL must use redis:// or rediss:// and include a hostname");
  }

  const googleKeys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
  ];
  const configuredGoogleKeys = googleKeys.filter(
    (key) => typeof environment[key] === "string" && environment[key],
  );
  if (configuredGoogleKeys.length && configuredGoogleKeys.length !== googleKeys.length) {
    throw new Error(
      "Google sign-in requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI",
    );
  }
  if (configuredGoogleKeys.length) {
    try {
      const callback = new URL(String(environment.GOOGLE_REDIRECT_URI));
      if (
        (callback.protocol !== "http:" && callback.protocol !== "https:") ||
        callback.username ||
        callback.password
      ) {
        throw new Error();
      }
    } catch {
      throw new Error("GOOGLE_REDIRECT_URI must be a valid HTTP(S) URL");
    }
  }

  return {
    ...environment,
    PORT: port,
    NODE_ENV: nodeEnv,
    APP_ORIGINS: origins.join(","),
    REDIS_URL: redisUrl.toString(),
    AWS_REGION: environment.AWS_REGION ?? "us-east-1",
  };
}
