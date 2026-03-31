import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-yellow-solid hover:bg-yellow-solid-hover text-gray dark:text-(--color-gray-12)",
        secondary:
          "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray ring-1 ring-gray-subtle",
        ghost:
          "bg-gray-ghost hover:bg-gray-ghost-hover active:bg-gray-ghost-active text-gray",
        destructive: "bg-red-solid hover:bg-red-solid-hover text-white",
        outline:
          "bg-gray-ghost hover:bg-gray-ghost-hover active:bg-gray-ghost-active text-gray ring-1 ring-gray",
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
  },
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
