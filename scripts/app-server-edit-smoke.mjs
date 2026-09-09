import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";

const [executable, workspaceBase] = process.argv.slice(2);
if (!executable || !workspaceBase) {
  throw new Error("Usage: node scripts/app-server-edit-smoke.mjs <codex.exe> <workspace-base>");
}

const instructions = `You are the editing agent embedded in PHITS AI Editor.

Work only inside the current PHITS workspace. Never run PHITS, ANGEL, DCHAIN, or PHIG-3D, and never use network access.

The application appends a PHITS_EDITOR_CONTEXT_V1 item to every user turn. Treat that item as application-supplied editor state. Its activeDocumentPath is the currently open file, activeInputPath is the PHITS execution target, cursor and selection are one-based editor positions, and dirtyBuffer contains the unsaved buffer only when supplied. Resolve phrases such as "the current file", "the open file", and "here" from this context.

When the user asks to edit, create, rename, move, or delete a file and the turn is writable, perform the requested change now with Codex's built-in file-editing capability so the App Server emits a fileChange item and the PHITS AI Editor can present its review and approval UI. Do not merely print a unified diff, patch, replacement text, or instructions in chat unless the user explicitly asks only for a proposal or explanation. Never claim a file was changed unless the built-in editing action completed.

When the turn is read-only, discuss the requested change without attempting to modify files. Request approval through the App Server whenever its policy requires it.`;

const workspace = resolve(workspaceBase, `.app-server-edit-smoke-${process.pid}`);
const inputName = "context-edit.inp";
const original = "[ Title ]\r\nSmoke input\r\n";
await mkdir(workspace, { recursive: true });
await writeFile(join(workspace, inputName), original, "utf8");

const child = spawn(executable, ["app-server"], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let nextId = 1;
let threadId;
let approvalObserved = false;
let safeReadApprovals = 0;
let completed = false;
let finalAgentText = "";

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolveRequest, reject) => {
    pending.set(id, { resolve: resolveRequest, reject });
    send({ id, method, params });
  });
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let finishTurn;
const turnFinished = new Promise((resolveTurn) => { finishTurn = resolveTurn; });

createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }

  if (message.id !== undefined && !message.method) {
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    else callback.resolve(message.result);
    return;
  }

  if (message.method === "item/fileChange/requestApproval") {
    approvalObserved = true;
    send({ id: message.id, result: { decision: "decline" } });
    return;
  }

  if (message.method === "item/commandExecution/requestApproval") {
    const actions = message.params?.commandActions ?? [];
    const safeRead = actions.length > 0
      && actions.every((action) => ["read", "listFiles", "search"].includes(action.type));
    if (safeRead) safeReadApprovals += 1;
    send({ id: message.id, result: { decision: safeRead ? "accept" : "decline" } });
    return;
  }

  if (message.method === "item/completed" && message.params?.item?.type === "agentMessage") {
    finalAgentText += message.params.item.text ?? "";
  }

  if (message.method === "turn/completed" && message.params?.threadId === threadId) {
    completed = true;
    finishTurn();
  }
});

try {
  await request("initialize", {
    clientInfo: { name: "phits_ai_editor_edit_smoke", title: "PHITS AI Editor edit smoke", version: "0.0.1-alpha" },
  });
  send({ method: "initialized", params: {} });
  const started = await request("thread/start", {
    cwd: workspace,
    approvalPolicy: "untrusted",
    sandbox: "workspace-write",
    developerInstructions: instructions,
  });
  threadId = started?.thread?.id;
  if (!threadId) throw new Error("thread/start returned no thread id");

  const context = {
    version: 1,
    activeDocumentPath: inputName,
    activeInputPath: inputName,
    cursor: { line: 1, column: 1 },
    selection: null,
    dirty: false,
    dirtyBuffer: null,
    openDocumentPaths: [inputName],
    diagnostics: [],
    phitsVersion: "3.370",
    attachedOutputPath: null,
    attachedOutputContent: null,
    contentWarning: null,
    documentRevisions: [],
  };
  await request("turn/start", {
    threadId,
    input: [
      { type: "text", text: "今開いているファイルの1行目の先頭に TEST を書き加えてください。" },
      { type: "text", text: `PHITS_EDITOR_CONTEXT_V1\n${JSON.stringify(context)}` },
    ],
    cwd: workspace,
    approvalPolicy: "untrusted",
    sandboxPolicy: { type: "workspaceWrite", writableRoots: [workspace], networkAccess: false },
  });

  await withTimeout(turnFinished, 120_000, "Timed out waiting for turn/completed");
  if (!completed) throw new Error("turn did not complete");
  if (!approvalObserved) {
    throw new Error(`No item/fileChange/requestApproval was observed. Agent reply: ${finalAgentText}`);
  }
  if (await readFile(join(workspace, inputName), "utf8") !== original) {
    throw new Error("Declined file change unexpectedly modified the input");
  }
  console.log(JSON.stringify({
    fileChangeApproval: "observed",
    declinedChangePreservedFile: true,
    safeReadApprovals,
  }));
} finally {
  if (threadId) {
    try {
      await withTimeout(request("thread/delete", { threadId }), 5_000, "Timed out deleting smoke-test thread");
    } catch { /* best effort */ }
  }
  child.stdin.end();
  try {
    await withTimeout(new Promise((resolveExit) => child.once("exit", resolveExit)), 5_000, "Timed out stopping app server");
  } catch {
    child.kill();
  }
  await rm(workspace, { recursive: true, force: true });
}
