import { describe, expect, it } from 'vitest';
import type { Bug, PullRequest } from '../../shared/types';
import { validatePool, validatePr, type ValidationIssue } from '../../content/validate';
import { pool } from '../../content/prs';

/** A diff with `count` rendered lines after the @@ header; lines in `addAt` are `+` lines. */
function diffOf(count: number, addAt: number[] = []): string {
  const body = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return addAt.includes(n) ? `+const v${n} = ${n};` : ` const v${n} = ${n};`;
  });
  return ['@@ src/a.ts @@', ...body].join('\n');
}

function validBug(overrides: Partial<Bug> = {}): Bug {
  return {
    type: 'money',
    severity: 'major',
    lines: [6],
    explanation: 'The total is computed twice, so the discount is applied twice.',
    incident: '💸 Double discount shipped. Customers paid half price. −$2M',
    ...overrides,
  };
}

function validPr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 'pay-009',
    title: 'Apply the discount once',
    author: 'dana.k',
    area: 'payments',
    description: 'Stops the discount from being applied twice.',
    language: 'ts',
    diff: diffOf(12, [6]),
    featureValue: 800_000,
    bug: validBug(),
    ...overrides,
  };
}

function rules(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.rule);
}

describe('validatePr', () => {
  it('accepts a well-formed buggy PR', () => {
    expect(validatePr(validPr())).toEqual([]);
  });

  it('accepts a well-formed clean PR with bug: null', () => {
    expect(validatePr(validPr({ bug: null }))).toEqual([]);
  });

  describe('id-format', () => {
    it('rejects an id that is not <area-prefix>-<nnn>', () => {
      expect(rules(validatePr(validPr({ id: 'pay-4' })))).toContain('id-format');
      expect(rules(validatePr(validPr({ id: 'PAY-004' })))).toContain('id-format');
    });

    it('rejects an id whose prefix does not match the area', () => {
      expect(rules(validatePr(validPr({ id: 'auth-009' })))).toContain('id-format');
    });
  });

  describe('diff-size', () => {
    it('accepts 10 and 40 rendered lines (the boundaries)', () => {
      expect(rules(validatePr(validPr({ diff: diffOf(10, [6]) })))).not.toContain('diff-size');
      expect(rules(validatePr(validPr({ diff: diffOf(40, [6]) })))).not.toContain('diff-size');
    });

    it('rejects 9 rendered lines', () => {
      expect(rules(validatePr(validPr({ diff: diffOf(9, [6]) })))).toContain('diff-size');
    });

    it('rejects 41 rendered lines', () => {
      expect(rules(validatePr(validPr({ diff: diffOf(41, [6]) })))).toContain('diff-size');
    });

    it('does not count @@ headers', () => {
      const diff = ['@@ a.ts @@', '@@ b.ts @@', ...diffOf(9, [6]).split('\n').slice(1)].join('\n');
      expect(rules(validatePr(validPr({ diff })))).toContain('diff-size');
    });
  });

  describe('diff-line-length', () => {
    it('accepts a diff line of exactly 70 characters', () => {
      const line = `+${'x'.repeat(69)}`;
      const diff = [...diffOf(12, [6]).split('\n'), line].join('\n');
      expect(rules(validatePr(validPr({ diff, bug: validBug({ lines: [6] }) })))).not.toContain(
        'diff-line-length',
      );
    });

    it('rejects a diff line of 71 characters', () => {
      const lines = diffOf(12, [6]).split('\n');
      lines[3] = ` ${'x'.repeat(70)}`;
      expect(rules(validatePr(validPr({ diff: lines.join('\n') })))).toContain('diff-line-length');
    });
  });

  describe('bug-lines', () => {
    it('rejects an empty bug.lines on a buggy PR', () => {
      expect(rules(validatePr(validPr({ bug: validBug({ lines: [] }) })))).toContain(
        'bug-lines-empty',
      );
    });

    it.each([
      ['past the last line', [13]],
      ['zero', [0]],
      ['negative', [-1]],
      ['fractional', [6.5]],
    ])('rejects bug.lines that are %s', (_label, lines) => {
      expect(rules(validatePr(validPr({ bug: validBug({ lines }) })))).toContain('bug-line-range');
    });

    it('rejects a bug line that points at a context line', () => {
      expect(rules(validatePr(validPr({ bug: validBug({ lines: [5] }) })))).toContain(
        'bug-line-not-added',
      );
    });

    it('rejects a bug line that points at a - line', () => {
      const diff = diffOf(12, [6]).replace(' const v3 = 3;', '-const v3 = 3;');
      expect(rules(validatePr(validPr({ diff, bug: validBug({ lines: [3] }) })))).toContain(
        'bug-line-not-added',
      );
    });

    it('accepts bug.lines that point at + lines in range', () => {
      const result = validatePr(
        validPr({ diff: diffOf(12, [6, 9]), bug: validBug({ lines: [6, 9] }) }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('feature-value', () => {
    it.each([[199_999], [2_000_001], [800_000.5], [0], [-200_000]])(
      'rejects featureValue %s',
      (featureValue) => {
        expect(rules(validatePr(validPr({ featureValue })))).toContain('feature-value');
      },
    );

    it('accepts $0.2M and $2M (the boundaries)', () => {
      expect(rules(validatePr(validPr({ featureValue: 200_000 })))).not.toContain('feature-value');
      expect(rules(validatePr(validPr({ featureValue: 2_000_000 })))).not.toContain(
        'feature-value',
      );
    });
  });

  describe('bug type and severity', () => {
    it('rejects an unknown bug type', () => {
      const bug = validBug({ type: 'bogus' as unknown as Bug['type'] });
      expect(rules(validatePr(validPr({ bug })))).toContain('bug-type');
    });

    it('rejects an unknown severity', () => {
      const bug = validBug({ severity: 'huge' as unknown as Bug['severity'] });
      expect(rules(validatePr(validPr({ bug })))).toContain('severity');
    });
  });

  describe('incident text', () => {
    it('rejects an incident that starts with the wrong type emoji', () => {
      const bug = validBug({ incident: '🔥 Double discount shipped. −$2M' });
      expect(rules(validatePr(validPr({ bug })))).toContain('incident-format');
    });

    it('rejects an incident with no impact at the end', () => {
      const bug = validBug({ incident: '💸 Double discount shipped. Customers paid half price.' });
      expect(rules(validatePr(validPr({ bug })))).toContain('incident-format');
    });

    it('accepts downtime as the impact for an outage', () => {
      const bug = validBug({
        type: 'outage',
        incident: '🔥 Maintenance gate shipped. Whole API returns 503. 4h down',
      });
      expect(rules(validatePr(validPr({ bug })))).not.toContain('incident-format');
    });

    it('rejects HTML in the incident text', () => {
      const bug = validBug({ incident: '💸 <b>Double</b> discount shipped. −$2M' });
      expect(rules(validatePr(validPr({ bug })))).toContain('incident-format');
    });
  });

  describe('explanation', () => {
    it('rejects an empty explanation', () => {
      expect(rules(validatePr(validPr({ bug: validBug({ explanation: '  ' }) })))).toContain(
        'explanation',
      );
    });

    it('rejects an explanation spanning more than one paragraph', () => {
      const bug = validBug({ explanation: 'First paragraph.\n\nSecond paragraph.' });
      expect(rules(validatePr(validPr({ bug })))).toContain('explanation');
    });
  });

  it('rejects a language other than ts', () => {
    expect(rules(validatePr(validPr({ language: 'js' as unknown as 'ts' })))).toContain('language');
  });
});

describe('validatePool', () => {
  it('reports a duplicate id once, on the later PR that repeats it', () => {
    const issues = validatePool([validPr(), validPr({ title: 'Another PR' })]);
    const dupes = issues.filter((i) => i.rule === 'duplicate-id');
    expect(dupes.map((i) => i.prId)).toEqual(['pay-009']);
  });

  it('accepts a pool of distinct valid PRs', () => {
    expect(validatePool([validPr(), validPr({ id: 'pay-010' })])).toEqual([]);
  });

  it('reports per-PR issues with the PR id attached', () => {
    const issues = validatePool([validPr({ featureValue: 1 })]);
    expect(issues).toEqual([expect.objectContaining({ prId: 'pay-009', rule: 'feature-value' })]);
  });
});

describe('seed pool (content/prs)', () => {
  it('passes validation as a whole', () => {
    expect(validatePool(pool)).toEqual([]);
  });

  it('contains the four Task 3 seeds with their matrix ids', () => {
    expect(pool.map((p) => p.id).sort()).toEqual(['auth-001', 'infra-001', 'pay-004', 'ui-001']);
  });

  it('has one clean PR and one PR of each bug type, so the engine has real content', () => {
    const types = pool.map((p) => p.bug?.type ?? 'clean').sort();
    expect(types).toEqual(['clean', 'money', 'outage', 'security']);
  });
});
