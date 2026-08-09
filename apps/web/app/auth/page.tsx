import { AuthPanel } from "@/components/AuthPanel";

export const metadata = {
  title: "FINALTab — your identity",
};

export default function AuthPage() {
  return (
    <main className="min-h-screen">
      <AuthPanel />
    </main>
  );
}
