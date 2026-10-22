"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import type {
  BitrixUser,
  Journey,
  JourneyType,
  TaskStatus,
} from "@/shared/contracts";
import { initials, statusLabels, typeLabels } from "@/lib/format";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-symbol" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span>
          nexo<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      className={`button button-${variant} ${className}`}
      aria-busy={loading}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Avatar({
  user,
  size = "md",
}: {
  user: Pick<BitrixUser, "name">;
  size?: "sm" | "md" | "lg";
}) {
  const color = [...user.name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5;
  return (
    <span
      className={`avatar avatar-${size} avatar-color-${color}`}
      aria-hidden="true"
    >
      {initials(user.name)}
    </span>
  );
}
export function TypeBadge({ type }: { type: JourneyType }) {
  return (
    <span className={`type-badge ${type}`}>
      {type === "onboarding" ? (
        <ArrowDownLeft size={13} />
      ) : (
        <ArrowUpRight size={13} />
      )}
      {typeLabels[type]}
    </span>
  );
}
export function TaskBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function RadarBadge({ journey }: { journey: Journey }) {
  const label =
    journey.status === "completed"
      ? "Concluída"
      : journey.status === "creating"
        ? "Preparando"
        : journey.status === "cancelled"
          ? "Cancelada"
          : {
              ok: "Em dia",
              attention: "Atenção",
              critical: "Crítica",
              unknown: "Sem atualização",
            }[journey.radar];
  return (
    <span
      className={`status radar-${journey.status === "completed" ? "completed" : journey.radar}`}
    >
      <span />
      {label}
    </span>
  );
}
export function Progress({
  value,
  label = true,
}: {
  value: number;
  label?: boolean;
}) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="progress-wrap">
      <div
        className="progress"
        role="progressbar"
        aria-label="Progresso da jornada"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {label && <span className="progress-label">{percent}%</span>}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar janela"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function CheckRow({
  checked,
  children,
}: {
  checked: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`check-row ${checked ? "is-complete" : ""}`}>
      <span>{checked ? <Check size={14} /> : <ChevronRight size={14} />}</span>
      {children}
    </div>
  );
}
