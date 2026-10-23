"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Cloud, KeyRound, LockKeyhole, Plug, ShieldCheck } from "lucide-react";
import type { PublicStatus } from "@/shared/contracts";
import { Button, Logo } from "./ui";

type BootstrapValues = { setupToken: string; email: string; password: string; bitrixUserId: string };

export function SetupScreen({ status, loading, error, onConnect, onBootstrap, onLogin, onRetry }: {
  status: PublicStatus | null;
  loading: boolean;
  error: string;
  onConnect: (url: string, setupToken: string) => Promise<void>;
  onBootstrap: (values: BootstrapValues) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [url, setUrl] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bitrixUserId, setBitrixUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const firstAdmin = Boolean(status?.webhookConnected && !status.firstAdminCreated);
  const login = Boolean(status?.firstAdminCreated);
  const needsEnvironment = Boolean(status?.missingEnvironment.length);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setLocalError("");
    try {
      if (firstAdmin) await onBootstrap({ setupToken, email, password, bitrixUserId });
      else if (login) await onLogin(email, password);
      else await onConnect(url, setupToken);
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  };
  return <div className="setup-screen">
    <aside className="setup-brand-panel"><Logo /><span className="setup-brand-label">Pessoas e processos</span><div className="setup-brand-content"><div className="setup-illustration" aria-hidden="true"><span className="orbit-core"><span className="brand-symbol"><span /><span /><span /><span /></span></span></div><h1>Cada pessoa.<br />Todas as etapas.</h1><p>Onboarding e offboarding organizados, do primeiro dia ao próximo passo.</p><div className="setup-brand-features"><span><ShieldCheck size={16} />Tarefas e checklists no Bitrix24</span><span><LockKeyhole size={16} />Acesso próprio para o time de RH</span><span><Plug size={16} />Integração somente por webhook</span></div></div><div className="setup-brand-footer"><span className="integration-logo inverse">b<span>24</span></span><span>Hospedado na Onnira</span></div></aside>
    <main className="setup-main"><div className="setup-topbar"><span><Cloud size={15} />Onnira · Nexo</span></div><div className="setup-main-content"><div className="setup-kicker"><span className="dot dot-onboarding" />{loading ? "Conectando" : needsEnvironment ? "Hospedagem" : login ? "Acesso RH" : firstAdmin ? "Administrador inicial" : "Configuração"}</div><h2>{loading ? "Preparando seu ambiente" : needsEnvironment ? "Configure a hospedagem" : login ? "Entre no Nexo" : firstAdmin ? "Crie o primeiro acesso" : "Conecte seu Bitrix24"}</h2><p className="setup-intro">{loading ? "Verificando conexão e sessão…" : needsEnvironment ? "Antes de conectar o Bitrix24, configure estas variáveis no serviço da Onnira:" : login ? `Portal conectado: ${status?.portalDomain}. Entre com sua conta Nexo.` : firstAdmin ? "Crie o acesso administrador e vincule a conta de serviço ativa do Bitrix24." : "Cole o webhook REST de entrada criado para a conta de RH. A URL será armazenada criptografada."}</p>
    {loading ? <div className="setup-skeleton"><span /><span /><span /></div> : needsEnvironment ? <div className="environment-list">{status?.missingEnvironment.map((key) => <code key={key}>{key}</code>)}<button type="button" className="button button-secondary" onClick={onRetry}>Verificar novamente</button></div> : <form className="bootstrap-form" onSubmit={submit}>
      {firstAdmin && <><label className="field"><span>Token de configuração <i>*</i></span><input type="password" autoComplete="off" required value={setupToken} onChange={e => setSetupToken(e.target.value)} /></label><label className="field"><span>ID da conta que criou o webhook <i>*</i></span><input required inputMode="numeric" value={bitrixUserId} onChange={e => setBitrixUserId(e.target.value)} placeholder="ID exibido na URL do webhook" /><small>O Nexo usa essa conta de serviço para executar as operações no Bitrix.</small></label></>}
      {!firstAdmin && !login && <><label className="field"><span>Webhook REST de entrada <i>*</i></span><input type="url" required autoComplete="off" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://portal.bitrix24.com.br/rest/..." /></label><label className="field"><span>Token de configuração <i>*</i></span><input type="password" required autoComplete="off" value={setupToken} onChange={e => setSetupToken(e.target.value)} /></label></>}
      {(firstAdmin || login) && <label className="field"><span>E-mail RH <i>*</i></span><input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {(firstAdmin || login) && <label className="field"><span>Senha {firstAdmin && <i>*</i>}</span><input type="password" required minLength={firstAdmin ? 12 : undefined} autoComplete={firstAdmin ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      <div className="privacy-note"><KeyRound size={15} />Credenciais protegidas no servidor. O Nexo usa webhooks para as operações no portal.</div>
      {(error || localError) && <div className="global-error" role="alert">{localError || error}</div>}
      <Button type="submit" loading={busy}>{login ? "Entrar" : firstAdmin ? "Criar acesso RH" : "Validar conexão"}<ArrowRight size={16} /></Button>
      {login && <button type="button" className="button button-ghost" onClick={onRetry}>Atualizar status</button>}
    </form>}</div></main>
  </div>;
}
