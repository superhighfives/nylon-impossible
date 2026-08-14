import {
  Children,
  Fragment,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
} from "react";

export type LayerCardProps = HTMLAttributes<HTMLDivElement>;

// A shell one step darker than the surface it sits on, with the Primary
// section rendered as its own inset surface — that contrast is the whole
// "layered" effect, so both backgrounds are fixed rather than configurable.
const SURFACE_CLASSES =
  "overflow-hidden rounded-lg bg-gray-surface shadow-sm ring ring-gray-subtle";
const LAYERED_ROOT_CLASSES =
  "flex w-full flex-col overflow-hidden rounded-lg bg-gray-base text-sm ring ring-gray-subtle";
const SECONDARY_CLASSES =
  "-my-2 flex items-center gap-2 p-4 text-sm font-medium text-gray-muted";
const PRIMARY_CLASSES =
  "relative flex flex-1 flex-col gap-2 overflow-hidden rounded-lg bg-gray-surface p-4 shadow-sm ring ring-gray-subtle";

function hasLayerCardSections(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement(child)) return false;
    if (child.type === LayerCardPrimary || child.type === LayerCardSecondary)
      return true;
    if (child.type === Fragment)
      return hasLayerCardSections(
        (child.props as { children?: ReactNode }).children,
      );
    return false;
  });
}

function LayerCardRoot({ children, className, ...props }: LayerCardProps) {
  const base = hasLayerCardSections(children)
    ? LAYERED_ROOT_CLASSES
    : SURFACE_CLASSES;
  return (
    <div className={`${base} ${className ?? ""}`} {...props}>
      {children}
    </div>
  );
}

function LayerCardSecondary({ children, className, ...props }: LayerCardProps) {
  return (
    <div className={`${SECONDARY_CLASSES} ${className ?? ""}`} {...props}>
      {children}
    </div>
  );
}

function LayerCardPrimary({ children, className, ...props }: LayerCardProps) {
  return (
    <div className={`${PRIMARY_CLASSES} ${className ?? ""}`} {...props}>
      {children}
    </div>
  );
}

/**
 * Card with a layered visual treatment, after Kumo's LayerCard: render
 * children directly for a plain surface, or use `LayerCard.Secondary`
 * (header strip on the shell) and `LayerCard.Primary` (inset surface)
 * for the layered look.
 */
export const LayerCard = Object.assign(LayerCardRoot, {
  Primary: LayerCardPrimary,
  Secondary: LayerCardSecondary,
});
