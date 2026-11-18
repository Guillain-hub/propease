import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    cpus: 1,
  },
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  async rewrites() {
    const apiOriginUrl = new URL(
      process.env.API_ORIGIN ?? "http://127.0.0.1:4000",
    );
    if (apiOriginUrl.hostname === "localhost") {
      apiOriginUrl.hostname = "127.0.0.1";
    }
    const apiOrigin = apiOriginUrl.toString().replace(/\/+$/, "");
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
