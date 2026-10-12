import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumen — Municipality Intelligence Dashboard",
  description:
    "Publiek-belang dashboard voor gemeenten: leegstand, ruimte en pijplijnsignalen met bron, confidence en methodologische grenzen.",
  keywords: [
    "Lumen",
    "gemeente dashboard",
    "leegstand",
    "ruimte",
    "bouwpijplijn",
    "woningconversie",
    "BAG",
    "PDOK",
    "TenderNed",
    "Netherlands housing",
  ],
  openGraph: {
    title: "Lumen",
    description:
      "Publieke woningmarktintelligentie voor verborgen capaciteit en delivery blockers.",
    url: "https://leegstandsradar.nl",
    siteName: "Lumen",
    locale: "nl_NL",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://service.pdok.nl" />
        <link rel="preconnect" href="https://demotiles.maplibre.org" />
      </head>
      <body>{children}</body>
    </html>
  );
}
