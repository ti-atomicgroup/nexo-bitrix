"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { fieldErrors } from "@/lib/form-errors";
import type { CollaboratorContentDTO, SettingsDTO } from "@/shared/contracts";
import { collaboratorContentInput } from "@/shared/schemas";
import styles from "./settings-section.module.css";

type Faq = CollaboratorContentDTO["faqOnboarding"];

function FaqEditor({ legend, items, path, errors, disabled, onChange }: { legend: string; items: Faq; path: string; errors: Record<string, string>; disabled: boolean; onChange: (items: Faq) => void }) {
  return (
    <fieldset className={styles.box}>
      <legend className={styles.subtitle}>{legend}</legend>
      {items.length ? null : <p className={styles.quiet}>Nenhuma pergunta ainda.</p>}
      <div className={styles.pairs}>
        {items.map((item, index) => (
          <div key={index} className={styles.pair}>
            <Field
              label={`Pergunta ${index + 1}`}
              value={item.question}
              disabled={disabled}
              onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, question: event.target.value } : entry)))}
              error={errors[`${path}.${index}.question`]}
            />
            <Textarea
              label="Resposta"
              rows={2}
              value={item.answer}
              disabled={disabled}
              onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, answer: event.target.value } : entry)))}
              error={errors[`${path}.${index}.answer`]}
            />
            {disabled ? null : (
              <Button variant="ghost" icon={Trash2} aria-label={`Remover a pergunta ${index + 1}`} className={styles.remove} onClick={() => onChange(items.filter((_, i) => i !== index))} />
            )}
          </div>
        ))}
      </div>
      {disabled ? null : (
        <div>
          <Button size="s" icon={Plus} onClick={() => onChange([...items, { question: "", answer: "" }])}>
            Adicionar pergunta
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** Conteúdo do link do colaborador: boas-vindas, despedida, contatos e perguntas frequentes. */
export function ContentSection({ settings, isAdmin, onSaved }: { settings: SettingsDTO; isAdmin: boolean; onSaved: (next: SettingsDTO) => void }) {
  const toast = useToast();
  const [content, setContent] = useState<CollaboratorContentDTO>(settings.content);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const disabled = !isAdmin;

  const save = async () => {
    const parsed = collaboratorContentInput.safeParse(content);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      onSaved(await api.settingsUpdate({ content: parsed.data }));
      toast.show({ tone: "success", title: "Conteúdo salvo", description: "Os links pessoais já mostram a versão nova." });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(error).message });
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel id="conteudo" title="Conteúdo do colaborador" description="O que aparece no link pessoal. Escreva como se falasse com a pessoa.">
      <div className={styles.stack}>
        <div className={styles.fields}>
          <Textarea
            label="Mensagem de boas-vindas"
            rows={4}
            hint="Aparece no link de quem está chegando."
            value={content.welcomeMessage}
            disabled={disabled}
            onChange={(event) => setContent({ ...content, welcomeMessage: event.target.value })}
            error={errors.welcomeMessage}
          />
          <Textarea
            label="Mensagem de despedida"
            rows={4}
            hint="Aparece no link de quem está saindo. Tom respeitoso; nunca o motivo da saída."
            value={content.farewellMessage}
            disabled={disabled}
            onChange={(event) => setContent({ ...content, farewellMessage: event.target.value })}
            error={errors.farewellMessage}
          />
        </div>

        <fieldset className={styles.box}>
          <legend className={styles.subtitle}>Contatos</legend>
          {content.contacts.length ? null : <p className={styles.quiet}>Nenhum contato ainda.</p>}
          <div className={styles.pairs}>
            {content.contacts.map((contact, index) => (
              <div key={index} className={styles.pair}>
                <Field
                  label={`Nome do contato ${index + 1}`}
                  placeholder="Ex.: E-mail do RH"
                  value={contact.label}
                  disabled={disabled}
                  onChange={(event) => setContent({ ...content, contacts: content.contacts.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)) })}
                  error={errors[`contacts.${index}.label`]}
                />
                <Field
                  label="Contato"
                  placeholder="E-mail, telefone ou link"
                  value={contact.value}
                  disabled={disabled}
                  onChange={(event) => setContent({ ...content, contacts: content.contacts.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)) })}
                  error={errors[`contacts.${index}.value`]}
                />
                {disabled ? null : (
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Remover o contato ${index + 1}`}
                    className={styles.remove}
                    onClick={() => setContent({ ...content, contacts: content.contacts.filter((_, i) => i !== index) })}
                  />
                )}
              </div>
            ))}
          </div>
          {disabled ? null : (
            <div>
              <Button size="s" icon={Plus} onClick={() => setContent({ ...content, contacts: [...content.contacts, { label: "", value: "" }] })}>
                Adicionar contato
              </Button>
            </div>
          )}
        </fieldset>

        <FaqEditor
          legend="Perguntas frequentes de quem chega"
          items={content.faqOnboarding}
          path="faqOnboarding"
          errors={errors}
          disabled={disabled}
          onChange={(faqOnboarding) => setContent({ ...content, faqOnboarding })}
        />
        <FaqEditor
          legend="Perguntas frequentes de quem sai"
          items={content.faqOffboarding}
          path="faqOffboarding"
          errors={errors}
          disabled={disabled}
          onChange={(faqOffboarding) => setContent({ ...content, faqOffboarding })}
        />

        {isAdmin ? (
          <div className={styles.actions}>
            <Button variant="primary" icon={Save} loading={pending} onClick={save}>
              Salvar conteúdo
            </Button>
          </div>
        ) : (
          <p className={styles.quiet}>Só a administração muda este conteúdo.</p>
        )}
      </div>
    </Panel>
  );
}
