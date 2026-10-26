import type { z } from "zod";

/** Primeira mensagem de cada campo de um erro do zod, com o caminho em pontos ("stages.0.name"). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** Leva o foco ao primeiro campo com erro (marcado com `aria-invalid`) dentro do formulário. */
export function focusFirstInvalid(form: HTMLElement | null): void {
  if (!form) return;
  window.requestAnimationFrame(() => {
    form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  });
}
