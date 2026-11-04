/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export. There is no Next.js server and no Next.js API route: FastAPI in api/
  // serves the built out/ folder and answers every /api/ call on the same origin.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Always defined, so the mock branch in lib/api.ts folds away in the default build.
  env: { NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? '0' },
};

module.exports = nextConfig;
