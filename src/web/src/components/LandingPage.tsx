import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { Button } from "@cloudflare/kumo";

export function LandingPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-72 space-y-8">
        <div className="text-center">
          <p className="text-kumo-strong mt-2">
            A <span className="font-bold underline underline-offset-4 decoration-wavy decoration-kumo-brand">todo app</span> to keep you organized.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <Button className="w-full" variant="primary" size="lg">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button className="w-full" variant="outline" size="lg">
              Sign Up
            </Button>
          </SignUpButton>
        </div>
      </div>
    </div>
  );
}
