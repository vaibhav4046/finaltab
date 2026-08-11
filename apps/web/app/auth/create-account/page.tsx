import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "Create account - FINALTab",
};

export default function CreateAccountPage() {
  return (
    <div className="min-h-screen">
      <AuthPanel initialMode="create-account" />
    </div>
  );
}
