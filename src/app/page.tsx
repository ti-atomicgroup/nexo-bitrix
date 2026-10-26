import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buildInfo } from "@/server/runtime/build-info";
import styles from "@/features/diagnostics/diagnostics.module.css";

export const dynamic = "force-dynamic";

export default function Home() {
  const build = buildInfo();
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Logo />
        <span className={styles.version}>
          versão {build.commit} · {build.buildTime}
        </span>
      </header>
      <section className={styles.content}>
        <h1 className={styles.title}>O Nexo está no ar</h1>
        <p className={styles.lead}>Esta é a sonda de ambiente. Ela confirma se a Onnira executa o Nexo corretamente antes da versão completa.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/diagnostico">
            Abrir diagnóstico
          </Link>
          <Link className={styles.secondary} href="/diagnostico/sem-referer">
            Diagnóstico sem Referer
          </Link>
          <Link className={styles.secondary} href="/j/teste">
            Página pública de teste
          </Link>
        </div>
      </section>
    </main>
  );
}
