const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  import: 'M12 15V3m-5 5 5-5 5 5M4 15v5h16v-5',
  down: 'm6 9 6 6 6-6',
  chart: 'M5 4v14m-2-9h4v5H3zm9-13v17m-2-12h4v8h-4zm9-9v15m-2-9h4v5h-4z',
  sliders: 'M3 7h6m4 0h8M3 17h11m4 0h3M9 4v6m5 4v6',
  pin: 'M5 4h14v17l-7-4-7 4z',
  database:
    'M4 6a8 3 0 1 0 16 0 8 3 0 1 0-16 0m0 0v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0',
  left: 'm14 5-7 7 7 7',
  right: 'm10 5 7 7-7 7',
  reset: 'M3 5v5h5M4 9a8 8 0 1 1 0 7',
  file: 'M5 3h9l5 6v12H5zM14 3v6h5',
  check: 'm4 12 5 5L20 6',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14m5 12 6 6',
  expand: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
}
export type IconName = keyof typeof paths
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
