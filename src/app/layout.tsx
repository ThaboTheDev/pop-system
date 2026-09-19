import type { Metadata } from "next";
import "./globals.css";
import { NavigationProgress } from "@/components/NavigationProgress";

export const metadata: Metadata = {
  title: "Payments and Proof of Payment | MSRI",
  description: "Participant payment and proof of payment administration",
  robots: { index: false, follow: false },
};

// Tints the mobile browser chrome with the brand navy.
export const viewport = { themeColor: "#0b113b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
