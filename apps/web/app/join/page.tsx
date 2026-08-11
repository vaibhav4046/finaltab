import type { Metadata } from "next";
import { JoinInvitePanel } from "@/components/JoinInvitePanel";

export const metadata: Metadata = {
  title: "FINALTab — join a shared tab",
  description: "Accept a private, expiring FINALTab collaboration invite.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function JoinPage() {
  return <JoinInvitePanel />;
}
