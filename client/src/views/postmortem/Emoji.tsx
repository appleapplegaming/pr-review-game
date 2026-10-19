// A decorative emoji, hidden from screen readers so it never ends up in an accessible name.
// The trailing space is inside the hidden span, so the visible text stays "🚨 Heading".

export function Emoji({ children }: { children: string }) {
  return <span aria-hidden="true">{children} </span>;
}
