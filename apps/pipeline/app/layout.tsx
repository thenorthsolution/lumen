import type { Metadata } from "next";
import type React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bouwcapaciteitcheck — Bouwpijplijn Nederland",
  description:
    "Gratis, open instrument dat regionale bouwactiviteit en capaciteitsknelpunten zichtbaar maakt. Aanbestedingsdata van TenderNed, vergunningdata van Omgevingsloket.",
  keywords: [
    "bouwcapaciteit",
    "woningbouw",
    "bouwpijplijn",
    "TenderNed",
    "bouwvergunningen",
  ],
  openGraph: {
    title: "Bouwcapaciteitcheck",
    description: "Bouwpijplijn en capaciteitsknelpunten zichtbaar maken",
    url: "https://lumen.thenorthsolution.com/pipeline",
    siteName: "Bouwcapaciteitcheck",
    locale: "nl_NL",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://www.tenderned.nl" />
        <link rel="preconnect" href="https://opendata.cbs.nl" />
      </head>
      <body>{children}</body>
    </html>
  );
}
