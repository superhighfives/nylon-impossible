import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { Button } from "@radix-ui/themes";

export function LandingPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-xs space-y-8 text-center">
        <p className="text-sm text-gray-11">
          A todo app to keep you organized.
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <SignInButton mode="modal">
            <Button className="w-full">
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
