"use client";

import { Plus, Route, Settings, TrainFront, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import type { MeDTO, SyncStatusDTO } from "@/shared/contracts";
import { SyncStatus } from "./sync-status";
import styles from "./top-bar.module.css";
import { UserMenu } from "./user-menu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/hoje", label: "Hoje", icon: TrainFront },
  { href: "/pessoas", label: "Pessoas", icon: Users },
  { href: "/trilhas", label: "Trilhas", icon: Route },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface TopBarProps {
  me: MeDTO;
  sync: SyncStatusDTO | null;
  syncing: boolean;
  onSyncNow: () => void;
  onLogout: () => void;
}

/** Barra verde-floresta: logo, navegação (ativo sublinhado em amarelo), sincronização, "Nova jornada" e conta. */
export function TopBar({ me, sync, syncing, onSyncNow, onLogout }: TopBarProps) {
  const pathname = usePathname() ?? "";
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/hoje" className={styles.brand} aria-label="Nexo: abrir o painel de hoje">
          <Logo size={26} />
        </Link>
        <nav className={styles.nav} aria-label="Principal">
          <ul className={styles.navList}>
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={styles.navLink} aria-current={active ? "page" : undefined}>
                    <Icon className={styles.navIcon} size={20} strokeWidth={2.25} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.tools}>
          <SyncStatus sync={sync} syncing={syncing} onSyncNow={onSyncNow} />
          <ButtonLink href="/pessoas/nova" variant="primary" icon={Plus} className={styles.newJourney}>
            <span className={styles.newJourneyLabel}>Nova jornada</span>
          </ButtonLink>
          <UserMenu me={me} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
