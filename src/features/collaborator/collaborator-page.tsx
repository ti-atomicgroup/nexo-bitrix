import { Check, ChevronDown, CircleAlert, CircleCheck, ExternalLink, Eye } from "lucide-react";
import { RotaNMark } from "@/components/brand/logo";
import { addDays, firstName, formatDateLong, formatDateMedium, initials, plural } from "@/lib/format";
import type { CollaboratorActivityDTO, CollaboratorViewDTO, LinkItem } from "@/shared/contracts";
import { CollaboratorActivity } from "./collaborator-activity";
import { COLLABORATOR_CSS } from "./collaborator-styles";
import { countdownFor } from "./countdown";

export interface CollaboratorPageProps {
  view: CollaboratorViewDTO;
  token: string;
  /** Resultado do último "Marcar como feita" (vem da query depois do redirecionamento 303). */
  flash?: "done" | "error" | null;
  /** Prévia dentro do console do RH: sem formulários e sem `<main>` próprio. */
  preview?: boolean;
}

const PEOPLE_ROLE: Record<CollaboratorViewDTO["people"][number]["role"], string> = {
  gestor: "Gestão direta",
  buddy: "Buddy: sua companhia nas primeiras semanas",
  rh: "Pessoas e cultura (RH)",
};

const STATION_STATE: Record<"done" | "current" | "upcoming", string> = {
  done: "Etapa concluída",
  current: "Você está aqui",
  upcoming: "Próxima etapa",
};

function byDue(a: CollaboratorActivityDTO, b: CollaboratorActivityDTO): number {
  return a.dueAt.localeCompare(b.dueAt);
}

/** Valor de contato vira link quando é e-mail, telefone ou endereço https. */
function ContactValue({ value }: { value: string }) {
  const trimmed = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return <a href={`mailto:${trimmed}`}>{trimmed}</a>;
  if (/^\+?[\d\s().-]{8,}$/.test(trimmed)) return <a href={`tel:${trimmed.replace(/[^\d+]/g, "")}`}>{trimmed}</a>;
  if (/^https:\/\//.test(trimmed)) {
    return (
      <a href={trimmed} target="_blank" rel="noopener noreferrer">
        {trimmed}
      </a>
    );
  }
  return <>{trimmed}</>;
}

/**
 * Página pessoal do colaborador (`/j/<token>`): componente de servidor, sem JavaScript, com CSS inline.
 * Entrada: cartão de embarque, linha com "você está aqui", o que fazer, materiais, pessoas, contatos e FAQ.
 * Saída: cabeçalho laranja e respeitoso, o que devolver e quando, o que vai acontecer, contatos e FAQ.
 * Nunca mostra o motivo do desligamento (o DTO nem o traz).
 */
