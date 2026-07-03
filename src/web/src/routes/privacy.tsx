import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy Policy — Nylon Impossible" }] }),
});

const CONTACT_EMAIL = "hi@charliegleason.com";

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 2, 2026">
      <p>
        This is the privacy policy for Nylon Impossible ("the app"). It explains
        what information the app collects, why, and what happens to it. The
        short version: the app only collects what it needs to work, doesn't sell
        your data, and lets you delete everything whenever you want.
      </p>

      <LegalSection heading="Information the app collects">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account details.</strong> When you sign up, authentication
            is handled by Clerk. This includes your email address and, if you
            sign in with a provider like Google, your basic profile information.
          </li>
          <li>
            <strong>Your todos.</strong> The tasks, notes, due dates, and lists
            you create in the app.
          </li>
          <li>
            <strong>Optional location.</strong> If you add a location in
            settings, it's used to make location-related research more relevant.
            You can remove it at any time.
          </li>
          <li>
            <strong>Imported data.</strong> If you choose to import from Google
            Tasks, the app reads your tasks so it can copy them in. It only
            requests read access, and only when you start an import.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="How the app uses your information">
        <p>
          Your information is used to run the app: to sign you in, store and
          sync your todos across your devices, and power optional AI features
          like parsing what you type and researching tasks. That's it. Your data
          isn't sold, and it isn't used for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Services the app relies on">
        <p>
          The app uses a few third-party services to function. Your data may
          pass through them for the purposes described above:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Clerk</strong> — accounts and sign-in.
          </li>
          <li>
            <strong>Cloudflare</strong> — hosting, database, and AI features.
          </li>
          <li>
            <strong>Google</strong> — only if you connect your account to import
            tasks.
          </li>
          <li>
            <strong>Sentry</strong> — error monitoring so bugs can be fixed.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Keeping and deleting your data">
        <p>
          Your data is kept for as long as your account exists. You can
          permanently delete your account and all of its data at any time from
          the settings menu. Once deleted, it can't be recovered.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The app isn't intended for children under 13, and doesn't knowingly
          collect information from them.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          This policy may be updated from time to time. When it changes, the
          "last updated" date at the top will change too.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy? Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-gray underline hover:no-underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
