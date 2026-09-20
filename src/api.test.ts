import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("api", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("opens the startup log folder through the backend-owned command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await api.openStartupLogFolder();

    expect(invoke).toHaveBeenCalledWith("open_startup_log_folder");
  });
});
