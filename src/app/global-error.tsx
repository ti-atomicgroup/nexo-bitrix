"use client";

import styles from "./global-error.module.css";

// Último recurso: substitui o layout inteiro. Sem depender do CSS global; se nem este arquivo chegar, o texto continua legível.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className={styles.body}>
        <main className={styles.main}>
          <h1 className={styles.title}>O Nexo encontrou um erro</h1>
          <p className={styles.text}>Recarregue a página. Se o problema continuar, informe ao suporte o código abaixo.</p>
          {error.digest ? <p className={styles.text}>Código: {error.digest}</p> : null}
          <button type="button" onClick={reset} className={styles.button}>
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
