import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

/**
 * The few full-width buttons outside the app (landing, error and not-found
 * pages), on design tokens: `primary` is the brand yellow fill with dark ink,
 * `outline` a hairline on the canvas.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-n-field font-medium n-focus transition-[background-color,color,transform] duration-(--n-duration-fast) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-n-brand text-n-brand-ink",
        outline:
          "border border-n-hairline bg-transparent text-n-ink pointer-fine:hover:bg-n-surface",
      },
      size: {
        base: "h-10 px-4 text-[0.9375rem]",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "base",
    },
  },
);

export interface ButtonProps
  extends ComponentProps<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
