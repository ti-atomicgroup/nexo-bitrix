"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { firstName } from "@/lib/format";
import type { MeDTO } from "@/shared/contracts";
import type { AppRole } from "@/shared/enums";
import styles from "./user-menu.module.css";

const ROLE_LABEL: Record<AppRole, string> = { admin: "Administração", rh: "RH" };

/** Menu da conta: quem está conectado, Ajustes e Sair. Fecha com Esc ou clique fora. */
export function UserMenu({ me, onLogout }: { me: MeDTO; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.menu}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={me.user.name} size="s" tone="light" />
        <span className={styles.name}>{firstName(me.user.name)}</span>
        <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
        <span className="sr-only">Conta de {me.user.name}</span>
      </button>
      {open ? (
        <div id={menuId} className={styles.dropdown}>
          <div className={styles.account}>
            <p className={styles.accountName}>{me.user.name}</p>
            <p className={styles.accountMeta}>{me.user.email}</p>
            <p className={styles.accountMeta}>{ROLE_LABEL[me.user.role]}</p>
          </div>
          <ul className={styles.list}>
            <li>
              <Link href="/ajustes" className={styles.item} onClick={() => setOpen(false)}>
                <Settings size={18} strokeWidth={2.25} aria-hidden="true" />
                Ajustes
              </Link>
            </li>
            <li>
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={18} strokeWidth={2.25} aria-hidden="true" />
                Sair
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
