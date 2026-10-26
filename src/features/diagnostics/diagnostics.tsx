"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
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

function cookieCheck(): Check {
  try {
    document.cookie = "nexo_sonda=1; Path=/; SameSite=None; Secure; Partitioned";
    const ok = document.cookie.includes("nexo_sonda=1");
    return { label: "Cookie particionado", status: ok ? "ok" : "aviso", detail: ok ? "Aceito neste contexto." : "Bloqueado. O Nexo não depende de cookies." };
  } catch {
    return { label: "Cookie particionado", status: "aviso", detail: "Bloqueado. O Nexo não depende de cookies." };
  }
}

export function Diagnostics({ variant }: { variant: "same-origin" | "no-referrer" }) {
  const [jsReady, setJsReady] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [server, setServer] = useState<unknown>(null);
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
    put("cookie", cookieCheck());
    /* eslint-enable react-hooks/set-state-in-effect */

    const started = performance.now();
    fetch("/api/probe", { headers: { Authorization: "Bearer sonda-sem-valor", "X-Nexo-Session": "sonda-sem-valor-0000000000" }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        setServer(body);
        const ms = Math.round(performance.now() - started);
        put("api", { label: "API do servidor", status: response.ok ? "ok" : "falha", detail: `HTTP ${response.status} em ${ms} ms` });
        const request = body?.request ?? {};
        put("auth", {
          label: "Cabeçalho Authorization chega ao servidor",
          status: request.authorizationPresent ? "ok" : "falha",
          detail: request.authorizationPresent ? "Sim: chega ao servidor." : "Não: a borda remove este cabeçalho (o Nexo usa X-Nexo-Session).",
        });
        put("sessionHeader", {
          label: "Cabeçalho X-Nexo-Session chega ao servidor",
          status: request.sessionHeaderPresent ? "ok" : "falha",
          detail: request.sessionHeaderPresent ? "Sim: o login do Nexo funciona dentro da Onnira." : "Não: a borda remove o cabeçalho próprio também.",
        });
        const sqlite: Array<{ driver: string; ok: boolean; rows?: number; journalMode?: string; error?: string }> = body?.sqlite ?? [];
        for (const item of sqlite) {
          put(`sqlite-${item.driver}`, {
            label: `SQLite (${item.driver})`,
            status: item.ok ? "ok" : "aviso",
            detail: item.ok ? `${item.rows} gravações acumuladas · diário ${item.journalMode}` : (item.error ?? "indisponível"),
          });
        }
        const boots = body?.boot?.record?.count;
        put("boots", {
          label: "Inicializações registradas na pasta de dados",
          status: boots ? "ok" : "falha",
          detail: boots ? `${boots} (aumenta a cada reinício; se voltar a 1 após republicar, o volume não persiste)` : (body?.boot?.error ?? "sem registro"),
        });
        put("dir", {
          label: "Pasta de dados",
          status: body?.dataDir?.chosen?.source === "onnira-volume" ? "ok" : "aviso",
          detail: `${body?.dataDir?.chosen?.path ?? "?"} (${body?.dataDir?.chosen?.source ?? "?"})`,
        });
        put("node", { label: "Node.js no servidor", status: "ok", detail: `${body?.runtime?.node} · ${body?.runtime?.platform}/${body?.runtime?.arch} · memória ${body?.runtime?.memory?.rssMb} MB em uso` });
      })
      .catch((error: unknown) => {
        put("api", { label: "API do servidor", status: "falha", detail: error instanceof Error ? error.message : "Sem resposta." });
      });
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
      const response = await fetch(`/api/probe?bitrix=${encodeURIComponent(host)}`, { cache: "no-store" });
      const egress = (await response.json())?.egress;
      setServer((current: unknown) => ({ ...(current as object), egress }));
      if (!egress || egress.error) {
        put("egress", { label: "Saída até o Bitrix24", status: "falha", detail: egress?.error ?? "Sem resposta da sonda." });
        return;
      }
      const line = (attempt: { ok: boolean; status?: number; error?: string; ms: number }) => (attempt.ok ? `HTTP ${attempt.status} em ${attempt.ms} ms` : `${attempt.error} (${attempt.ms} ms)`);
      put("egress-dns", { label: "DNS do portal", status: egress.dns.ok ? "ok" : "falha", detail: egress.dns.ok ? egress.dns.addresses.join(", ") : egress.dns.error });
      put("egress", { label: "Saída até o Bitrix24 (fetch)", status: egress.bitrixFetch.ok ? "ok" : "falha", detail: line(egress.bitrixFetch) });
      put("egress-ipv4", { label: "Saída até o Bitrix24 (IPv4)", status: egress.bitrixIpv4.ok ? "ok" : "falha", detail: line(egress.bitrixIpv4) });
      put("egress-neutral", { label: "Saída para a internet (example.com)", status: egress.neutralFetch.ok ? "ok" : "falha", detail: line(egress.neutralFetch) });
      put("egress-ip", {
        label: "IP de saída do servidor",
        status: egress.outboundIp?.ok ? "ok" : "aviso",
        detail: egress.outboundIp?.ok ? `${egress.outboundIp.ip} (é este IP que o Bitrix24 vê)` : (egress.outboundIp?.error ?? "Não informado."),
      });
      put("egress-proxy", { label: "Proxy no ambiente", status: "ok", detail: egress.proxyEnv.length ? egress.proxyEnv.join(", ") : "Nenhum" });
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

        <h2 className={styles.subtitle}>Conexão com o Bitrix24</h2>
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
