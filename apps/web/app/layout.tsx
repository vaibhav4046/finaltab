import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FINALTab — receipt to verified testnet settlement",
  description:
    "FINALTab turns shared receipts into exact splits and KeeperHub-executed USDC settlements on Base Sepolia, with explicit proof and product gaps.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FINALTab",
  },
};

export const viewport: Viewport = {
  themeColor: "#050706",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts the tree into dynamic rendering. Next can then
  // extract the per-request CSP nonce installed by middleware and attach it to
  // framework/bootstrap scripts; without this, strict-dynamic blocks hydration.
  await headers();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-txt antialiased">{children}</body>
    </html>
  );
}
