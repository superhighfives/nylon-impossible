import { useClerk } from "@clerk/tanstack-react-start";
import { ChevronDown } from "lucide-react";
import {
  type Theme,
  useDeleteCurrentUser,
  useUpdateUser,
  useUser,
} from "@/hooks/useUser";
import { messageFromError, toast } from "@/lib/toast";
import { browserTimeZone } from "../TimezoneSync";
import { Masthead } from "./Masthead";
import { Screen } from "./Screen";

const AUTOMATIC = "automatic";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const ZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

const pretty = (zone: string) => zone.replace(/_/g, " ");

const SECTION = "border-b border-n-hairline px-5 py-5";
const LABEL = "mb-2 block text-[0.8125rem] font-semibold text-n-ink-muted";
const HINT = "mt-2 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted";

/**
 * Settings for the phone: theme, the timezone (Automatic follows this device;
 * picking a zone by hand turns Automatic off), and account deletion. Each
 * choice saves the moment it's made.
 */
export function SettingsScreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: user } = useUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteCurrentUser();
  const { signOut } = useClerk();

  const theme = user?.theme ?? "system";
  const timezone = user?.timezone ?? "UTC";
  const automatic = user?.timezoneAuto !== false;
  const detected = browserTimeZone() ?? "UTC";
  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  const fail = (fallback: string) => (err: unknown) =>
    toast.error(messageFromError(err, fallback));

  const setZone = (value: string) => {
    const update =
      value === AUTOMATIC
        ? { timezone: detected, timezoneAuto: true }
        : { timezone: value, timezoneAuto: false };
    if (update.timezone === timezone && update.timezoneAuto === automatic) {
      return;
    }
    updateUser.mutate(update, { onError: fail("Couldn't change timezone") });
  };

  const deleteAccount = () => {
    // The one confirmation in the app: it can't be undone.
    const ok = window.confirm(
      "Permanently delete your account? All of your todos and lists will be removed and cannot be recovered.",
    );
    if (!ok) return;
    deleteUser.mutate(undefined, {
      onSuccess: async () => {
        onClose();
        await signOut({ redirectUrl: "/" });
      },
      onError: fail("Couldn't delete your account"),
    });
  };

  return (
    <Screen open={open} onClose={onClose} backLabel="Back" title="Settings">
      <Masthead
        pushed
        title="Settings"
        subline={user?.email ?? "Saved as you change them"}
      />
      <fieldset className={`${SECTION} min-w-0`}>
        <legend className={`${LABEL} float-left w-full`}>Appearance</legend>
        <div className="clear-both flex gap-1.5">
          {THEMES.map(({ value, label }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={!user}
                onClick={() => {
                  if (!selected) {
                    updateUser.mutate(
                      { theme: value },
                      { onError: fail("Couldn't change theme") },
                    );
                  }
                }}
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-n-chip border text-[0.9375rem] font-medium n-focus disabled:opacity-50 ${
                  selected
                    ? "border-n-brand bg-n-brand text-n-brand-ink"
                    : "border-n-hairline text-n-ink-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className={HINT}>
          System follows your device’s light or dark setting.
        </p>
      </fieldset>

      <section className={SECTION}>
        <label htmlFor="phone-timezone" className={LABEL}>
          Timezone
        </label>
        <div className="relative">
          <select
            id="phone-timezone"
            value={automatic ? AUTOMATIC : timezone}
            disabled={!user}
            onChange={(e) => setZone(e.target.value)}
            className="min-h-11 w-full cursor-pointer appearance-none rounded-n-field border border-n-hairline bg-n-canvas py-2 pr-10 pl-3 text-base text-n-ink n-focus disabled:opacity-50 dark:bg-n-surface"
          >
            <option value={AUTOMATIC}>
              Automatic ({pretty(automatic ? timezone : detected)})
            </option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {pretty(zone)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-n-ink-muted"
          />
        </div>
        <p className={HINT}>
          Today moves to This Week, and This Week to Someday, at your local
          midnight. A todo gets at least a full day in Today.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={LABEL}>Account</h2>
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/" })}
          className="-ml-2 min-h-11 cursor-pointer rounded-n-chip px-2 text-base font-medium text-n-ink n-focus"
        >
          Sign out
        </button>
        <div className="mt-3">
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleteUser.isPending || !user}
            className="-ml-2 min-h-11 cursor-pointer rounded-n-chip px-2 text-base font-medium text-n-overdue n-focus disabled:opacity-50"
          >
            {deleteUser.isPending ? "Deleting…" : "Delete my account"}
          </button>
          <p className={HINT}>
            Permanently deletes your account, todos and lists. This can’t be
            undone.
          </p>
        </div>
      </section>
    </Screen>
  );
}
