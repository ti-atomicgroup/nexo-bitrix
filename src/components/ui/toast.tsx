"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./toast.module.css";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
}

interface ToastItem extends Required<Pick<ToastInput, "tone" | "title">> {
  id: number;
  description?: string;
}

interface ToastApi {
  show: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const DURATION: Record<ToastTone, number> = { success: 5_000, info: 6_000, error: 9_000 };
const MAX_VISIBLE = 4;

let nextToastId = 1;

/** Avisos curtos no canto da tela. Regiões `aria-live` sempre presentes para o leitor de tela anunciar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ tone = "success", title, description }: ToastInput) => {
      const id = nextToastId++;
      setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, tone, title, description }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const polite = toasts.filter((toast) => toast.tone !== "error");
  const assertive = toasts.filter((toast) => toast.tone === "error");

  const render = (toast: ToastItem) => {
    const Icon = ICON[toast.tone];
    return (
      <div key={toast.id} className={cx(styles.toast, styles[toast.tone])}>
        <Icon className={styles.icon} size={22} strokeWidth={2.25} aria-hidden="true" />
        <div className={styles.text}>
          <p className={styles.title}>{toast.title}</p>
          {toast.description ? <p className={styles.description}>{toast.description}</p> : null}
        </div>
        <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Fechar aviso">
          <X size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region}>
        <div aria-live="assertive" className={styles.stack}>
          {assertive.map(render)}
        </div>
        <div aria-live="polite" className={styles.stack}>
          {polite.map(render)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa de <ToastProvider>.");
  return context;
}
