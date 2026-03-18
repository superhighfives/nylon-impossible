import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { Button } from "./ui";

export function LandingPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-xs space-y-8 text-center">
        <p className="text-sm text-gray-muted">
          A todo app to keep you organized.
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <SignInButton mode="modal">
            <Button variant="primary" className="w-full">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="ghost" className="w-full">
              Sign Up
            </Button>
          </SignUpButton>
        </div>
      </div>
    </div>
  );
}
