import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "Sign in - FINALTab",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen">
      <AuthPanel initialMode="sign-in" />
    </div>
  );
}
