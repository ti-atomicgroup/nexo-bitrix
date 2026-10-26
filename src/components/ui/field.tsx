"use client";

import { CircleAlert, type LucideIcon } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { cx } from "@/lib/cx";
import styles from "./field.module.css";

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/** Moldura comum de campo: rótulo, dica, controle e erro (texto + ícone, nunca só a cor). */
export function FieldFrame({ id, label, hint, error, optional, hideLabel, className, children }: FieldFrameProps) {
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={cx(styles.label, hideLabel && "sr-only")}>
        {label}
        {optional ? <span className={styles.optional}> (opcional)</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** `aria-describedby` com dica e erro, quando existirem. */
export function describedBy(id: string, hint?: ReactNode, error?: string | null): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
  optional?: boolean;
  hideLabel?: boolean;
  leadingIcon?: LucideIcon;
  /** Elemento dentro do campo, à direita (ex.: botão de mostrar senha). */
  trailing?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Field({ label, hint, error, id: idProp, optional, hideLabel, leadingIcon: Leading, trailing, className, ref, ...input }: FieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={className}>
      <div className={cx(styles.control, error && styles.invalid, input.disabled && styles.disabled)}>
        {Leading ? <Leading className={styles.leading} size={20} strokeWidth={2.25} aria-hidden="true" /> : null}
        <input
          ref={ref}
          id={id}
          className={cx(styles.input, Leading && styles.withLeading)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...input}
        />
        {trailing}
      </div>
    </FieldFrame>
  );
}
