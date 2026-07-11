import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition-colors focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "border-teal-700 bg-teal-700 text-white shadow-[4px_4px_0_rgba(15,118,110,0.18)] hover:bg-teal-800",
        variant === "secondary" &&
          "border-teal-700 bg-[#fffdf5] text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.14)] hover:bg-teal-50",
        variant === "danger" &&
          "border-rose-700 bg-rose-100 text-rose-800 shadow-[4px_4px_0_rgba(190,18,60,0.14)] hover:bg-rose-200",
        variant === "ghost" &&
          "border-teal-700 bg-transparent text-teal-800 hover:bg-teal-50",
        className,
      )}
      {...props}
    />
  );
}
