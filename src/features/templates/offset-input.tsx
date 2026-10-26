"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { OffsetUnit } from "@/shared/enums";
import styles from "./offset-input.module.css";

type Direction = "before" | "same" | "after";

export interface OffsetInputProps {
  legend: string;
  /** Dias relativos à data-âncora (negativo = antes). */
  days: number;
  unit: OffsetUnit;
  /** "do 1º dia" ou "do último dia". */
  anchorWord: string;
  onChange: (days: number, unit: OffsetUnit) => void;
  error?: string | null;
}

/** Deslocamento em linguagem de gente: "[3] [dias úteis] [antes] do 1º dia". */
export function OffsetInput({ legend, days, unit, anchorWord, onChange, error }: OffsetInputProps) {
  const id = useId();
  const direction: Direction = days < 0 ? "before" : days > 0 ? "after" : "same";
  const amount = Math.abs(days);
  const set = (nextAmount: number, nextDirection: Direction, nextUnit: OffsetUnit) => {
    const clean = Math.max(0, Math.min(365, Math.round(Number.isFinite(nextAmount) ? nextAmount : 0)));
    onChange(nextDirection === "same" ? 0 : nextDirection === "before" ? -Math.max(clean, 1) : Math.max(clean, 1), nextUnit);
  };
  return (
    <fieldset className={styles.group} aria-describedby={error ? `${id}-erro` : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.row}>
        {direction !== "same" ? (
          <Field
            label="Quantos dias"
            hideLabel
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={String(amount)}
            onChange={(event) => set(Number(event.target.value), direction, unit)}
            className={styles.amount}
          />
        ) : null}
        {direction !== "same" ? (
          <Select
            label="Tipo de dia"
            hideLabel
            value={unit}
            onChange={(event) => set(amount, direction, event.target.value as OffsetUnit)}
            options={[
              { value: "business", label: amount === 1 ? "dia útil" : "dias úteis" },
              { value: "calendar", label: amount === 1 ? "dia corrido" : "dias corridos" },
            ]}
          />
        ) : null}
        <Select
          label="Antes ou depois"
          hideLabel
          value={direction}
          onChange={(event) => set(amount || 1, event.target.value as Direction, unit)}
          options={[
            { value: "before", label: `antes ${anchorWord}` },
            { value: "same", label: `no próprio dia (${anchorWord.replace(/^do /, "")})` },
            { value: "after", label: `depois ${anchorWord}` },
          ]}
        />
      </div>
      {error ? (
        <p id={`${id}-erro`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
