import { Check } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./stepper.module.css";

export interface StepperProps {
  steps: string[];
  /** Índice do passo atual (0 = primeiro). */
  current: number;
  label?: string;
  className?: string;
}

/** Passos de um assistente desenhados como uma linha com estações numeradas. */
export function Stepper({ steps, current, label = "Passos", className }: StepperProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className={styles.stepper}>
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "upcoming";
          return (
            <li key={step} className={cx(styles.step, styles[state])} aria-current={state === "current" ? "step" : undefined}>
              <span className={styles.station} aria-hidden="true">
                {state === "done" ? <Check size={18} strokeWidth={3} /> : index + 1}
              </span>
              <span className={styles.label}>
                <span className="sr-only">
                  Passo {index + 1} de {steps.length}
                  {state === "done" ? ", concluído" : state === "current" ? ", atual" : ""}:{" "}
                </span>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
