import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/** Commit do build; "+ alterações" quando o build sai de arquivos ainda não commitados (ex.: build local). */
function gitCommit(): string {
  const git = (command: string) => execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    const commit = git("git rev-parse --short HEAD");
    return git("git status --porcelain --untracked-files=no") ? `${commit} + alterações` : commit;
  } catch {
    return "desconhecido";
  }
}

// As páginas recebem a CSP com nonce em src/proxy.ts. A API só devolve dados: nada ali carrega, executa ou é emoldurado.
const apiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

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
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: apiContentSecurityPolicy }] },
      { source: "/health", headers: [{ key: "Content-Security-Policy", value: apiContentSecurityPolicy }] },
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
