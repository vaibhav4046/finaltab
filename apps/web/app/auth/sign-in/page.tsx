import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "Sign in — FINALTab",
};

export default function SignInPage() {
  return <AuthPanel initialMode="sign-in" />;
}
