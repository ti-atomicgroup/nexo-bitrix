"use client";

// Último recurso: substitui o layout inteiro, por isso usa estilos inline e nenhum CSS externo.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#eef3ef", color: "#0e2a21", fontFamily: "Barlow, system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "48px auto", padding: 24 }}>
          <h1 style={{ fontSize: 32, margin: "0 0 12px" }}>O Nexo encontrou um erro</h1>
          <p style={{ margin: "0 0 16px" }}>Recarregue a página. Se o problema continuar, informe ao suporte o código abaixo.</p>
          {error.digest ? <p style={{ margin: "0 0 16px" }}>Código: {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, padding: "0 16px", border: 0, borderRadius: 6, background: "#ffd200", color: "#0e2a21", fontWeight: 600, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
