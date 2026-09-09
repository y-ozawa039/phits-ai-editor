import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const [executable, cwd] = process.argv.slice(2);
if (!executable || !cwd) throw new Error("Usage: node scripts/app-server-smoke.mjs <codex.exe> <workspace>");

const child = spawn(executable, ["app-server"], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let nextId = 1;

createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (typeof message.id !== "number" || message.method) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
  else callback.resolve(message.result);
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

const initialize = await request("initialize", { clientInfo: { name: "phits_ai_editor_smoke", title: "PHITS AI Editor smoke", version: "0.0.1-alpha" } });
child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
const models = await request("model/list", { limit: 5, includeHidden: false });
const started = await request("thread/start", { cwd, approvalPolicy: "untrusted", sandbox: "read-only" });
const threadId = started?.thread?.id;
if (!threadId) throw new Error("thread/start returned no thread id");
const smokeTitle = `PHITS AI Editor smoke ${Date.now()}`;
await request("thread/name/set", { threadId, name: smokeTitle });
const read = await request("thread/read", { threadId, includeTurns: false });
if (read?.thread?.name !== smokeTitle) throw new Error("thread/name/set was not reflected by thread/read");
await request("thread/delete", { threadId });
child.stdin.end();

const exitCode = await new Promise((resolve) => child.once("exit", resolve));
if (exitCode !== 0) throw new Error(`Codex App Server exited with ${exitCode}`);
console.log(JSON.stringify({ protocol: initialize?.protocolVersion ?? "initialized", models: models?.data?.length ?? 0, threadRenameDelete: "passed" }));
