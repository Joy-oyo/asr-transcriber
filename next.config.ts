import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // This repo lives beside unrelated projects, so pin tracing to itself instead
  // of letting Next.js walk up and find a stray lockfile.
  outputFileTracingRoot: import.meta.dirname,

  // Verification builds can be redirected so they never overwrite the
  // `.next` directory a running dev server is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  webpack: (config) => {
    // Inference happens entirely in the browser, so the Node-only halves of
    // transformers.js must never enter the client bundle. Aliasing them away
    // keeps the bundle small and keeps `onnxruntime-node`/`sharp` (and their
    // CVEs) out of anything we ship.
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Required for SharedArrayBuffer, which ONNX Runtime Web uses for
          // multi-threaded WASM inference. Without these the model still runs,
          // just single-threaded and noticeably slower.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // Model weights are fetched cross-origin from the Hugging Face CDN.
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
