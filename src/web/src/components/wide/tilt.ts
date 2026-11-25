/**
 * A dragged todo's tilt (the board's lifted card, and a phone row lifted in
 * place): one angle per drag, picked when it lifts and held until it's
 * dropped, so it doesn't wobble as it moves. On landing it swings past level
 * the other way, then rests. The angles come from the tokens (`motion` in
 * tokens.json, read here from tokens.css).
 */

import type { CSSProperties } from "react";

/** A dragged todo's tilt, in degrees, as `n-lifted` (styles.css) reads it. */
export const tiltStyle = (tilt: number) =>
  ({ "--n-drag-tilt": `${tilt}deg` }) as CSSProperties;

/** The tilt's tokens, in degrees. */
export interface TiltTokens {
  /** The furthest a drag tilts either way: `--n-tilt-max`. */
  max: number;
  /** How far past level a landed row swings: `--n-settle-overshoot`. */
  settleOvershoot: number;
  /** Tilted less than this either way, a row lands with no swing. */
  settleMinTilt: number;
}

/** The tilt tokens from tokens.css, or null if they aren't loaded. */
export function tiltTokens(): TiltTokens | null {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name).trim());
  const tokens = {
    max: read("--n-tilt-max"),
    settleOvershoot: read("--n-settle-overshoot"),
    settleMinTilt: read("--n-settle-min-tilt"),
  };
  return Object.values(tokens).every(Number.isFinite) ? tokens : null;
}

/**
 * A drag's angle, in degrees: uniformly between -`max` and +`max`. Call it
 * once, when the todo lifts. `random` is `Math.random`, or a seeded one.
 */
export function pickTilt(max: number, random: () => number = Math.random) {
  return (random() * 2 - 1) * max;
}

/**
 * How far past level a row dropped at `tilt` swings as it lands: the
 * settle overshoot, the opposite way to its tilt. 0, no swing, for a nearly
 * level drag, under reduced motion, or without the tokens.
 */
export function landingSwing(
  tilt: number,
  tokens: TiltTokens | null,
  reducedMotion: boolean,
): number {
  if (!tokens || reducedMotion || Math.abs(tilt) < tokens.settleMinTilt) {
    return 0;
  }
  return -Math.sign(tilt) * tokens.settleOvershoot;
}

/**
 * The landed row's swing: from its tilt, past level by `swing` at 60%, then
 * level. On the `rotate` property, so it plays over the settle's
 * `transform` without replacing it.
 */
export function swingKeyframes(tilt: number, swing: number): Keyframe[] {
  return [
    { rotate: `${tilt}deg` },
    { rotate: `${swing}deg`, offset: 0.6 },
    { rotate: "0deg" },
  ];
}
