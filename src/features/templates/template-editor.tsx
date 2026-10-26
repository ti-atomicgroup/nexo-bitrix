"use client";

import { Archive, LogIn, LogOut, Plus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { plural } from "@/lib/format";
import { fieldErrors, focusFirstInvalid } from "@/lib/form-errors";
import { useApi } from "@/lib/use-api";
import type { TemplateDTO } from "@/shared/contracts";
import { templateInput } from "@/shared/schemas";
import { LibraryDialog } from "./library-dialog";
import { move, StageEditor } from "./stage-editor";
import { draftFrom, emptyStage, emptyTemplate, fromLibrary, toBody, type TemplateDraft } from "./template-draft";
import styles from "./template-editor.module.css";

/** `/trilhas/[id]` e `/trilhas/nova`: carrega a trilha (se existir) e abre o editor. */
export function TemplateEditorScreen({ templateId }: { templateId?: string }) {
  const template = useApi((signal) => api.template(templateId ?? "", { signal }), [templateId], { enabled: Boolean(templateId), revalidateOnFocus: false });
  if (!templateId) return <TemplateEditor template={null} />;
  if (template.data) return <TemplateEditor key={template.data.id} template={template.data} />;
  if (template.error) {
    return (
      <>
        <PageHeader title="Trilha" back={{ href: "/trilhas", label: "Trilhas" }} />
        <Notice
          tone="error"
          role="alert"
          title={template.error.status === 404 ? "Esta trilha não existe mais" : "Não foi possível abrir a trilha"}
          action={
            <Button variant="forest" icon={RefreshCw} onClick={template.reload}>
              Tentar de novo
            </Button>
          }
        >
          {template.error.message}
        </Notice>
      </>
    );
  }
  return (
    <LoadingArea label="Carregando a trilha…">
      <Skeleton width="45%" height={52} />
      <Skeleton height={220} radius={6} />
      <Skeleton height={320} radius={6} />
    </LoadingArea>
  );
}

/** Editor em formulário (sem arrastar): dados da trilha, etapas e atividades. Valida com `templateInput`. */
export function TemplateEditor({ template }: { template: TemplateDTO | null }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<TemplateDraft>(() => (template ? draftFrom(template) : emptyTemplate()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [libraryFor, setLibraryFor] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set(template ? [] : draft.stages.flatMap((stage) => stage.activities.map((activity) => activity.uid))));
  const libraryStage = draft.stages.find((stage) => stage.uid === libraryFor);
  const activityCount = draft.stages.reduce((total, stage) => total + stage.activities.length, 0);

  const markFresh = (uid: string) => setFreshIds((current) => new Set([...current, uid]));

  const save = async () => {
    const body = toBody(draft);
    const parsed = templateInput.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFailure(`Corrija ${plural(parsed.error.issues.length, "campo marcado", "campos marcados")} antes de salvar.`);
      focusFirstInvalid(document.getElementById("editor-trilha"));
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const saved = template ? await api.templateUpdate(template.id, body) : await api.templateCreate(body);
      toast.show({ tone: "success", title: template ? "Trilha salva" : "Trilha criada", description: "As próximas jornadas já usam esta versão." });
      if (!template) router.replace(`/trilhas/${encodeURIComponent(saved.id)}`);
      else setDraft(draftFrom(saved));
    } catch (error) {
      setFailure(toApiError(error).message);
    } finally {
      setPending(false);
    }
  };

  const archive = async () => {
    if (!template) return;
    setPending(true);
    try {
      await api.templateArchive(template.id);
      toast.show({ tone: "success", title: "Trilha arquivada", description: "Jornadas em andamento não mudam." });
      router.push("/trilhas");
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível arquivar", description: toApiError(error).message });
      setPending(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={template ? draft.name || template.name : "Nova trilha"}
        meta={`${plural(draft.stages.length, "etapa", "etapas")} · ${plural(activityCount, "atividade", "atividades")}${template ? ` · versão ${template.version}` : ""}`}
        back={{ href: "/trilhas", label: "Trilhas" }}
        actions={
          <>
            {template ? (
              <Button variant="danger" icon={Archive} onClick={() => setArchiving(true)} disabled={pending || template.archived}>
                {template.archived ? "Arquivada" : "Arquivar"}
              </Button>
            ) : null}
            <Button variant="primary" icon={Save} loading={pending} onClick={save}>
              Salvar trilha
            </Button>
          </>
        }
      />

      <form
        id="editor-trilha"
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {failure ? (
          <Notice tone="error" role="alert" title="Não foi possível salvar">
            {failure}
          </Notice>
        ) : null}

        <section className={styles.section} aria-labelledby="dados-trilha">
          <h2 id="dados-trilha" className={styles.sectionTitle}>
            Sobre a trilha
          </h2>
          <ChoiceCards
            legend="Tipo"
            value={draft.kind}
            onChange={(kind) => setDraft({ ...draft, kind })}
            options={[
              { value: "onboarding", title: "Entrada", description: "Prazos contados a partir do 1º dia.", icon: LogIn, tone: "arrival" },
              { value: "offboarding", title: "Saída", description: "Prazos contados a partir do último dia.", icon: LogOut, tone: "departure" },
            ]}
          />
          <div className={styles.fields}>
            <Field label="Nome" placeholder="Ex.: Onboarding Vendas" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} error={errors.name} />
            <Field
              label="Perfil"
              optional
              placeholder="Ex.: Comercial, Tecnologia"
              hint="Ajuda a escolher a trilha certa na nova jornada."
              value={draft.profile}
              onChange={(event) => setDraft({ ...draft, profile: event.target.value })}
              error={errors.profile}
            />
            <Textarea
              label="Descrição"
              optional
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              error={errors.description}
              className={styles.wide}
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="etapas-trilha">
          <h2 id="etapas-trilha" className={styles.sectionTitle}>
            Etapas
          </h2>
          <p className={styles.lead}>Cada etapa é uma estação da linha. As atividades de uma etapa viram tarefas no Bitrix24 quando ela libera.</p>
          {errors.stages ? <p className={styles.error}>{errors.stages}</p> : null}
          <div className={styles.stages}>
            {draft.stages.map((stage, index) => (
              <StageEditor
                key={stage.uid}
                stage={stage}
                index={index}
                count={draft.stages.length}
                journeyKind={draft.kind}
                errors={errors}
                freshIds={freshIds}
                onFresh={markFresh}
                onChange={(next) => setDraft({ ...draft, stages: draft.stages.map((item) => (item.uid === next.uid ? next : item)) })}
                onMove={(delta) => setDraft({ ...draft, stages: move(draft.stages, index, delta) })}
                onRemove={() => setDraft({ ...draft, stages: draft.stages.filter((item) => item.uid !== stage.uid) })}
                onOpenLibrary={() => setLibraryFor(stage.uid)}
              />
            ))}
          </div>
          <div>
            <Button
              icon={Plus}
              onClick={() => {
                const stage = emptyStage(false);
                stage.activities.forEach((activity) => markFresh(activity.uid));
                setDraft({ ...draft, stages: [...draft.stages, stage] });
              }}
            >
              Adicionar etapa
            </Button>
          </div>
        </section>

        <div className={styles.footer}>
          <ButtonLink href="/trilhas" variant="ghost">
            Voltar sem salvar
          </ButtonLink>
          <Button type="submit" variant="primary" icon={Save} loading={pending}>
            Salvar trilha
          </Button>
        </div>
      </form>

      <LibraryDialog
        open={Boolean(libraryStage)}
        kind={draft.kind}
        stageName={libraryStage?.name ?? ""}
        onClose={() => setLibraryFor(null)}
        onPick={(item) => {
          if (!libraryStage) return;
          const activity = fromLibrary(item);
          markFresh(activity.uid);
          setDraft({ ...draft, stages: draft.stages.map((stage) => (stage.uid === libraryStage.uid ? { ...stage, activities: [...stage.activities, activity] } : stage)) });
          setLibraryFor(null);
          toast.show({ tone: "success", title: "Atividade inserida", description: `${item.activity.title} entrou em ${libraryStage.name || "esta etapa"}.` });
        }}
      />

      <Dialog
        open={archiving}
        onClose={() => setArchiving(false)}
        tone="danger"
        title="Arquivar esta trilha?"
        description="Ela some da escolha de novas jornadas. Jornadas em andamento continuam com a versão que já têm."
        actions={
          <>
            <Button variant="secondary" onClick={() => setArchiving(false)}>
              Voltar
            </Button>
            <Button variant="danger" icon={Archive} loading={pending} onClick={archive}>
              Arquivar trilha
            </Button>
          </>
        }
      />
    </div>
  );
}
