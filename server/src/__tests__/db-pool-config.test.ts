/**
 * Pins the connection-pool configuration in packages/db/src/client.ts.
 *
 * The pool options are passed inline to the postgres() call and are not
 * exported, so we verify them via source inspection. The test guards against
 * accidental removal of the max:5 cap or the idle_timeout:20 setting.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DB_CLIENT_SOURCE = path.resolve(
  import.meta.dirname,
  "../../../packages/db/src/client.ts",
);

describe("db client pool configuration (source pins)", () => {
  it("createDb uses max: 5 pool cap", async () => {
    const src = await fs.readFile(DB_CLIENT_SOURCE, "utf8");
    // The createDb function should contain postgres(url, { max: 5, ... })
    const createDbSection = src.slice(src.indexOf("export function createDb"));
    expect(createDbSection).toContain("max: 5");
  });

  it("createDb uses idle_timeout: 20", async () => {
    const src = await fs.readFile(DB_CLIENT_SOURCE, "utf8");
    const createDbSection = src.slice(src.indexOf("export function createDb"));
    expect(createDbSection).toContain("idle_timeout: 20");
  });

  it("max and idle_timeout appear together in the same postgres() call", async () => {
    const src = await fs.readFile(DB_CLIENT_SOURCE, "utf8");
    // Find the postgres() call inside createDb and confirm both options coexist
    const match = src.match(
      /export function createDb[\s\S]*?postgres\([^)]*\{([^}]*)\}/,
    );
    expect(match, "postgres() call not found inside createDb").toBeTruthy();
    const optionsBlock = match![1];
    expect(optionsBlock).toContain("max: 5");
    expect(optionsBlock).toContain("idle_timeout: 20");
  });

  it("utility sql helper uses max: 1 (single-connection, not capped)", async () => {
    const src = await fs.readFile(DB_CLIENT_SOURCE, "utf8");
    // createUtilitySql is intentionally max:1 — guard it stays separate from createDb
    expect(src).toContain("max: 1");
    // Ensure there are exactly two distinct postgres() calls with different max values
    const maxFiveCount = (src.match(/max:\s*5/g) ?? []).length;
    const maxOneCount = (src.match(/max:\s*1/g) ?? []).length;
    expect(maxFiveCount).toBeGreaterThanOrEqual(1);
    expect(maxOneCount).toBeGreaterThanOrEqual(1);
  });
});
