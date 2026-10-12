import type { SVGProps } from "react";

export type IconName = "layers" | "search" | "building" | "close" | "menu" | "mic" | "send" | "spark" | "location" | "chevron" | "info" | "cursor" | "chart" | "pencil" | "compare" | "folder";

const paths: Record<IconName, React.ReactNode> = {
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  building: <><path d="M4 22V4l10-2v20M14 8h6v14M8 7h2M8 11h2M8 15h2M8 19h2M17 12h1M17 16h1M2 22h20"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>, menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
  send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/>,
  spark: <><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  cursor: <path d="M5 3l13 9-6 1-3 6L5 3Z"/>, chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  pencil: <><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z"/><path d="m14 7 3 3"/></>, compare: <><path d="M8 3 4 7l4 4M4 7h15M16 21l4-4-4-4M20 17H5"/></>,
  folder: <path d="M3 6h7l2 2h9v11H3V6Z"/>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
