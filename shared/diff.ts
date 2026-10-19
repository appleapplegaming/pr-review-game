// Turns a PR diff string into rendered lines. Shared by the content validator,
// the engine (bug.lines, comment lines) and DiffView, so all three agree on numbering.

export type DiffLineKind = 'add' | 'remove' | 'context';

export interface DiffLine {
  /** 1-based index into the rendered lines. @@ headers are not counted. */
  index: number;
  kind: DiffLineKind;
  /** The line without its +, - or leading-space prefix. */
  text: string;
}

/**
 * Parses a diff string into rendered lines.
 * - `@@ ... @@` headers are skipped and not numbered.
 * - A leading `+` is an add, a leading `-` a remove, anything else is context.
 * - Blank lines at the very start and end (from template-literal newlines) are dropped.
 */
export function parseDiff(diff: string): DiffLine[] {
  const raw = diff.split('\n');
  let start = 0;
  let end = raw.length;
  while (start < end && raw[start]?.trim() === '') start++;
  while (end > start && raw[end - 1]?.trim() === '') end--;

  const lines: DiffLine[] = [];
  for (const line of raw.slice(start, end)) {
    if (line.startsWith('@@')) continue;
    const { kind, text } = classify(line);
    lines.push({ index: lines.length + 1, kind, text });
  }
  return lines;
}

function classify(line: string): { kind: DiffLineKind; text: string } {
  if (line.startsWith('+')) return { kind: 'add', text: line.slice(1) };
  if (line.startsWith('-')) return { kind: 'remove', text: line.slice(1) };
  if (line.startsWith(' ')) return { kind: 'context', text: line.slice(1) };
  return { kind: 'context', text: line };
}
