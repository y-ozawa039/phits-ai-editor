// Server-initiated requests only; client requests and notifications are separate.
export const requestPolicy = {
  "item/commandExecution/requestApproval": { status: "supported", requiredParams: ["threadId", "turnId", "itemId"], note: "Existing command checks and approval queue; network/outside writes remain restricted." },
  "item/fileChange/requestApproval": { status: "supported", requiredParams: ["threadId", "turnId", "itemId"], note: "Existing path, revision and consultation-mode checks." },
  "item/tool/requestUserInput": { status: "supported", requiredParams: ["threadId", "turnId", "itemId", "questions"], note: "Explicit answers; cancellation sends empty answers. No automatic timeout answer." },
  "tool/requestUserInput": { status: "supported", optionalAlias: true, requiredParams: ["threadId", "questions"], note: "Compatibility alias; may be absent from generated ServerRequest." },
  "mcpServer/elicitation/request": { status: "supported", requiredParams: ["threadId", "serverName"], note: "Partial format coverage: basic form only. See shapePolicy." },
  "item/permissions/requestApproval": { status: "restricted", requiredParams: ["threadId", "turnId", "itemId", "permissions"], note: "Protocol response supported; grants nothing, with turn scope and policy-denial log." },
  "item/tool/call": { status: "outOfScope", note: "Editor registers no dynamicTools; PHITS uses the MCP bridge instead." },
  "account/chatgptAuthTokens/refresh": { status: "outOfScope", note: "Editor does not supply externally managed ChatGPT tokens." },
  "attestation/generate": { status: "outOfScope", note: "Editor does not opt in to requestAttestation." },
  "applyPatchApproval": { status: "outOfScope", note: "Legacy protocol; editor uses v2 thread/turn APIs." },
  "execCommandApproval": { status: "outOfScope", note: "Legacy protocol; editor uses v2 thread/turn APIs." },
};

export const shapePolicy = [
  { method: "mcpServer/elicitation/request", shape: "form: empty confirmation or string/enum/boolean/number/integer fields", status: "supported" },
  { method: "mcpServer/elicitation/request", shape: "url", status: "restricted" },
  { method: "mcpServer/elicitation/request", shape: "openai/form", status: "outOfScope" },
  { method: "mcpServer/elicitation/request", shape: "arrays, nested objects, unknown schema constraints", status: "unsupported" },
  { method: "item/tool/requestUserInput", shape: "autoResolutionMs", status: "restricted" },
];

export function classifyServerRequests(schema) {
  if (!Array.isArray(schema?.oneOf) || !schema.oneOf.length) throw new Error("Unrecognized ServerRequest schema: expected non-empty oneOf");
  const rows = schema.oneOf.map((variant) => {
    const method = variant?.properties?.method;
    const values = method?.enum ?? (typeof method?.const === "string" ? [method.const] : []);
    if (values.length !== 1 || typeof values[0] !== "string") throw new Error("Unrecognized ServerRequest method schema");
    const policy = requestPolicy[values[0]];
    const reference = variant?.properties?.params?.$ref;
    const params = reference?.startsWith("#/definitions/") ? schema.definitions?.[reference.slice("#/definitions/".length)] : variant?.properties?.params;
    const missingParams = (policy?.requiredParams ?? []).filter((name) => !params?.properties?.[name]);
    return { method: values[0], status: policy?.status ?? "unsupported", classified: !!policy, note: policy?.note ?? "New request requires review", missingParams };
  });
  if (new Set(rows.map((row) => row.method)).size !== rows.length) throw new Error("Duplicate ServerRequest methods");
  const unclassifiedMethods = rows.filter((row) => !row.classified).map((row) => row.method);
  const missingMethods = Object.entries(requestPolicy).filter(([method, policy]) => !policy.optionalAlias && ["supported", "restricted"].includes(policy.status) && !rows.some((row) => row.method === method)).map(([method]) => method);
  return { compatible: !unclassifiedMethods.length && !missingMethods.length && rows.every((row) => !row.missingParams.length), requests: rows, unclassifiedMethods, missingMethods, shapes: shapePolicy };
}
