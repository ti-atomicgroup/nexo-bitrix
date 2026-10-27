import { Check, Clock, ExternalLink, FileUp, Upload } from "lucide-react";
import { ACTIVITY_KIND_ICON } from "@/components/lines/icons";
import { daysBetween, formatDateShort, relativeDays, wallClock } from "@/lib/format";
import type { CollaboratorActivityDTO } from "@/shared/contracts";

/** "Prazo: amanhã, 18:00", "Quando: em 3 dias, 30 de out.", "Prazo: 27 de out. (já passou)". */
export function dueText(activity: CollaboratorActivityDTO, today: string): string {
  const clock = wallClock(activity.dueAt);
  if (!clock) return "";
  const label = activity.kind === "meeting" ? "Quando" : "Prazo";
  const diff = daysBetween(today, clock.date);
  const time = clock.time.replace(/^0(\d)/, "$1");
  if (diff < 0) return `${label}: ${formatDateShort(clock.date)} (já passou)`;
  if (diff <= 1) return `${label}: ${relativeDays(diff)}, ${time}`;
  return `${label}: ${relativeDays(diff)}, ${formatDateShort(clock.date)}`;
}

const THEIR_STATUS: Record<CollaboratorActivityDTO["status"], string> = {
  todo: "Em andamento",
  done: "Pronto",
  waiting: "Em breve",
};

export interface CollaboratorActivityProps {
  activity: CollaboratorActivityDTO;
  today: string;
  token: string;
  /** Prévia no console: mostra o botão, mas sem formulário. */
  preview: boolean;
  /** O link aceita envio de arquivos (webhook com Drive). Sem isso, os documentos pedidos aparecem só como lista. */
  uploads?: boolean;
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** Documentos pedidos: o que já chegou e um formulário de envio por documento (multipart, sem JavaScript). */
function DocumentRequests({ activity, token, preview, uploads }: { activity: CollaboratorActivityDTO; token: string; preview: boolean; uploads: boolean }) {
  const requests = activity.documents ?? [];
  const open = activity.status !== "waiting";
  return (
    <>
      <ul className="cp-docs" aria-label={`Documentos pedidos em ${activity.title}`}>
        {requests.map((request) => {
          const count = request.received.length;
          const fieldId = `arquivo-${activity.id}-${request.key}`;
          const form =
            uploads && open ? (
              preview ? (
                <button type="button" className="cp-btn" disabled>
                  <Upload size={20} strokeWidth={2.5} aria-hidden="true" />
                  Enviar arquivo
                </button>
              ) : (
                <form className="cp-upload" method="post" encType="multipart/form-data" action={`/j/${encodeURIComponent(token)}/documento`}>
                  <input type="hidden" name="activityId" value={activity.id} />
                  <input type="hidden" name="key" value={request.key} />
                  <label className="cp-file-label" htmlFor={fieldId}>
                    <span className="cp-sr">{request.name}: </span>
                    Foto ou PDF, até 10 MB
                  </label>
                  <input id={fieldId} className="cp-file" type="file" name="file" accept={ACCEPT} required />
                  <button type="submit" className="cp-btn">
                    <Upload size={20} strokeWidth={2.5} aria-hidden="true" />
                    Enviar
                  </button>
                </form>
              )
            ) : null;
          return (
            <li key={request.key} className={`cp-doc${count ? " cp-doc--got" : ""}`}>
              <div className="cp-doc-head">
                <span className="cp-doc-mark" aria-hidden="true">
                  {count ? <Check size={16} strokeWidth={3} /> : <FileUp size={16} strokeWidth={2.25} />}
                </span>
                <div className="cp-act-text">
                  <p className="cp-doc-name">
                    {request.name}
                    {request.required ? null : <span className="cp-doc-opt"> (opcional)</span>}
                  </p>
                  {request.hint ? <p className="cp-act-meta">{request.hint}</p> : null}
                  <p className="cp-doc-state">{count ? (count > 1 ? `Recebido (${count} arquivos)` : "Recebido") : request.required ? "Falta enviar" : "Envie se tiver"}</p>
                </div>
              </div>
              {form && count ? (
                <details className="cp-more">
                  <summary>Enviar outro arquivo</summary>
                  {form}
                </details>
              ) : (
                form
              )}
            </li>
          );
        })}
      </ul>
      {!uploads && open ? <p className="cp-docs-note">Envie estes documentos ao RH pelo canal combinado com você.</p> : null}
    </>
  );
}

/**
 * Uma atividade na página do colaborador. As do próprio colaborador têm "Marcar como feita" (formulário POST,
 * sem JavaScript); as das outras pessoas aparecem como "o que vai acontecer", com o papel e nunca o nome de quem faz.
 */
export function CollaboratorActivity({ activity, today, token, preview, uploads = false }: CollaboratorActivityProps) {
  const Icon = ACTIVITY_KIND_ICON[activity.kind];
  const links = activity.links.length ? (
    <ul className="cp-links">
      {activity.links.map((link) => (
        <li key={link.url}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} strokeWidth={2.25} aria-hidden="true" />
            {link.label}
            <span className="cp-sr"> (abre em nova aba)</span>
          </a>
        </li>
      ))}
    </ul>
  ) : null;

