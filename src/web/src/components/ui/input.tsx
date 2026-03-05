import { Input as BaseInput } from "@base-ui/react/input";
import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

const inputVariants = cva(
  "flex w-full rounded-md bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-9 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "ring-1 ring-gray-6 focus-visible:ring-indigo-8",
        error: "ring-1 ring-tomato-7 focus-visible:ring-tomato-8",
      },
      inputSize: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-2.5 text-sm",
        base: "h-9 px-3 text-sm",
        lg: "h-10 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "base",
    },
  }
);

export interface InputProps
  extends Omit<ComponentProps<typeof BaseInput>, "size">,
    VariantProps<typeof inputVariants> {}

export function Input({
  className,
  variant,
  inputSize,
  ...props
}: InputProps) {
  return (
    <BaseInput
      className={inputVariants({ variant, inputSize, className })}
      {...props}
    />
  );
}
