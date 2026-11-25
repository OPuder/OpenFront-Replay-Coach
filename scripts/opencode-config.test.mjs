import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const config = JSON.parse(await readFile(new URL("../opencode.json", import.meta.url), "utf8"));
const expectedAgents = [
  "replay-engine",
  "coaching-intelligence",
  "ux-visualization",
  "platform-updates",
  "qa-release",
];

test("OpenCode config declares all project specialists as subagents", () => {
  for (const id of expectedAgents) {
    assert.equal(config.agents?.[id]?.mode, "subagent", `agent ${id} must be configured as a subagent`);
    assert.ok(config.permissions?.some(rule =>
      rule.action === "subagent" && rule.resource === id && rule.effect === "allow"
    ), `primary agent must be allowed to call ${id}`);
  }
});

test("every configured specialist has a matching read-only agent file", async () => {
  for (const id of expectedAgents) {
    const file = await readFile(new URL(`../.opencode/agents/${id}.md`, import.meta.url), "utf8");
    const frontmatter = file.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---/);
    assert.ok(frontmatter, `${id}: frontmatter missing`);
    assert.match(frontmatter[1], /^mode: subagent$/m, `${id}: must be subagent`);
    for (const action of ["edit", "shell", "subagent"]) {
      assert.match(
        frontmatter[1],
        new RegExp(`action: ${action}\\n\\s+resource: ["']?\\*["']?\\n\\s+effect: deny`),
        `${id}: must deny ${action}`
      );
    }
  }
});

test("project OpenCode commands are present", async () => {
  for (const command of ["coach-task", "qa"]) {
    await assert.doesNotReject(readFile(new URL(`../.opencode/commands/${command}.md`, import.meta.url)));
  }
});

test("global shell policy keeps push denied and routine inspection allowlisted", () => {
  assert.ok(config.permissions.some(rule => rule.action === "shell" && rule.resource === "*" && rule.effect === "ask"));
  assert.ok(config.permissions.some(rule => rule.action === "shell" && rule.resource === "git push *" && rule.effect === "deny"));
  for (const command of ["git status *", "git diff *", "git log *", "git branch *", "git fetch *"]) {
    assert.ok(config.permissions.some(rule => rule.action === "shell" && rule.resource === command && rule.effect === "allow"), `${command} allowlist missing`);
  }
});
