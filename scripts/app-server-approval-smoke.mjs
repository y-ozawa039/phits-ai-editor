// Real App Server + deterministic loopback model/MCP fixtures. No PHITS or account required.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";

const self = fileURLToPath(import.meta.url);
const fixtureFormSchema = {type:"object",properties:{label:{type:"string",minLength:2,maxLength:8},choice:{type:"string",enum:["one","two"]},
  enabled:{type:"boolean"},count:{type:"integer",minimum:1,maximum:5},ratio:{type:"number",minimum:0,maximum:1},optional:{type:"string"}},
  required:["label","choice","enabled","count","ratio"]};
const fixtureFormContent = {label:"検査",choice:"two",enabled:false,count:3,ratio:0.5};
if (process.argv[2] === "--fixture-mcp") {
  const populatedForm = process.argv[3] === "--populated-form";
  let pending;
  const output = (value) => process.stdout.write(`${JSON.stringify({jsonrpc:"2.0", ...value})}\n`);
  createInterface({input:process.stdin}).on("line", (line) => {
    const request = JSON.parse(line);
    if (request.id === "fixture-confirm") {
      const accepted = request.result?.action === "accept";
      const contentMatches = !populatedForm || isDeepStrictEqual(request.result?.content, fixtureFormContent);
      const text = accepted && contentMatches ? (populatedForm ? "FIXTURE_FORM_ACCEPTED" : "FIXTURE_RUN_ACCEPTED") : "FIXTURE_RUN_DECLINED";
      output({id:pending, result:{content:[{type:"text", text}], isError:!accepted || !contentMatches}});
      return;
    }
    if (request.id === undefined) return;
    switch (request.method) {
      case "initialize": output({id:request.id,result:{protocolVersion:request.params.protocolVersion, capabilities:{tools:{}, elicitation:{}},serverInfo:{name:"approval_fixture",version:"1"}}}); break;
      case "tools/list": output({id:request.id,result:{tools:[{name:"run_phits",description:"Approval test only. Never runs PHITS or any command.",
        inputSchema:{type:"object",properties:{inputRelativePath:{type:"string"}},required:["inputRelativePath"],additionalProperties:false},
        annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}}]}}); break;
      case "tools/call":
        pending = request.id;
        output({id:"fixture-confirm",method:"elicitation/create",params:{mode:"form",message:populatedForm ? "Fixture populated form (no calculation)" : "Fixture PHITS approval (no calculation)",
          requestedSchema:populatedForm ? fixtureFormSchema : {type:"object",properties:{}}}});
        break;
      case "ping": output({id:request.id,result:{}}); break;
      default: output({id:request.id,error:{code:-32601,message:"Fixture method not found"}});
    }
  });
} else {
  const [executable, reportArgument] = process.argv.slice(2);
  if (!executable) throw new Error("Usage: node scripts/app-server-approval-smoke.mjs <codex-executable> [report-file]");
  const temporary = await mkdtemp(join(tmpdir(), "phits-editor-approval-"));
  const workspace = join(temporary, "workspace");
  const codexHome = join(temporary, "codex-home");
  await mkdir(workspace); await mkdir(codexHome);
  const input = join(workspace, "approval-fixture.inp");
  await writeFile(input, "Approval fixture only; not a PHITS input.\n");
  const original = await readFile(input, "utf8");
  const report = {kind:"loopback-fixture-e2e", noRealPhits:true, noAccount:true, cases:[], passed:false};
  let modelTurn = 0;
  let modelError;
  const model = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (request.url !== "/v1/responses") throw new Error(`Unexpected model endpoint: ${request.url}`);
      const tools = body.tools ?? [];
      let tool = tools.find((tool) => tool.type === "function" && /phits_ai_editor.*run_phits/.test(tool.name));
      for (const group of tools.filter((v) => v.type === "namespace" && /phits_ai_editor/.test(v.name))) {
        const nested = group.tools?.find((v) => v.type === "function" && v.name === "run_phits");
        if (nested) tool = {...nested, namespace:group.name};
      }
      const functionOutput = (body.input ?? []).some((item) => item.type === "function_call_output");
      if (currentCase?.kind === "permissions" && functionOutput) currentCase.permissionResults = body.input.filter((item) => item.type === "function_call_output").map((item) => item.output);
      const call = !functionOutput;
      // Recent CLI versions defer MCP schema loading. The fixture calls only the registered exact tool.
      if (!tool) tool = {name:"run_phits",namespace:"mcp__phits_ai_editor"};
      let argumentsValue = currentCase?.kind === "command" ? {cmd:"Write-Output 'PHITS_APPROVAL_FIXTURE'",sandbox_permissions:"require_escalated",justification:"Approval fixture: output a fixed test marker only."} : {inputRelativePath:"approval-fixture.inp"};
      if (currentCase?.kind === "command") tool = {name:"exec_command"};
      if (currentCase?.kind === "permissions") {
        tool = {name:"request_permissions"};
        currentCase.permissionToolSchema = tools.find((v) => v.name === "request_permissions");
        const file_system = {write:[codexHome]};
        const permissions = currentCase.decision === "network" ? {network:{enabled:true}} : currentCase.decision === "filesystem" ? {file_system} : {network:{enabled:true},file_system};
        argumentsValue = {permissions,reason:"Fixture additional permission request; no network or filesystem command is executed."};
      }
      const id = `resp_fixture_${++modelTurn}`;
      const item = call ? {type:"function_call",id:`fc_${modelTurn}`,call_id:`call_${modelTurn}`,name:tool.name,...(tool.namespace ? {namespace:tool.namespace} : {}),arguments:JSON.stringify(argumentsValue),status:"completed"}
        : {type:"message",id:`msg_${modelTurn}`,role:"assistant",status:"completed",content:[{type:"output_text",text:"Approval fixture completed.",annotations:[]}]};
      response.writeHead(200, {"Content-Type":"text/event-stream", "Cache-Control":"no-cache"});
      const event = (type, value) => response.write(`event: ${type}\ndata: ${JSON.stringify({type,...value})}\n\n`);
      event("response.created", {response:{id,object:"response",status:"in_progress",output:[]}});
      event("response.output_item.added", {output_index:0,item:call ? {...item,arguments:"",status:"in_progress"} : {...item,content:[],status:"in_progress"}});
      if (call) event("response.function_call_arguments.delta", {item_id:item.id,output_index:0,delta:item.arguments});
      else {
        event("response.content_part.added",{item_id:item.id,output_index:0,content_index:0,part:{type:"output_text",text:"",annotations:[]}});
        event("response.output_text.delta",{item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
      }
      event("response.output_item.done", {output_index:0,item});
      event("response.completed", {response:{id,object:"response",status:"completed",output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
      response.end();
    } catch (error) { modelError = error; response.writeHead(500); response.end("Fixture model error"); }
  });
  await new Promise((ready) => model.listen(0, "127.0.0.1", ready));
  const baseUrl = `http://127.0.0.1:${model.address().port}/v1`;
  const cli = spawn(executable, ["-c", "features.plugins=false", "-c", "features.remote_plugin=false", "-c", "check_for_update_on_startup=false", "app-server"], {env:{...process.env,CODEX_HOME:codexHome},stdio:["pipe","pipe","pipe"],windowsHide:true});
  const pending = new Map(); let nextId = 1; let currentCase; let finishTurn; let rejectTurn;
  const send = (message) => cli.stdin.write(`${JSON.stringify(message)}\n`);
  const timeout = (promise, label) => {
    let timer;
    return Promise.race([promise,new Promise((_,reject) => {timer=setTimeout(() => reject(new Error(`Timeout: ${label}`)),30_000);})]).finally(() => clearTimeout(timer));
  };
  const request = (method, params) => {
    const id=nextId++;
    return timeout(new Promise((resolveRequest,reject) => {pending.set(id,{resolve:resolveRequest,reject});send({id,method,params});}),method);
  };
  let stderr = "";
  cli.stderr.on("data", (value) => {stderr = (stderr + value.toString()).slice(-8000);});
  createInterface({input:cli.stdout}).on("line", (line) => {
    let message; try {message=JSON.parse(line);} catch {return;}
    if (message.id !== undefined && !message.method) {
      const callback=pending.get(message.id); if (!callback) return; pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
    } else if (message.id !== undefined && message.method) {
      currentCase?.requests.push(message.method);
      currentCase?.interactionRequests.push({method:message.method,params:message.params});
      if (["item/tool/requestUserInput","tool/requestUserInput"].includes(message.method)) {
        // Answer only an exact known fixture approval option. Never accept arbitrary requests.
        const answers={};
        for (const question of message.params.questions) {
          const label=currentCase.decision === "accept" ? "Accept" : "Decline";
          const option=question.options?.find((v) => v.label === label);
          if (!option) {rejectTurn?.(new Error("Fixture approval options changed"));send({id:message.id,result:{answers:{}}});return;}
          answers[question.id]={answers:[option.label]};
        }
        send({id:message.id,result:{answers}});
      } else if (message.method === "mcpServer/elicitation/request" && message.params.serverName === "phits_ai_editor"
        && (message.params.message === "Fixture PHITS approval (no calculation)"
          || message.params.message === "Fixture populated form (no calculation)"
          || (message.params._meta?.codex_approval_kind === "mcp_tool_call"
            && message.params.message === 'Allow the phits_ai_editor MCP server to run tool "run_phits"?'))) {
        const populated = message.params.message === "Fixture populated form (no calculation)";
        if (populated && !isDeepStrictEqual(message.params.requestedSchema, fixtureFormSchema)) {
          rejectTurn?.(new Error("Fixture form schema changed")); send({id:message.id,result:{action:"cancel",content:null}}); return;
        }
        const entry = message.params._meta?.codex_approval_kind === "mcp_tool_call";
        const decision = currentCase.kind === "mcpForm" && entry ? "accept" : currentCase.decision;
        const content = decision === "accept" ? (populated ? fixtureFormContent : {}) : null;
        currentCase.responses ??= []; currentCase.responses.push({method:message.method,result:{action:decision,content}});
        send({id:message.id,result:{action:decision,content}});
      } else if (message.method === "item/permissions/requestApproval" && currentCase.kind === "permissions") {
        const result = {permissions:{},scope:"turn"};
        currentCase.responses ??= []; currentCase.responses.push({method:message.method,result});
        send({id:message.id,result});
      } else if (message.method === "item/commandExecution/requestApproval" && currentCase.kind === "command"
        && /Write-Output ['"]PHITS_APPROVAL_FIXTURE['"]/.test(message.params.command ?? "")) {
        send({id:message.id,result:{decision:currentCase.decision}});
      } else {
        send({id:message.id,error:{code:-32601,message:`Fixture unsupported request: ${message.method}`}});
        rejectTurn?.(new Error(`Unsupported request: ${message.method}`));
      }
    } else if (message.method === "serverRequest/resolved") currentCase?.resolved.push(message.params.requestId);
    else if (message.method === "item/completed" && ["mcpToolCall","commandExecution"].includes(message.params.item.type)) currentCase?.results.push(message.params.item);
    else if (message.method === "turn/completed") {
      if (message.params.turn.error) rejectTurn?.(new Error(message.params.turn.error.message)); else finishTurn?.();
    }
  });
  cli.on("error", (error) => {for (const entry of pending.values()) entry.reject(error);rejectTurn?.(error);});
  try {
    await request("initialize", {clientInfo:{name:"phits_editor_approval_fixture",version:"0.0.5-alpha"},capabilities:{experimentalApi:true}});
    send({method:"initialized",params:{}});
    for (const kind of ["mcp","command","mcpForm","permissions"]) for (const decision of kind === "permissions" ? ["network","filesystem","combined"] : ["accept","decline","cancel"]) {
      currentCase={kind,decision,requests:[],interactionRequests:[],resolved:[],results:[]}; report.cases.push(currentCase);
      const started=await request("thread/start",{cwd:workspace,model:"gpt-5.4",modelProvider:"approval_fixture",approvalPolicy:"on-request",sandbox:"workspace-write",
        developerInstructions:"This is a deterministic approval test. Use only the fixture MCP tool. Never use shell or PHITS.",
        config:{model_provider:"approval_fixture",model_providers:{approval_fixture:{name:"Loopback approval fixture",base_url:baseUrl,wire_api:"responses",requires_openai_auth:false}},
          mcp_servers:{phits_ai_editor:{command:process.execPath,args:[self,"--fixture-mcp",...(kind === "mcpForm" ? ["--populated-form"] : [])],enabled:true,required:true,tools:{run_phits:{approval_mode:"prompt"}}}},features:{apps:false,plugins:false,remote_plugin:false,request_permissions_tool:kind === "permissions"}}});
      const done=new Promise((resolveTurn,reject) => {finishTurn=resolveTurn;rejectTurn=reject;});
      // Attach timeout/error handler immediately, before a request can complete the turn.
      const completion=timeout(done,"approval turn"); completion.catch(() => {});
      await request("turn/start",{threadId:started.thread.id,cwd:workspace,input:[{type:"text",text:"Call the fixture run_phits tool once."}],approvalPolicy:"on-request",sandboxPolicy:{type:"workspaceWrite",networkAccess:false}});
      await completion;
      const expectedMethod = kind === "permissions" ? "item/permissions/requestApproval" : kind === "command" ? "item/commandExecution/requestApproval" : "mcpServer/elicitation/request";
      if (!currentCase.requests.includes(expectedMethod)) throw new Error(`No fixture approval observed: ${kind}/${decision}`);
      if (!currentCase.resolved.length) throw new Error(`No serverRequest/resolved observed: ${decision}`);
      const text=JSON.stringify(currentCase.results);
      if (kind === "mcp" && (decision === "accept" ? !text.includes("FIXTURE_RUN_ACCEPTED") : text.includes("FIXTURE_RUN_ACCEPTED") || !currentCase.results.length)) throw new Error(`Wrong fixture result: ${decision}`);
      if (kind === "mcpForm" && (decision === "accept" ? !text.includes("FIXTURE_FORM_ACCEPTED") : text.includes("FIXTURE_FORM_ACCEPTED") || !currentCase.results.length)) throw new Error(`Wrong form result: ${decision}`);
      if (kind === "permissions" && !currentCase.responses?.some((v) => v.method === expectedMethod && JSON.stringify(v.result) === JSON.stringify({permissions:{},scope:"turn"}))) throw new Error("No no-grant permissions response");
      if (kind === "permissions") {
        const requested = currentCase.interactionRequests.find((v) => v.method === expectedMethod).params.permissions;
        if (decision !== "filesystem" && requested.network?.enabled !== true) throw new Error("Network permission request not observed");
        if (decision !== "network" && !requested.fileSystem?.write?.includes(codexHome)) throw new Error("Filesystem permission request not observed");
        if (!currentCase.permissionResults?.length) throw new Error("No permissions tool result delivered to model");
        for (const raw of currentCase.permissionResults) {
          const output = JSON.parse(raw);
          if (output.scope !== "turn" || !isDeepStrictEqual(output.permissions,{network:null,file_system:null})) throw new Error("Unexpected permissions granted or response shape changed");
        }
      }
      if (kind === "command" && decision === "accept" && !currentCase.results.some((v) => v.status === "completed" && v.aggregatedOutput?.includes("PHITS_APPROVAL_FIXTURE"))) throw new Error("Approved fixture command did not complete");
      if (kind === "command" && decision !== "accept" && currentCase.results.some((v) => v.exitCode === 0)) throw new Error("Declined/cancelled fixture command unexpectedly ran");
      if (await readFile(input,"utf8") !== original) throw new Error("Fixture input unexpectedly changed");
      await request("thread/delete",{threadId:started.thread.id});
    }
    report.passed=true;
  } catch (error) {
    report.error=String(modelError ?? error); report.stderr=stderr; process.exitCode=1;
  } finally {
    cli.stdin.end();
    if (cli.exitCode === null) {try {await timeout(new Promise((done) => cli.once("exit",done)),"App Server exit");} catch {cli.kill();}}
    await new Promise((done) => model.close(done));
    // mkdtemp-owned directory only; no user settings or workspace are removed.
    await rm(temporary,{recursive:true,force:true});
    if (reportArgument) await writeFile(resolve(reportArgument),`${JSON.stringify(report,null,2)}\n`);
    console.log(JSON.stringify({passed:report.passed,kind:report.kind,noRealPhits:true,noAccount:true,
      cases:report.cases.map((v) => ({kind:v.kind,decision:v.decision,requests:v.requests,resolved:v.resolved.length,statuses:v.results.map((v) => v.status)})),
      ...(report.error ? {error:report.error,stderr:report.stderr} : {})},null,2));
  }
}
