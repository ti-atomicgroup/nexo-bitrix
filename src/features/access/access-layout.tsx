import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import styles from "./access-layout.module.css";
import { RouteMap } from "./route-map";

/** Tela de acesso dividida: painel verde-floresta com a promessa do produto e o mapa; conteúdo à direita. */
export function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <aside className={styles.aside}>
        <Logo size={30} />
        <p className={styles.promise}>
          <span className={styles.arrival}>Cada chegada bem-recebida.</span> <span className={styles.departure}>Cada saída sem pendência.</span>
        </p>
        <div className={styles.map}>
          <RouteMap />
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

/** Faixa verde-floresta no topo, para o assistente de instalação. */
export function BandLayout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.bandPage}>
      <header className={styles.band}>
        <div className={styles.bandInner}>
          <Logo size={26} />
          <span className={styles.bandLabel}>{label}</span>
        </div>
      </header>
      <main className={styles.bandMain}>{children}</main>
    </div>
  );
}
