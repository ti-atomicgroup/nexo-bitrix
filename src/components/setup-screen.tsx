"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Cloud, KeyRound, LockKeyhole, Plug, ShieldCheck } from "lucide-react";
import type { PublicStatus } from "@/shared/contracts";
import { Button, Logo } from "./ui";

type BootstrapValues = { email: string; password: string };

export function SetupScreen({ status, loading, error, onConnect, onBootstrap, onLogin, onRetry }: {
  status: PublicStatus | null;
  loading: boolean;
  error: string;
  onConnect: (url: string) => Promise<void>;
  onBootstrap: (values: BootstrapValues) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const firstAdmin = Boolean(status?.webhookConnected && !status.firstAdminCreated);
  const login = Boolean(status?.firstAdminCreated);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setLocalError("");
    try {
      if (firstAdmin) await onBootstrap({ email, password });
      else if (login) await onLogin(email, password);
      else await onConnect(url);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="setup-screen">
    <aside className="setup-brand-panel"><Logo /><span className="setup-brand-label">Pessoas e processos</span><div className="setup-brand-content"><div className="setup-illustration" aria-hidden="true"><span className="orbit-core"><span className="brand-symbol"><span /><span /><span /><span /></span></span></div><h1>Cada pessoa.<br />Todas as etapas.</h1><p>Onboarding e offboarding organizados, do primeiro dia ao próximo passo.</p><div className="setup-brand-features"><span><ShieldCheck size={16} />Tarefas e checklists no Bitrix24</span><span><LockKeyhole size={16} />Acesso próprio para o time de RH</span><span><Plug size={16} />Integração somente por webhook</span></div></div><div className="setup-brand-footer"><span className="integration-logo inverse">b<span>24</span></span><span>Hospedado na Onnira</span></div></aside>
    <main className="setup-main"><div className="setup-topbar"><span><Cloud size={15} />Onnira · Nexo</span></div><div className="setup-main-content"><div className="setup-kicker"><span className="dot dot-onboarding" />{loading ? "Conectando" : login ? "Acesso RH" : firstAdmin ? "Passo 2 de 2" : "Passo 1 de 2"}</div><h2>{loading ? "Preparando seu ambiente" : login ? "Entre no Nexo" : firstAdmin ? "Crie seu acesso de RH" : "Conecte seu Bitrix24"}</h2><p className="setup-intro">{loading ? "Verificando conexão e sessão…" : login ? `Portal conectado: ${status?.portalDomain}. Entre com sua conta Nexo.` : firstAdmin ? `O portal ${status?.portalDomain ?? "Bitrix24"} está conectado. Crie uma senha para entrar no Nexo.` : "Cole o webhook da conta de RH. O Nexo valida o portal e prepara a conexão automaticamente."}</p>
    {loading ? <div className="setup-skeleton"><span /><span /><span /></div> : <form className="bootstrap-form" onSubmit={submit}>
      {!firstAdmin && !login && <div className="bitrix-connect-guide"><h3>Como conectar</h3><ol><li>Entre no Bitrix24 com a conta de RH que executará as tarefas.</li><li>Crie um <strong>webhook de entrada</strong> com acesso a tarefas, usuários, CRM, grupos e configuração de campos.</li><li>Copie a URL completa do webhook e cole abaixo.</li></ol></div>}
      {!firstAdmin && !login && <label className="field"><span>URL do webhook de entrada <i>*</i></span><input type="url" required autoComplete="off" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://suaempresa.bitrix24.com.br/rest/42/..." /><small>Essa URL contém uma credencial. Cole apenas aqui no Nexo.</small></label>}
      {(firstAdmin || login) && <label className="field"><span>E-mail RH <i>*</i></span><input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {(firstAdmin || login) && <label className="field"><span>Senha <i>*</i></span><input type="password" required minLength={firstAdmin ? 12 : undefined} autoComplete={firstAdmin ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /><small>{firstAdmin ? "Use pelo menos 12 caracteres. Essa será sua senha para voltar ao Nexo." : "Use a senha criada na instalação."}</small></label>}
      <div className="privacy-note"><KeyRound size={15} />Credenciais protegidas no servidor. O Nexo usa webhooks para as operações no portal.</div>
      {(error || localError) && <div className="global-error" role="alert">{localError || error}</div>}
      <Button type="submit" loading={busy}>{login ? "Entrar" : firstAdmin ? "Criar acesso RH" : "Validar conexão"}<ArrowRight size={16} /></Button>
      {firstAdmin && <button type="button" className="button button-ghost" onClick={onRetry}>Verificar conexão</button>}
    </form>}</div></main>
  </div>;
}
