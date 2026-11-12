import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2] ?? "";
if (!/^\\d+\\.\\d+\\.\\d+$/.test(version)) {
  throw new Error("Expected a stable semantic version such as 2.2.5.");
}

const [major, minor, patch] = version.split(".").map(Number);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;
const gradlePath = "android/app/build.gradle";
const gradle = readFileSync(gradlePath, "utf8");

if (!/versionCode\\s+\\d+/.test(gradle) || !/versionName\\s+["'][^"']+["']/.test(gradle)) {
  throw new Error("Could not find versionCode and versionName in generated Android Gradle file.");
}

const updated = gradle
  .replace(/versionCode\\s+\\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\\s+["'][^"']+["']/, `versionName "${version}"`);

writeFileSync(gradlePath, updated);
console.log(`Android versionName=${version}, versionCode=${versionCode}`);
