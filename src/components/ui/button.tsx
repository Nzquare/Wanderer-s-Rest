import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "brand" | "ghost" | "danger" | "outline";
type Size = "md" | "lg" | "xl";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-teal-600 text-white hover:bg-teal-500 active:bg-teal-600 shadow-sm",
  brand:
    "bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
  ghost:
    "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/5",
  danger: "bg-status-danger text-white hover:brightness-110",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/5",
};

// Large touch targets everywhere per §47 — even "md" clears the 44px a11y minimum.
const sizeClasses: Record<Size, string> = {
  md: "h-11 px-4 text-sm rounded-lg gap-2",
  lg: "h-14 px-6 text-base rounded-xl gap-2",
  xl: "h-20 px-8 text-lg rounded-2xl gap-3",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "lg", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
