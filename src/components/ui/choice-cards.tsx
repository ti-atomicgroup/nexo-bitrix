"use client";

import { CircleCheck, CircleAlert, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./choice-cards.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Faixa de cor da linha no topo do cartão. */
  tone?: "arrival" | "departure" | "forest";
  /** Detalhe extra no rodapé do cartão (ex.: "14 atividades · 4 etapas"). */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceCardsProps<T extends string> {
  legend: string;
  hideLegend?: boolean;
  hint?: ReactNode;
  options: Array<ChoiceOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  /** Largura mínima de cada cartão na grade. */
  minWidth?: number;
  className?: string;
}

/** Escolha única em cartões (rádios nativos). O cartão escolhido ganha borda grossa e o selo "Escolhida". */
export function ChoiceCards<T extends string>({ legend, hideLegend = false, hint, options, value, onChange, error, minWidth = 220, className }: ChoiceCardsProps<T>) {
  const name = useId();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className={cx(styles.group, className)} aria-describedby={describedBy}>
      <legend className={cx(styles.legend, hideLegend && "sr-only")}>{legend}</legend>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <div className={styles.grid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))` }}>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = option.value === value;
          return (
            <label key={option.value} className={cx(styles.option, option.disabled && styles.disabled)}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className={styles.input}
              />
              <span className={cx(styles.card, option.tone && styles[option.tone])}>
                <span className={styles.head}>
                  {Icon ? (
                    <span className={styles.tile} aria-hidden="true">
                      <Icon size={22} strokeWidth={2.25} />
                    </span>
                  ) : null}
                  <span className={styles.title}>{option.title}</span>
                  {checked ? (
                    <span className={styles.badge}>
                      <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
                      Escolhida
                    </span>
                  ) : null}
                </span>
                {option.description ? <span className={styles.description}>{option.description}</span> : null}
                {option.meta ? <span className={styles.meta}>{option.meta}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
