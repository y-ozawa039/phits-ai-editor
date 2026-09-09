import type { SVGProps } from "react";

export type IconName =
  | "folder"
  | "file"
  | "save"
  | "undo"
  | "redo"
  | "play"
  | "rocket"
  | "stop"
  | "search"
  | "spark"
  | "chevron"
  | "close"
  | "refresh"
  | "terminal"
  | "panel";

const paths: Record<IconName, React.ReactNode> = {
  folder: <path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Zm0 3h18" />,
  file: <path d="M7 2.8h7l4 4V21H7a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2Zm7 0v5h4M8.5 12h6.8M8.5 16h6.8" />,
  save: <path d="M4 3h14l2 2v16H4V3Zm4 0v6h8V3M8 21v-7h8v7" />,
  undo: <path d="M9 7 4 12l5 5m-5-5h9a7 7 0 0 1 7 7" />,
  redo: <path d="m15 7 5 5-5 5m5-5h-9a7 7 0 0 0-7 7" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  rocket: <path d="M14.7 4.1c2.2-1.6 4.7-1.5 5.2-1.4.1.5.2 3-1.4 5.2l-5.1 6.8-4.2.1.7-4.1 5.5-6.6ZM9.6 14.4l-2.7 2.7M5.5 13.8 3 15l3 2.9m4.2.6 2.9 3 1.2-2.6" />,
  stop: <path d="M7 7h10v10H7z" />,
  search: <path d="m20 20-4.5-4.5m2-5A7 7 0 1 1 3.5 10.5a7 7 0 0 1 14 0Z" />,
  spark: <path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8L12 2Zm7 13 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  refresh: <path d="M20 7v5h-5M4 17v-5h5m10.1-.8A7.5 7.5 0 0 0 6.2 6.4L4 9m16 6-2.2 2.6a7.5 7.5 0 0 1-12.9-4.8" />,
  terminal: <path d="m4 6 5 5-5 5m7 1h8" />,
  panel: <path d="M3 4h18v16H3V4Zm12 0v16" />,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}
