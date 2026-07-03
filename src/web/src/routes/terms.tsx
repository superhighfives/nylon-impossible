import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: "Terms of Service — Nylon Impossible" }] }),
});

const CONTACT_EMAIL = "hi@charliegleason.com";

function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 2, 2026">
      <p>
        These terms cover your use of Nylon Impossible ("the app"). By using the
        app, you agree to them. They're meant to be reasonable and easy to read.
      </p>

      <LegalSection heading="The service">
        <p>
          Nylon Impossible is a todo app for web and iOS with optional AI
          features. It's offered as-is and may change over time as features are
          added, improved, or removed.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You're responsible for your account and for keeping your sign-in
          secure. Please provide accurate information when you sign up, and let
          us know if you notice any unauthorized use.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Please don't use the app to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>break the law or infringe someone else's rights;</li>
          <li>
            attempt to disrupt, overload, or gain unauthorized access to the app
            or its infrastructure;
          </li>
          <li>
            store or share content that is harmful, abusive, or otherwise
            malicious.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          The todos and other content you create are yours. You keep ownership
          of them. You grant only the permission needed for the app to store,
          process, and display that content back to you so the app can work.
        </p>
      </LegalSection>

      <LegalSection heading="AI features">
        <p>
          Some features use AI to parse input and research tasks. AI output can
          be inaccurate or incomplete, so please use your own judgement and
          don't rely on it for anything important without checking.
        </p>
      </LegalSection>

      <LegalSection heading="Availability and warranty">
        <p>
          The app is provided "as is" and "as available," without warranties of
          any kind. There may be downtime, bugs, or changes, and the app may not
          always be error-free or uninterrupted.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the extent allowed by law, the app and its creator aren't liable
          for any indirect, incidental, or consequential damages arising from
          your use of the app. Please keep your own backups of anything
          important.
        </p>
      </LegalSection>

      <LegalSection heading="Ending your use">
        <p>
          You can stop using the app and delete your account at any time from
          the settings menu. Access may be suspended or ended if these terms are
          seriously or repeatedly broken.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          These terms may be updated from time to time. When they change, the
          "last updated" date at the top will change too. Continuing to use the
          app means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email{" "}
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
