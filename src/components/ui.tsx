import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "soft";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-copper text-white hover:bg-copper-dark",
        variant === "ghost" && "border border-line bg-card hover:bg-paper",
        variant === "soft" && "bg-inverse text-on-inverse hover:opacity-90",
        variant === "danger" && "bg-rose-700 text-white hover:bg-rose-800",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-ink-soft">{hint}</span>}
    </div>
  );
}

const control =
  "w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-copper focus:ring-2 focus:ring-copper/20";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, props.className)} {...props} />;
}

export type SelectOption = { value: string; label: string; description?: string };

export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  pill = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  pill?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < 280 && rect.top > spaceBelow;
    setMenu({ top: up ? rect.top : rect.bottom, left: rect.left, width: Math.max(rect.width, 208), up });
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    placeMenu();
    setOpen(true);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = options[(index + direction + options.length) % options.length];
      if (next) onChange(next.value);
      placeMenu();
      setOpen(true);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        ref={buttonRef}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 border border-line bg-card px-3 text-left text-sm font-semibold text-ink outline-none focus:border-copper disabled:cursor-not-allowed disabled:opacity-50",
          pill ? "rounded-full" : "rounded-xl",
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Elegir"}</span>
        <svg viewBox="0 0 20 20" className={cn("h-4 w-4 shrink-0 text-ink-soft transition", open && "rotate-180")} aria-hidden="true">
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        menu &&
        createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{
            position: "fixed",
            left: menu.left,
            width: menu.width,
            top: menu.up ? undefined : menu.top + 4,
            bottom: menu.up ? window.innerHeight - menu.top + 4 : undefined,
            zIndex: 80,
          }}
          className="max-h-80 overflow-auto rounded-2xl border border-line bg-card p-1 shadow-xl"
        >
          {options.map((option) => {
            const current = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex w-full flex-col rounded-xl px-3 py-2 text-left",
                    current ? "bg-peach text-ink" : "text-ink hover:bg-paper",
                  )}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  {option.description && <span className="text-xs text-ink-soft">{option.description}</span>}
                </button>
              </li>
            );
          })}
        </ul>,
          document.body,
        )}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  layer = "base",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  layer?: "base" | "top";
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={cn(
        "modal-scrim fixed inset-0 flex items-start justify-center overflow-y-auto px-4 py-8",
        layer === "top" ? "z-[90]" : "z-50",
      )}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-3xl border border-line bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl leading-none">{title}</h2>
            {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full px-2 text-2xl leading-none text-ink-soft hover:text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending = false,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} layer="top">
      <p className="text-sm leading-6">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={danger ? "danger" : "primary"} disabled={pending} onClick={onConfirm}>
          {pending ? "Esperá…" : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}

export function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal title="No se pudo" onClose={onClose} layer="top">
      <p className="text-sm leading-6">{message}</p>
      <Button type="button" className="mt-4" onClick={onClose}>
        Entendido
      </Button>
    </Modal>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.14em] text-ink-soft uppercase">{label}</p>
      <p className="mt-1 font-display text-4xl leading-none">{value}</p>
      {hint && <p className="mt-2 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}
