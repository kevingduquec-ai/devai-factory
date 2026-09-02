import { forwardRef } from "react";
import { Spinner } from "@/components/spinner";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-qubit-blue-400 text-white hover:bg-qubit-blue-600 shadow-sm shadow-qubit-blue-400/20 disabled:opacity-60",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-qubit-gray-100 dark:hover:bg-white/5 disabled:opacity-60",
  ghost: "text-foreground hover:bg-qubit-gray-100 dark:hover:bg-white/5 disabled:opacity-60",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, disabled, className = "", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`font-accent inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});
