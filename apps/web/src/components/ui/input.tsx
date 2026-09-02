import { forwardRef } from "react";

const FIELD_CLASSES =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-qubit-blue-400 focus:ring-2 focus:ring-qubit-blue-400/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return <textarea ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-qubit-blue-400 ${className}`}
        {...props}
      />
    );
  },
);

export function Label({ className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-sm font-medium text-foreground ${className}`} {...props} />;
}
