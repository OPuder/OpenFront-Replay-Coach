import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const publishScript = join(root, "scripts", "publish-engine-candidate-branch.sh");
const workflow = readFileSync(join(root, ".github", "workflows", "discover-openfront-engine.yml"), "utf8");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function writeManifest(repoPath, commit) {
  writeFileSync(join(repoPath, "engine-build", "engines.json"), JSON.stringify([
    { commit: "a".repeat(40), source: "vendor/OpenFrontIO", bundleId: "aaaaaaaaaaaa" },
    { commit, source: `vendor/OpenFrontIO-${commit.slice(0, 12)}`, bundleId: commit.slice(0, 12) }
  ], null, 2) + "\n");
}

function runPublish(repoPath, baseSha, runId) {
  const result = spawnSync("bash", [publishScript], {
    cwd: repoPath,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: baseSha, GITHUB_RUN_ID: String(runId), GIT_TERMINAL_PROMPT: "0" }
  });
  assert.equal(result.status, 0, `publish helper failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}

function remoteBranchSha(repoPath, name) {
  return git(repoPath, "ls-remote", "--heads", "origin", `refs/heads/${name}`).split(/\s+/)[0] || "";
}

test("discovery workflow delegates branch publishing to the tested safe helper", () => {
  const helper = readFileSync(publishScript, "utf8");
  assert.match(workflow, /run: bash scripts\/publish-engine-candidate-branch\.sh/);
  assert.match(helper, /git merge-base --is-ancestor/);
  assert.match(helper, /git push origin "HEAD:refs\/heads\/\$branch"/);
  assert.doesNotMatch(helper, /git push[^\n]*--force|force-with-lease/);
});

test("stale candidate branches are preserved and a current-main branch is published idempotently", () => {
  const temp = mkdtempSync(join(tmpdir(), "engine-discovery-publish-"));
  const remote = join(temp, "remote.git");
  const work = join(temp, "work");
  const candidateCommit = "c".repeat(40);
  const candidateBranch = `automation/openfront-engine-${candidateCommit.slice(0, 12)}`;

  try {
    execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
    execFileSync("git", ["init", "-b", "main", work], { stdio: "ignore" });
    git(work, "config", "user.name", "Contract Test");
    git(work, "config", "user.email", "contract@example.invalid");
    git(work, "remote", "add", "origin", remote);

    mkdirSync(join(work, "engine-build"), { recursive: true });
    writeManifest(work, "a".repeat(40));
    writeFileSync(join(work, "base.txt"), "base\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "test: create base");
    git(work, "push", "-u", "origin", "main");

    git(work, "checkout", "-b", "stale-candidate");
    writeManifest(work, candidateCommit);
    git(work, "add", "-A");
    git(work, "commit", "-m", "test: publish candidate from old base");
    git(work, "push", "origin", `HEAD:refs/heads/${candidateBranch}`);

    git(work, "checkout", "main");
    writeFileSync(join(work, "main-update.txt"), "main advanced\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "test: advance main");
    git(work, "push", "origin", "main");
    const currentMain = git(work, "rev-parse", "HEAD");

    writeManifest(work, candidateCommit);
    git(work, "add", "-A");
    const expectedCurrentBranch = `${candidateBranch}-${currentMain.slice(0, 8)}`;

    const firstOutput = runPublish(work, currentMain, 12345);
    assert.ok(firstOutput.includes(expectedCurrentBranch), "the publisher uses a main-specific branch name");
    const oldRefSha = remoteBranchSha(work, candidateBranch);
    const newRefSha = remoteBranchSha(work, expectedCurrentBranch);
    assert.ok(oldRefSha, "the stale candidate branch remains present");
    assert.ok(newRefSha, "a fresh branch based on current main is published");

    // Simulate the same scheduled discovery again from the same main base.
    git(work, "checkout", "main");
    git(work, "reset", "--hard", currentMain);
    writeManifest(work, candidateCommit);
    git(work, "add", "-A");
    const secondOutput = runPublish(work, currentMain, 12346);
    assert.match(secondOutput, /already published .* leaving the remote ref unchanged/i);
    assert.equal(remoteBranchSha(work, candidateBranch), oldRefSha, "the stale ref is never overwritten");
    assert.equal(remoteBranchSha(work, expectedCurrentBranch), newRefSha, "the current candidate ref remains unchanged on repeat");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
