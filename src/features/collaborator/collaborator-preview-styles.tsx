"use client";

import { useEffect } from "react";
import { COLLABORATOR_CSS } from "./collaborator-styles";

/**
 * Prévia da página do colaborador dentro do console. Aqui o React cria os elementos no navegador e não conhece o nonce da
 * página, então o CSS entra por uma folha construída em JavaScript, que a CSP permite.
 */
export function CollaboratorPreviewStyles() {
  useEffect(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(COLLABORATOR_CSS);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet);
    };
  }, []);
  return null;
}
