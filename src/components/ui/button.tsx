import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "forest" | "ghost" | "danger" | "onDark";
export type ButtonSize = "m" | "s";

interface LookProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconAfter?: LucideIcon;
  fullWidth?: boolean;
  children?: ReactNode;
}

function lookClass({ variant = "secondary", size = "m", fullWidth, children }: LookProps, className?: string) {
  return cx(styles.button, styles[variant], size === "s" && styles.small, fullWidth && styles.full, !children && styles.iconOnly, className);
}

function Content({ icon: Icon, iconAfter: IconAfter, children, loading }: LookProps & { loading?: boolean }) {
  return (
    <>
      {loading ? (
        <LoaderCircle className={cx(styles.icon, styles.spin)} size={20} strokeWidth={2.25} aria-hidden="true" />
      ) : Icon ? (
        <Icon className={styles.icon} size={20} strokeWidth={2.25} aria-hidden="true" />
      ) : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {IconAfter ? <IconAfter className={styles.icon} size={20} strokeWidth={2.25} aria-hidden="true" /> : null}
    </>
  );
}

export interface ButtonProps extends LookProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Mostra o indicador de progresso e bloqueia novos cliques. */
  loading?: boolean;
}

/** Botão com alvo mínimo de 44 px. Botões só com ícone precisam de `aria-label`. */
export function Button({ variant, size, icon, iconAfter, fullWidth, loading = false, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={lookClass({ variant, size, fullWidth, children }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content icon={icon} iconAfter={iconAfter} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export interface ButtonLinkProps extends LookProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  href: string;
  /** Abre fora do Nexo (nova aba, sem `opener`). */
  external?: boolean;
}

/** Link com aparência de botão: navegação interna via `next/link`; externa em nova aba. */
export function ButtonLink({ href, external = false, variant, size, icon, iconAfter, fullWidth, className, children, ...rest }: ButtonLinkProps) {
  const classes = lookClass({ variant, size, fullWidth, children }, className);
  const content = (
    <Content icon={icon} iconAfter={iconAfter}>
      {children}
    </Content>
  );
  if (external || /^(https?:|mailto:|tel:)/.test(href)) {
    const newTab = external || href.startsWith("http");
    return (
      <a href={href} className={classes} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined} {...rest}>
        {content}
        {newTab ? <span className="sr-only"> (abre em nova aba)</span> : null}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}
