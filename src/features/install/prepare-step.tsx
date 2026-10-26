"use client";

import { TrainFront } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PersonPicker } from "@/features/people/person-picker";
import { api, isAbortError, toApiError } from "@/lib/api-client";
import { plural } from "@/lib/format";
import { fieldErrors, focusFirstInvalid } from "@/lib/form-errors";
import type { UserRef } from "@/shared/contracts";
import { prepareInput } from "@/shared/schemas";
import styles from "./install-step.module.css";

type PeopleState = { kind: "loading" } | { kind: "ready"; count: number } | { kind: "failed" };

/** Passo 3: empresa, projeto e responsáveis padrão. "Preparar e começar" faz o resto em 1 clique. */
export function PrepareStep({ onDone }: { onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [companyName, setCompanyName] = useState("");
  const [projectName, setProjectName] = useState("Nexo · Jornadas");
  const [ti, setTi] = useState<UserRef | null>(null);
  const [rh, setRh] = useState<UserRef | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [people, setPeople] = useState<PeopleState>({ kind: "loading" });

  // Traz as pessoas do Bitrix24 para o cache local, para a escolha dos responsáveis.
  useEffect(() => {
    const controller = new AbortController();
    api.peopleRefresh({ signal: controller.signal }).then(
      (result) => setPeople({ kind: "ready", count: result.count }),
      (error: unknown) => {
        if (!isAbortError(error)) setPeople({ kind: "failed" });
      },
    );
    return () => controller.abort();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = prepareInput.safeParse({
      companyName,
      projectName,
      defaults: { ...(ti ? { ti: ti.bitrixUserId } : {}), ...(rh ? { rh: rh.bitrixUserId } : {}) },
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      await api.setupPrepare(parsed.data);
      onDone();
    } catch (caught) {
      setFailure(toApiError(caught).message);
      setPending(false);
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Prepare o Nexo</h2>
        <p className={styles.lead}>
          Em 1 clique, o Nexo procura o projeto privado no Bitrix24 (ou cria um novo), carrega as trilhas iniciais de entrada e saída e define quem responde por TI e
          RH.
        </p>
      </div>

      <p className={styles.peopleStatus} role="status">
        {people.kind === "loading"
          ? "Carregando as pessoas do Bitrix24…"
          : people.kind === "ready"
            ? `${plural(people.count, "pessoa carregada", "pessoas carregadas")} do Bitrix24.`
            : "Não foi possível carregar as pessoas agora. Você pode escolher os responsáveis depois, em Ajustes."}
      </p>

      {failure ? (
        <Notice tone="error" role="alert" title="Não foi possível preparar o Nexo">
          {failure}
        </Notice>
      ) : null}

      <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.columns}>
          <Field
            label="Nome da empresa"
            name="companyName"
            autoComplete="organization"
            hint="Aparece no link do colaborador."
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            error={errors.companyName}
          />
          <Field
            label="Nome do projeto no Bitrix24"
            name="projectName"
            hint="Se já existir um projeto com este nome, o Nexo usa o mesmo."
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            error={errors.projectName}
          />
          <PersonPicker label="Responsável padrão de TI" value={ti} onChange={setTi} optional hint="Recebe as tarefas de acessos e equipamentos." error={errors["defaults.ti"]} />
          <PersonPicker label="Responsável padrão de RH" value={rh} onChange={setRh} optional hint="Recebe as tarefas do RH e acompanha as jornadas." error={errors["defaults.rh"]} />
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" icon={TrainFront} loading={pending}>
            {pending ? "Preparando…" : "Preparar e começar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
