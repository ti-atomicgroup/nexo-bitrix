"use client";

import { Search, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { describedBy, FieldFrame } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDebounced } from "@/lib/use-debounced";
import type { PersonDTO, UserRef } from "@/shared/contracts";
import styles from "./person-picker.module.css";

export interface PersonPickerProps {
  label: string;
  value: UserRef | null;
  onChange: (value: UserRef | null) => void;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  placeholder?: string;
  /** Pessoas que não podem ser escolhidas aqui (ex.: quem está entrando). */
  excludeIds?: string[];
  id?: string;
}

function toUserRef(person: PersonDTO): UserRef | null {
  return person.bitrixUserId ? { bitrixUserId: person.bitrixUserId, name: person.name, position: person.position } : null;
}

/**
 * Escolha de um usuário do Bitrix24 (busca no cache local de pessoas, sem chamar o Bitrix).
 * Combobox com lista: setas escolhem, Enter confirma, Esc fecha.
 */
export function PersonPicker({ label, value, onChange, hint, error, optional, placeholder = "Digite um nome", excludeIds = [], id: idProp }: PersonPickerProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-lista`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 250);

  const results = useApi((signal) => api.people({ query: debounced, limit: 8 }, { signal }), [debounced], {
    enabled: open && !value,
    revalidateOnFocus: false,
  });
  const options = (results.data ?? []).filter((person) => person.bitrixUserId && person.active && !excludeIds.includes(person.bitrixUserId));
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const activeOption = open ? options[activeIndex] : undefined;

  const choose = (person: PersonDTO) => {
    const ref = toUserRef(person);
    if (!ref) return;
    onChange(ref);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.min(activeIndex + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      if (open && activeOption) {
        event.preventDefault();
        choose(activeOption);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  };

  if (value) {
    return (
      <div className={styles.field} role="group" aria-labelledby={`${id}-rotulo`}>
        <span id={`${id}-rotulo`} className={styles.label}>
          {label}
          {optional ? <span className={styles.optional}> (opcional)</span> : null}
        </span>
        <div className={styles.chosen}>
          <Avatar name={value.name} size="m" tone="light" />
          <div className={styles.chosenText}>
            <p className={styles.chosenName}>{value.name}</p>
            {value.position ? <p className={styles.chosenMeta}>{value.position}</p> : null}
          </div>
          <Button
            size="s"
            variant="ghost"
            icon={optional ? X : undefined}
            onClick={() => {
              onChange(null);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {optional ? "Remover" : "Trocar"}
            <span className="sr-only"> {value.name}</span>
          </Button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  const statusText = !open
    ? ""
    : results.loading
      ? "Buscando…"
      : results.error
        ? results.error.message
        : options.length === 0
          ? "Ninguém encontrado com esse nome."
          : plural(options.length, "pessoa encontrada", "pessoas encontradas");

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional}>
      <div className={styles.combo}>
        <div className={cx(styles.control, error && styles.invalid)}>
          <Search className={styles.searchIcon} size={20} strokeWidth={2.25} aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            className={styles.input}
            placeholder={placeholder}
            value={query}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul id={listId} role="listbox" aria-label={label} className={cx(styles.list, !open && styles.hidden)}>
          {open
            ? options.map((person, index) => (
                <li
                  key={person.id}
                  id={`${listId}-${person.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cx(styles.option, index === activeIndex && styles.activeOption)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(person)}
                >
                  <Avatar name={person.name} size="s" tone="light" />
                  <span className={styles.optionText}>
                    <span className={styles.optionName}>{person.name}</span>
                    {person.position || person.department ? (
                      <span className={styles.optionMeta}>{[person.position, person.department].filter(Boolean).join(" · ")}</span>
                    ) : null}
                  </span>
                </li>
              ))
            : null}
        </ul>
        {open && (results.loading || options.length === 0 || results.error) ? <p className={styles.empty}>{statusText}</p> : null}
        <span className="sr-only" role="status" aria-live="polite">
          {statusText}
        </span>
      </div>
    </FieldFrame>
  );
}
