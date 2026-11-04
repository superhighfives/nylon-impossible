/**
 * The written empty state ("Nothing today.") drawn as a row: a squiggle in
 * the "+ Add" composer's icon slot and the words at a row title's size, so it
 * sits where the first todo will and that todo takes its place without moving
 * anything. Nothing here can be clicked, so it's drawn lighter than a row: the
 * squiggle isn't a ring or a box, and both it and the words are subtle.
 * The squiggle is decorative; the words are what's read out. Colour comes
 * from the parent, subtle by default.
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
    <p
      data-empty-line
      className={`m-0 flex items-start ${wide ? "gap-3" : "gap-2.5"}`}
    >
      {/* Same width and left edge as the composer's plus, centred on the
          words' first line. */}
      <span
        aria-hidden="true"
        className={`flex w-4 shrink-0 items-center ${wide ? "ml-[3px] h-10" : "h-[2.8125rem]"}`}
      >
        <svg
          width="16"
          height="8"
          viewBox="0 0 16 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M1 4C2.5 0.5 5.5 0.5 8 4S13.5 7.5 15 4" />
        </svg>
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
