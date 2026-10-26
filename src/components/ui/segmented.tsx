"use client";

import { Check, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { cx } from "@/lib/cx";
import styles from "./segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

export interface SegmentedProps<T extends string> {
  legend: string;
  hideLegend?: boolean;
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Filtro de escolha única (grupo de rádios nativo: setas do teclado funcionam sozinhas). */
export function Segmented<T extends string>({ legend, hideLegend = false, options, value, onChange, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx(styles.group, className)}>
      <legend className={cx(styles.legend, hideLegend && "sr-only")}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = option.value === value;
          return (
            <label key={option.value} className={styles.option}>
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className={styles.input} />
              <span className={styles.face}>
                {checked ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : Icon ? <Icon size={16} strokeWidth={2.25} aria-hidden="true" /> : null}
                {option.label}
                {option.count !== undefined ? <span className={styles.count}>{option.count}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
