import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(),
  useUpdateUser: vi.fn(),
}));

import { useUpdateUser, useUser } from "@/hooks/useUser";
import { TimezoneSync } from "../TimezoneSync";

const mutate = vi.fn();

function stubUser(user: { timezone: string; timezoneAuto?: boolean } | null) {
  vi.mocked(useUser).mockReturnValue({
    data: user ?? undefined,
  } as unknown as ReturnType<typeof useUser>);
}

function stubBrowserZone(timeZone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone };
    },
  );
}

describe("TimezoneSync", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof useUpdateUser>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the browser zone when automatic and different", () => {
    stubUser({ timezone: "UTC", timezoneAuto: true });
    stubBrowserZone("Europe/London");
    render(<TimezoneSync />);
    expect(mutate).toHaveBeenCalledWith({ timezone: "Europe/London" });
  });

  it("does nothing when the zone already matches", () => {
    stubUser({ timezone: "Europe/London", timezoneAuto: true });
    stubBrowserZone("Europe/London");
    render(<TimezoneSync />);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("leaves a manually picked zone alone", () => {
    stubUser({ timezone: "Asia/Tokyo", timezoneAuto: false });
    stubBrowserZone("Europe/London");
    render(<TimezoneSync />);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("waits for the user to load", () => {
    stubUser(null);
    stubBrowserZone("Europe/London");
    render(<TimezoneSync />);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("only tries once per stored and detected pair", () => {
    stubUser({ timezone: "UTC", timezoneAuto: true });
    stubBrowserZone("Europe/London");
    const { rerender } = render(<TimezoneSync />);
    stubUser({ timezone: "UTC", timezoneAuto: true });
    rerender(<TimezoneSync />);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
