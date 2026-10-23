"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Cloud, Copy, KeyRound, LockKeyhole, Plug, ShieldCheck } from "lucide-react";
import type { PublicStatus } from "@/shared/contracts";
import { Button, Logo } from "./ui";

type BootstrapValues = { setupToken: string; email: string; password: string; bitrixUserId: string };
const setupVariables = [
  { name: "NEXO_APP_URL", value: "URL HTTPS pública mostrada pela Onnira depois de publicar o app, sem barra no final." },
  { name: "BITRIX_PORTAL_URL", value: "https://helpbr24.bitrix24.com.br (ou a URL base do seu portal Bitrix24)." },
  { name: "NEXO_ENCRYPTION_KEY", value: "Chave gerada no seu computador pelo comando abaixo. Guarde uma cópia segura." },
  { name: "NEXO_SETUP_TOKEN", value: "Token gerado no seu computador pelo comando abaixo. Você vai usá-lo no próximo passo." },
];
const generateSecretsCommand = `node -e "console.log('NEXO_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex')); console.log('NEXO_SETUP_TOKEN=' + require('crypto').randomBytes(32).toString('base64url'))"`;

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
  const [copyStatus, setCopyStatus] = useState("");
  const firstAdmin = Boolean(status?.webhookConnected && !status.firstAdminCreated);
  const login = Boolean(status?.firstAdminCreated);
  const needsEnvironment = Boolean(status?.missingEnvironment.length);
  const invalidEnvironment = Boolean(status?.missingEnvironment.some((key) => !setupVariables.some((variable) => variable.name === key)));
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(generateSecretsCommand);
      setCopyStatus("Comando copiado");
    } catch {
      setCopyStatus("Não foi possível copiar. Selecione e copie o comando manualmente.");
    }
  };
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
    <main className="setup-main"><div className="setup-topbar"><span><Cloud size={15} />Onnira · Nexo</span></div><div className="setup-main-content"><div className="setup-kicker"><span className="dot dot-onboarding" />{loading ? "Conectando" : needsEnvironment ? "Hospedagem" : login ? "Acesso RH" : firstAdmin ? "Administrador inicial" : "Configuração"}</div><h2>{loading ? "Preparando seu ambiente" : needsEnvironment ? "Configure a hospedagem" : login ? "Entre no Nexo" : firstAdmin ? "Crie o primeiro acesso" : "Conecte seu Bitrix24"}</h2><p className="setup-intro">{loading ? "Verificando conexão e sessão…" : needsEnvironment ? "Vamos preparar o serviço Onnira. Configure os valores abaixo no servidor; nenhum segredo deve ser digitado nesta tela." : login ? `Portal conectado: ${status?.portalDomain}. Entre com sua conta Nexo.` : firstAdmin ? "Crie o acesso administrador e vincule a conta de serviço ativa do Bitrix24." : "Cole o webhook REST de entrada criado para a conta de RH. A URL será armazenada criptografada."}</p>
    {loading ? <div className="setup-skeleton"><span /><span /><span /></div> : needsEnvironment ? <div className="environment-wizard">
      <section className="environment-wizard-step" aria-labelledby="environment-step-1"><span className="environment-wizard-number">1</span><div><h3 id="environment-step-1">Adicione as variáveis na Onnira</h3><p>Abra as configurações deste serviço, entre em <strong>Variáveis de ambiente</strong> e crie estes nomes exatamente como aparecem:</p><ul className="environment-variable-list">{setupVariables.map(({ name, value }) => { const pending = status?.missingEnvironment.includes(name); return <li key={name}><div className="environment-variable-title"><code>{name}</code><span className={pending || invalidEnvironment ? "environment-variable-pending" : "environment-variable-ready"}>{pending || invalidEnvironment ? "verificar" : "informada"}</span></div><p>{value}</p></li>; })}</ul>{invalidEnvironment && <p className="environment-validation-error" role="alert">A Onnira encontrou um valor ausente ou inválido. Confira os quatro nomes, os formatos e a URL HTTPS, depois salve e reinicie o serviço.</p>}</div></section>
      <section className="environment-wizard-step" aria-labelledby="environment-step-2"><span className="environment-wizard-number">2</span><div><h3 id="environment-step-2">Gere os dois segredos no seu computador</h3><p>Abra o PowerShell no seu computador, cole e execute este comando. Ele imprime os dois valores para você copiar às variáveis acima.</p><div className="environment-command"><code>{generateSecretsCommand}</code><button type="button" className="button button-secondary" onClick={copyCommand}><Copy size={14} />Copiar comando</button></div>{copyStatus && <p className="environment-copy-status" role={copyStatus.startsWith("Não") ? "alert" : "status"}>{copyStatus}</p>}<p className="environment-security-note"><LockKeyhole size={14} />Os segredos são gerados localmente. Não os envie no chat nem os coloque no Git.</p></div></section>
      <section className="environment-wizard-step" aria-labelledby="environment-step-3"><span className="environment-wizard-number">3</span><div><h3 id="environment-step-3">Salve, reinicie e verifique</h3><p>Salve as variáveis na Onnira e reinicie ou publique o serviço. Depois volte aqui e confira a configuração.</p><button type="button" className="button button-secondary" onClick={onRetry}>Verificar novamente<ArrowRight size={15} /></button></div></section>
    </div> : <form className="bootstrap-form" onSubmit={submit}>
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
