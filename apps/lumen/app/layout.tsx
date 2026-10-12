import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lumen | Ruimtelijke werkruimte",
    template: "%s | Lumen",
  },
  description: "Onderzoek locaties, gebouwen en ruimtelijke gegevens in één werkruimte.",
  applicationName: "Lumen",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/brand/lumen_normal.png",
  },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: "Lumen",
    title: "Lumen | Ruimtelijke werkruimte",
    description: "Onderzoek locaties, gebouwen en ruimtelijke gegevens in één werkruimte.",
    images: [{ url: "/brand/lumen_normal.png", alt: "Lumen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumen | Ruimtelijke werkruimte",
    description: "Onderzoek locaties, gebouwen en ruimtelijke gegevens in één werkruimte.",
    images: ["/brand/lumen_normal.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className="dark">
      <body>{children}</body>
    </html>
  );
}
