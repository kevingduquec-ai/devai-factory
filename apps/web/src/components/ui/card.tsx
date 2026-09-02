export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 shadow-sm shadow-qubit-navy/[0.03] transition hover:shadow-md hover:shadow-qubit-navy/[0.06] ${className}`}
      {...props}
    />
  );
}

export function CardBadge({
  tone = "neutral",
  className = "",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "blue" | "green" | "amber" | "red" }) {
  const TONE_CLASSES: Record<string, string> = {
    neutral: "bg-qubit-gray-100 text-qubit-navy dark:bg-white/10 dark:text-white",
    blue: "bg-qubit-blue-400/10 text-qubit-blue-600 dark:text-qubit-blue-400",
    green: "bg-qubit-green/10 text-green-700 dark:text-qubit-green",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };
  return (
    <span
      className={`font-accent inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
