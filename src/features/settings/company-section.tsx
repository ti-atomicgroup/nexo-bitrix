"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import type { SettingsDTO } from "@/shared/contracts";
import { SCOPE_LABEL, type OptionalScope } from "@/shared/enums";
import styles from "./settings-section.module.css";

const TIME_ZONES = [
  ["America/Sao_Paulo", "Brasília (São Paulo, Rio, Sul, Nordeste)"],
  ["America/Manaus", "Amazonas (Manaus)"],
  ["America/Cuiaba", "Mato Grosso (Cuiabá)"],
  ["America/Porto_Velho", "Rondônia (Porto Velho)"],
  ["America/Rio_Branco", "Acre (Rio Branco)"],
  ["America/Belem", "Pará (Belém)"],
  ["America/Fortaleza", "Ceará (Fortaleza)"],
  ["America/Recife", "Pernambuco (Recife)"],
  ["America/Noronha", "Fernando de Noronha"],
] as const;

const FEATURES: Array<{ key: keyof SettingsDTO["features"]; scope: OptionalScope; label: string; description: string }> = [
  { key: "notifications", scope: "im", label: "Notificações", description: "Avisa responsáveis no Bitrix24 e envia o link ao colaborador que tem conta." },
  { key: "calendar", scope: "calendar", label: "Agenda", description: "Marca o 1:1 e a entrevista de saída como eventos." },
  { key: "feed", scope: "log", label: "Feed de notícias", description: "Publica as boas-vindas no 1º dia." },
];

/** Empresa (nome e fuso) e recursos opcionais, que só ligam com a permissão certa no webhook. */
export function CompanySection({ settings, isAdmin, onSaved }: { settings: SettingsDTO; isAdmin: boolean; onSaved: (next: SettingsDTO) => void }) {
  const toast = useToast();
  const [name, setName] = useState(settings.company.name);
  const [timezone, setTimezone] = useState(settings.company.timezone);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const zones = TIME_ZONES.some(([value]) => value === timezone) ? TIME_ZONES : ([[timezone, timezone], ...TIME_ZONES] as const);

  const saveCompany = async () => {
    if (!name.trim()) {
      setError("Preencha este campo.");
      return;
    }
    setError(null);
    setPending("company");
    try {
      onSaved(await api.settingsUpdate({ company: { name: name.trim(), timezone } }));
      toast.show({ tone: "success", title: "Empresa salva" });
    } catch (caught) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(caught).message });
    } finally {
      setPending(null);
    }
  };

  const toggle = async (key: keyof SettingsDTO["features"], value: boolean) => {
    setPending(key);
    try {
      onSaved(await api.settingsUpdate({ features: { [key]: value } }));
    } catch (caught) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(caught).message });
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel id="empresa" title="Empresa e recursos">
      <div className={styles.stack}>
        <div className={styles.fields}>
          <Field label="Nome da empresa" hint="Aparece no link do colaborador." value={name} disabled={!isAdmin} onChange={(event) => setName(event.target.value)} error={error} />
          <Select
            label="Fuso horário"
            hint="Prazos e o dia de hoje seguem este fuso."
            value={timezone}
            disabled={!isAdmin}
            onChange={(event) => setTimezone(event.target.value)}
            options={zones.map(([value, label]) => ({ value, label }))}
          />
        </div>
        {isAdmin ? (
          <div className={styles.actions}>
            <Button variant="forest" icon={Save} loading={pending === "company"} onClick={saveCompany}>
              Salvar empresa
            </Button>
          </div>
        ) : null}

        <fieldset className={styles.box}>
          <legend className={styles.subtitle}>Recursos opcionais</legend>
          {FEATURES.map((feature) => {
            const granted = settings.webhook?.scopes.optional[feature.scope] ?? false;
            return (
              <Checkbox
                key={feature.key}
                label={feature.label}
                description={granted ? feature.description : `Para ligar, marque a permissão ${SCOPE_LABEL[feature.scope]} (${feature.scope}) no webhook e troque o webhook acima.`}
                checked={settings.features[feature.key] && granted}
                disabled={!isAdmin || !granted || pending === feature.key}
                onChange={(event) => toggle(feature.key, event.target.checked)}
              />
            );
          })}
        </fieldset>
      </div>
    </Panel>
  );
}
