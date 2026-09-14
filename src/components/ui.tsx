import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/* Micro label — the "lab plaque" caption */
export function Plaque({ children, className, tone = "light" }: { children: ReactNode; className?: string; tone?: "light" | "dark" }) {
  return (
    <p
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
        tone === "dark" ? "text-ink-400" : "text-ink-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "ghost" | "outline" | "danger-ghost";
  size?: "sm" | "md" | "icon";
};

export function Btn({ variant = "outline", size = "md", className, ...rest }: BtnProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1 text-xs",
        size === "md" && "px-3.5 py-1.5 text-sm",
        size === "icon" && "h-8 w-8",
        variant === "primary" && "bg-signal-600 text-white shadow-[0_2px_10px_-2px_var(--color-signal-600)] hover:bg-signal-700",
        variant === "ink" && "bg-ink-950 text-[#f5f1e8] hover:bg-ink-800",
        variant === "outline" && "border border-ink-200 bg-white/70 hover:border-ink-400 hover:bg-white",
        variant === "ghost" && "text-ink-700 hover:bg-ink-950/5",
        variant === "danger-ghost" && "text-red-700/80 hover:bg-red-50 hover:text-red-700",
        className,
      )}
      {...rest}
    />
  );
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-ink-200 bg-white/80 px-2.5 py-1.5 text-sm outline-none transition placeholder:text-ink-400 focus:border-signal-600 focus:ring-2 focus:ring-signal-600/15",
        props.className,
      )}
    />
  );
}

export function DarkField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[13px] text-[#ece7db] outline-none transition placeholder:text-ink-400 focus:border-signal-500/60 focus:ring-2 focus:ring-signal-500/20",
        props.className,
      )}
    />
  );
}

export function StatusDot({ tone }: { tone: "green" | "red" | "amber" | "live" }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {tone === "live" && <span className="absolute h-full w-full animate-pulse-dot rounded-full bg-signal-500" />}
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "green" && "bg-emerald-500",
          tone === "red" && "bg-red-500",
          tone === "amber" && "bg-amber-500",
          tone === "live" && "bg-signal-500",
        )}
      />
    </span>
  );
}
