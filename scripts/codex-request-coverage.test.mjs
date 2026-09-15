import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyServerRequests, requestPolicy, shapePolicy } from "./codex-request-coverage.mjs";

const baseline = JSON.parse(await readFile(new URL("../schemas/codex/0.153.1/ServerRequest.json", import.meta.url), "utf8"));
test("every pinned server request is explicitly classified", () => {
  const report = classifyServerRequests(baseline);
  assert.equal(report.compatible, true);
  assert.equal(report.requests.length, 10);
  assert.deepEqual(report.unclassifiedMethods, []);
  assert.deepEqual(new Set(report.requests.map((row) => row.status)), new Set(["supported", "restricted", "outOfScope"]));
});
test("a new request fails coverage instead of silently passing", () => {
  const changed = structuredClone(baseline);
  changed.oneOf.push({ properties: { method: { enum: ["new/requestApproval"] } } });
  assert.deepEqual(classifyServerRequests(changed).unclassifiedMethods, ["new/requestApproval"]);
  assert.equal(classifyServerRequests(changed).compatible, false);
});
test("missing supported requests and parameter drift fail coverage", () => {
  const changed = structuredClone(baseline);
  changed.oneOf = changed.oneOf.filter((variant) => variant.properties.method.enum[0] !== "item/permissions/requestApproval");
  assert.equal(classifyServerRequests(changed).compatible, false);
  assert.deepEqual(classifyServerRequests(changed).missingMethods, ["item/permissions/requestApproval"]);
  const drift = structuredClone(baseline);
  delete drift.definitions.ToolRequestUserInputParams.properties.questions;
  assert.deepEqual(classifyServerRequests(drift).requests.find((row) => row.method === "item/tool/requestUserInput").missingParams, ["questions"]);
});
test("unknown schema layout and duplicate methods fail closed", () => {
  assert.throws(() => classifyServerRequests({}), /Unrecognized/);
  const duplicate = structuredClone(baseline);
  duplicate.oneOf.push(duplicate.oneOf[0]);
  assert.throws(() => classifyServerRequests(duplicate), /Duplicate/);
});
test("both language documents include all methods and format limitations", async () => {
  for (const language of ["", ".en"]) {
    const contents = await readFile(new URL(`../docs/codex-request-coverage${language}.md`, import.meta.url), "utf8");
    for (const method of Object.keys(requestPolicy)) assert.ok(contents.includes(`\`${method}\``), `${language}: ${method}`);
    for (const status of ["supported", "restricted", "outOfScope", "unsupported"]) assert.ok(shapePolicy.some((row) => row.status === status));
    for (const shape of ["openai/form", "autoResolutionMs", "url"]) assert.ok(contents.includes(`\`${shape}\``));
  }
});
test("release notes link to both versioned inventories and portable packaging includes them", async () => {
  const packaging = await readFile(new URL("./package-windows-release.ps1", import.meta.url), "utf8");
  for (const language of ["", ".en"]) {
    const notes = await readFile(new URL(`../docs/release-notes-v0.0.5-alpha${language}.md`, import.meta.url), "utf8");
    for (const inventoryLanguage of ["", ".en"]) assert.ok(notes.includes(`https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.5-alpha/docs/codex-request-coverage${inventoryLanguage}.md`));
    assert.ok(packaging.includes(`Source = "docs\\codex-request-coverage${language}.md"; Destination = "docs\\codex-request-coverage${language}.md"`));
  }
});
