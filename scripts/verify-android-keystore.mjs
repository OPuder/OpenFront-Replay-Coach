import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const encoded = process.env.ANDROID_KEYSTORE_BASE64 ?? "";
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD ?? "";
const alias = process.env.ANDROID_KEY_ALIAS ?? "";
const keyPassword = process.env.ANDROID_KEY_PASSWORD ?? "";

const missing = [
  ["ANDROID_KEYSTORE_BASE64", encoded],
  ["ANDROID_KEYSTORE_PASSWORD", storePassword],
  ["ANDROID_KEY_ALIAS", alias],
  ["ANDROID_KEY_PASSWORD", keyPassword],
].filter(([, value]) => !value);

if (missing.length) {
  throw new Error(`Missing Android signing secrets: ${missing.map(([name]) => name).join(", ")}`);
}

const directory = mkdtempSync(join(tmpdir(), "ofrc-keystore-check-"));
const file = join(directory, "release.jks");

try {
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error("ANDROID_KEYSTORE_BASE64 is not valid canonical Base64 data.");
  }
  writeFileSync(file, bytes, { mode: 0o600 });

  const check = spawnSync("keytool", [
    "-list", "-keystore", file, "-storepass", storePassword, "-alias", alias, "-keypass", keyPassword
  ], { encoding: "utf8", windowsHide: true });

  if (check.status !== 0) {
    const output = `${check.stderr ?? ""}\n${check.stdout ?? ""}`;
    const detail = output.split(/\r?\n/).find(line => /password was incorrect|Keystore was tampered|does not exist|key password/i.test(line));
    throw new Error(detail ? `Android keystore validation failed: ${detail.trim()}` : "Android keystore validation failed. Check the keystore file, alias and both passwords.");
  }

  console.log("Android keystore file, store password, alias and key password validated successfully.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
