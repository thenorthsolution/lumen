import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumen Pipeline — Bouwpijplijn Nederland",
  description:
    "Regionaal overzicht van bouwactiviteit, tenderpijplijn en capaciteitsknelpunten in de Nederlandse woningbouw. Gratis en open.",
  keywords: ["bouwcapaciteit", "woningbouw", "bouwpijplijn", "CBS bouwvolume"],
  openGraph: {
    title: "Lumen Pipeline",
    description: "Bouwpijplijn en capaciteitsknelpunten zichtbaar maken",
    url: "https://lumenpipeline.nl",
    siteName: "Lumen Pipeline",
    locale: "nl_NL",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://opendata.cbs.nl" />
      </head>
      <body>{children}</body>
    </html>
  );
}
