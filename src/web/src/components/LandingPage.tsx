import { SignInButton, useClerk } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { type FormEvent, Fragment, useId, useState } from "react";
import { Button } from "./ui";

/** The headline and subhead, kept together so they're easy to change. */
export const LANDING_COPY = {
  headline: "Today, This week, Someday.",
  subhead:
    "Nylon is a todo list shaped by time. Things you don't get to move along on their own, and done means gone. The same on the web, iPhone, iPad and Mac.",
  eyebrow: "Coming soon",
  joined: "You're on the list. We'll email you when it's ready.",
};

/** The three horizons, in the order todos move through them. */
const horizons = [
  {
    title: "Today",
    body: "What you're doing now. Anything still here tomorrow moves on to This week by itself.",
  },
  {
    title: "This week",
    body: "What's coming up. After seven days it settles into Someday, without you sorting it.",
  },
  {
    title: "Someday",
    body: "Everything else, kept out of the way until you want it.",
  },
];

const features = [
  {
    title: "Done means gone",
    body: "Tick a todo and it leaves straight away, with Undo if you need it.",
  },
  {
    title: "Add in one motion",
    body: "Type “Call Sam tomorrow” and it's due tomorrow. Paste a link and it titles itself.",
  },
  {
    title: "Lists that stay put",
    body: "Groceries, a project, a trip. Your own lists never age.",
  },
  {
    title: "Keyboard first",
    body: "On a wide screen or the Mac, everything you can click has a key.",
  },
];

/** Where Nylon runs, all synced as you type and fine offline. */
const platforms = [
  {
    title: "Web",
    body: "The full board in any desktop browser: three time columns and your lists.",
  },
  {
    title: "Web on your phone",
    body: "The same app in a mobile browser, with nothing to install.",
  },
  {
    title: "iPhone",
    body: "Swipe to mark done, and a Today widget on your Home Screen.",
  },
  {
    title: "iPad",
    body: "The wide board, with all three columns side by side.",
  },
  {
    title: "Mac",
    body: "A native app, plus quick add from the menu bar.",
  },
  {
    title: "Gmail",
    body: "Turn an email into a todo without leaving your inbox.",
  },
];

const linkClass =
  "rounded-sm transition-colors duration-(--n-duration-fast) pointer-fine:hover:text-n-ink n-focus";

