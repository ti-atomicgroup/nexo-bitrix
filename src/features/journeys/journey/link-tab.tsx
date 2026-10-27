"use client";

import { BellRing, Ban, Copy, KeyRound, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { CollaboratorPage } from "@/features/collaborator/collaborator-page";
import { api, toApiError } from "@/lib/api-client";
import { firstName, relativeTo } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { CollaboratorLinkDTO, JourneyDTO } from "@/shared/contracts";
import { toCollaboratorPreview } from "./collaborator-preview";
import styles from "./link-tab.module.css";
import { collaboratorPending, reminderMessage } from "./reminder";

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Link pessoal do colaborador: criar, revogar, copiar, enviar por WhatsApp ou e-mail e ver a prévia. */
export function LinkTab({ journey, today, onChanged }: { journey: JourneyDTO; today: string; onChanged: (link: CollaboratorLinkDTO) => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useApi((signal) => api.settings({ signal }), [], { revalidateOnFocus: false });
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const { person, kind } = journey.summary;
  const first = firstName(person.name);
  const company = settings.data?.company.name || "a empresa";

  const run = async (action: "create" | "revoke") => {
    setBusy(action);
    try {
      const link = await api.journeyCollaboratorLink(journey.summary.id, { action });
      onChanged(link);
      setCreated(action === "create" && link.url ? absolute(link.url) : null);
      setConfirmRevoke(false);
      toast.show(
        action === "create"
          ? { tone: "success", title: "Link criado", description: `Envie agora para ${first}: por segurança, o Nexo não mostra este link de novo.` }
          : { tone: "success", title: "Link revogado", description: "Quem tiver o link antigo vê uma página de link expirado." },
      );
    } catch (error) {
      toast.show({ tone: "error", title: action === "create" ? "Não foi possível criar o link" : "Não foi possível revogar o link", description: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  };

  const copyText = async (text: string, field: HTMLInputElement | HTMLTextAreaElement | null, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: "success", title });
    } catch {
      // Dentro do painel da Onnira a API de área de transferência é bloqueada; o comando antigo ainda funciona com o texto selecionado.
      field?.select();
      const copied = typeof document.execCommand === "function" && document.execCommand("copy");
      if (copied) toast.show({ tone: "success", title });
      else toast.show({ tone: "info", title: "Copie com Ctrl+C", description: "O navegador não deixou copiar sozinho; o texto já está selecionado." });
    }
  };
  const copy = () => (created ? copyText(created, inputRef.current, "Link copiado") : undefined);

  // Lembrete: o que falta do lado do colaborador, pronto para WhatsApp ou e-mail.
  const reminderRef = useRef<HTMLTextAreaElement>(null);
  const pending = collaboratorPending(journey);
  const reminder = reminderMessage(kind, first, pending, created);
  const reminderSubject = kind === "onboarding" ? `O que falta para a sua chegada à ${company}` : "O que falta para concluir a sua saída";

  const message =
    kind === "onboarding"
      ? `Olá, ${first}! Este é o seu link pessoal para acompanhar a sua chegada à ${company}: ${created ?? ""}`
      : `Olá, ${first}. Este é o seu link pessoal com as informações da sua saída da ${company}: ${created ?? ""}`;
  const subject = kind === "onboarding" ? `Boas-vindas à ${company}` : "Informações da sua saída";
  const mailto = `mailto:${person.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className={styles.tab}>
      <div className={styles.manage}>
        <div className={styles.intro}>
          <h2 className={styles.title}>Link pessoal de {first}</h2>
          <p className={styles.lead}>
            {kind === "onboarding"
              ? `Sem senha e pensado para o celular: ${first} acompanha a chegada, marca o que fez e encontra materiais, pessoas e respostas.`
              : `Sem senha e pensado para o celular: ${first} vê o que devolver e quando, os contatos e as respostas. O motivo da saída nunca aparece.`}
          </p>
        </div>

        {created ? (
          <div className={styles.created}>
            <Notice tone="success" icon={KeyRound} title="Link pronto para enviar">
              Por segurança, o Nexo não guarda este endereço e não consegue mostrá-lo de novo. Envie agora.
            </Notice>
            <label className={styles.urlLabel} htmlFor="link-colaborador">
              Link pessoal
            </label>
            <input id="link-colaborador" ref={inputRef} className={styles.url} readOnly value={created} onFocus={(event) => event.currentTarget.select()} />
            <div className={styles.actions}>
              <Button variant="primary" icon={Copy} onClick={copy}>
                Copiar link
              </Button>
              <ButtonLink href={whatsapp} external variant="secondary" icon={MessageCircle}>
                Enviar por WhatsApp
              </ButtonLink>
              <ButtonLink href={mailto} variant="secondary" icon={Mail}>
                Enviar por e-mail
              </ButtonLink>
            </div>
          </div>
        ) : journey.link.active ? (
          <Notice
            tone="info"
            icon={KeyRound}
            title="Link ativo"
            action={
              <Button variant="secondary" size="s" icon={RefreshCw} loading={busy === "create"} onClick={() => run("create")}>
                Gerar novo link
              </Button>
            }
          >
            {journey.link.expiresAt ? `Expira ${relativeTo(journey.link.expiresAt, today)}. ` : ""}O endereço só aparece na hora em que é criado. Se ele se perdeu, gere um novo e envie.
          </Notice>
        ) : (
          <div className={styles.actions}>
            <Button variant="primary" icon={KeyRound} loading={busy === "create"} onClick={() => run("create")}>
              Criar link pessoal
            </Button>
          </div>
        )}

        {journey.link.active && pending.length ? (
          <section className={styles.reminder} aria-labelledby="lembrete-titulo">
            <h3 id="lembrete-titulo" className={styles.reminderTitle}>
              <BellRing size={18} strokeWidth={2.25} aria-hidden="true" />
              Lembrar {first} do que falta
            </h3>
            <label className={styles.urlLabel} htmlFor="lembrete-texto">
              Mensagem
            </label>
            <textarea id="lembrete-texto" ref={reminderRef} className={styles.message} readOnly rows={Math.min(8, pending.length + 3)} value={reminder} />
            <div className={styles.actions}>
              <ButtonLink href={`https://wa.me/?text=${encodeURIComponent(reminder)}`} external variant="secondary" icon={MessageCircle}>
                Lembrar por WhatsApp
              </ButtonLink>
              <ButtonLink
                href={`mailto:${person.email ?? ""}?subject=${encodeURIComponent(reminderSubject)}&body=${encodeURIComponent(reminder)}`}
                variant="secondary"
                icon={Mail}
              >
                Lembrar por e-mail
              </ButtonLink>
              <Button variant="ghost" icon={Copy} onClick={() => copyText(reminder, reminderRef.current, "Mensagem copiada")}>
                Copiar mensagem
              </Button>
            </div>
          </section>
        ) : null}

        {journey.link.active ? (
          <div>
            <Button variant="danger" size="s" icon={Ban} onClick={() => setConfirmRevoke(true)}>
              Revogar link
            </Button>
          </div>
        ) : null}
      </div>

      <section className={styles.preview} aria-labelledby="previa-titulo">
        <h3 id="previa-titulo" className={styles.previewTitle}>
          Prévia do que {first} vê
        </h3>
        <div className={styles.phone}>
          {settings.loading ? (
            <LoadingArea label="Montando a prévia…">
              <Skeleton height={200} radius={6} />
            </LoadingArea>
          ) : (
            <CollaboratorPage view={toCollaboratorPreview(journey, settings.data ?? null, today)} token="previa" preview />
          )}
        </div>
      </section>

      <Dialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        tone="danger"
        title="Revogar o link pessoal?"
        description={`${first} deixa de acessar a página. Você pode criar um link novo depois.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmRevoke(false)}>
              Voltar
            </Button>
            <Button variant="danger" icon={Ban} loading={busy === "revoke"} onClick={() => run("revoke")}>
              Revogar link
            </Button>
          </>
        }
      />
    </div>
  );
}
