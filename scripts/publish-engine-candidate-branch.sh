#!/usr/bin/env bash
set -Eeuo pipefail

base_sha="${GITHUB_SHA:?GITHUB_SHA must identify the main commit that was validated}"
run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID must identify this workflow run}"
run_attempt="${GITHUB_RUN_ATTEMPT:-1}"
candidate_commit="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8")); console.log(engines.at(-1).commit);')"
bundle_id="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; const engines = JSON.parse(readFileSync("engine-build/engines.json", "utf8")); console.log(engines.at(-1).bundleId);')"

branch="automation/openfront-engine-${bundle_id}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A

# Generated upstream engine JS may retain upstream whitespace. Keep the check
# strict for repository-owned staged changes and exclude only these bundles.
git diff --cached --check -- . ':!src/renderer/engine/replay-engine-*.js'
if git diff --cached --quiet; then
  echo "::error::Engine discovery reported changes but produced no commit."
  exit 1
fi
git commit -m "build(engine): add latest exact OpenFront revision"

remote_branch_sha() {
  git ls-remote --heads origin "refs/heads/$1" | awk 'NR == 1 { print $1 }'
}

branch_contains_current_candidate() {
  local ref="$1"
  local remote_candidate
  remote_candidate="$(git show "$ref:engine-build/engines.json" | node --input-type=module -e 'let data=""; for await (const chunk of process.stdin) data += chunk; const engines = JSON.parse(data); console.log(engines.at(-1).commit);')"
  [[ "$remote_candidate" == "$candidate_commit" ]] &&
    git merge-base --is-ancestor "$base_sha" "$ref"
}

fetch_remote_branch() {
  local name="$1"
  git fetch origin "+refs/heads/$name:refs/remotes/origin/$name"
}

existing_sha="$(remote_branch_sha "$branch")"
if [[ -n "$existing_sha" ]]; then
  fetch_remote_branch "$branch"
  remote_ref="refs/remotes/origin/$branch"
  if branch_contains_current_candidate "$remote_ref"; then
    echo "::notice::Validated candidate $candidate_commit is already published on $branch from current main; leaving the remote ref unchanged."
    exit 0
  fi

  # Never force-update a candidate branch that diverged from current main.
  # Preserve it and publish this validated tree under a deterministic main-based name.
  branch="${branch}-${base_sha:0:8}"
fi

existing_sha="$(remote_branch_sha "$branch")"
if [[ -n "$existing_sha" ]]; then
  fetch_remote_branch "$branch"
  remote_ref="refs/remotes/origin/$branch"
  if branch_contains_current_candidate "$remote_ref"; then
    echo "::notice::Validated candidate $candidate_commit is already published on $branch from current main; leaving the remote ref unchanged."
    exit 0
  fi

  # Preserve a conflicting main-specific branch and use a run-specific fallback.
  branch="${branch}-${run_id}"
fi

existing_sha="$(remote_branch_sha "$branch")"
if [[ -n "$existing_sha" ]]; then
  fetch_remote_branch "$branch"
  remote_ref="refs/remotes/origin/$branch"
  if branch_contains_current_candidate "$remote_ref"; then
    echo "::notice::Validated candidate $candidate_commit is already published on $branch from current main; leaving the remote ref unchanged."
    exit 0
  fi

  # Workflow reruns keep the same run ID. If this run-specific ref conflicts,
  # preserve it and isolate the retry by its attempt number.
  branch="${branch}-${run_attempt}"
fi

existing_sha="$(remote_branch_sha "$branch")"
if [[ -n "$existing_sha" ]]; then
  fetch_remote_branch "$branch"
  remote_ref="refs/remotes/origin/$branch"
  if branch_contains_current_candidate "$remote_ref"; then
    echo "::notice::Validated candidate $candidate_commit is already published on $branch from current main; leaving the remote ref unchanged."
    exit 0
  fi

  echo "::error::Run-attempt branch $branch already exists with conflicting content; refusing to overwrite it."
  exit 1
fi

git push origin "HEAD:refs/heads/$branch"
echo "::notice::Validated engine candidate published on $branch. It still requires a review PR and real replay hash verification."
