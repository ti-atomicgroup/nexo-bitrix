"use client";

import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button } from "./button";
import styles from "./dialog.module.css";
import { useModalDialog } from "./use-modal-dialog";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Faixa superior: verde-floresta (padrão), vermelho para ações destrutivas, laranja para saídas. */
  tone?: "forest" | "danger" | "departure";
  children?: ReactNode;
  /** Botões do rodapé. O primeiro botão focável recebe o foco ao abrir. */
  actions?: ReactNode;
}

/** Caixa de diálogo modal (`<dialog>` nativo). O conteúdo só existe enquanto está aberta. */
export function Dialog({ open, onClose, title, description, tone = "forest", children, actions }: DialogProps) {
  const { ref, ...handlers } = useModalDialog(open, onClose);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, styles[tone])}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...handlers}
    >
      {open ? (
        <div className={styles.inner}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className={styles.description}>
              {description}
            </div>
          ) : null}
          {children ? <div className={styles.body}>{children}</div> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
          <Button variant="ghost" icon={X} aria-label="Fechar" className={styles.close} onClick={onClose} />
        </div>
      ) : null}
    </dialog>
  );
}
