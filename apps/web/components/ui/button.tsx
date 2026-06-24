import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-sky-400 text-slate-950 hover:bg-sky-300",
        variant === "secondary" && "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
        variant === "danger" && "border border-rose-500/50 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
        variant === "ghost" && "text-slate-300 hover:bg-slate-800",
        className
      )}
      {...props}
    />
  );
}
