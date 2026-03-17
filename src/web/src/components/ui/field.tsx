import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode, TextareaHTMLAttributes } from "react";

export interface FieldProps extends ComponentProps<typeof BaseField.Root> {
  label?: string;
  description?: ReactNode;
  error?: { message?: string };
}

export function Field({
  children,
  label,
  description,
  error,
  className,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root
      className={`flex flex-col gap-1 ${className ?? ""}`}
      {...props}
    >
      {label && (
        <BaseField.Label className="text-sm font-medium text-gray-normal">
          {label}
        </BaseField.Label>
      )}
      {children}
      {description && !error && (
        <BaseField.Description className="text-xs text-gray-dim">
          {description}
        </BaseField.Description>
      )}
      {error?.message && (
        <BaseField.Error className="text-xs text-red-dim">
          {error.message}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "error";
}

export function Textarea({
  className,
  variant = "default",
  ...props
}: TextareaProps) {
  const variantClasses = {
    default: "ring-1 ring-gray-6 focus-visible:ring-yellow-8",
    error: "ring-1 ring-red-7 focus-visible:ring-red-8",
  };

  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-lg bg-gray-subtle px-3 py-2 text-sm text-gray-normal placeholder:text-gray-dim transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className ?? ""}`}
      {...props}
    />
  );
}
