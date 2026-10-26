"use client";

import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button } from "./button";
import styles from "./drawer.module.css";
import { useModalDialog } from "./use-modal-dialog";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Contexto logo abaixo do título (ex.: "TI · Ana Souza"). */
  meta?: ReactNode;
  /** Faixa de 6 px no topo, na cor da linha. */
  tone?: "forest" | "arrival" | "departure";
  children?: ReactNode;
  /** Rodapé fixo com as ações. */
  footer?: ReactNode;
}

/** Gaveta lateral (tela cheia no celular), feita sobre `<dialog>` nativo. */
export function Drawer({ open, onClose, title, meta, tone = "forest", children, footer }: DrawerProps) {
  const { ref, ...handlers } = useModalDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} className={cx(styles.drawer, styles[tone])} aria-labelledby={titleId} {...handlers}>
      {open ? (
        <div className={styles.inner}>
          <header className={styles.header}>
            <div className={styles.headText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {meta ? <div className={styles.meta}>{meta}</div> : null}
            </div>
            <Button variant="ghost" icon={X} aria-label="Fechar" onClick={onClose} />
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
