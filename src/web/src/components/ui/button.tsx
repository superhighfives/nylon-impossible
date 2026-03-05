import { Button as BaseButton } from "@base-ui/react/button";
import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-8 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-indigo-9 text-white hover:bg-indigo-10 active:bg-indigo-10",
        secondary:
          "bg-gray-3 text-gray-12 hover:bg-gray-4 active:bg-gray-5 ring-1 ring-gray-6",
        ghost: "bg-transparent text-gray-12 hover:bg-gray-3 active:bg-gray-4",
        destructive:
          "bg-tomato-9 text-white hover:bg-tomato-10 active:bg-tomato-10",
        outline:
          "bg-transparent text-gray-12 ring-1 ring-gray-7 hover:bg-gray-3 active:bg-gray-4",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        base: "h-9 px-4 text-sm",
        lg: "h-10 px-5 text-base",
      },
      shape: {
        base: "",
        square: "!px-0 aspect-square",
        circle: "!px-0 aspect-square rounded-full",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "base",
      shape: "base",
    },
  }
);

export interface ButtonProps
  extends ComponentProps<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  shape,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={buttonVariants({ variant, size, shape, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      ) : null}
      {children}
    </BaseButton>
  );
}
