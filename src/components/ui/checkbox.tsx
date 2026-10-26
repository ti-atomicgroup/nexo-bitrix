import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "@/lib/cx";
import styles from "./checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Caixa de seleção nativa com alvo de 44 px e rótulo clicável. */
export function Checkbox({ label, description, className, ref, ...input }: CheckboxProps) {
  return (
    <label className={cx(styles.checkbox, input.disabled && styles.disabled, className)}>
      <input ref={ref} type="checkbox" className={styles.input} {...input} />
      <span className={styles.box} aria-hidden="true">
        <Check size={16} strokeWidth={3} />
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
    </label>
  );
}
