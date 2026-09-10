import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

const userDocumentPairs = [
  ["README.md", "README.en.md"],
  ["ARCHITECTURE.md", "ARCHITECTURE.en.md"],
  ["AUTHORS.md", "AUTHORS.en.md"],
  ["CONTRIBUTING.md", "CONTRIBUTING.en.md"],
  ["SECURITY.md", "SECURITY.en.md"],
  ["TRADEMARKS.md", "TRADEMARKS.en.md"],
  ["docs/installation.md", "docs/installation.en.md"],
  ["docs/building.md", "docs/building.en.md"],
  ["docs/known-issues-v0.0.1-alpha.md", "docs/known-issues-v0.0.1-alpha.en.md"],
  ["docs/release-notes-v0.0.1-alpha.md", "docs/release-notes-v0.0.1-alpha.en.md"],
  ["docs/customizing-with-ai.md", "docs/customizing-with-ai.en.md"],
  ["docs/safety-boundaries.md", "docs/safety-boundaries.en.md"],
];

const problems = [];
const documents = new Map();
for (const [japanesePath, englishPath] of userDocumentPairs) {
  let japanese;
  let english;
  try {
    japanese = readFileSync(join(projectRoot, japanesePath), "utf8");
  } catch {
    problems.push(`missing Japanese document: ${japanesePath}`);
    continue;
  }
  try {
    english = readFileSync(join(projectRoot, englishPath), "utf8");
  } catch {
    problems.push(`missing English document: ${englishPath}`);
    continue;
  }
  documents.set(japanesePath, japanese);
  documents.set(englishPath, english);

  const englishLink = `[English](${basename(englishPath)})`;
  const japaneseLink = `[日本語](${basename(japanesePath)})`;
  if (!japanese.includes(englishLink)) {
    problems.push(`${japanesePath} does not link to ${englishPath}`);
  }
  if (!english.includes(japaneseLink)) {
    problems.push(`${englishPath} does not link to ${japanesePath}`);
  }
  if (!/[ぁ-んァ-ヶ一-龠]/u.test(japanese)) {
    problems.push(`${japanesePath} does not contain Japanese text`);
  }
  if (!/\b(?:the|and|for|with|is|are)\b/i.test(english)) {
    problems.push(`${englishPath} does not appear to contain English prose`);
  }
}

for (const [documentPath, contents] of documents) {
  for (const match of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolvedTarget = resolve(projectRoot, dirname(documentPath), target);
    if (!existsSync(resolvedTarget)) {
      problems.push(`${documentPath} has a broken relative link: ${target}`);
    }
  }
}

if (problems.length > 0) {
  throw new Error(`User documentation language check failed:\n- ${problems.join("\n- ")}`);
}

console.log(`Verified ${userDocumentPairs.length} Japanese/English user-document pairs.`);
