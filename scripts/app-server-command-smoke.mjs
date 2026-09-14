import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const argumentsList = process.argv.slice(2);
if (argumentsList[0] === "--") argumentsList.shift();
const [executable, workspaceArgument, rootsMode = "auto"] = argumentsList;
if (!executable || !workspaceArgument || !["auto", "implicit", "explicit"].includes(rootsMode)) {
  throw new Error(
    "Usage: node scripts/app-server-command-smoke.mjs <codex.exe> <workspace> [auto|implicit|explicit]",
  );
}

const workspace = resolve(workspaceArgument);
const probeDirectory = join(workspace, `.app-server-command-smoke-${process.pid}`);
const markerPath = join(probeDirectory, "workspace-write.txt");
const marker = `PHITS_AI_EDITOR_COMMAND_SMOKE:${randomUUID()}`;

const child = spawn(executable, ["app-server"], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let nextId = 1;

createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (typeof message.id !== "number" || message.method) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
  else callback.resolve(message.result);
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolveRequest, rejectRequest) => {
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

try {
  await mkdir(probeDirectory, { recursive: false });
  await request("initialize", {
    clientInfo: {
      name: "phits_ai_editor_command_smoke",
      title: "PHITS AI Editor command smoke",
      version: "0.0.5-alpha",
    },
  });
  child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
  const readiness = await request("windowsSandbox/readiness", {});
  const requirements = await request("configRequirements/read", {});
  const config = await request("config/read", { cwd: workspace, includeLayers: false });
  const implementation = config?.config?.windows?.sandbox ?? null;

  const escapedMarkerPath = markerPath.replaceAll("'", "''");
  const escapedMarker = marker.replaceAll("'", "''");
  const modes = rootsMode === "auto" ? ["explicit", "implicit"] : [rootsMode];
  const errors = [];
  let successfulMode;
  for (const mode of modes) {
    await rm(markerPath, { force: true });
    const sandboxPolicy = { type: "workspaceWrite", networkAccess: false };
    if (mode === "explicit") sandboxPolicy.writableRoots = [workspace];
    try {
      const result = await request("command/exec", {
        command: [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `[System.IO.File]::WriteAllText('${escapedMarkerPath}', '${escapedMarker}', [System.Text.UTF8Encoding]::new($false))`,
        ],
        cwd: workspace,
        sandboxPolicy,
        timeoutMs: 10_000,
      });
      if (result?.exitCode !== 0) {
        throw new Error(
          `exit ${result?.exitCode}: ${result?.stderr || result?.stdout || "no output"}`,
        );
      }
      const actual = await readFile(markerPath, "utf8");
      if (actual !== marker) throw new Error("workspace marker did not match");
      successfulMode = mode;
      break;
    } catch (error) {
      errors.push(`${mode}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!successfulMode) throw new Error(errors.join(" / "));
  console.log(
    JSON.stringify({ workspace, rootsMode, successfulMode, readiness, implementation, requirements, workspaceWrite: "passed" }),
  );
} finally {
  child.stdin.end();
  await new Promise((resolveExit) => {
    if (child.exitCode !== null) resolveExit();
    else child.once("exit", resolveExit);
  });
  await rm(probeDirectory, { recursive: true, force: true });
}
