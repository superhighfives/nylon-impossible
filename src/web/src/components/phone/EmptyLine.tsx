import { CircleDashed } from "lucide-react";

/**
 * The written empty state ("Nothing today.") drawn as a row: a muted dashed
 * circle in the check's slot and the words at a row title's size, so it sits
 * where the first todo will and that todo takes its place without moving
 * anything. The circle is decorative; the words are what's read out.
 * Colour comes from the parent, muted by default.
 */
export function EmptyLine({
  text,
  density,
}: {
  text: string;
  /** `wide` is the board's row; `phone` the phone pages'. */
  density: "phone" | "wide";
}) {
  const wide = density === "wide";
  return (
    <p data-empty-line className="m-0 flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`-mr-1.5 -ml-2.5 flex size-11 shrink-0 items-center justify-center ${wide ? "-my-0.5" : "mt-0.5"}`}
      >
        <CircleDashed
          size={wide ? 26 : 28}
          strokeWidth={1.6}
          aria-hidden="true"
        />
      </span>
      <span
        className={`min-w-0 flex-1 wrap-anywhere ${
          wide
            ? "py-2.5 text-[0.9375rem] leading-[1.4]"
            : "py-[0.6875rem] text-[1.0625rem] leading-[1.35]"
        }`}
      >
        {text}
      </span>
    </p>
  );
}
