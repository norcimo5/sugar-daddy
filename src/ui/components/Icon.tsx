const PATHS = {
  today: 'M12 3l9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10l9-7z',
  history: 'M4 6h16M4 12h16M4 18h10',
  trends: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  dash: 'M6 12h12',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0',
  note: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  share:
    'M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  guide: 'M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3zM9 21h6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
