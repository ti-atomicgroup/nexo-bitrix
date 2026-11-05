"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { api, ApiError, hasSession, negotiateTransport } from "@/lib/api-client";
import type { BasicProbeDTO, EgressAttemptDTO } from "@/shared/contracts";
import { explainCookieTrace } from "./cookie-trace";
import styles from "./diagnostics.module.css";

type Status = "ok" | "falha" | "aviso" | "manual" | "aguardando";

interface Check {
  label: string;
  status: Status;
  detail: string;
}

const STATUS_LABEL: Record<Status, string> = {
  ok: "Funciona",
  falha: "Falhou",
  aviso: "Atenção",
  manual: "Teste manual",
  aguardando: "Aguardando",
};

function storageCheck(kind: "localStorage" | "sessionStorage"): Check {
  try {
    const storage = window[kind];
    storage.setItem("nexo-sonda", "1");
    const ok = storage.getItem("nexo-sonda") === "1";
    storage.removeItem("nexo-sonda");
    return { label: kind, status: ok ? "ok" : "falha", detail: ok ? "Grava e lê normalmente." : "Gravou, mas não leu de volta." };
  } catch (error) {
    return { label: kind, status: "falha", detail: error instanceof Error ? error.message : "Bloqueado pelo navegador." };
  }
}

const COOKIE_CHECK = "Sessão por cookie protegido";
const PROBE_HINT = "__Host-nexo_probe_hint";
const PAGE_TEST_COOKIE = "__Host-nexo_page_test";
const COOKIE_ATTRIBUTES = "Path=/; Secure; SameSite=None; Partitioned";

function hasCookie(name: string): boolean {
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${name}=`));
}

/** A própria página grava um cookie com os mesmos atributos: separa recusa do navegador de alteração na borda. */
function pageCanWriteCookie(): boolean {
  try {
    document.cookie = `${PAGE_TEST_COOKIE}=1; ${COOKIE_ATTRIBUTES}; Max-Age=60`;
    const works = hasCookie(PAGE_TEST_COOKIE);
    document.cookie = `${PAGE_TEST_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
    return works;
  } catch {
    return false;
  }
}

async function traceCookie() {
  await api.sessionTransport();
  const { cookie, seen } = await api.sessionTransport();
  return { ...explainCookieTrace({ cookie, seen, hintVisible: hasCookie(PROBE_HINT), pageWriteWorks: pageCanWriteCookie() }), seen };
}

