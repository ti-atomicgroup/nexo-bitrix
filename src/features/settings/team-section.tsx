"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { PersonPicker } from "@/features/people/person-picker";
import { api, toApiError } from "@/lib/api-client";
import { formatSince } from "@/lib/format";
import { fieldErrors } from "@/lib/form-errors";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { AppUserDTO, SettingsDTO, UserRef } from "@/shared/contracts";
import { type AppRole, type ParticipantRole } from "@/shared/enums";
import { createUserInput, updateUserInput } from "@/shared/schemas";
import styles from "./settings-section.module.css";

const DEFAULT_ROLES: Array<{ role: ParticipantRole; label: string; hint: string }> = [
  { role: "rh", label: "RH", hint: "Recebe as tarefas do RH em todas as jornadas." },
  { role: "ti", label: "TI", hint: "Recebe as tarefas de acessos e equipamentos." },
  { role: "gestor", label: "Gestor", hint: "Usado quando a jornada não indica a liderança da pessoa." },
  { role: "buddy", label: "Buddy", hint: "Usado quando a jornada não indica um buddy." },
];

const ROLE_LABEL: Record<AppRole, string> = { admin: "Administração", rh: "RH" };

function UserRow({ user, onChanged }: { user: AppUserDTO; onChanged: () => void }) {
  const toast = useToast();
  const now = useNow(60_000);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = async (body: { active?: boolean; resetPassword?: string }, success: string) => {
    const parsed = updateUserInput.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os dados.");
      return;
    }
    setPending(true);
    try {
      await api.userUpdate(user.id, parsed.data);
      toast.show({ tone: "success", title: success });
      setResetting(false);
      setPassword("");
      setError(null);
      onChanged();
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={styles.listItem}>
      <div className={styles.itemText}>
        <p className={styles.itemTitle}>{user.name}</p>
        <p className={styles.itemMeta}>
          {user.email} · {user.lastLoginAt && now !== null ? `entrou ${formatSince(user.lastLoginAt, now)}` : "ainda não entrou"}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
      <Chip tone={user.role === "admin" ? "forest" : "neutral"}>{ROLE_LABEL[user.role]}</Chip>
      {!user.active ? <Chip tone="neutral">Desativado</Chip> : null}
      <Button size="s" variant="ghost" icon={KeyRound} onClick={() => setResetting(!resetting)} disabled={pending}>
        Nova senha
        <span className="sr-only"> para {user.name}</span>
      </Button>
      <Button size="s" variant={user.active ? "danger" : "secondary"} loading={pending && !resetting} onClick={() => update({ active: !user.active }, user.active ? "Acesso desativado" : "Acesso reativado")}>
        {user.active ? "Desativar" : "Reativar"}
        <span className="sr-only"> {user.name}</span>
      </Button>
      {resetting ? (
        <form
          className={styles.box}
          style={{ flexBasis: "100%" }}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void update({ resetPassword: password }, "Senha redefinida");
          }}
        >
          <Field
            label={`Senha temporária para ${user.name}`}
            type="text"
            autoComplete="off"
            hint="Pelo menos 10 caracteres. Combine com a pessoa um canal seguro para enviar."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className={styles.actions}>
            <Button type="submit" size="s" variant="forest" loading={pending}>
              Salvar nova senha
            </Button>
            <Button size="s" variant="ghost" onClick={() => setResetting(false)}>
              Voltar
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function NewUserForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", role: "rh" as AppRole, temporaryPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createUserInput.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.userCreate(parsed.data);
      toast.show({ tone: "success", title: "Acesso criado", description: `Envie a senha temporária para ${parsed.data.name} por um canal seguro.` });
      setForm({ name: "", email: "", role: "rh", temporaryPassword: "" });
      onCreated();
    } catch (caught) {
      setErrors({ form: toApiError(caught).message });
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.box} onSubmit={submit} noValidate>
      <h4 className={styles.subtitle}>Novo acesso ao Nexo</h4>
      <div className={styles.fields}>
        <Field label="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={errors.name} />
        <Field label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={errors.email} />
        <Select
          label="Permissão"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}
          options={[
            { value: "rh", label: "RH: acompanha jornadas e trilhas" },
            { value: "admin", label: "Administração: também muda Ajustes" },
          ]}
        />
        <Field
          label="Senha temporária"
          type="text"
          autoComplete="off"
          hint="Pelo menos 10 caracteres."
          value={form.temporaryPassword}
          onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })}
          error={errors.temporaryPassword}
        />
      </div>
      {errors.form ? (
        <p className={styles.error} role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button type="submit" variant="forest" icon={UserPlus} loading={pending}>
          Criar acesso
        </Button>
      </div>
    </form>
  );
}

/** Equipe: responsáveis padrão de cada papel e os acessos ao Nexo. */
export function TeamSection({ settings, isAdmin, onSaved }: { settings: SettingsDTO; isAdmin: boolean; onSaved: (next: SettingsDTO) => void }) {
  const toast = useToast();
  const users = useApi((signal) => api.users({ signal }), [], { enabled: isAdmin });
  const [saving, setSaving] = useState<ParticipantRole | null>(null);

  const saveDefault = async (role: ParticipantRole, ref: UserRef | null) => {
    setSaving(role);
    try {
      onSaved(await api.settingsUpdate({ defaults: { [role]: ref ? ref.bitrixUserId : null } }));
      toast.show({ tone: "success", title: ref ? `${ref.name} é o padrão para ${role === "rh" ? "RH" : role === "ti" ? "TI" : role === "gestor" ? "Gestor" : "Buddy"}` : "Padrão removido" });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(error).message });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Panel id="equipe" title="Equipe" description="Quem recebe as tarefas quando a jornada não diz outra pessoa, e quem acessa o Nexo.">
      <div className={styles.stack}>
        <h3 className={styles.subtitle}>Responsáveis padrão</h3>
        {isAdmin ? (
          <div className={styles.fields}>
            {DEFAULT_ROLES.map((item) => (
              <div key={item.role} aria-busy={saving === item.role || undefined}>
                <PersonPicker label={item.label} hint={item.hint} optional value={settings.defaults[item.role] ?? null} onChange={(ref) => saveDefault(item.role, ref)} />
              </div>
            ))}
          </div>
        ) : (
          <dl className={styles.facts}>
            {DEFAULT_ROLES.map((item) => (
              <div key={item.role}>
                <dt>{item.label}</dt>
                <dd>{settings.defaults[item.role]?.name ?? "Ninguém"}</dd>
              </div>
            ))}
          </dl>
        )}

        <h3 className={styles.subtitle}>Acessos ao Nexo</h3>
        {!isAdmin ? (
          <p className={styles.quiet}>Só a administração vê e cria acessos.</p>
        ) : users.loading ? (
          <LoadingArea label="Carregando os acessos…">
            <Skeleton height={64} radius={6} />
          </LoadingArea>
        ) : users.error ? (
          <Notice tone="error" title="Não foi possível carregar os acessos">
            {users.error.message}
          </Notice>
        ) : (
          <ul className={styles.list}>
            {(users.data ?? []).map((user) => (
              <UserRow key={user.id} user={user} onChanged={users.reload} />
            ))}
          </ul>
        )}
        {isAdmin ? <NewUserForm onCreated={users.reload} /> : null}
      </div>
    </Panel>
  );
}
