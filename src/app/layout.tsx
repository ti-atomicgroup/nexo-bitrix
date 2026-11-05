import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/archivo-black/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nexo", template: "%s · Nexo" },
  description: "Onboarding e offboarding de colaboradores integrados ao Bitrix24.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3b2c",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Renderização a cada pedido: a CSP (src/proxy.ts) usa um nonce novo por página, e HTML pré-gerado não teria como carregá-lo.
  await connection();
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
