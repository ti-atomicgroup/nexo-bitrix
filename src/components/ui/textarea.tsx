"use client";

import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { describedBy, FieldFrame } from "./field";
import styles from "./field.module.css";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
  optional?: boolean;
  hideLabel?: boolean;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, hint, error, id: idProp, optional, hideLabel, className, ref, rows = 4, ...textarea }: TextareaProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={className}>
      <div className={cx(styles.control, error && styles.invalid, textarea.disabled && styles.disabled)}>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={styles.textarea}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...textarea}
        />
      </div>
    </FieldFrame>
  );
}
