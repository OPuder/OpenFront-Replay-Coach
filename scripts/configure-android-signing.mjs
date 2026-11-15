import { readFileSync, writeFileSync } from "node:fs";

const keystorePath = process.env.ANDROID_KEYSTORE_PATH;
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;
const upgradeTestBuild = process.env.ANDROID_UPGRADE_TEST_BUILD === "1";

if (!keystorePath || !storePassword || !keyAlias || !keyPassword) {
  throw new Error("Permanent Android signing requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD.");
}

const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");
if (!/android\s*\{/.test(gradle) || !/buildTypes\s*\{/.test(gradle)) {
  throw new Error("Could not locate android { ... } and buildTypes { ... } in generated app/build.gradle.");
}

if (!/signingConfigs\s*\{[\s\S]*?\brelease\s*\{/.test(gradle)) {
  const signingBlock = "android {\n    signingConfigs {\n        release {\n            storeFile file(System.getenv(\"ANDROID_KEYSTORE_PATH\"))\n            storePassword System.getenv(\"ANDROID_KEYSTORE_PASSWORD\")\n            keyAlias System.getenv(\"ANDROID_KEY_ALIAS\")\n            keyPassword System.getenv(\"ANDROID_KEY_PASSWORD\")\n        }\n    }\n";
  gradle = gradle.replace(/android\s*\{/, signingBlock);
}

function updateBuildType(source, type, { signWithRelease, debuggable }) {
  const pattern = "buildTypes\\s*\\{[\\s\\S]*?\\b" + type + "\\s*\\{";
  const match = new RegExp(pattern).exec(source);
  if (!match) throw new Error("Could not locate the " + type + " build type.");
  const open = source.indexOf("{", match.index + match[0].lastIndexOf(type));
  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) { close = index; break; }
    }
  }
  if (close < 0) throw new Error("Could not locate the end of the " + type + " build type.");
  let block = source.slice(open + 1, close);
  if (signWithRelease) {
    if (/signingConfig\s+signingConfigs\.[A-Za-z0-9_]+/.test(block)) {
      block = block.replace(/signingConfig\s+signingConfigs\.[A-Za-z0-9_]+/, "signingConfig signingConfigs.release");
    } else {
      block += "\n            signingConfig signingConfigs.release";
    }
  }
  if (debuggable !== undefined) {
    if (/debuggable\s+(?:true|false)/.test(block)) {
      block = block.replace(/debuggable\s+(?:true|false)/, "debuggable " + debuggable);
    } else {
      block += "\n            debuggable " + debuggable;
    }
  }
  return source.slice(0, open + 1) + block + source.slice(close);
}

gradle = updateBuildType(gradle, "release", { signWithRelease: true, debuggable: "false" });
if (upgradeTestBuild) {
  // BuildConfig.DEBUG and Android's debuggable manifest flag are enabled only
  // in the test variant; it is signed by the same permanent release key.
  gradle = updateBuildType(gradle, "debug", { signWithRelease: true, debuggable: "true" });
}

writeFileSync(gradlePath, gradle);
console.log(upgradeTestBuild
  ? "Configured permanent-key debug test APK; production release remains non-debuggable."
  : "Configured permanent-key non-debuggable production APK.");
