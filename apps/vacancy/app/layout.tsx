import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leegstandsradar — Noord-Holland vacaturekaart",
  description:
    "Kaart van leegstaande en onderbenutte gebouwen in Nederland met haalbaarheidsfilter voor woningconversie. Gratis en open — geen account vereist.",
  keywords: [
    "leegstand",
    "woningconversie",
    "BAG",
    "PDOK",
    "kantoorleegtand",
    "Netherlands housing",
  ],
  openGraph: {
    title: "Leegstandsradar",
    description: "Leegstaande gebouwen zichtbaar maken voor woningconversie",
    url: "https://leegstandsradar.nl",
    siteName: "Leegstandsradar",
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