/** One product shot in each theme; the app's class-based dark mode picks. */
function Shot({
  name,
  alt,
  width,
  height,
  className,
  priority = false,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  className: string;
  priority?: boolean;
}) {
  const common = {
    width,
    height,
    decoding: "async" as const,
    loading: priority ? ("eager" as const) : ("lazy" as const),
  };
  return (
    <>
      <img
        {...common}
        src={`/images/landing/${name}-light.webp`}
        alt={alt}
        className={`${className} dark:hidden`}
      />
      <img
        {...common}
        src={`/images/landing/${name}-dark.webp`}
        alt={alt}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}

/**
 * Clerk API errors carry a readable message on their first entry. The cast is
 * a third-party boundary: Clerk's error shape isn't exported, so every field
 * is optional-chained with a fallback.
 */
function errorMessage(error: unknown): string {
  const first = (
    error as { errors?: { longMessage?: string; message?: string }[] }
  )?.errors?.[0];
  return (
    first?.longMessage ?? first?.message ?? "Something went wrong. Try again."
  );
}

/**
 * Email sign-up for the waitlist. Clerk holds the entries (waitlist mode is
 * on for the instance), so approving someone sends their invite from there.
 */
function WaitlistForm() {
  const clerk = useClerk();
  const inputId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "joined">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await clerk.joinWaitlist({ emailAddress: email.trim() });
      setStatus("joined");
    } catch (err) {
      setError(errorMessage(err));
      setStatus("idle");
    }
  }

  if (status === "joined") {
    return (
      <p role="status" className="leading-relaxed font-medium">
        {LANDING_COPY.joined}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        Email
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 min-w-0 rounded-n-field border border-n-hairline bg-n-canvas px-4 text-base text-n-ink placeholder:text-n-ink-subtle n-focus sm:flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={status === "sending"}
          className="sm:w-auto"
        >
          Join the waitlist
        </Button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-[0.9375rem] text-n-overdue"
        >
          {error}
        </p>
      )}
    </form>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-n-canvas text-n-ink">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <header className="flex h-16 items-center justify-between border-b border-n-hairline">
          <span className="font-n-display text-xl font-bold tracking-[-0.02em]">
            Nylon
          </span>
          <SignInButton mode="modal">
            <Button variant="outline">Sign in</Button>
          </SignInButton>
        </header>

        <main>
          <section
            aria-labelledby="landing-headline"
            className="grid gap-8 pt-12 pb-14 sm:pt-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16"
          >
            <h1
              id="landing-headline"
              className="font-n-display text-[3rem] leading-[1.02] font-bold tracking-[-0.035em] sm:text-[4.5rem] lg:text-[5.5rem]"
            >
              {/* One horizon per line: the order todos move in. */}
              {LANDING_COPY.headline.split(/(?<=,) /).map((line, index) => (
                <Fragment key={line}>
                  {index > 0 && " "}
                  <span className="block">{line}</span>
                </Fragment>
              ))}
            </h1>
            <div className="space-y-6 lg:pb-3">
              <p className="inline-block rounded-full border border-n-hairline px-3 py-1 text-[0.8125rem] font-medium text-n-ink">
                {LANDING_COPY.eyebrow}
              </p>
              <p className="text-[1.0625rem] leading-relaxed text-n-ink-muted text-pretty">
                {LANDING_COPY.subhead}
              </p>
              <WaitlistForm />
            </div>
          </section>

          {/* Phone width shows the iPhone alone, large enough to read; wider
              screens put it over the desktop board. */}
          <figure className="relative mb-10 pb-4 sm:mb-0 sm:pb-16">
            <div className="hidden overflow-hidden rounded-n-field border border-n-hairline sm:block">
              <Shot
                name="board"
                alt="Nylon on the web: Today, This week and Someday side by side, with a sidebar of lists."
                width={1600}
                height={1000}
                className="block h-auto w-full"
                priority
              />
            </div>
            <div className="mx-auto w-[72%] max-w-72 overflow-hidden rounded-[14%/6.5%] border border-n-hairline bg-n-canvas sm:absolute sm:right-8 sm:bottom-6 sm:w-[30%] sm:max-w-64">
              <Shot
                name="phone"
                alt="Nylon on iPhone, showing Today."
                width={660}
                height={1434}
                className="block h-auto w-full"
              />
            </div>
          </figure>

          <section
            aria-labelledby="landing-horizons"
            className="border-t border-n-hairline py-14 sm:py-20"
          >
            <h2
              id="landing-horizons"
              className="font-n-display text-[1.375rem] leading-7 font-semibold tracking-[-0.01em]"
            >
              Time is the structure
            </h2>
            <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10">
              {horizons.map((horizon, index) => (
                <li key={horizon.title} className="border-t border-n-ink pt-4">
                  <p className="text-[0.8125rem] text-n-ink-muted tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 font-n-display text-[2.125rem] leading-10 font-bold tracking-[-0.025em]">
                    {horizon.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-n-ink-muted">
                    {horizon.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="landing-platforms"
            className="border-t border-n-hairline py-14 sm:py-20"
          >
            <h2
              id="landing-platforms"
              className="font-n-display text-[1.375rem] leading-7 font-semibold tracking-[-0.01em]"
            >
              Everywhere you are
            </h2>
            <p className="mt-2 leading-relaxed text-n-ink-muted">
              Synced as you type, and fine offline.
            </p>
            <ul className="mt-8 grid sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-3">
              {platforms.map((platform) => (
                <li
                  key={platform.title}
                  className="border-t border-n-hairline py-5"
                >
                  <h3 className="font-n-display text-[1.125rem] leading-6 font-semibold">
                    {platform.title}
                  </h3>
                  <p className="mt-1 leading-relaxed text-n-ink-muted">
                    {platform.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="landing-features"
            className="border-t border-n-hairline py-14 sm:py-20"
          >
            <h2
              id="landing-features"
              className="font-n-display text-[1.375rem] leading-7 font-semibold tracking-[-0.01em]"
            >
              Small on purpose
            </h2>
            <ul className="mt-8 grid sm:grid-cols-2 sm:gap-x-10">
              {features.map((feature) => (
                <li
                  key={feature.title}
                  className="border-t border-n-hairline py-5"
                >
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="mt-1 leading-relaxed text-n-ink-muted">
                    {feature.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-n-hairline py-8 text-[0.8125rem] text-n-ink-muted">
          <span className="font-n-display font-bold text-n-ink">Nylon</span>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to="/privacy" className={linkClass}>
              Privacy
            </Link>
            <Link to="/terms" className={linkClass}>
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
