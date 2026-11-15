import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./set-android-version.mjs", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ofrc-android-version-"));
  mkdirSync(join(root, "android", "app"), { recursive: true });
  const gradlePath = join(root, "android", "app", "build.gradle");
  writeFileSync(gradlePath, `plugins { id "com.android.application" }
android {
  namespace "de.openfront.replaycoach"
  compileSdk 36
  defaultConfig { applicationId "de.openfront.replaycoach" }
  signingConfigs {
    release {
      storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
      storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
      keyAlias System.getenv("ANDROID_KEY_ALIAS")
      keyPassword System.getenv("ANDROID_KEY_PASSWORD")
    }
  }
  defaultConfig {
    versionCode 2002052
    versionName "2.2.52"
  }
  buildTypes {
    release { signingConfig signingConfigs.release }
  }
}
`);
  return { root, gradlePath };
}

test("Android version update preserves compileSdk and permanent signing configuration", () => {
  const { root, gradlePath } = fixture();
  try {
    const result = spawnSync(process.execPath, [script, "2.2.53"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const gradle = readFileSync(gradlePath, "utf8");
    assert.match(gradle, /compileSdk 36/);
    assert.match(gradle, /storeFile file\(System\.getenv\("ANDROID_KEYSTORE_PATH"\)\)/);
    assert.match(gradle, /signingConfig signingConfigs\.release/);
    assert.match(gradle, /versionCode 2002053/);
    assert.match(gradle, /versionName "2\.2\.53"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Android version update rejects invalid version without changing Gradle file", () => {
  const { root, gradlePath } = fixture();
  try {
    const before = readFileSync(gradlePath, "utf8");
    const result = spawnSync(process.execPath, [script, "latest"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(gradlePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
