import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "FINALTab - Account",
};

export default function AuthPage() {
  return (
    <div className="min-h-screen">
      <AuthPanel />
    </div>
  );
}
