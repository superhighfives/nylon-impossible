import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";

export function LandingPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-xs space-y-8 text-center">
        <p className="text-sm text-surface">
          A todo app to keep you organized.
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <SignInButton mode="modal">
            <button
              type="button"
              className="w-full py-2 border border-surface text-surface font-medium hover:bg-surface hover:text-surface-inverse transition-colors"
            >
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="w-full py-2 text-muted hover:text-surface transition-colors"
            >
              Sign Up
            </button>
          </SignUpButton>
        </div>
      </div>
    </div>
  );
}
