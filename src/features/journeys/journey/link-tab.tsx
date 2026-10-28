"use client";

import { BellRing, Ban, Copy, KeyRound, MessagesSquare, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** Link pessoal do colaborador: criar, revogar, enviar pelo chat do Bitrix24 ou copiar, lembrar do que falta e ver a prévia. */
export function LinkTab({ journey, today, onChanged }: { journey: JourneyDTO; today: string; onChanged: (link: CollaboratorLinkDTO) => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useApi((signal) => api.settings({ signal }), [], { revalidateOnFocus: false });
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [sending, setSending] = useState<"link" | "reminder" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const { person, kind } = journey.summary;
  const first = firstName(person.name);
  // Chat do Bitrix24: só para quem tem conta lá e com a permissão Bate-papo e notificações (im) no webhook.
  const canChat = Boolean(person.bitrixUserId) && Boolean(settings.data?.webhook?.scopes.optional.im);
  const chatHint = !person.bitrixUserId
    ? `${first} ainda não tem conta no Bitrix24: copie e envie por onde preferir, ou vincule ou convide a conta no topo da página.`
    : settings.data && !settings.data.webhook?.scopes.optional.im
      ? "Para enviar pelo chat do Bitrix24, o webhook precisa da permissão Bate-papo e notificações (im)."
      : null;

  const sendByBitrix = async (body: { kind: "link"; url: string } | { kind: "reminder" }) => {
    setSending(body.kind);
    try {
      await api.journeyCollaboratorMessage(journey.summary.id, body);
      toast.show({
        tone: "success",
        title: body.kind === "link" ? "Link enviado pelo Bitrix24" : "Lembrete enviado pelo Bitrix24",
        description: `A mensagem está no chat de ${first} no Bitrix24.`,
      });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível enviar pelo Bitrix24", description: toApiError(error).message });
    } finally {
      setSending(null);
    }
  };

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

  // Lembrete: o que falta do lado do colaborador (no Bitrix24, cada item leva à tarefa; o texto daqui serve para copiar).
  const reminderRef = useRef<HTMLTextAreaElement>(null);
  const pending = collaboratorPending(journey);
  const reminder = reminderMessage(kind, first, pending, created);

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
              {canChat ? (
                <Button variant="primary" icon={MessagesSquare} loading={sending === "link"} onClick={() => sendByBitrix({ kind: "link", url: created })}>
                  Enviar pelo Bitrix24
                </Button>
              ) : null}
              <Button variant={canChat ? "secondary" : "primary"} icon={Copy} onClick={copy}>
                Copiar link
              </Button>
            </div>
            {chatHint ? <p className={styles.hint}>{chatHint}</p> : null}
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
              {canChat ? (
                <Button variant="forest" icon={MessagesSquare} loading={sending === "reminder"} onClick={() => sendByBitrix({ kind: "reminder" })}>
                  Lembrar pelo Bitrix24
                </Button>
              ) : null}
              <Button variant={canChat ? "ghost" : "secondary"} icon={Copy} onClick={() => copyText(reminder, reminderRef.current, "Mensagem copiada")}>
                Copiar mensagem
              </Button>
            </div>
            {canChat ? <p className={styles.hint}>No Bitrix24, cada item da lista abre a tarefa correspondente.</p> : chatHint ? <p className={styles.hint}>{chatHint}</p> : null}
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
