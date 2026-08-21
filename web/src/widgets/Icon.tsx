/**
 * The icon set, as inline SVG.
 *
 * client-design.md fixes the style: Feather/Lucide-compatible, `fill="none"`,
 * `stroke="currentColor"`, stroke width 1.5–2, round caps. `currentColor` is
 * the load-bearing part — an icon takes the colour of the text it sits in, so
 * a nav row going active recolours its icon with no extra rule.
 *
 * Inline rather than an icon font or a sprite sheet: this is a local-first app
 * and these are a few hundred bytes each, so a request per icon or a whole
 * font file for eleven glyphs both cost more than they save.
 *
 * Every icon is `aria-hidden`. An icon is decoration; the accessible name
 * belongs to the control around it. A button with nothing but an icon in it
 * therefore needs its own `aria-label`, and `eslint-plugin-jsx-a11y` will fail
 * the build if it does not have one.
 */

const paths = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  shelves: (
    <>
      <path d="M4 4v16" />
      <path d="M8 8v12" />
      <path d="M12 6v14" />
      <path d="m16 6 4 14" />
    </>
  ),
  'message-square': <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  'rotate-cw': (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
} as const

export type IconName = keyof typeof paths

interface IconProps {
  name: IconName
  /** Pixel size for both dimensions. The design uses 12–18px. */
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
