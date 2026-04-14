/**
 * Tests for the HARD_FAIL behaviour in agentInstructionsService.getBundle().
 *
 * Two hard-fail cases are tested:
 *  1. rootPath is configured but the directory does not exist on disk.
 *  2. rootPath directory exists but the entry file is absent from it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentInstructionsService } from "../services/agent-instructions.js";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeAgent(adapterConfig: Record<string, unknown>) {
  return {
    id: "agent-hf-1",
    companyId: "company-hf-1",
    name: "Hard Fail Agent",
    adapterConfig,
  };
}

describe("agentInstructionsService.getBundle() — HARD_FAIL paths", () => {
  const cleanupDirs = new Set<string>();
  const originalPaperclipHome = process.env.PAPERCLIP_HOME;
  const originalPaperclipInstanceId = process.env.PAPERCLIP_INSTANCE_ID;

  afterEach(async () => {
    // Restore env vars
    if (originalPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = originalPaperclipHome;
    if (originalPaperclipInstanceId === undefined)
      delete process.env.PAPERCLIP_INSTANCE_ID;
    else process.env.PAPERCLIP_INSTANCE_ID = originalPaperclipInstanceId;

    // Clean up temp dirs
    await Promise.all(
      [...cleanupDirs].map((dir) =>
        fs.rm(dir, { recursive: true, force: true }),
      ),
    );
    cleanupDirs.clear();
  });

  it("throws HARD_FAIL when rootPath is configured but directory does not exist", async () => {
    const paperclipHome = await makeTempDir("paperclip-hf-home-");
    cleanupDirs.add(paperclipHome);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "test-instance";

    // Point to a non-existent directory
    const missingRoot = path.join(paperclipHome, "does-not-exist");

    const svc = agentInstructionsService();
    const agent = makeAgent({
      instructionsBundleMode: "external",
      instructionsRootPath: missingRoot,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(missingRoot, "AGENTS.md"),
    });

    await expect(svc.getBundle(agent)).rejects.toThrow(
      "[agent-instructions] HARD_FAIL",
    );
  });

  it("throws HARD_FAIL when directory exists but entry file is absent", async () => {
    const paperclipHome = await makeTempDir("paperclip-hf-home-");
    const rootDir = await makeTempDir("paperclip-hf-root-");
    cleanupDirs.add(paperclipHome);
    cleanupDirs.add(rootDir);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "test-instance";

    // Directory exists but AGENTS.md is missing — write a different file so
    // the directory is non-empty and recovery cannot auto-select AGENTS.md.
    await fs.writeFile(path.join(rootDir, "README.md"), "# readme\n", "utf8");

    const svc = agentInstructionsService();
    const agent = makeAgent({
      instructionsBundleMode: "external",
      instructionsRootPath: rootDir,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(rootDir, "AGENTS.md"),
    });

    await expect(svc.getBundle(agent)).rejects.toThrow(
      "[agent-instructions] HARD_FAIL",
    );
  });

  it("HARD_FAIL error message names the expected path", async () => {
    const paperclipHome = await makeTempDir("paperclip-hf-home-");
    cleanupDirs.add(paperclipHome);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "test-instance";

    const missingRoot = path.join(paperclipHome, "no-such-dir");

    const svc = agentInstructionsService();
    const agent = makeAgent({
      instructionsBundleMode: "external",
      instructionsRootPath: missingRoot,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(missingRoot, "AGENTS.md"),
    });

    const err = await svc.getBundle(agent).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("agent-hf-1");
    expect((err as Error).message).toContain("company-hf-1");
    expect((err as Error).message).toContain(
      "Create the file before registering this agent",
    );
  });

  it("succeeds when rootPath exists and entry file is present", async () => {
    const paperclipHome = await makeTempDir("paperclip-hf-home-");
    const rootDir = await makeTempDir("paperclip-hf-root-ok-");
    cleanupDirs.add(paperclipHome);
    cleanupDirs.add(rootDir);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "test-instance";

    await fs.writeFile(
      path.join(rootDir, "AGENTS.md"),
      "# Agent Instructions\n",
      "utf8",
    );

    const svc = agentInstructionsService();
    const agent = makeAgent({
      instructionsBundleMode: "external",
      instructionsRootPath: rootDir,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(rootDir, "AGENTS.md"),
    });

    const bundle = await svc.getBundle(agent);
    expect(bundle.files.some((f) => f.path === "AGENTS.md")).toBe(true);
  });
});
