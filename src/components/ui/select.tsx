"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { describedBy, FieldFrame } from "./field";
import styles from "./field.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  options?: SelectOption[];
  /** Primeira opção vazia (ex.: "Escolha uma trilha"). */
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ label, options, placeholder, hint, error, id: idProp, optional, hideLabel, className, children, ref, ...select }: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={className}>
      <div className={cx(styles.control, error && styles.invalid, select.disabled && styles.disabled)}>
        <select
          ref={ref}
          id={id}
          className={styles.select}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...select}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className={styles.chevron} size={20} strokeWidth={2.25} aria-hidden="true" />
      </div>
    </FieldFrame>
  );
}
