import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FINALTab — receipt to verified testnet settlement",
  description:
    "FINALTab turns shared receipts into exact splits and KeeperHub-executed USDC settlements on Base Sepolia, with explicit proof and product gaps.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FINALTab",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-txt antialiased">{children}</body>
    </html>
  );
}
