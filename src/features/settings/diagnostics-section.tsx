"use client";

import { RefreshCw, Stethoscope } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { HistoryTab } from "@/features/journeys/journey/history-tab";
import { api } from "@/lib/api-client";
import { formatSince } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import styles from "./settings-section.module.css";

const DATA_SOURCE: Record<string, string> = {
  "onnira-volume": "Volume persistente (onnira-volume)",
  NEXO_DATA_DIR: "Pasta definida em NEXO_DATA_DIR",
  local: "Pasta local: na hospedagem, os dados se perdem a cada publicação",
};

/** Diagnóstico técnico (último ciclo, fila, limite, banco, proteção dos dados, versão) e o registro de atividades. */
export function DiagnosticsSection() {
  const now = useNow(30_000);
  const diagnostics = useApi((signal) => api.diagnostics({ signal }), [], { refreshMs: 30_000 });
  const audit = useApi((signal) => api.audit({ limit: 50 }, { signal }), []);
  const since = (iso: string | null) => (!iso ? "Nunca" : now === null ? iso : formatSince(iso, now));
  const data = diagnostics.data;

  return (
    <>
      <Panel
        id="diagnostico"
        title="Diagnóstico"
        description="Para quem cuida do Nexo. Nenhum segredo aparece aqui."
        actions={
          <>
            <Button size="s" variant="ghost" icon={RefreshCw} onClick={diagnostics.reload} loading={diagnostics.refreshing}>
              Atualizar
            </Button>
            <ButtonLink href="/diagnostico" size="s" icon={Stethoscope}>
              Diagnóstico do ambiente
            </ButtonLink>
          </>
        }
      >
        {diagnostics.loading ? (
          <LoadingArea label="Lendo o diagnóstico…">
            <Skeleton height={120} radius={6} />
          </LoadingArea>
        ) : diagnostics.error && !data ? (
          <Notice tone="error" title="Não foi possível ler o diagnóstico">
            {diagnostics.error.message}
          </Notice>
        ) : data ? (
          <div className={styles.stack}>
            {data.backup.lastError ? (
              <Notice tone="warning" title="A última cópia de segurança falhou">
                {data.backup.lastError}
              </Notice>
            ) : null}
            {data.scheduler.lastError ? (
              <Notice tone="warning" title="O último ciclo teve erro">
                {data.scheduler.lastError}
              </Notice>
            ) : null}
            <dl className={styles.facts}>
              <div>
                <dt>Último ciclo</dt>
                <dd>
                  {since(data.scheduler.lastCycleAt)}
                  {data.scheduler.lastCycleMs !== null ? ` (${data.scheduler.lastCycleMs} ms)` : ""}
                </dd>
              </div>
              <div>
                <dt>Próximo ciclo</dt>
                <dd>{data.scheduler.running ? since(data.scheduler.nextCycleAt) : "Agendador parado"}</dd>
              </div>
              <div>
                <dt>Fila para o Bitrix24</dt>
                <dd>
                  {data.queue.queued} na fila · {data.queue.failed} com falha
                </dd>
              </div>
              <div>
                <dt>Limite do Bitrix24</dt>
                <dd>{data.rateLimitedUntil && now !== null && Date.parse(data.rateLimitedUntil) > now ? `Pausa até ${since(data.rateLimitedUntil)}` : "Sem pausa"}</dd>
              </div>
              <div>
                <dt>Banco</dt>
                <dd>
                  {data.database.driver} · diário {data.database.journalMode}
                </dd>
              </div>
              <div>
                <dt>Pasta de dados</dt>
                <dd>{DATA_SOURCE[data.database.dataSource] ?? data.database.dataSource}</dd>
              </div>
              <div>
                <dt>Permissões dos dados</dt>
                <dd>{!data.dataProtection.applies ? "Este sistema não usa permissões POSIX" : data.dataProtection.ok ? "Só o Nexo lê e grava" : `Ainda abertos: ${data.dataProtection.exposed.join(", ") || "não deu para conferir"}`}</dd>
              </div>
              <div>
                <dt>Chave de cifragem</dt>
                <dd>{data.dataProtection.keyFromEnv ? "No ambiente, separada do banco" : "No mesmo volume do banco"}</dd>
              </div>
              <div>
                <dt>Cópia de segurança</dt>
                <dd>
                  {data.backup.lastAt ? `Última ${since(data.backup.lastAt)}` : "Ainda sem cópia"} · {data.backup.count} guardada(s) por {data.backup.keepDays} dias
                </dd>
              </div>
              <div>
                <dt>Tentativas suspeitas ({data.security.hours} h)</dt>
                <dd>
                  {data.security.loginFailures} senha(s) errada(s) · {data.security.loginLocks} bloqueio(s) · {data.security.rateLimited} acima do limite
                </dd>
              </div>
              <div>
                <dt>Worker do Bitrix24</dt>
                <dd>{data.bitrixWorker ? "Ligado" : "Desligado: o Nexo chama o Bitrix24 direto, com a mesma política"}</dd>
              </div>
              <div>
                <dt>Versão</dt>
                <dd>
                  {data.build.version} · {data.build.commit}
                </dd>
              </div>
              <div>
                <dt>Node.js</dt>
                <dd>{data.node}</dd>
              </div>
            </dl>
            <h3 className={styles.subtitle}>Erros recentes do Bitrix24</h3>
            {data.recentBitrixErrors.length ? (
              <ul className={styles.list}>
                {data.recentBitrixErrors.map((item, index) => (
                  <li key={`${item.at}-${index}`} className={styles.listItem}>
                    <div className={styles.itemText}>
                      <p className={`${styles.itemTitle} ${styles.mono}`}>{item.method}</p>
                      <p className={styles.itemMeta}>
                        {item.code ?? "sem código"} · {since(item.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.quiet}>Nenhum erro recente.</p>
            )}
          </div>
        ) : null}
      </Panel>

      <Panel id="registro" title="Registro de atividades" description="As 50 ações mais recentes no Nexo, de qualquer pessoa.">
        {audit.loading ? (
          <LoadingArea label="Carregando o registro…">
            <Skeleton height={120} radius={6} />
          </LoadingArea>
        ) : audit.error ? (
          <Notice tone="error" title="Não foi possível carregar o registro">
            {audit.error.message}
          </Notice>
        ) : (
          <HistoryTab entries={audit.data ?? []} />
        )}
      </Panel>
    </>
  );
}
