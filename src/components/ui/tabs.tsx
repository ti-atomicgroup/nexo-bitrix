"use client";

import type { LucideIcon } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./tabs.module.css";

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Contagem ao lado do rótulo (ex.: itens pendentes). */
  badge?: string | number;
  content: ReactNode;
}

export interface TabsProps {
  /** Nome acessível do grupo de abas. */
  label: string;
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}

/** Abas acessíveis: setas, Home e End movem o foco e ativam a aba. */
export function Tabs({ label, items, value, onValueChange, className }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.id === value) ?? items[0];

  const focusTab = (index: number) => {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    onValueChange(item.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${item.id}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === active?.id);
    if (event.key === "ArrowRight") focusTab(index + 1);
    else if (event.key === "ArrowLeft") focusTab(index - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(items.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className={cx(styles.tabs, className)}>
      <div ref={listRef} role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {items.map((item) => {
          const selected = item.id === active?.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              data-tab={item.id}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={cx(styles.tab, selected && styles.selected)}
              onClick={() => onValueChange(item.id)}
            >
              {Icon ? <Icon size={18} strokeWidth={2.25} aria-hidden="true" /> : null}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== "" ? <span className={styles.badge}>{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
      {active ? (
        <div role="tabpanel" id={`${baseId}-panel-${active.id}`} aria-labelledby={`${baseId}-tab-${active.id}`} tabIndex={0} className={styles.panel}>
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
