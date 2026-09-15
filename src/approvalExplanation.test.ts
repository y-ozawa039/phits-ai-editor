import { describe, it, expect } from "vitest";
import { approvalExplanation, approvalScopeExplanation } from "./approvalExplanation";
import type { ApprovalRequest } from "./types";
const command = (value: string): ApprovalRequest => ({ requestId: 1, method: "item/commandExecution/requestApproval", kind: "commandExecution", command: value, changes: [] });
describe("approval explanations", () => {
  it("describes only narrowly recognized read commands", () => {
    expect(approvalExplanation(command('Get-Content -LiteralPath "C:\\phits\\workbench\\AI\\reference_policy.md" -Raw'))).toContain("読み取る");
    expect(approvalExplanation(command("Get-ChildItem -LiteralPath 'C:\\work'"))).toContain("一覧");
    expect(approvalExplanation(command("rg -n 'maxbch' main.inp"))).toContain("検索");
  });
  it("does not describe compound commands, expansions, redirections or extra rg flags as read-only", () => {
    for (const value of ["Get-Content -LiteralPath x > result.txt", "Get-Content -LiteralPath $path", "Get-Content -LiteralPath $(Remove-Item x)", "Get-Content -LiteralPath x; Remove-Item x", "rg -n --pre script", "rg -n '--pre' script", "Get-Content -LiteralPath x -Unknown", "powershell -File task.ps1"]) {
      expect(approvalExplanation(command(value))).not.toContain("書き換えません");
    }
  });
  it("distinguishes current-only from prefix rule persistence", () => {
    expect(approvalScopeExplanation("accept")).toContain("規則は追加しません");
    expect(approvalScopeExplanation("acceptWithExecPolicyAmendment")).toContain("今後");
  });
  it("explains a narrowly recognized App Server PowerShell envelope without claiming the whole process is read-only", () => {
    const explanation = approvalExplanation(command('"C:\\bin\\pwsh.exe" -Command "Get-Content -LiteralPath \'C:\\phits\\workbench\\AI\\reference_policy.md\' -Raw"'));
    expect(explanation).toContain("読み取る");
    expect(explanation).not.toContain("書き換えません");
    for (const value of ['pwsh -EncodedCommand abc', 'pwsh -Command "Get-Content -LiteralPath x; Remove-Item y"', 'pwsh -Command "Get-Content -LiteralPath $path"']) expect(approvalExplanation(command(value))).not.toContain("書き換えません");
  });
});
