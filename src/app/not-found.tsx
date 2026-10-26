import Link from "next/link";
import styles from "@/features/diagnostics/diagnostics.module.css";

export default function NotFound() {
  return (
    <main className={styles.content}>
      <h1 className={styles.title}>Esta página não existe</h1>
      <p className={styles.lead}>O endereço pode ter mudado ou o link pessoal pode ter expirado. Se você é colaborador, peça um novo link ao RH.</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
