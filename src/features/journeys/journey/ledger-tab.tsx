"use client";

import { Archive, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { LEDGER_ICON } from "@/components/lines/icons";
import { Pictogram } from "@/components/lines/pictogram";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { calendarDateOf, firstName, formatDateShort, plural } from "@/lib/format";
import { fieldErrors, focusFirstInvalid } from "@/lib/form-errors";
import type { JourneyDTO, LedgerItemDTO } from "@/shared/contracts";
import { LEDGER_KIND_LABEL, LEDGER_STATUS_LABEL, type LedgerKind } from "@/shared/enums";
import { ledgerItemInput, ledgerWaiveInput } from "@/shared/schemas";
import { LEDGER_STATUS_TONE } from "../labels";
import styles from "./ledger-tab.module.css";

const OPEN_STATUSES = new Set<LedgerItemDTO["status"]>(["planned", "active", "return_requested"]);

function WaiveForm({ item, onDone, onCancel }: { item: LedgerItemDTO; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = ledgerWaiveInput.safeParse({ status: "waived", reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Explique o motivo.");
      return;
    }
    setPending(true);
    try {
      await api.ledgerWaive(item.id, parsed.data);
      toast.show({ tone: "success", title: "Item dispensado", description: `${item.name} não bloqueia mais a conclusão.` });
      onDone();
    } catch (caught) {
      setError(toApiError(caught).message);
      setPending(false);
    }
  };

  return (
    <form className={styles.waive} onSubmit={submit} noValidate>
      <Textarea
        label={`Por que dispensar ${item.name}?`}
        hint="Ex.: a pessoa usava equipamento próprio. Fica no histórico."
        rows={2}
        maxLength={300}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={error}
        autoFocus
      />
      <div className={styles.actions}>
        <Button type="submit" variant="forest" size="s" loading={pending}>
          Dispensar item
        </Button>
        <Button variant="ghost" size="s" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
      </div>
    </form>
  );
}

/** "Tudo o que entrou, sai.": acessos e equipamentos da pessoa, com entrada manual e dispensa com motivo. */
export function LedgerTab({ journey, onChanged }: { journey: JourneyDTO; onChanged: () => void }) {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const { person, kind } = journey.summary;
  const [waiving, setWaiving] = useState<string | null>(null);
  const [itemKind, setItemKind] = useState<LedgerKind>("equipment");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const pendingItems = journey.ledger.filter((item) => OPEN_STATUSES.has(item.status));

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = ledgerItemInput.safeParse({ kind: itemKind, name, detail });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.personLedgerAdd(person.id, parsed.data);
      toast.show({ tone: "success", title: "Item adicionado", description: `${parsed.data.name} entrou no inventário de ${firstName(person.name)}.` });
      setName("");
      setDetail("");
      onChanged();
    } catch (caught) {
      setErrors({ form: toApiError(caught).message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.tab}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Tudo o que entrou, sai.</h2>
        <p className={styles.lead}>
          {kind === "onboarding"
            ? `Acessos e equipamentos entregues a ${firstName(person.name)}. Na saída, viram a lista "Revogar e recolher" da TI.`
            : `Só o que ainda está com ${firstName(person.name)} impede a conclusão da jornada. ${plural(pendingItems.length, "item pendente", "itens pendentes")}.`}
        </p>
      </div>

      {journey.ledger.length ? (
        <ul className={styles.list}>
          {journey.ledger.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.row}>
                <Pictogram icon={LEDGER_ICON[item.kind]} tone={OPEN_STATUSES.has(item.status) ? "forest" : "muted"} label={LEDGER_KIND_LABEL[item.kind]} />
                <div className={styles.text}>
                  <p className={styles.name}>{item.name}</p>
                  <p className={styles.meta}>
                    {[
                      LEDGER_KIND_LABEL[item.kind],
                      item.detail,
                      item.source === "manual" ? "registrado à mão" : "veio da trilha de entrada",
                      item.grantedAt ? `entregue em ${formatDateShort(calendarDateOf(item.grantedAt) ?? item.grantedAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {item.status === "waived" && item.waivedReason ? <p className={styles.meta}>Dispensado: {item.waivedReason}</p> : null}
                </div>
                <Chip tone={LEDGER_STATUS_TONE[item.status]}>{LEDGER_STATUS_LABEL[item.status]}</Chip>
                {OPEN_STATUSES.has(item.status) && waiving !== item.id ? (
                  <Button variant="ghost" size="s" icon={Archive} onClick={() => setWaiving(item.id)}>
                    Dispensar
                    <span className="sr-only"> {item.name}</span>
                  </Button>
                ) : null}
              </div>
              {waiving === item.id ? (
                <WaiveForm
                  item={item}
                  onCancel={() => setWaiving(null)}
                  onDone={() => {
                    setWaiving(null);
                    onChanged();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.quiet}>Nenhum acesso ou equipamento registrado ainda. Itens do checklist marcados como acesso ou equipamento aparecem aqui sozinhos.</p>
      )}

      <form ref={formRef} className={styles.add} onSubmit={add} noValidate>
        <h3 className={styles.addTitle}>Registrar item à mão</h3>
        <p className={styles.quiet}>Para o que foi entregue antes do Nexo ou fora das trilhas.</p>
        <div className={styles.fields}>
          <Select
            label="Tipo"
            value={itemKind}
            onChange={(event) => setItemKind(event.target.value as LedgerKind)}
            options={[
              { value: "equipment", label: "Equipamento" },
              { value: "access", label: "Acesso" },
            ]}
          />
          <Field label="Nome" placeholder={itemKind === "access" ? "Ex.: Conta do Google Workspace" : "Ex.: Notebook Dell 5440"} value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
          <Field label="Detalhe" optional placeholder="Ex.: patrimônio 0042" value={detail} onChange={(event) => setDetail(event.target.value)} error={errors.detail} />
        </div>
        {errors.form ? <p className={styles.error} role="alert">{errors.form}</p> : null}
        <div>
          <Button type="submit" variant="forest" icon={Plus} loading={pending}>
            Adicionar ao inventário
          </Button>
        </div>
      </form>
    </div>
  );
}
