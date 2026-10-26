import type { NextConfig } from "next";
import { execSync } from "node:child_process";

const production = process.env.NODE_ENV === "production";

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "desconhecido";
  }
}

// A Onnira exibe o app dentro do painel (iframe); localhost permite os testes locais.
const frameAncestors = "'self' https://app.onnira.com https://app.onnira.com.br http://localhost:* http://127.0.0.1:*";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${production ? "" : " ws: wss:"}`,
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Build enxuto: o plano Inicial da Onnira tem 512 MB de memória.
  productionBrowserSourceMaps: false,
  enablePrerenderSourceMaps: false,
  // Um processo só: o worker de build e os workers de páginas estáticas ficariam fora do limite de memória.
  experimental: { webpackMemoryOptimizations: true, webpackBuildWorker: false, serverSourceMaps: false, cpus: 1 },
  // A checagem de tipos roda em `npm run typecheck`; no build ela estoura a memória de 512 MB da Onnira.
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXO_COMMIT: gitCommit(),
    NEXO_BUILD_TIME: new Date().toISOString(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Sonda: mesma página sem Referer, para descobrir se a borda da Onnira bloqueia os scripts.
        source: "/diagnostico/sem-referer",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/j/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