export function Diagnostics({ variant }: { variant: "same-origin" | "no-referrer" }) {
  const [jsReady, setJsReady] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [server, setServer] = useState<object>({});
  const [canTestEgress, setCanTestEgress] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const put = useCallback((id: string, check: Check) => setChecks((current) => ({ ...current, [id]: check })), []);

  useEffect(() => {
    // Sincroniza o painel com o ambiente real do navegador: só existe depois que o JavaScript carrega.
    /* eslint-disable react-hooks/set-state-in-effect */
    setJsReady(true);
    const framed = window.self !== window.top;
    put("frame", { label: "Dentro do painel (iframe)", status: framed ? "ok" : "aviso", detail: framed ? "Aberto dentro de outra página." : "Aberto fora de iframe." });
    put("referrer", { label: "document.referrer", status: "ok", detail: document.referrer || "(vazio)" });
    put("local", storageCheck("localStorage"));
    put("session", storageCheck("sessionStorage"));
    /* eslint-enable react-hooks/set-state-in-effect */

    negotiateTransport().then((transport) => {
      put("cookie", {
        label: COOKIE_CHECK,
        status: transport === "cookie" ? "ok" : "aviso",
        detail: transport === "cookie" ? "Funciona: o token da sessão fica fora do alcance do JavaScript." : "Bloqueado aqui: o Nexo usa o modo alternativo, com sessão mais curta.",
      });
      if (transport === "cookie") return;
      traceCookie().then(
        (trace) => {
          put("cookieTrace", { label: "Onde o cookie se perde", status: "aviso", detail: trace.detail });
          setServer((current: object) => ({ ...current, cookieTrace: trace }));
        },
        () => put("cookieTrace", { label: "Onde o cookie se perde", status: "aviso", detail: "O teste não respondeu." }),
      );
    });

    const started = performance.now();
    fetch("/api/probe", { headers: { Authorization: "Bearer sonda-sem-valor", "X-Nexo-Session": "sonda-sem-valor-0000000000" }, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Partial<BasicProbeDTO>;
        setServer((current: object) => ({ ...current, basic: body }));
        const ms = Math.round(performance.now() - started);
        put("api", { label: "API do servidor", status: response.ok ? "ok" : "falha", detail: `HTTP ${response.status} em ${ms} ms` });
        if (!response.ok) return;
        put("auth", {
          label: "Cabeçalho Authorization chega ao servidor",
          status: body.authorizationHeader ? "ok" : "aviso",
          detail: body.authorizationHeader ? "Sim: chega ao servidor." : "Não: a borda remove este cabeçalho (o Nexo usa X-Nexo-Session).",
        });
        put("sessionHeader", {
          label: "Cabeçalho X-Nexo-Session chega ao servidor",
          status: body.sessionHeader ? "ok" : "aviso",
          detail: body.sessionHeader ? "Sim: o modo alternativo funciona aqui." : "Não: a borda remove o cabeçalho próprio também.",
        });
        put("database", { label: "Banco de dados", status: body.database ? "ok" : "falha", detail: body.database ? "Responde normalmente." : "O servidor não conseguiu abrir o banco." });
      })
      .catch((error: unknown) => {
        put("api", { label: "API do servidor", status: "falha", detail: error instanceof Error ? error.message : "Sem resposta." });
      });

    // O restante do ambiente só para a administração.
    if (!hasSession()) {
      put("full", { label: "Diagnóstico completo", status: "aviso", detail: "Entre com um acesso de administração para ver o ambiente do servidor." });
      return;
    }
    api.probeFull().then(
      (full) => {
        setServer((current: object) => ({ ...current, full }));
        setCanTestEgress(true);
        for (const item of full.sqlite) {
          put(`sqlite-${item.driver}`, { label: `SQLite (${item.driver})`, status: item.ok ? "ok" : "aviso", detail: item.ok ? `Grava e lê · diário ${item.journalMode}` : (item.error ?? "indisponível") });
        }
        put("boots", {
          label: "Inicializações registradas na pasta de dados",
          status: full.boots ? "ok" : "falha",
          detail: full.boots ? `${full.boots} (aumenta a cada reinício; se voltar a 1 após republicar, o volume não persiste)` : "sem registro",
        });
        put("dir", { label: "Pasta de dados", status: full.dataDir.persistent && full.dataDir.writable ? "ok" : "aviso", detail: `${full.dataDir.source}${full.dataDir.writable ? "" : " · sem permissão de gravar"}` });
        put("node", { label: "Node.js no servidor", status: "ok", detail: `${full.runtime.node} · ${full.runtime.platform}/${full.runtime.arch} · memória ${full.runtime.rssMb} MB em uso` });
      },
      (error: unknown) => {
        const denied = error instanceof ApiError && (error.status === 401 || error.status === 403);
        const mustChangePassword = error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED";
        const detail = mustChangePassword ? error.message : denied ? "Entre com um acesso de administração para ver o ambiente do servidor." : "Sem resposta do servidor.";
        put("full", { label: "Diagnóstico completo", status: "aviso", detail });
      },
    );
  }, [put]);

  const manualClipboard = async () => {
    try {
      await navigator.clipboard.writeText("nexo");
      put("clipboard", { label: "Copiar para a área de transferência", status: "ok", detail: "Permitido." });
    } catch (error) {
      put("clipboard", { label: "Copiar para a área de transferência", status: "falha", detail: error instanceof Error ? error.message : "Bloqueado." });
    }
  };

  const [bitrixHost, setBitrixHost] = useState("");
  const testBitrix = async () => {
    const host = bitrixHost.trim().replace(/^https?:\/\//i, "").split("/")[0] ?? "";
    if (!host) return;
    put("egress", { label: "Saída até o Bitrix24", status: "aguardando", detail: `Testando ${host}…` });
    try {
      const { egress } = await api.probeFull({ bitrix: host });
      setServer((current: object) => ({ ...current, egress }));
      if (!egress || egress.error) {
        put("egress", { label: "Saída até o Bitrix24", status: "falha", detail: egress?.error ?? "Sem resposta da sonda." });
        return;
      }
      const attempted = (label: string, attempt: EgressAttemptDTO | undefined): Check => ({
        label,
        status: attempt?.ok ? "ok" : "falha",
        detail: !attempt ? "Sem resposta." : attempt.ok ? `HTTP ${attempt.status} em ${attempt.ms} ms` : `${attempt.error} (${attempt.ms} ms)`,
      });
      put("egress-dns", { label: "DNS do portal", status: egress.dns?.ok ? "ok" : "falha", detail: egress.dns?.ok ? (egress.dns.addresses ?? []).join(", ") : (egress.dns?.error ?? "Sem resposta.") });
      put("egress", attempted("Saída até o Bitrix24", egress.bitrixFetch));
      put("egress-ipv4", attempted("Saída até o Bitrix24 (IPv4)", egress.bitrixIpv4));
      put("egress-neutral", attempted("Saída para a internet (example.com)", egress.neutralFetch));
      put("egress-ip", {
        label: "IP de saída do servidor",
        status: egress.outboundIp?.ok ? "ok" : "aviso",
        detail: egress.outboundIp?.ok ? `${egress.outboundIp.ip} (é este IP que o Bitrix24 vê)` : (egress.outboundIp?.error ?? "Não informado."),
      });
    } catch (error) {
      put("egress", { label: "Saída até o Bitrix24", status: "falha", detail: error instanceof Error ? error.message : "Sem resposta." });
    }
  };

  const manualPopup = () => {
    const opened = window.open("/api/health", "_blank");
    if (opened) opened.opener = null;
    put("popup", { label: "Abrir nova aba (links para o Bitrix)", status: opened ? "ok" : "falha", detail: opened ? "Abriu." : "Bloqueado pelo navegador ou pelo painel." });
  };

  const manualDownload = () => {
    const url = URL.createObjectURL(new Blob(["Teste de download do Nexo\n"], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexo-teste.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    put("download", { label: "Baixar arquivo", status: "manual", detail: "Confira se o arquivo nexo-teste.txt foi baixado." });
  };

  const report = useMemo(() => JSON.stringify({ variant, checks, server }, null, 2), [variant, checks, server]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied("Relatório copiado. Cole na conversa.");
    } catch {
      setCopied("Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.");
    }
  };

  const rows = Object.entries(checks);

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Logo />
        <span className={styles.version}>diagnóstico · {variant === "no-referrer" ? "sem Referer" : "Referer na mesma origem"}</span>
      </header>
      <section className={styles.content}>
        <h1 className={styles.title}>Diagnóstico do ambiente</h1>
        <p className={styles.lead}>Confere se a hospedagem executa o Nexo do jeito que ele precisa. Nenhum dado pessoal ou segredo aparece aqui.</p>

        <div className={styles.board} role="table" aria-label="Resultados do diagnóstico">
          <div className={styles.boardHead} role="row">
            <span role="columnheader">Verificação</span>
            <span role="columnheader">Situação</span>
            <span role="columnheader">Detalhe</span>
          </div>
          <div className={styles.boardRow} role="row">
            <span role="cell">JavaScript carregou</span>
            <span role="cell">
              <span className={`${styles.chip} ${jsReady ? styles.ok : styles.falha}`}>{jsReady ? STATUS_LABEL.ok : "Não carregou"}</span>
            </span>
            <span role="cell">{jsReady ? "Os scripts do Nexo chegaram ao navegador." : "Se esta linha não mudar, a hospedagem bloqueou os scripts."}</span>
          </div>
          {rows.map(([id, check]) => (
            <div className={styles.boardRow} role="row" key={id}>
              <span role="cell">{check.label}</span>
              <span role="cell">
                <span className={`${styles.chip} ${styles[check.status]}`}>{STATUS_LABEL[check.status]}</span>
              </span>
              <span role="cell" className={styles.detail}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>

        {canTestEgress ? <h2 className={styles.subtitle}>Conexão com o Bitrix24</h2> : null}
        {canTestEgress ? (
        <form
          className={styles.actions}
          onSubmit={(event) => {
            event.preventDefault();
            void testBitrix();
          }}
        >
          <label className={styles.lead} htmlFor="bitrix-host">
            Domínio do portal (sem o webhook)
          </label>
          <input
            id="bitrix-host"
            className={styles.secondary}
            placeholder="suaempresa.bitrix24.com.br"
            autoComplete="off"
            spellCheck={false}
            value={bitrixHost}
            onChange={(event) => setBitrixHost(event.target.value)}
          />
          <button type="submit" className={styles.secondary}>
            Testar conexão
          </button>
        </form>
        ) : null}

        <h2 className={styles.subtitle}>Testes que dependem de um clique</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={manualClipboard}>
            Testar copiar
          </button>
          <button type="button" className={styles.secondary} onClick={manualPopup}>
            Testar nova aba
          </button>
          <button type="button" className={styles.secondary} onClick={manualDownload}>
            Testar download
          </button>
          <a className={styles.secondary} href="mailto:?subject=Teste%20do%20Nexo&body=Se%20este%20e-mail%20abriu%2C%20o%20link%20funciona.">
            Testar e-mail
          </a>
          <a className={styles.secondary} href="https://wa.me/?text=Teste%20do%20Nexo" target="_blank" rel="noopener noreferrer">
            Testar WhatsApp
          </a>
        </div>

        <h2 className={styles.subtitle}>Relatório</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={copyReport}>
            Copiar relatório
          </button>
          {copied ? <span role="status">{copied}</span> : null}
        </div>
        <textarea className={styles.report} readOnly value={report} aria-label="Relatório do diagnóstico em JSON" rows={10} />
      </section>
    </main>
  );
}
