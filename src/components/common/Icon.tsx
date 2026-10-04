import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "characters"
  | "backgrounds"
  | "expressions"
  | "effects"
  | "audio"
  | "play"
  | "pause"
  | "save"
  | "plus"
  | "chevron"
  | "layers"
  | "spark"
  | "clock";

const paths: Record<IconName, ReactNode> = {
  characters: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.2 3.1-5 7-5s6.5 1.8 7 5" /></>,
  backgrounds: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
  expressions: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  effects: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 1.1 2.1L22 17l-1.9.9L19 20l-1-2.1L16 17l2-.9 1-2.1Z" /></>,
  audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  play: <path d="m8 5 12 7-12 7V5Z" />,
  pause: <><path d="M8 5h3v14H8zM16 5h3v14h-3z" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 1.1 2.1L22 17l-1.9.9L19 20l-1-2.1L16 17l2-.9 1-2.1Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
