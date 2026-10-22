"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  Cloud,
  Copy,
  ExternalLink,
  KeyRound,
  Layers3,
  LockKeyhole,
  Plug,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { PublicStatus } from "@/shared/contracts";
import { Button, Logo } from "./ui";

export function SetupScreen({
  status,
  bootstrap,
  loading,
  error,
  onBootstrap,
  onRetry,
}: {
  status: PublicStatus | null;
  bootstrap: boolean;
  loading: boolean;
  error: string;
  onBootstrap: (values: {
    setupToken: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<void>;
  onRetry: () => void;
}) {
  const [guide, setGuide] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [copied, setCopied] = useState("");
  const base =
    status?.appUrl?.replace(/\/$/, "") || "https://seu-app.onnira.cloud";
  const missing = status?.missingEnvironment || [];
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setLocalError(
        "Não foi possível copiar. Selecione o endereço e copie manualmente.",
      );
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      await onBootstrap({ setupToken, clientId, clientSecret });
      setSetupToken("");
      setClientSecret("");
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Não foi possível autorizar a instalação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setup-screen">
      <aside className="setup-brand-panel">
        <Logo />
        <span className="setup-brand-label">Pessoas e processos</span>
        <div className="setup-brand-content">
          <div className="setup-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="orbit-node node-one">
              <Users size={24} />
            </span>
            <span className="orbit-node node-two">
              <Layers3 size={24} />
            </span>
            <span className="orbit-node node-three">
              <CheckCheck size={24} />
            </span>
            <span className="orbit-core">
              <span className="brand-symbol">
                <span />
                <span />
                <span />
                <span />
              </span>
            </span>
          </div>
          <h1>
            Cada pessoa.
            <br />
            Todas as etapas.
          </h1>
          <p>
            Onboarding e offboarding organizados, do primeiro dia ao próximo
            passo.
          </p>
          <div className="setup-brand-features">
            <span>
              <Check size={16} />
              Tarefas e checklists no Bitrix24
            </span>
            <span>
              <Check size={16} />
              Responsáveis e prazos definidos
            </span>
            <span>
              <Check size={16} />
              Um radar para as pendências críticas
            </span>
          </div>
        </div>
        <div className="setup-brand-footer">
          <span className="integration-logo inverse">
            b<span>24</span>
          </span>
          <span>Feito para trabalhar com seu Bitrix24</span>
        </div>
      </aside>
      <main className="setup-main">
        <div className="setup-topbar">
          <span>
            <Cloud size={15} />
            Hospedado na Onnira
          </span>
          <button
            className="button button-ghost"
            onClick={() => setGuide(!guide)}
          >
            <CircleHelp size={16} />
            Guia de instalação
          </button>
        </div>
        <div className="setup-main-content">
          <div className="setup-kicker">
            <span className="dot dot-onboarding" />
            {status?.installed ? "Seu ambiente Nexo" : "Vamos começar"}
          </div>
          <h2>
            {loading
              ? "Preparando seu ambiente"
              : bootstrap
                ? "Conecte o Nexo ao seu portal"
                : status?.installed
                  ? "Abra o Nexo pelo Bitrix24"
                  : "Seu próximo processo começa aqui."}
          </h2>
          <p className="setup-intro">
            {loading
              ? "Verificando a instalação e o contexto de acesso…"
              : bootstrap
                ? "Confirme as credenciais da aplicação para autorizar esta instalação."
                : status?.installed
                  ? "O Nexo utiliza sua identidade e suas permissões no portal. Encontre a aplicação no menu do seu Bitrix24."
                  : "Prepare a hospedagem e instale a aplicação no Bitrix24. Depois, o assistente ajuda a configurar o processo de RH."}
          </p>
          {loading ? (
            <div className="setup-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : bootstrap ? (
            <form className="bootstrap-form" onSubmit={submit}>
              <label className="field">
                <span>
                  Chave de configuração inicial <i>*</i>
                </span>
                <input
                  type="password"
                  required
                  autoComplete="off"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="NEXO_SETUP_TOKEN da sua hospedagem"
                />
                <small>
                  Use o segredo definido nas variáveis de ambiente da Onnira.
                </small>
              </label>
              <label className="field">
                <span>
                  ID da aplicação Bitrix <i>*</i>
                </span>
                <input
                  required
                  autoComplete="off"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="ID gerado ao salvar a aplicação local"
                />
              </label>
              <label className="field">
                <span>
                  Chave da aplicação Bitrix <i>*</i>
                </span>
                <input
                  type="password"
                  required
                  autoComplete="off"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Chave secreta gerada pelo Bitrix24"
                />
              </label>
              <div className="privacy-note">
                <LockKeyhole size={15} />
                As credenciais serão protegidas no servidor.
              </div>
              <Button type="submit" loading={busy}>
                Autorizar instalação
                <ArrowRight size={16} />
              </Button>
            </form>
          ) : status?.installed ? (
            <div className="setup-installed">
              <div className="connection-summary">
                <span className="integration-logo">
                  b<span>24</span>
                </span>
                <div>
                  <strong>{status.portalDomain}</strong>
                  <p>
                    {status.configured
                      ? "Instalação configurada"
                      : "Configuração inicial em andamento"}
                  </p>
                </div>
                <ShieldCheck size={22} />
              </div>
              {status.portalDomain && (
                <a
                  href={`https://${status.portalDomain}`}
                  className="button button-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir para meu Bitrix24
                  <ExternalLink size={15} />
                </a>
              )}
              <p className="field-help">
                Se sua sessão expirou, feche e abra novamente a aplicação no
                menu do Bitrix24.
              </p>
            </div>
          ) : (
            <div className="installation-steps">
              <div
                className={`installation-step ${missing.length === 0 && status ? "complete" : ""}`}
              >
                <span className="installation-step-number">
                  {missing.length === 0 && status ? <Check size={17} /> : "1"}
                </span>
                <div>
                  <h3>Prepare sua hospedagem</h3>
                  <p>
                    Publique o projeto na Onnira e configure as variáveis de
                    ambiente.
                  </p>
                  {missing.length > 0 && (
                    <div className="environment-list">
                      <span>Configurações pendentes</span>
                      {missing.map((key) => (
                        <code key={key}>{key}</code>
                      ))}
                    </div>
                  )}
                </div>
                <Cloud size={20} />
              </div>
              <div className="installation-step">
                <span className="installation-step-number">2</span>
                <div>
                  <h3>Adicione o app ao Bitrix24</h3>
                  <p>
                    Em Recursos do desenvolvedor, crie uma aplicação local do
                    tipo servidor.
                  </p>
                  <div className="handler-addresses">
                    {!status?.appUrl && (
                      <p>
                        Endereços ilustrativos. Configure a URL pública da
                        Onnira para copiar os endereços reais.
                      </p>
                    )}
                    {[
                      {
                        label: "Instalação inicial",
                        path: "/api/bitrix/install",
                      },
                      {
                        label: "Página da aplicação",
                        path: "/api/bitrix/launch",
                      },
                    ].map((item) => (
                      <div key={item.path}>
                        <span>{item.label}</span>
                        <div>
                          <code>
                            {base}
                            {item.path}
                          </code>
                          <button
                            className="icon-button"
                            aria-label={`Copiar endereço de ${item.label.toLowerCase()}`}
                            disabled={!status?.appUrl}
                            onClick={() => copy(base + item.path)}
                          >
                            {copied === base + item.path ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <Plug size={20} />
              </div>
              <div className="installation-step">
                <span className="installation-step-number">3</span>
                <div>
                  <h3>Abra o Nexo no seu portal</h3>
                  <p>
                    O assistente vai configurar modelos, responsáveis e gatilhos
                    de aprovação.
                  </p>
                </div>
                <Users size={20} />
              </div>
            </div>
          )}
          {(error || localError) && (
            <div className="form-error" role="alert">
              {localError || error}
              <Button variant="ghost" onClick={onRetry}>
                Verificar novamente
                <ArrowRight size={14} />
              </Button>
            </div>
          )}
          {guide && (
            <section className="installation-guide">
              <h3>
                <KeyRound size={17} />
                Guia rápido de instalação
              </h3>
              <ol>
                <li>
                  Publique o código na Onnira com runtime Next.js, comando de
                  build <code>npm run build</code> e inicialização{" "}
                  <code>npm start</code>.
                </li>
                <li>
                  Configure <code>NEXO_APP_URL</code>,{" "}
                  <code>BITRIX_PORTAL_URL</code>,{" "}
                  <code>NEXO_ENCRYPTION_KEY</code> e{" "}
                  <code>NEXO_SETUP_TOKEN</code>. Mantenha <code>./data</code> em
                  armazenamento persistente.
                </li>
                <li>
                  Na aplicação local do Bitrix, informe os dois endereços acima
                  e marque a opção de conclusão da instalação pelo aplicativo.
                </li>
                <li>
                  Selecione os escopos Tarefas, Usuários (mínimo), CRM e
                  Configuração de campos personalizados.
                </li>
                <li>
                  Abra a aplicação, informe suas credenciais no assistente e
                  prepare o processo de RH.
                </li>
              </ol>
              <p className="field-help">
                A URL publicada precisa ser HTTPS. Teste com um portal exclusivo
                e colaboradores fictícios.
              </p>
            </section>
          )}
          <div className="setup-trust">
            <ShieldCheck size={17} />
            <p>
              Seus usuários e tarefas continuam no Bitrix24.
              <br />O Nexo organiza a jornada e acompanha cada etapa.
            </p>
          </div>
        </div>
        <footer className="setup-footer">
          <span>Nexo · Onboarding e Offboarding</span>
          <span>v{status?.version || "1.0.0"}</span>
        </footer>
      </main>
    </div>
  );
}
