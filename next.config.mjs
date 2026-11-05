import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    cpus: 1,
  },
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};

export default nextConfig;
