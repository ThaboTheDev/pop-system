import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payments and Proof of Payment | MSRI",
  description: "Participant payment and proof of payment administration",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
