"use client";

import { ArrowRight, Ban, Check, CircleCheckBig, ExternalLink, Laptop, ListChecks, LogIn, LogOut, Plus, Search, Trash2, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { BoardingPass } from "@/components/lines/boarding-pass";
import { DepartureBoard } from "@/components/lines/departure-board";
import { LEDGER_ICON, ROLE_ICON } from "@/components/lines/icons";
import { LineTrack } from "@/components/lines/line-track";
import { Pictogram } from "@/components/lines/pictogram";
import { StationList } from "@/components/lines/station-list";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { countdownFor } from "@/features/collaborator/countdown";
import { ScopeList } from "@/features/install/scope-list";
import { JourneyLineCard } from "@/features/journeys/journey-line-card";
import { UpcomingList } from "@/features/today/upcoming-list";
import { formatDateMedium } from "@/lib/format";
import type { BoardRowDTO } from "@/shared/contracts";
import type { Samples } from "./sample-data";
import styles from "./showcase.module.css";

function Section({ id, title, children, note }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-titulo`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-titulo`} className={styles.sectionTitle}>
          {title}
        </h2>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

const SECTIONS = [
  ["botoes", "Botões"],
  ["chips", "Situações"],
  ["campos", "Campos"],
  ["linhas", "Linhas"],
  ["painel", "Painel de partidas"],
  ["cartao", "Cartão de embarque"],
  ["navegacao", "Passos e abas"],
  ["avisos", "Avisos e estados"],
  ["camadas", "Gaveta, diálogo e avisos rápidos"],
  ["colaborador", "Página do colaborador"],
] as const;

/** Vitrine dos componentes com dados de exemplo (só em desenvolvimento). */
export function Showcase({ samples, collaborator }: { samples: Samples; collaborator: { onboarding: ReactNode; offboarding: ReactNode; flash: ReactNode } }) {
  return (
    <ToastProvider>
      <ShowcaseBody samples={samples} collaborator={collaborator} />
    </ToastProvider>
  );
}

function ShowcaseBody({ samples, collaborator }: { samples: Samples; collaborator: { onboarding: ReactNode; offboarding: ReactNode; flash: ReactNode } }) {
  const toast = useToast();
  const [segment, setSegment] = useState<"open" | "onboarding" | "offboarding" | "closed">("open");
  const [kind, setKind] = useState<"onboarding" | "offboarding" | null>("onboarding");
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState("linha");
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [checked, setChecked] = useState({ email: true, crm: false });
  const ana = samples.lines[0];
  const bruno = samples.lines[1];

  const renderAction = (row: BoardRowDTO) => (
    <>
      <Button
        size="s"
        variant={row.action.type === "start_journey" || row.status.tone === "late" || row.action.type === "nudge" || row.action.type === "approve" ? "primary" : "onDark"}
        onClick={() => toast.show({ tone: "info", title: `Exemplo: ${row.action.label}`, description: `${row.what} · ${row.who.name}` })}
      >
        {row.action.label}
      </Button>
      {row.kind === "detection" ? (
        <Button size="s" variant="onDark" onClick={() => toast.show({ tone: "info", title: "Exemplo: Dispensar" })}>
          Dispensar
        </Button>
      ) : null}
    </>
  );

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Logo size={26} />
          <span className={styles.barLabel}>Vitrine de componentes · só em desenvolvimento</span>
        </div>
      </header>

      <main className={styles.main}>
        <PageHeader
          title="Vitrine do Nexo"
          description="Os componentes do sistema Linhas com dados de exemplo (Atomic Group, pessoas fictícias). Confira em 390 px e 1440 px: nada pode rolar para o lado."
        />

        <nav aria-label="Seções da vitrine" className={styles.toc}>
          <ul>
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="botoes" title="Botões" note="Alvo mínimo de 44 px. Amarelo é a ação principal; verde-floresta, a estrutura.">
          <div className={styles.row}>
            <Button variant="primary" icon={Plus}>
              Nova jornada
            </Button>
            <Button variant="forest" icon={CircleCheckBig}>
              Concluir
            </Button>
            <Button>Pausar</Button>
            <Button variant="ghost" iconAfter={ArrowRight}>
              Ver todas
            </Button>
            <Button variant="danger" icon={Ban}>
              Cancelar jornada
            </Button>
            <Button variant="primary" loading>
              Salvando
            </Button>
            <Button disabled>Indisponível</Button>
            <Button variant="secondary" icon={Trash2} aria-label="Remover item" />
            <ButtonLink href="https://exemplo.com.br" external icon={ExternalLink}>
              Abrir no Bitrix24
            </ButtonLink>
          </div>
          <div className={styles.darkRow}>
            <Button variant="primary" size="s">
              Iniciar jornada
            </Button>
            <Button variant="onDark" size="s">
              Abrir
            </Button>
          </div>
        </Section>

        <Section id="chips" title="Situações" note="Sempre com texto e ícone: a cor nunca é o único sinal.">
          <div className={styles.row}>
            <Chip tone="ok">Em dia</Chip>
            <Chip tone="attention">Atenção</Chip>
            <Chip tone="late">Atrasada</Chip>
            <Chip tone="info">A fazer</Chip>
            <Chip tone="neutral">Ainda não liberada</Chip>
            <Chip tone="arrival">Entrada</Chip>
            <Chip tone="departure">Saída</Chip>
            <Chip tone="forest" icon={Check}>
              Escolhida
            </Chip>
          </div>
          <div className={styles.darkRow}>
            <Chip tone="ok" onDark>
              Em dia
            </Chip>
            <Chip tone="attention" onDark>
              Aguardando você
            </Chip>
            <Chip tone="late" onDark>
              Atrasada
            </Chip>
            <Chip tone="info" onDark>
              Novo
            </Chip>
          </div>
          <div className={styles.row}>
            <Avatar name="Ana Souza" tone="arrival" />
            <Avatar name="Bruno Lima" tone="departure" />
            <Avatar name="Carla Mendes" />
            <Avatar name="Carla Mendes" size="l" tone="light" />
            <Pictogram icon={ROLE_ICON.ti} label="TI" />
            <Pictogram icon={ROLE_ICON.gestor} tone="arrival" label="Gestor" />
            <Pictogram icon={LEDGER_ICON.equipment} tone="departure" label="Equipamento" />
            <Pictogram icon={ListChecks} tone="attention" size="l" label="Checklist" />
          </div>
        </Section>

        <Section id="campos" title="Campos" note="Rótulos reais, dica entre o rótulo e o campo, erro com ícone e texto.">
          <div className={styles.grid2}>
            <Field label="Nome completo" defaultValue="Ana Souza" />
            <Field label="E-mail" type="email" defaultValue="ana@" error="Informe um e-mail válido." />
            <Field label="Buscar pessoa ou trilha" type="search" leadingIcon={Search} placeholder="Nome, cargo ou trilha" />
            <Select
              label="Tipo"
              defaultValue="equipment"
              options={[
                { value: "equipment", label: "Equipamento" },
                { value: "access", label: "Acesso" },
              ]}
            />
            <Textarea label="Motivo" optional hint="Fica no histórico. Nunca aparece para o colaborador." rows={3} />
            <div>
              <Checkbox
                label="Criar conta de e-mail"
                description="Acesso: Google Workspace. Entra no inventário da pessoa."
                checked={checked.email}
                onChange={(event) => setChecked({ ...checked, email: event.target.checked })}
              />
              <Checkbox label="Liberar acesso ao CRM" checked={checked.crm} onChange={(event) => setChecked({ ...checked, crm: event.target.checked })} />
              <Checkbox label="Checklist bloqueado" disabled />
            </div>
          </div>
          <Segmented
            legend="Mostrar"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "open", label: "Em andamento", count: 3 },
              { value: "onboarding", label: "Entradas", count: 2 },
              { value: "offboarding", label: "Saídas", count: 1 },
              { value: "closed", label: "Encerradas", count: 8 },
            ]}
          />
          <ChoiceCards
            legend="Tipo de jornada"
            value={kind}
            onChange={setKind}
            options={[
              { value: "onboarding", title: "Entrada", description: "Alguém vai chegar à empresa.", icon: LogIn, tone: "arrival" },
              { value: "offboarding", title: "Saída", description: "Alguém vai deixar a empresa.", icon: LogOut, tone: "departure" },
            ]}
          />
          <Panel title="Permissões do webhook" description="Como aparece na instalação e em Ajustes." headingLevel={3}>
            <ScopeList scopes={samples.scopes} headingLevel={4} />
          </Panel>
        </Section>

        <Section id="linhas" title="Linhas" note="Verde-sinal para entradas, laranja para saídas, amarelo para 'você está aqui'.">
          {ana && bruno ? (
            <div className={styles.stack}>
              <Panel title="Linha completa" headingLevel={3}>
                <div className={styles.stack}>
                  <LineTrack stations={ana.line} kind="onboarding" label="Linha de Ana Souza" />
                  <LineTrack stations={bruno.line} kind="offboarding" label="Linha de Bruno Lima" />
                  <LineTrack
                    stations={[
                      { position: 1, name: "Antes", state: "done" },
                      { position: 2, name: "Primeiro dia", state: "done" },
                      { position: 3, name: "Primeira semana", state: "done" },
                      { position: 4, name: "Primeiro mês", state: "done" },
                      { position: 5, name: "Experiência", state: "current" },
                    ]}
                    kind="onboarding"
                    label="Linha no fim"
                  />
                </div>
              </Panel>
              <Panel title="Linha compacta (listas)" headingLevel={3}>
                <LineTrack stations={ana.line} kind="onboarding" label="Linha de Ana Souza" size="compact" />
              </Panel>
              <div className={styles.lines}>
                {samples.lines.map((journey) => (
                  <JourneyLineCard key={journey.id} journey={journey} today={samples.today} />
                ))}
              </div>
              <Panel title="Linha vertical (etapas)" headingLevel={3}>
                <StationList
                  kind="onboarding"
                  label="Etapas de exemplo"
                  items={[
                    { key: "1", title: "Antes do 1º dia", state: "done", meta: "Etapa concluída · 4 atividades" },
                    {
                      key: "2",
                      title: "Primeiro dia",
                      state: "current",
                      meta: "2 de 5 atividades feitas",
                      children: <p className={styles.note}>As atividades da etapa entram aqui.</p>,
                    },
                    { key: "3", title: "Primeira semana", state: "upcoming", meta: "Libera em 3 dias" },
                  ]}
                />
              </Panel>
            </div>
          ) : null}
        </Section>

        <Section id="painel" title="Painel de partidas" note="Tabela acessível; no celular cada linha vira um cartão.">
          <DepartureBoard rows={samples.todayDto.board} caption="Exemplo do painel de hoje" renderAction={renderAction} />
          <div className={styles.grid2}>
            <Panel title="Próximos 14 dias" headingLevel={3}>
              <UpcomingList items={samples.todayDto.upcoming} />
            </Panel>
            <Panel title="Progresso" headingLevel={3}>
              <div className={styles.stack}>
                <ProgressBar value={21} tone="arrival" label="Progresso de Ana Souza" />
                <ProgressBar value={45} tone="departure" label="Progresso de Bruno Lima" />
                <ProgressBar value={75} label="Progresso geral" />
              </div>
            </Panel>
          </div>
        </Section>

        <Section id="cartao" title="Cartão de embarque" note="Largo, o canhoto vai para a direita; estreito, fica embaixo.">
          <div className={styles.passes}>
            <BoardingPass
              kind="onboarding"
              title="Cartão de embarque"
              greeting="Boas-vindas,"
              name="Ana"
              fields={[
                { label: "Embarque", value: formatDateMedium(samples.collaboratorOnboarding.anchorDate, samples.today) },
                { label: "Destino", value: samples.company },
                { label: "Com você", value: "Rafael Prado" },
                { label: "Seu buddy", value: "Júlia Campos" },
              ]}
              countdown={countdownFor("onboarding", 7)}
            />
            <div className={styles.narrow}>
              <BoardingPass
                kind="offboarding"
                title="Cartão de saída"
                greeting="Até breve,"
                name="Bruno"
                fields={[
                  { label: "Último dia", value: formatDateMedium(samples.collaboratorOffboarding.anchorDate, samples.today) },
                  { label: "Empresa", value: samples.company },
                  { label: "Seu gestor", value: "Rafael Prado" },
                  { label: "Contato no RH", value: "Marina Rocha" },
                ]}
                countdown={countdownFor("offboarding", 3)}
              />
            </div>
          </div>
        </Section>

        <Section id="navegacao" title="Passos e abas">
          <Stepper steps={["Quem", "Trilha e data", "Participantes"]} current={step} />
          <div className={styles.row}>
            <Button size="s" onClick={() => setStep((value) => Math.max(0, value - 1))}>
              Passo anterior
            </Button>
            <Button size="s" variant="forest" onClick={() => setStep((value) => Math.min(3, value + 1))}>
              Próximo passo
            </Button>
          </div>
          <Tabs
            label="Abas de exemplo"
            value={tab}
            onValueChange={setTab}
            items={[
              { id: "linha", label: "Linha", badge: 4, content: <p>Conteúdo da aba Linha.</p> },
              { id: "inventario", label: "Acessos e equipamentos", icon: Laptop, badge: 2, content: <p>Conteúdo da aba de inventário.</p> },
              { id: "historico", label: "Histórico", content: <p>Conteúdo da aba Histórico.</p> },
            ]}
          />
        </Section>

        <Section id="avisos" title="Avisos e estados">
          <div className={styles.stack}>
            <Notice tone="info" title="Indo para o Bitrix24">
              A tarefa aparece no Bitrix24 no próximo ciclo, em até 1 minuto.
            </Notice>
            <Notice tone="success" title="Conectado a atomic.bitrix24.com.br">
              Todas as permissões obrigatórias estão liberadas.
            </Notice>
            <Notice tone="warning" title="Ana ainda não tem conta no Bitrix24" action={<Button size="s" variant="forest">Vincular conta</Button>}>
              As tarefas que dependem da conta só vão para o Bitrix24 depois do vínculo.
            </Notice>
            <Notice tone="error" title="Não foi possível conectar">
              O endereço do webhook não respondeu. Confira se copiou o endereço completo.
            </Notice>
            <div className={styles.grid2}>
              <EmptyState
                icon={Users}
                title="Nenhuma jornada ainda"
                headingLevel={3}
                action={
                  <Button variant="primary" icon={Plus}>
                    Nova jornada
                  </Button>
                }
              >
                Comece uma entrada ou uma saída. Cada atividade liberada vira uma tarefa no Bitrix24.
              </EmptyState>
              <LoadingArea label="Exemplo de carregamento">
                <Skeleton width="45%" height={28} />
                <Skeleton height={16} />
                <Skeleton width="80%" height={16} />
                <Skeleton height={120} radius={6} />
              </LoadingArea>
            </div>
          </div>
        </Section>

        <Section id="camadas" title="Gaveta, diálogo e avisos rápidos" note="Gaveta e diálogo usam <dialog> nativo: foco preso, Esc fecha.">
          <div className={styles.row}>
            <Button variant="forest" onClick={() => setDrawer(true)}>
              Abrir gaveta
            </Button>
            <Button variant="danger" onClick={() => setDialog(true)}>
              Abrir diálogo
            </Button>
            <Button onClick={() => toast.show({ tone: "success", title: "Jornada iniciada", description: "As atividades liberadas vão para o Bitrix24 em instantes." })}>
              Aviso de sucesso
            </Button>
            <Button onClick={() => toast.show({ tone: "error", title: "Não foi possível cobrar", description: "O Bitrix24 não respondeu. Tente de novo." })}>
              Aviso de erro
            </Button>
            <Button onClick={() => toast.show({ tone: "info", title: "Detecção dispensada" })}>Aviso informativo</Button>
          </div>
          <Drawer
            open={drawer}
            onClose={() => setDrawer(false)}
            title="Preparar notebook"
            tone="arrival"
            meta={
              <>
                <Pictogram icon={ROLE_ICON.ti} size="s" />
                TI · Bruno Lima · Etapa Antes do 1º dia
              </>
            }
            footer={
              <>
                <ButtonLink href="https://exemplo.com.br" external icon={ExternalLink}>
                  Abrir no Bitrix24
                </ButtonLink>
                <Button variant="primary" icon={CircleCheckBig} onClick={() => setDrawer(false)}>
                  Marcar como feita
                </Button>
              </>
            }
          >
            <div className={styles.row}>
              <Chip tone="attention">Em risco</Chip>
              <strong>Vence em 2 dias</strong>
            </div>
            <p>Formatar o notebook, instalar a imagem padrão e entregar com o carregador.</p>
            <div>
              <Checkbox label="Instalar a imagem padrão" defaultChecked />
              <Checkbox label="Registrar o patrimônio" description="Equipamento: Notebook Dell 5440. Entra no inventário da pessoa." />
            </div>
          </Drawer>
          <Dialog
            open={dialog}
            onClose={() => setDialog(false)}
            tone="danger"
            title="Cancelar a jornada de Ana?"
            description="A jornada sai das listas de acompanhamento. O histórico continua guardado."
            actions={
              <>
                <Button variant="secondary" onClick={() => setDialog(false)}>
                  Voltar
                </Button>
                <Button variant="danger" icon={Ban} onClick={() => setDialog(false)}>
                  Cancelar jornada
                </Button>
              </>
            }
          >
            <Textarea label="Motivo" optional rows={3} hint="Fica no histórico. Nunca aparece para o colaborador." />
          </Dialog>
        </Section>

        <Section id="colaborador" title="Página do colaborador" note="Renderizada no servidor, sem JavaScript, com CSS próprio. Moldura de 390 px.">
          <div className={styles.phones}>
            <figure className={styles.phoneFigure}>
              <figcaption className={styles.note}>Entrada (Ana)</figcaption>
              <div className={styles.phone}>{collaborator.onboarding}</div>
            </figure>
            <figure className={styles.phoneFigure}>
              <figcaption className={styles.note}>Saída (Bruno)</figcaption>
              <div className={styles.phone}>{collaborator.offboarding}</div>
            </figure>
            <figure className={styles.phoneFigure}>
              <figcaption className={styles.note}>Depois de &quot;Marcar como feita&quot;</figcaption>
              <div className={styles.phone}>{collaborator.flash}</div>
            </figure>
          </div>
        </Section>
      </main>
    </div>
  );
}
