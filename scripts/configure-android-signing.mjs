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

if (!/android\\s*\\{/.test(gradle) || !/buildTypes\\s*\\{\\s*release\\s*\\{/.test(gradle)) {
  throw new Error("Could not locate android { ... } and buildTypes { release { ... } } in generated app/build.gradle.");
}

if (!/signingConfigs\\s*\\{[\\s\\S]*?release\\s*\\{/.test(gradle)) {
  gradle = gradle.replace(
    /android\\s*\\{/,
    `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
`,
  );
}

const releaseMatch = /buildTypes\\s*\\{\\s*release\\s*\\{/.exec(gradle);
if (!releaseMatch) throw new Error("Could not locate the release build type.");
const releaseOpen = gradle.indexOf("{", releaseMatch.index);
let depth = 0;
let releaseClose = -1;
for (let index = releaseOpen; index < gradle.length; index += 1) {
  if (gradle[index] === "{") depth += 1;
  else if (gradle[index] === "}") {
    depth -= 1;
    if (depth === 0) {
      releaseClose = index;
      break;
    }
  }
}
if (releaseClose < 0) throw new Error("Could not locate the end of the release build type.");

let releaseBlock = gradle.slice(releaseOpen + 1, releaseClose);
if (/signingConfig\\s+signingConfigs\\.release/.test(releaseBlock)) {
  // Keep the existing permanent signing assignment.
} else {
  releaseBlock += "\\n            signingConfig signingConfigs.release";
}
if (/debuggable\\s+(?:true|false)/.test(releaseBlock)) {
  releaseBlock = releaseBlock.replace(/debuggable\\s+(?:true|false)/, `debuggable ${upgradeTestBuild ? "true" : "false"}`);
} else {
  releaseBlock += `\\n            debuggable ${upgradeTestBuild ? "true" : "false"}`;
}
gradle = gradle.slice(0, releaseOpen + 1) + releaseBlock + gradle.slice(releaseClose);

writeFileSync(gradlePath, gradle);
console.log(upgradeTestBuild
  ? "Configured permanent signing and debuggable mode for the isolated Android upgrade-test APK."
  : "Configured permanent signing and non-debuggable mode for the production Android APK.");
