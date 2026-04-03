import type { SVGProps } from "react"

export function NomiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 4h4" />
      <path d="M10 4v7" />
      <path d="M14 4v7" />
      <path d="M10 11h4" />
      <path d="M10 11l-2 5h8l-2-5" />
      <path d="M12 16v4" />
      <path d="M5 12h2" />
      <path d="M17 12h2" />
    </svg>
  )
}