export function CollaboratorPage({ view, token, flash = null, preview = false }: CollaboratorPageProps) {
  const Root = preview ? "div" : "main";
  const onboarding = view.kind === "onboarding";
  const today = addDays(view.anchorDate, -view.daysUntilAnchor);
  const first = view.person.firstName || firstName(view.person.name);
  const countdown = countdownFor(view.kind, view.daysUntilAnchor);
  const activities = view.stages.flatMap((stage) => stage.activities);
  const mine = activities.filter((activity) => activity.mine).sort(byDue);
  const theirs = activities.filter((activity) => !activity.mine).sort(byDue);
  const gestor = view.people.find((person) => person.role === "gestor");
  const buddy = view.people.find((person) => person.role === "buddy");
  const rh = view.people.find((person) => person.role === "rh");
  const materials = [...new Map(activities.flatMap((activity) => activity.links).map((link): [string, LinkItem] => [link.url, link])).values()];
  const onlyReturns = mine.length > 0 && mine.every((activity) => activity.kind === "delivery");

  return (
    <Root className={`cp cp--${view.kind}${preview ? " cp--preview" : ""}`}>
      <style>{COLLABORATOR_CSS}</style>
      <header className="cp-top">
        <div className="cp-top-in">
          <span className="cp-brand">
            <RotaNMark size={22} />
            <span>nexo</span>
          </span>
          <span className="cp-company">{view.company}</span>
        </div>
      </header>

      <div className="cp-body">
        {preview ? (
          <p className="cp-preview-note">
            <Eye size={18} strokeWidth={2.25} aria-hidden="true" />
            Prévia: é assim que {first} vê o link pessoal. Os botões só funcionam no link.
          </p>
        ) : null}

        {flash === "done" ? (
          <p className="cp-flash" role="status">
            <CircleCheck size={20} strokeWidth={2.25} aria-hidden="true" />
            Pronto! Marcamos como feita. Obrigado.
          </p>
        ) : flash === "error" ? (
          <p className="cp-flash cp-flash--err" role="alert">
            <CircleAlert size={20} strokeWidth={2.25} aria-hidden="true" />
            Não foi possível marcar agora. Tente de novo em instantes; se continuar, fale com o RH.
          </p>
        ) : null}

        {view.completed ? (
          <p className="cp-flash" role="status">
            <CircleCheck size={20} strokeWidth={2.25} aria-hidden="true" />
            {onboarding ? "Tudo pronto! Sua jornada de chegada foi concluída." : "Tudo certo com a sua saída. Obrigado por tudo."}
          </p>
        ) : null}

        {onboarding ? (
          <article className="cp-pass" aria-label={`Cartão de embarque de ${first}`}>
            <div className="cp-pass-strip">
              <span>Cartão de embarque</span>
              <span>{view.company}</span>
            </div>
            <div className="cp-pass-line" aria-hidden="true" />
            <div className="cp-pass-main">
              <div>
                <p className="cp-pass-greet">Boas-vindas,</p>
                <h1 className="cp-pass-name">{first}</h1>
              </div>
              <dl className="cp-fields">
                <div>
                  <dt>Embarque</dt>
                  <dd>{formatDateMedium(view.anchorDate, today)}</dd>
                </div>
                <div>
                  <dt>Destino</dt>
                  <dd>{view.company}</dd>
                </div>
                <div>
                  <dt>Com você</dt>
                  <dd>{gestor?.name ?? "Sua liderança"}</dd>
                </div>
                <div>
                  <dt>Seu buddy</dt>
                  <dd>{buddy?.name ?? "Em breve"}</dd>
                </div>
              </dl>
            </div>
            <div className="cp-stub">
              <p className="cp-count">{countdown.value}</p>
              <p className="cp-count-cap">{countdown.caption}</p>
            </div>
          </article>
        ) : (
          <section className="cp-farewell" aria-labelledby="cp-titulo">
            <h1 id="cp-titulo" className="cp-farewell-title">
              Obrigado por fazer parte, {first}
            </h1>
            <p className="cp-farewell-date">Seu último dia: {formatDateLong(view.anchorDate, { midSentence: true })}</p>
            <p className="cp-farewell-count">
              <span className="cp-count">{countdown.value}</span>
              <span className="cp-count-cap">{countdown.caption}</span>
            </p>
          </section>
        )}

        {view.message.trim() ? (
          <section className="cp-section" aria-labelledby="cp-mensagem">
            <h2 id="cp-mensagem" className="cp-h2">
              {onboarding ? "Uma mensagem para você" : "Uma palavra do RH"}
            </h2>
            <p className="cp-msg">{view.message}</p>
          </section>
        ) : null}

        {view.progress.total > 0 ? (
          <div className="cp-progress">
            <p className="cp-progress-text">
              <strong>{view.progress.done}</strong> de {plural(view.progress.total, "passo feito", "passos feitos")}
            </p>
            <div className="cp-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, view.progress.percent))}%` }} />
            </div>
          </div>
        ) : null}

        {onboarding ? (
          <section className="cp-section" aria-labelledby="cp-linha">
            <h2 id="cp-linha" className="cp-h2">
              Sua linha
            </h2>
            {view.stages.length ? (
              <ol className="cp-stations" aria-label="Etapas da sua chegada">
                {view.stages.map((stage) => (
                  <li key={stage.position} className={`cp-station cp-station--${stage.state}`}>
                    <span className="cp-dot" aria-hidden="true">
                      {stage.state === "done" ? <Check size={14} strokeWidth={3.5} /> : null}
                    </span>
                    <div className="cp-station-body">
                      <div className="cp-station-head">
                        <h3 className="cp-h3">{stage.name}</h3>
                        {stage.state === "current" ? <span className="cp-here">Você está aqui</span> : <span className="cp-sr">{STATION_STATE[stage.state]}</span>}
                      </div>
                      {stage.activities.length ? (
                        <ul className="cp-acts">
                          {stage.activities.map((activity) => (
                            <CollaboratorActivity key={activity.id} activity={activity} today={today} token={token} preview={preview} />
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="cp-lead">As etapas da sua chegada aparecem aqui em breve.</p>
            )}
          </section>
        ) : (
          <>
            <section className="cp-section" aria-labelledby="cp-voce">
              <h2 id="cp-voce" className="cp-h2">
                {onlyReturns ? "O que devolver e quando" : "O que você precisa fazer"}
              </h2>
              {mine.length ? (
                <ul className="cp-acts">
                  {mine.map((activity) => (
                    <CollaboratorActivity key={activity.id} activity={activity} today={today} token={token} preview={preview} />
                  ))}
                </ul>
              ) : (
                <p className="cp-lead">Nada para você fazer por enquanto. Se algo surgir, aparece aqui.</p>
              )}
            </section>
            {theirs.length ? (
              <section className="cp-section" aria-labelledby="cp-acontecer">
                <h2 id="cp-acontecer" className="cp-h2">
                  O que vai acontecer
                </h2>
                <ul className="cp-acts">
                  {theirs.map((activity) => (
                    <CollaboratorActivity key={activity.id} activity={activity} today={today} token={token} preview={preview} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}

        {onboarding && materials.length ? (
          <section className="cp-section" aria-labelledby="cp-materiais">
            <h2 id="cp-materiais" className="cp-h2">
              Materiais
            </h2>
            <ul className="cp-links">
              {materials.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={18} strokeWidth={2.25} aria-hidden="true" />
                    {link.label}
                    <span className="cp-sr"> (abre em nova aba)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.people.length ? (
          <section className="cp-section" aria-labelledby="cp-pessoas">
            <h2 id="cp-pessoas" className="cp-h2">
              {onboarding ? "Quem está com você" : "Com quem falar"}
            </h2>
            <ul className="cp-people">
              {view.people.map((person) => (
                <li key={`${person.role}-${person.name}`} className="cp-person">
                  <span className="cp-avatar" aria-hidden="true">
                    {initials(person.name)}
                  </span>
                  <span>
                    <span className="cp-person-name">{person.name}</span>
                    <br />
                    <span className="cp-person-role">
                      {PEOPLE_ROLE[person.role]}
                      {person.position ? ` · ${person.position}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.contacts.length ? (
          <section className="cp-section" aria-labelledby="cp-contatos">
            <h2 id="cp-contatos" className="cp-h2">
              Contatos
            </h2>
            <dl className="cp-contacts">
              {view.contacts.map((contact) => (
                <div key={`${contact.label}-${contact.value}`}>
                  <dt>{contact.label}</dt>
                  <dd>
                    <ContactValue value={contact.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {view.faq.length ? (
          <section className="cp-section" aria-labelledby="cp-faq">
            <h2 id="cp-faq" className="cp-h2">
              Perguntas frequentes
            </h2>
            <div className="cp-faq">
              {view.faq.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <ChevronDown size={20} strokeWidth={2.25} aria-hidden="true" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="cp-foot">
          <p>Este link é pessoal: não compartilhe.</p>
          <p>
            Dúvidas? Fale com {rh ? rh.name : "o RH"}
            {" "}· {view.company}
          </p>
        </footer>
      </div>
    </Root>
  );
}
