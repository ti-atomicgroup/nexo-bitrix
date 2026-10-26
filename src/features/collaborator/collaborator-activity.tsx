import { Check, Clock, ExternalLink } from "lucide-react";
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
}

/**
 * Uma atividade na página do colaborador. As do próprio colaborador têm "Marcar como feita" (formulário POST,
 * sem JavaScript); as das outras pessoas aparecem como "o que vai acontecer", com o papel e nunca o nome de quem faz.
 */
export function CollaboratorActivity({ activity, today, token, preview }: CollaboratorActivityProps) {
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
  return (
    <li className={`cp-act cp-act--mine${done ? " cp-act--done" : ""}`}>
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
      ) : preview ? (
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
