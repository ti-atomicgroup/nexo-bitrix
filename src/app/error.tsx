"use client";

import styles from "@/features/diagnostics/diagnostics.module.css";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.content}>
      <h1 className={styles.title}>Algo não saiu como esperado</h1>
      <p className={styles.lead}>Nada foi perdido. Tente de novo; se continuar, abra Ajustes → Diagnóstico e envie o código abaixo para o suporte.</p>
      {error.digest ? <p>Código: {error.digest}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
