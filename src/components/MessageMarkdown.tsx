import { Fragment, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

const INLINE_TOKEN = /(`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|<https?:\/\/[^>\s]+>)/g;
const LIST_ITEM = /^(\s*)([-+*]|\d+\.)\s+(.+)$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const FENCE = /^```([^\s`]*)\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function plainWithBreaks(value: string, key: string): ReactNode[] {
  return value.split("\n").flatMap((part, index) => (
    index === 0 ? [part] : [<br key={`${key}-br-${index}`} />, part]
  ));
}

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const matcher = new RegExp(INLINE_TOKEN.source, INLINE_TOKEN.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value))) {
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (match.index > cursor) nodes.push(...plainWithBreaks(value.slice(cursor, match.index), `${key}-text`));

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{inlineMarkdown(token.slice(2, -2), `${key}-strong`)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{inlineMarkdown(token.slice(2, -2), `${key}-del`)}</del>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{inlineMarkdown(token.slice(1, -1), `${key}-em`)}</em>);
    } else {
      const markdownLink = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = markdownLink?.[1] ?? token.slice(1, -1);
      const href = safeExternalUrl(markdownLink?.[2] ?? token.slice(1, -1));
      nodes.push(href ? (
        <a
          href={href}
          key={key}
          rel="noreferrer noopener"
          onClick={(event) => {
            event.preventDefault();
            void openUrl(href).catch(() => undefined);
          }}
        >
          {inlineMarkdown(label, `${key}-link`)}
        </a>
      ) : <span className="message-link-disabled" key={key}>{label}</span>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < value.length) nodes.push(...plainWithBreaks(value.slice(cursor), `${keyPrefix}-tail`));
  return nodes;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function beginsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return !line.trim() || FENCE.test(line) || HEADING.test(line) || /^>\s?/.test(line) || LIST_ITEM.test(line)
    || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? ""));
}

export function MessageMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1];
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{body.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const content = inlineMarkdown(heading[2], `heading-${index}`);
      blocks.push(level === 1 ? <h1 key={`h-${index}`}>{content}</h1>
        : level === 2 ? <h2 key={`h-${index}`}>{content}</h2>
          : level === 3 ? <h3 key={`h-${index}`}>{content}</h3>
            : level === 4 ? <h4 key={`h-${index}`}>{content}</h4>
              : level === 5 ? <h5 key={`h-${index}`}>{content}</h5>
                : <h6 key={`h-${index}`}>{content}</h6>);
      index += 1;
      continue;
    }

    if (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(splitTableRow(lines[index++]));
      blocks.push(
        <div className="message-table-wrap" key={`table-${index}`}>
          <table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{inlineMarkdown(quote.join("\n"), `quote-${index}`)}</blockquote>);
      continue;
    }

    const list = line.match(LIST_ITEM);
    if (list) {
      const ordered = /\d+\./.test(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(LIST_ITEM);
        if (!item || /\d+\./.test(item[2]) !== ordered) break;
        items.push(item[3]);
        index += 1;
      }
      const children = items.map((item, itemIndex) => {
        const task = item.match(/^\[([ xX])\]\s+(.+)$/);
        return <li key={itemIndex}>{task && <input type="checkbox" checked={task[1].toLowerCase() === "x"} readOnly tabIndex={-1} />}{inlineMarkdown(task?.[2] ?? item, `li-${index}-${itemIndex}`)}</li>;
      });
      blocks.push(ordered ? <ol key={`list-${index}`}>{children}</ol> : <ul key={`list-${index}`}>{children}</ul>);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !beginsBlock(lines, index)) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}>{inlineMarkdown(paragraph.join("\n"), `p-${index}`)}</p>);
  }

  return <Fragment>{blocks}</Fragment>;
}
