import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "Create account — FINALTab",
};

export default function CreateAccountPage() {
  return <AuthPanel initialMode="create-account" />;
}
