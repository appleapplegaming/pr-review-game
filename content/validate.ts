// Content validation for the PR pool. Every per-PR rule from SPEC → Testing Strategy and
// the authoring guide (content/README.md) is checked here. Rules that need a human
// (realism, "findable in about 60 s", "looks suspicious but is correct") are not.

import {
  AREAS,
  BUG_TYPES,
  LANGUAGES,
  SEVERITIES,
  type Area,
  type PullRequest,
} from '../shared/types';
import { parseDiff } from '../shared/diff';
import { config } from '../shared/config';

export type ValidationRule =
  | 'duplicate-id'
  | 'id-format'
  | 'language'
  | 'diff-size'
  | 'diff-line-length'
  | 'bug-lines-empty'
  | 'bug-line-range'
  | 'bug-line-not-added'
  | 'feature-value'
  | 'bug-type'
  | 'severity'
  | 'explanation'
  | 'incident-format';

export interface ValidationIssue {
  prId: string;
  rule: ValidationRule;
  message: string;
}

const AREA_PREFIX: Record<Area, string> = {
  payments: 'pay',
  auth: 'auth',
  infra: 'infra',
  ui: 'ui',
  data: 'data',
  api: 'api',
};

const TYPE_EMOJI: Record<(typeof BUG_TYPES)[number], string> = {
  money: '💸',
  security: '🔓',
  outage: '🔥',
};

// "−$2M", "−$0.5M", "−$150k", "4h down", "30 min down", "24 h down"
const IMPACT_AT_END = /(?:−\$\d+(?:\.\d+)?[kM]|\d+ ?(?:min|h) down)$/;

/** Returns every rule the PR breaks. An empty array means the PR is valid. */
export function validatePr(pr: PullRequest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = (rule: ValidationRule, message: string) =>
    issues.push({ prId: pr.id, rule, message });

  if (!isValidId(pr)) {
    report(
      'id-format',
      `id "${pr.id}" must be <area-prefix>-<nnn> with the prefix for "${pr.area}"`,
    );
  }
  if (!(LANGUAGES as readonly string[]).includes(pr.language)) {
    report(
      'language',
      `language must be one of ${LANGUAGES.join(', ')}, got "${String(pr.language)}"`,
    );
  }

  const lines = parseDiff(pr.diff);
  if (lines.length < config.diffLines.min || lines.length > config.diffLines.max) {
    report(
      'diff-size',
      `diff has ${lines.length} rendered lines, must be ${config.diffLines.min}-${config.diffLines.max}`,
    );
  }
  for (const raw of pr.diff.split('\n')) {
    if (!raw.startsWith('@@') && raw.length > config.contentLineMax) {
      report('diff-line-length', `diff line is ${raw.length} characters: "${raw.slice(0, 40)}..."`);
      break;
    }
  }

  const { featureValue } = pr;
  if (
    !Number.isInteger(featureValue) ||
    featureValue < config.featureValue.min ||
    featureValue > config.featureValue.max
  ) {
    report(
      'feature-value',
      `featureValue must be an integer from ${config.featureValue.min} to ${config.featureValue.max}, got ${featureValue}`,
    );
  }

  if (pr.bug === null) return issues;

  const { bug } = pr;
  if (!(BUG_TYPES as readonly string[]).includes(bug.type)) {
    report('bug-type', `bug.type "${String(bug.type)}" is not one of ${BUG_TYPES.join(', ')}`);
  }
  if (!(SEVERITIES as readonly string[]).includes(bug.severity)) {
    report(
      'severity',
      `bug.severity "${String(bug.severity)}" is not one of ${SEVERITIES.join(', ')}`,
    );
  }

  if (bug.lines.length === 0) {
    report('bug-lines-empty', 'bug.lines must name at least one line');
  }
  for (const n of bug.lines) {
    if (!Number.isInteger(n) || n < 1 || n > lines.length) {
      report('bug-line-range', `bug line ${n} is outside 1-${lines.length}`);
      continue;
    }
    if (lines[n - 1]?.kind !== 'add') {
      report('bug-line-not-added', `bug line ${n} is not a + line`);
    }
  }

  if (bug.explanation.trim() === '' || /\n\s*\n/.test(bug.explanation.trim())) {
    report('explanation', 'explanation must be one non-empty paragraph');
  }
  if (!isValidIncident(bug.type, bug.incident)) {
    report(
      'incident-format',
      'incident must start with the type emoji, end with an impact (−$2M or 4h down) and contain no HTML',
    );
  }

  return issues;
}

/** Pool-level checks (duplicate ids) plus every PR's own issues. */
export function validatePool(prs: readonly PullRequest[]): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const pr of prs) {
    if (seen.has(pr.id)) {
      issues.push({
        prId: pr.id,
        rule: 'duplicate-id',
        message: `id "${pr.id}" is used more than once`,
      });
    }
    seen.add(pr.id);
    issues.push(...validatePr(pr));
  }
  return issues;
}

function isValidId(pr: PullRequest): boolean {
  const match = /^([a-z]+)-\d{3}$/.exec(pr.id);
  if (!match) return false;
  const prefix = match[1];
  return (AREAS as readonly string[]).includes(pr.area) && prefix === AREA_PREFIX[pr.area];
}

function isValidIncident(type: string, incident: string): boolean {
  const emoji = TYPE_EMOJI[type as keyof typeof TYPE_EMOJI];
  const text = incident.trim();
  return (
    emoji !== undefined && text.startsWith(emoji) && IMPACT_AT_END.test(text) && !/[<>]/.test(text)
  );
}
