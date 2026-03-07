import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const loaderVariants = cva(
  "animate-spin rounded-full border-2 border-current border-t-transparent",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        base: "h-5 w-5",
        lg: "h-6 w-6",
      },
    },
    defaultVariants: {
      size: "base",
    },
  },
);

export interface LoaderProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof loaderVariants> {}

export function Loader({ className, size, ...props }: LoaderProps) {
  return (
    <span
      className={loaderVariants({ size, className })}
      aria-hidden="true"
      {...props}
    />
  );
}