  if (!activity.mine) {
    return (
      <li className="cp-act cp-act--theirs">
        <div className="cp-act-head">
          <span className="cp-tile" aria-hidden="true">
            <Icon size={20} strokeWidth={2.25} />
          </span>
          <div className="cp-act-text">
            <p className="cp-act-title">{activity.title}</p>
            <p className="cp-act-meta">
              {activity.status === "done" ? `Feito por ${activity.ownerLabel}` : `${activity.ownerLabel} está cuidando disso`}
            </p>
          </div>
        </div>
        <span className={`cp-badge${activity.status === "done" ? " cp-badge--done" : ""}`}>
          {activity.status === "done" ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : <Clock size={16} strokeWidth={2.25} aria-hidden="true" />}
          {THEIR_STATUS[activity.status]}
        </span>
      </li>
    );
  }

  const done = activity.status === "done";
  const waiting = activity.status === "waiting";
  // Com envio de arquivos, a atividade fica feita sozinha quando chegam os obrigatórios: sem "Marcar como feita".
  const byUpload = Boolean(activity.documents?.length) && uploads;
  return (
    <li id={`atividade-${activity.id}`} className={`cp-act cp-act--mine${done ? " cp-act--done" : ""}`}>
      <div className="cp-act-head">
        <span className="cp-tile" aria-hidden="true">
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <div className="cp-act-text">
          <p className="cp-act-title">{activity.title}</p>
          <p className="cp-act-meta">{done ? "Feita por você" : dueText(activity, today)}</p>
        </div>
      </div>
      {!done && activity.instructions ? <p className="cp-act-body">{activity.instructions}</p> : null}
      {!done ? links : null}
      {activity.documents?.length ? <DocumentRequests activity={activity} token={token} preview={preview} uploads={uploads} /> : null}
      {done ? (
        <span className="cp-badge cp-badge--done">
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          Feita
        </span>
      ) : waiting ? (
        <span className="cp-badge cp-badge--wait">
          <Clock size={16} strokeWidth={2.25} aria-hidden="true" />
          Libera quando chegar a hora
        </span>
      ) : byUpload ? null : preview ? (
        <button type="button" className="cp-btn" disabled>
          <Check size={20} strokeWidth={2.5} aria-hidden="true" />
          Marcar como feita
        </button>
      ) : (
        <form className="cp-form" method="post" action={`/j/${encodeURIComponent(token)}/feito`}>
          <input type="hidden" name="activityId" value={activity.id} />
          <button type="submit" className="cp-btn">
            <Check size={20} strokeWidth={2.5} aria-hidden="true" />
            Marcar como feita
          </button>
        </form>
      )}
    </li>
  );
}
