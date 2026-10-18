import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { SideBar, TabBar } from "@/components/chrome";
import { SessionProvider } from "@/components/session";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800", "900"], style: ["normal", "italic"], variable: "--font-barlow", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "LA VAR, le média rap", template: "%s · LA VAR" },
  description: "Actualité du rap français et international, sorties, tendances et artistes émergents. Publiez, commentez, partagez.",
  applicationName: "LA VAR",
  appleWebApp: { capable: true, title: "LA VAR", statusBarStyle: "black-translucent" },
  openGraph: { type: "website", locale: "fr_FR", siteName: "LA VAR", images: [{ url: "/brand/icon-512.png" }] },
  // Préproduction : pas d'indexation tant que les règles et les mentions ne sont pas validées.
  robots: process.env.SITE_INDEXABLE === "true" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${barlow.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        <a href="#contenu" className="sr-only-focusable fixed left-3 top-3 z-[80] rounded bg-[var(--color-paper)] px-4 py-2 font-semibold text-black">
          Aller au contenu
        </a>
        <SessionProvider>
          <SideBar />
          <main id="contenu" className="pb-[calc(var(--nav-h)+var(--safe-b))] lg:pb-0 lg:pl-60">
            {children}
          </main>
          <TabBar />
        </SessionProvider>
      </body>
    </html>
  );
}
