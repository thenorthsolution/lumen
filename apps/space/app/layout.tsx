import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruimtevinden — Bouwlocaties in Nederland",
  description:
    "Vind onderbenutte en bouwbare gronden voor woningbouw in elke Nederlandse gemeente. Gratis en open — geen account vereist.",
  keywords: [
    "bouwlocaties",
    "woningbouw",
    "bestemmingsplan",
    "PDOK",
    "ruimtelijke ordening",
  ],
  openGraph: {
    title: "Ruimtevinden",
    description: "Bouwlocaties zichtbaar maken voor woningontwikkeling",
    url: "https://ruimtevinden.nl",
    siteName: "Ruimtevinden",
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
        <link rel="preconnect" href="https://afnemers.ruimtelijkeplannen.nl" />
      </head>
      <body>{children}</body>
    </html>
  );
}
