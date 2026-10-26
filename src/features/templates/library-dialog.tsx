"use client";

import { Plus } from "lucide-react";
import { ROLE_ICON } from "@/components/lines/icons";
import { Pictogram } from "@/components/lines/pictogram";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import type { LibraryActivityDTO } from "@/shared/contracts";
import { ROLE_LABEL, type JourneyKind } from "@/shared/enums";
import styles from "./library-dialog.module.css";

/** Biblioteca de atividades prontas (só leitura): escolher uma insere uma cópia na etapa. */
export function LibraryDialog({ open, kind, stageName, onClose, onPick }: { open: boolean; kind: JourneyKind; stageName: string; onClose: () => void; onPick: (item: LibraryActivityDTO) => void }) {
  const library = useApi((signal) => api.library({ signal }), [], { enabled: open, revalidateOnFocus: false });
  const items = (library.data ?? []).filter((item) => item.journeyKind === kind || item.journeyKind === "both");
  const groups = [...new Set(items.map((item) => item.group))];

  return (
    <Dialog open={open} onClose={onClose} title="Biblioteca de atividades" description={`Escolha uma atividade pronta para inserir em ${stageName || "esta etapa"}. Depois você pode ajustar tudo.`}>
      {library.loading ? (
        <LoadingArea label="Carregando a biblioteca…">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </LoadingArea>
      ) : library.error ? (
        <Notice tone="error" title="Não foi possível carregar a biblioteca">
          {library.error.message}
        </Notice>
      ) : items.length === 0 ? (
        <p className={styles.quiet}>Nenhuma atividade pronta para este tipo de trilha.</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group} className={styles.group} aria-label={group}>
              <h3 className={styles.groupTitle}>{group}</h3>
              <ul className={styles.list}>
                {items
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <li key={item.id} className={styles.item}>
                      <Pictogram icon={ROLE_ICON[item.activity.role]} size="s" />
                      <span className={styles.text}>
                        <span className={styles.title}>{item.activity.title}</span>
                        <span className={styles.meta}>{ROLE_LABEL[item.activity.role]}</span>
                      </span>
                      <Button size="s" icon={Plus} onClick={() => onPick(item)}>
                        Inserir
                        <span className="sr-only"> {item.activity.title}</span>
                      </Button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
