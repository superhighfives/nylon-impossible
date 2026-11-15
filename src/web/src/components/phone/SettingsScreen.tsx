import { useClerk } from "@clerk/tanstack-react-start";
import {
  ArrowUpRight,
  ChevronDown,
  type LucideIcon,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ApiTokenInfo,
  useApiToken,
  useCreateApiToken,
  useRevokeApiToken,
} from "@/hooks/useApiToken";
import {
  type Theme,
  useDeleteCurrentUser,
  useUpdateUser,
  useUser,
} from "@/hooks/useUser";
import { API_URL } from "@/lib/config";
import { messageFromError, toast } from "@/lib/toast";
import { useDevEnvironment } from "../DevEnvironmentIndicator";
import { browserTimeZone } from "../TimezoneSync";
import { Masthead } from "./Masthead";
import { Screen } from "./Screen";

const AUTOMATIC = "automatic";

/** In the iOS order, with the tokens' theme glyphs. */
const THEMES: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

const ZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

const pretty = (zone: string) => zone.replace(/_/g, " ");

const SECTION = "mx-5 border-b border-n-hairline py-5";
const LABEL = "mb-2 block text-[0.8125rem] font-semibold text-n-ink-muted";
const HINT = "mt-2 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted";
const BUTTON =
  "min-h-11 cursor-pointer rounded-n-chip border border-n-hairline px-3.5 text-[0.9375rem] font-medium n-focus disabled:opacity-50";
const EXTERNAL_LINK =
  "-mx-2 flex min-h-11 items-center justify-between rounded-n-chip px-2 text-base text-n-ink no-underline n-focus";

/**
 * Settings for the phone: theme, the timezone (Automatic follows this device;
 * picking a zone by hand turns Automatic off), the personal API token, and
 * account deletion. Each choice saves the moment it's made.
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
    // One of the app's few confirmations (with Regenerate and Revoke API
    // token): it can't be undone.
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
      <Masthead pushed title="Settings" subline="Synced across your devices" />
      <fieldset className={`${SECTION} min-w-0`}>
        <legend className={`${LABEL} float-left w-full`}>Appearance</legend>
        <div className="clear-both flex flex-wrap gap-1.5">
          {THEMES.map(({ value, label, Icon }) => {
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
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-n-chip border px-3.5 text-[0.9375rem] font-medium n-focus disabled:opacity-50 ${
                  selected
                    ? "border-n-brand bg-n-brand text-n-brand-ink"
                    : "border-n-hairline text-n-ink-muted"
                }`}
              >
                <Icon size={15} aria-hidden="true" />
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
          Today moves to this week, and this week to someday, at your local
          midnight. A todo gets at least a full day in today.
        </p>
      </section>

      <ApiTokenSection open={open} />

      <section className={SECTION}>
        <h2 className={LABEL}>About</h2>
        {[
          { href: "/privacy", label: "Privacy policy" },
          { href: "/terms", label: "Terms of service" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener"
            className={EXTERNAL_LINK}
          >
            {link.label}
            <ArrowUpRight
              size={16}
              aria-hidden="true"
              className="text-n-ink-muted"
            />
          </a>
        ))}
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

      {/* Local dev and preview deploys only; production renders nothing. */}
      {open && typeof window !== "undefined" && (
        <Environment origin={window.location.origin} />
      )}
    </Screen>
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "3 Nov 2026", or "3 Nov" without the year. */
function day(iso: string, withYear: boolean) {
  const d = new Date(iso);
  const short = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${short} ${d.getFullYear()}` : short;
}

function tokenDates(info: ApiTokenInfo) {
  const used = info.lastUsedAt
    ? `Last used ${day(info.lastUsedAt, false)}`
    : "Never used";
  return `Created ${day(info.createdAt, true)} · ${used}`;
}

/**
 * The personal API token: one per account, read-only, for the person's own
 * scripts. It's shown once, right after it's made, and stays on screen until
 * Settings closes. Regenerate and Revoke ask first: the old token can't come
 * back, since only its hash is kept.
 */
function ApiTokenSection({ open }: { open: boolean }) {
  const { data: info, isPending } = useApiToken(open);
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setFresh(null);
  }, [open]);

  const fail = (fallback: string) => (err: unknown) =>
    toast.error(messageFromError(err, fallback));
  const busy = create.isPending || revoke.isPending;

  const make = (regenerate: boolean) => {
    if (
      regenerate &&
      !window.confirm(
        "Regenerate your API token? Anything using the current one will stop working.",
      )
    ) {
      return;
    }
    create.mutate(regenerate, {
      onSuccess: ({ token }) => setFresh(token),
      onError: fail(
        regenerate ? "Couldn't regenerate token" : "Couldn't create token",
      ),
    });
  };

  const remove = () => {
    if (
      !window.confirm(
        "Revoke your API token? Anything using it will stop working.",
      )
    ) {
      return;
    }
    revoke.mutate(undefined, {
      onSuccess: () => toast.success("Token revoked"),
      onError: fail("Couldn't revoke token"),
    });
  };

  const copy = () => {
    if (!fresh) return;
    navigator.clipboard
      .writeText(fresh)
      .then(() => toast.success("Copied"), fail("Couldn't copy"));
  };

  const docsLink = (
    <a
      href="/docs/api"
      target="_blank"
      rel="noopener"
      className={EXTERNAL_LINK}
    >
      API docs
      <ArrowUpRight size={16} aria-hidden="true" className="text-n-ink-muted" />
    </a>
  );

  return (
    <section className={SECTION}>
      <h2 className={LABEL}>API token</h2>
      {fresh ? (
        <>
          <div className="flex gap-2">
            <input
              aria-label="API token"
              readOnly
              value={fresh}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-n-field border border-n-hairline bg-n-canvas px-3 font-mono text-[0.8125rem] text-n-ink n-focus dark:bg-n-surface"
            />
            <button
              type="button"
              onClick={copy}
              className={`${BUTTON} text-n-ink`}
            >
              Copy
            </button>
          </div>
          <p className={HINT}>Copy it now. You won’t see it again.</p>
          <code className="mt-3 block rounded-n-field bg-n-fill px-3 py-2 font-mono text-xs leading-relaxed break-all text-n-ink">
            {`curl -H "Authorization: Bearer ${fresh}" ${API_URL}/v1/lists/today/todos`}
          </code>
          <div className="mt-2">{docsLink}</div>
        </>
      ) : info ? (
        <>
          <p className="text-base text-n-ink">{tokenDates(info)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => make(true)}
              disabled={busy}
              className={`${BUTTON} text-n-ink`}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className={`${BUTTON} text-n-overdue`}
            >
              Revoke
            </button>
          </div>
          <div className="mt-2">{docsLink}</div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => make(false)}
            disabled={busy || isPending}
            className={`${BUTTON} text-n-ink`}
          >
            Create token
          </button>
          <p className={HINT}>
            Lets your own scripts read your lists and todos. It can’t change
            anything.
          </p>
        </>
      )}
    </section>
  );
}

function Environment({ origin }: { origin: string }) {
  const env = useDevEnvironment(origin);
  if (!env) return null;
  return (
    <section className={SECTION}>
      <h2 className={LABEL}>Environment</h2>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-n-ink-muted">
        <dt>url</dt>
        <dd className="m-0 truncate">{env.currentUrl}</dd>
        <dt>api</dt>
        <dd className="m-0 truncate">{env.apiUrl}</dd>
      </dl>
    </section>
  );
}
