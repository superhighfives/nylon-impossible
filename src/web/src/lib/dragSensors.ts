import {
  PointerSensor,
  type PointerSensorOptions,
  TouchSensor,
} from "@dnd-kit/core";
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

/**
 * dnd-kit sensors shared by the phone's rows and the wide board. Touch
 * long-presses to lift; a mouse, trackpad or pen drags after a few px. The
 * input decides, per drag, not the device (principle 6).
 */

/** A pointer sensor for everything but touch, which long-presses instead. */
export class NonTouchPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        event: ReactPointerEvent,
        options: PointerSensorOptions,
      ): boolean =>
        event.nativeEvent.pointerType !== "touch" &&
        PointerSensor.activators[0].handler(event, options),
    },
  ];
}

/**
 * The board's touch sensor: a row lifts from anywhere but its checkbox (a
 * tap there ticks it) or a link.
 */
export class RowTouchSensor extends TouchSensor {
  static override activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (
        event: ReactTouchEvent,
        options: Parameters<(typeof TouchSensor.activators)[0]["handler"]>[1],
      ): boolean =>
        !(
          event.target instanceof Element &&
          event.target.closest("a, [data-row-check]")
        ) && TouchSensor.activators[0].handler(event, options),
    },
  ];
}

/** A touch event, without `instanceof`: desktop Firefox has no `TouchEvent`. */
export const isTouchEvent = (e: Event): e is TouchEvent => "touches" in e;

/** Whether a drag was started by a finger, from the event that started it. */
export function startedByTouch(e: Event | null): boolean {
  if (!e) return false;
  if (e.type.startsWith("touch")) return true;
  return "pointerType" in e && e.pointerType === "touch";
}
