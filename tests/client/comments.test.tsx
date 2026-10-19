import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'preact-render-to-string';
import { config } from '../../shared/config';
import { parseDiff } from '../../shared/diff';
import type { Comment } from '../../shared/types';
import { DiffView } from '../../client/src/components/diff-view';
import {
  charsLeft,
  checkComment,
  cooldownSeconds,
  commentsOn,
  pingCooldownLeft,
  selectedLineFor,
  toggleLine,
} from '../../client/src/views/game/comment-rules';
import { CommentBox } from '../../client/src/views/game/CommentBox';
import { CommentThread } from '../../client/src/views/game/CommentThread';
import { LineComments } from '../../client/src/views/game/LineComments';
import { PingButton } from '../../client/src/views/game/PingButton';
import { PrComments } from '../../client/src/views/game/PrComments';

const HOSTILE = '<img src=x onerror="alert(1)">';

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    prId: 'pr-1',
    playerId: 'p-1',
    playerName: 'Sara',
    line: null,
    text: 'Looks fine',
    at: 1_000,
    ...overrides,
  };
}

describe('checkComment', () => {
  it('trims the text before checking it', () => {
    expect(checkComment('  hello  ')).toEqual({ ok: true, text: 'hello' });
  });

  it('rejects empty and whitespace-only text', () => {
    expect(checkComment('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkComment('   \n ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts exactly the maximum length and rejects one more character', () => {
    const max = config.comment.max;
    expect(checkComment('a'.repeat(max)).ok).toBe(true);
    expect(checkComment('a'.repeat(max + 1))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('counts characters, not UTF-16 units, so an emoji is one character', () => {
    const max = config.comment.max;
    expect(checkComment('😀'.repeat(max)).ok).toBe(true);
    expect(checkComment('😀'.repeat(max + 1))).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('charsLeft', () => {
  it('counts down from the maximum as text is typed', () => {
    expect(charsLeft('')).toBe(config.comment.max);
    expect(charsLeft('abc')).toBe(config.comment.max - 3);
  });

  it('goes negative when the text is over the limit', () => {
    expect(charsLeft('a'.repeat(config.comment.max + 2))).toBe(-2);
  });
});

describe('commentsOn', () => {
  const comments = [
    comment({ id: 'a', line: null }),
    comment({ id: 'b', line: 3 }),
    comment({ id: 'c', line: 3 }),
    comment({ id: 'd', line: 7 }),
  ];

  it('returns the comments on one diff line', () => {
    expect(commentsOn(comments, 3).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('returns the whole-PR comments for null', () => {
    expect(commentsOn(comments, null).map((c) => c.id)).toEqual(['a']);
  });
});

describe('pingCooldownLeft', () => {
  it('is zero before anyone has pinged from this tab', () => {
    expect(pingCooldownLeft(undefined, 5_000)).toBe(0);
  });

  it('counts down the configured cooldown after a ping', () => {
    expect(pingCooldownLeft(10_000, 10_000)).toBe(config.pingCooldownMs);
    expect(pingCooldownLeft(10_000, 15_000)).toBe(config.pingCooldownMs - 5_000);
  });

  it('never shows more than the full cooldown, even when the clock read is slightly stale', () => {
    // The render clock can lag the click by a tick, so the raw value would read past the cooldown.
    expect(pingCooldownLeft(10_000, 5_000)).toBe(config.pingCooldownMs);
  });

  it('is zero exactly when the cooldown ends, and never negative', () => {
    expect(pingCooldownLeft(10_000, 10_000 + config.pingCooldownMs)).toBe(0);
    expect(pingCooldownLeft(10_000, 99_000)).toBe(0);
  });
});

describe('cooldownSeconds', () => {
  it('rounds up so the button never says 0 s while still disabled', () => {
    expect(cooldownSeconds(20_000)).toBe(20);
    expect(cooldownSeconds(19_001)).toBe(20);
    expect(cooldownSeconds(1)).toBe(1);
  });
});

describe('line selection', () => {
  it('selects a line, and tapping the same line again clears it', () => {
    const first = toggleLine(null, 'pr-1', 4);
    expect(first).toEqual({ prId: 'pr-1', line: 4 });
    expect(toggleLine(first, 'pr-1', 4)).toBeNull();
  });

  it('moves the selection when a different line is tapped', () => {
    expect(toggleLine({ prId: 'pr-1', line: 4 }, 'pr-1', 9)).toEqual({ prId: 'pr-1', line: 9 });
  });

  it('reports no selected line for a different PR', () => {
    const sel = { prId: 'pr-1', line: 4 };
    expect(selectedLineFor(sel, 'pr-1')).toBe(4);
    expect(selectedLineFor(sel, 'pr-2')).toBeNull();
    expect(selectedLineFor(null, 'pr-1')).toBeNull();
  });
});

describe('CommentThread', () => {
  it('renders comment text as literal text, never as markup', () => {
    const html = renderToStaticMarkup(
      <CommentThread comments={[comment({ text: HOSTILE, playerName: 'Eve' })]} />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Eve');
  });
});

describe('CommentBox', () => {
  it('starts with the submit button disabled and the full count left', () => {
    const html = renderToStaticMarkup(
      <CommentBox label="Comment on line 3" onSubmit={() => true} />,
    );
    expect(html).toContain('aria-label="Comment on line 3"');
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain(`${config.comment.max} characters left`);
  });

  it('disables submit while not connected', () => {
    const html = renderToStaticMarkup(
      <CommentBox label="Comment" connected={false} onSubmit={() => true} />,
    );
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});

describe('PingButton', () => {
  it('is aria-disabled and shows the seconds left during the cooldown', () => {
    const html = renderToStaticMarkup(<PingButton cooldownLeftMs={12_400} onPing={() => true} />);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"/);
    expect(html).toContain('13 s');
  });

  it('is enabled when the cooldown is over', () => {
    const html = renderToStaticMarkup(<PingButton cooldownLeftMs={0} onPing={() => true} />);
    expect(html).not.toMatch(/<button[^>]*aria-disabled="true"/);
    expect(html).toContain('Second opinion?');
  });

  it('is disabled when the PR is resolved or the socket is down', () => {
    const resolved = renderToStaticMarkup(
      <PingButton cooldownLeftMs={0} disabled onPing={() => true} />,
    );
    expect(resolved).toMatch(/<button[^>]*aria-disabled="true"/);
  });
});

describe('LineComments', () => {
  it('renders nothing when the line has no comments and is not selected', () => {
    const html = renderToStaticMarkup(
      <LineComments line={2} comments={[]} selected={false} connected onSubmit={() => true} />,
    );
    expect(html).toBe('');
  });

  it('shows the thread for a line that has comments', () => {
    const html = renderToStaticMarkup(
      <LineComments
        line={2}
        comments={[comment({ line: 2, text: 'Off by one?' })]}
        selected={false}
        connected
        onSubmit={() => true}
      />,
    );
    expect(html).toContain('Off by one?');
    expect(html).not.toContain('<textarea');
  });

  it('shows the comment box under a selected line', () => {
    const html = renderToStaticMarkup(
      <LineComments line={2} comments={[]} selected connected onSubmit={() => true} />,
    );
    expect(html).toContain('<textarea');
  });
});

describe('PrComments', () => {
  it('shows the ping button and only the comments it is given', () => {
    const html = renderToStaticMarkup(
      <PrComments
        comments={[comment({ text: 'Whole PR note' })]}
        open
        connected
        now={50_000}
        lastPingAt={undefined}
        onPing={() => true}
        onSubmit={() => true}
      />,
    );
    expect(html).toContain('Second opinion?');
    expect(html).toContain('Whole PR note');
  });

  it('disables the ping button while its cooldown runs from the last ping', () => {
    const html = renderToStaticMarkup(
      <PrComments
        comments={[]}
        open
        connected
        now={15_000}
        lastPingAt={10_000}
        onPing={() => true}
        onSubmit={() => true}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-disabled="true"/);
  });
});

describe('DiffView with line threads', () => {
  it('places the thread as its own row under the line it belongs to', () => {
    const diff = `
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;
    const lines = parseDiff(diff);
    const html = renderToStaticMarkup(
      <DiffView
        diff={diff}
        onLineSelect={() => undefined}
        renderAfterLine={(line) => (
          <LineComments
            line={line.index}
            comments={commentsOn([comment({ line: 2, text: 'Why change this?' })], line.index)}
            selected={false}
            connected
            onSubmit={() => true}
          />
        )}
      />,
    );
    expect(lines.length).toBe(3);
    const afterRow = html.indexOf('Why change this?');
    expect(afterRow).toBeGreaterThan(html.indexOf('data-line="2"'));
    expect(afterRow).toBeLessThan(html.indexOf('data-line="3"'));
  });
});
