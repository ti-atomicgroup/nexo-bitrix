"use client";

import { DatabaseBackup, Download, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { saveBlob } from "@/lib/download";
import { useDebounced } from "@/lib/use-debounced";
import { useApi } from "@/lib/use-api";
import type { ErasureReceiptDTO, PrivacyPersonDTO, SettingsDTO } from "@/shared/contracts";
import styles from "./settings-section.module.css";

const RETENTION_OPTIONS = [12, 24, 36, 60, 120];

function PersonRow({ person, onErased }: { person: PrivacyPersonDTO; onErased: (receipt: ErasureReceiptDTO) => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const exportData = async () => {
    setPending(true);
    try {
      const data = await api.privacyExport(person.id);
      saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `dados-${person.id}.json`);
      toast.show({ tone: "success", title: "Dados exportados", description: "Entregue o arquivo só à própria pessoa." });
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setPending(false);
    }
  };

  const erase = async () => {
    setPending(true);
    try {
      onErased(await api.privacyErase(person.id, { confirmName }));
    } catch (caught) {
      setError(toApiError(caught).message);
      setPending(false);
    }
  };

  return (
    <li className={styles.listItem}>
      <div className={styles.itemText}>
        <p className={styles.itemTitle}>{person.name}</p>
        <p className={styles.itemMeta}>
          {person.email ?? "sem e-mail"} · {person.journeys} {person.journeys === 1 ? "jornada" : "jornadas"}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
      {!person.active ? <Chip tone="neutral">Inativa</Chip> : null}
      <Button size="s" variant="ghost" icon={Download} onClick={exportData} disabled={pending}>
        Exportar
        <span className="sr-only"> os dados de {person.name}</span>
      </Button>
      <Button size="s" variant="danger" icon={Trash2} onClick={() => setConfirming(!confirming)} disabled={pending || person.openJourneys > 0}>
        Excluir
        <span className="sr-only"> os dados de {person.name}</span>
      </Button>
      {person.openJourneys > 0 ? <p className={`${styles.itemMeta} ${styles.fullRow}`}>Tem jornada em andamento: cancele ou conclua antes de excluir.</p> : null}
      {confirming ? (
        <form
          className={`${styles.box} ${styles.fullRow}`}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void erase();
          }}
        >
          <Field
            label={`Digite ${person.name} para confirmar`}
            autoComplete="off"
            hint="Apaga jornadas, documentos, inventário e o texto do histórico desta pessoa. Não tem volta. O que está no Bitrix24 continua lá."
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
          />
          <div className={styles.actions}>
            <Button type="submit" size="s" variant="danger" loading={pending} disabled={!confirmName.trim()}>
              Excluir definitivamente
            </Button>
            <Button size="s" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Voltar
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** Dados pessoais (LGPD): quanto tempo guardar, cópia de segurança e exportação ou exclusão por pessoa. Só a administração vê. */
export function PrivacySection({ settings, onSaved }: { settings: SettingsDTO; onSaved: (next: SettingsDTO) => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const people = useApi((signal) => api.privacyPeople({ query: debounced }, { signal }), [debounced], { enabled: debounced.trim().length >= 2 });
  const [receipt, setReceipt] = useState<ErasureReceiptDTO | null>(null);
  const [downloading, setDownloading] = useState(false);

  const saveRetention = async (retentionMonths: number) => {
    try {
      onSaved(await api.settingsUpdate({ retentionMonths }));
      toast.show({ tone: "success", title: `Jornadas encerradas ficam guardadas por ${retentionMonths} meses` });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(error).message });
    }
  };

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await api.backup();
      saveBlob(blob, fileName);
      toast.show({ tone: "success", title: "Cópia baixada", description: "Ela só abre com a chave desta instância." });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível baixar", description: toApiError(error).message });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Panel id="dados" title="Dados pessoais" description="Por quanto tempo o Nexo guarda os dados, a cópia de segurança e os pedidos de cada pessoa (LGPD).">
      <div className={styles.stack}>
        <div className={styles.fields}>
          <Select
            label="Guardar jornadas encerradas por"
            hint="Depois desse prazo, a jornada e o que ela guarda são excluídos sozinhos. O registro de atividades segue o mesmo prazo."
            value={String(settings.retentionMonths)}
            onChange={(event) => void saveRetention(Number(event.target.value))}
            options={RETENTION_OPTIONS.map((months) => ({ value: String(months), label: `${months} meses` }))}
          />
        </div>

        <h3 className={styles.subtitle}>Cópia de segurança</h3>
        <p className={styles.quiet}>O Nexo faz uma cópia cifrada por dia e guarda as últimas no volume de dados. Para ter uma fora dele, baixe aqui: ela só abre com a chave desta instância.</p>
        <div className={styles.actions}>
          <Button icon={DatabaseBackup} loading={downloading} onClick={downloadBackup}>
            Baixar cópia cifrada
          </Button>
        </div>

        <h3 className={styles.subtitle}>Pedido de uma pessoa</h3>
        <Field label="Procurar por nome ou e-mail" leadingIcon={Search} autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} hint="Inclui candidatos e contas desativadas." />
        {receipt ? (
          <Notice tone="success" title="Dados excluídos do Nexo">
            {receipt.journeys} jornada(s), {receipt.documents} documento(s) e {receipt.ledgerItems} item(ns) de inventário. As cópias de segurança guardam esses dados por até {receipt.backupDays} dias.
            {receipt.bitrix.taskIds.length || receipt.bitrix.fileUrls.length
              ? ` No Bitrix24 continuam ${receipt.bitrix.taskIds.length} tarefa(s) (${receipt.bitrix.taskIds.join(", ")}) e ${receipt.bitrix.fileUrls.length} arquivo(s). Quem responde pelo portal decide se apaga.`
              : ""}
          </Notice>
        ) : null}
        {people.error ? (
          <Notice tone="error" title="Não foi possível procurar">
            {people.error.message}
          </Notice>
        ) : debounced.trim().length >= 2 && people.data ? (
          people.data.length ? (
            <ul className={styles.list}>
              {people.data.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  onErased={(next) => {
                    setReceipt(next);
                    people.reload();
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className={styles.quiet}>Ninguém com esse nome ou e-mail.</p>
          )
        ) : null}
      </div>
    </Panel>
  );
}
