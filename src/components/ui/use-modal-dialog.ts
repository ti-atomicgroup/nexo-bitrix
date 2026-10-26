"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";

/**
 * Liga um `<dialog>` nativo ao estado `open`: `showModal()` dá foco preso, Esc e fundo inerte de graça.
 * Fecha com Esc e com clique no fundo (só se o clique começou e terminou fora da caixa).
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return {
    ref,
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
      pressedBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
      pressedBackdrop.current = false;
    },
  };
}
