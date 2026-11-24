import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/frontend/components/site-header";
import { SiteFooter } from "@/frontend/components/site-footer";
import { ReminderBanner } from "@/frontend/components/reminder-banner";
import { CloudSync } from "@/frontend/components/cloud-sync";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Perkfolio — Credit card benefits, tracked", template: "%s · Perkfolio" },
  description:
    "Compare premium credit cards, track statement credits before they expire, and find airport lounges your cards unlock.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <ReminderBanner />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
        <SiteFooter />
        <CloudSync />
      </body>
    </html>
  );
}
