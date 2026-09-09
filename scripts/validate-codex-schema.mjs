import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const [schemaArgument, reportArgument] = process.argv.slice(2);
if (!schemaArgument) {
  throw new Error("Usage: node scripts/validate-codex-schema.mjs <schema-directory> [report-file]");
}

const requirements = {
  chat: [
    "InitializeParams.json",
    "InitializeResponse.json",
    "ModelListParams.json",
    "ModelListResponse.json",
    "TurnStartParams.json",
    "TurnStartResponse.json",
  ],
  threads: [
    "ThreadListParams.json",
    "ThreadListResponse.json",
    "ThreadStartParams.json",
    "ThreadStartResponse.json",
    "ThreadReadParams.json",
    "ThreadReadResponse.json",
    "ThreadResumeParams.json",
    "ThreadResumeResponse.json",
    "ThreadDeleteParams.json",
    "ThreadDeleteResponse.json",
    "ThreadSetNameParams.json",
    "ThreadSetNameResponse.json",
  ],
  fileEditing: [
    "FileChangeRequestApprovalParams.json",
    "FileChangeRequestApprovalResponse.json",
    "TurnDiffUpdatedNotification.json",
  ],
  approvals: [
    "FileChangeRequestApprovalParams.json",
    "FileChangeRequestApprovalResponse.json",
    "CommandExecutionRequestApprovalParams.json",
    "CommandExecutionRequestApprovalResponse.json",
  ],
};
const requiredDecisions = ["accept", "acceptForSession", "decline", "cancel"];

async function inventory(directory, files = new Map()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inventory(path, files);
    else if (entry.isFile() && entry.name.endsWith(".json") && !files.has(entry.name)) files.set(entry.name, path);
  }
  return files;
}

const schemaDirectory = resolve(schemaArgument);
const files = await inventory(schemaDirectory);
const features = Object.entries(requirements).map(([id, requiredFiles]) => {
  const missingFiles = requiredFiles.filter((name) => !files.has(name));
  return { id, available: missingFiles.length === 0, missingFiles, missingDecisions: [] };
});
const approvals = features.find((feature) => feature.id === "approvals");
if (approvals?.available) {
  for (const name of ["FileChangeRequestApprovalResponse.json", "CommandExecutionRequestApprovalResponse.json"]) {
    const text = await readFile(files.get(name), "utf8");
    for (const decision of requiredDecisions) {
      if (!text.includes(`"${decision}"`) && !approvals.missingDecisions.includes(decision)) approvals.missingDecisions.push(decision);
    }
  }
  approvals.available = approvals.missingDecisions.length === 0;
}

const report = {
  schemaDirectory,
  schemaBundle: basename(schemaDirectory),
  checkedAt: new Date().toISOString(),
  compatible: features.every((feature) => feature.available),
  features,
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (reportArgument) await writeFile(resolve(reportArgument), output, "utf8");
process.stdout.write(output);
if (!report.compatible) process.exitCode = 1;
