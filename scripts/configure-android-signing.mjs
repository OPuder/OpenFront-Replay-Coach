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

function findClosingBrace(source, openingIndex, label) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Could not locate the end of the " + label + " block.");
}

function updateBuildType(source, type, { signWithRelease, debuggable }) {
  const pattern = "buildTypes\\s*\\{[\\s\\S]*?\\b" + type + "\\s*\\{";
  const match = new RegExp(pattern).exec(source);
  if (!match) throw new Error("Could not locate the " + type + " build type.");
  const open = source.indexOf("{", match.index + match[0].lastIndexOf(type));
  const close = findClosingBrace(source, open, type);
  let block = source.slice(open + 1, close).trimEnd();

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

  block += "\n        ";
  return source.slice(0, open + 1) + block + source.slice(close);
}

const androidMatch = /android\s*\{/.exec(gradle);
if (!androidMatch) throw new Error("Could not locate the Android Gradle block.");
const androidOpen = gradle.indexOf("{", androidMatch.index);
const androidClose = findClosingBrace(gradle, androidOpen, "android");
const featuresMatch = /buildFeatures\s*\{/.exec(gradle.slice(androidOpen, androidClose));
if (featuresMatch) {
  const featureOpen = androidOpen + featuresMatch.index + featuresMatch[0].lastIndexOf("{");
  const featureClose = findClosingBrace(gradle, featureOpen, "buildFeatures");
  let featureBlock = gradle.slice(featureOpen + 1, featureClose);
  if (/buildConfig\s+false/.test(featureBlock)) featureBlock = featureBlock.replace(/buildConfig\s+false/, "buildConfig true");
  else if (!/buildConfig\s+true/.test(featureBlock)) featureBlock += "\n        buildConfig true\n    ";
  gradle = gradle.slice(0, featureOpen + 1) + featureBlock + gradle.slice(featureClose);
} else {
  gradle = gradle.slice(0, androidOpen + 1) + "\n    buildFeatures { buildConfig true }" + gradle.slice(androidOpen + 1);
}

const defaultMatch = /defaultConfig\s*\{/.exec(gradle);
if (!defaultMatch) throw new Error("Could not locate the Android defaultConfig block.");
const defaultOpen = gradle.indexOf("{", defaultMatch.index);
const defaultClose = findClosingBrace(gradle, defaultOpen, "defaultConfig");
let defaultBlock = gradle.slice(defaultOpen + 1, defaultClose);
const inspectorValue = upgradeTestBuild ? "true" : "false";
const fieldPattern = /buildConfigField\s+"boolean",\s*"OFRC_ANDROID_UPGRADE_TEST",\s*"(?:true|false)"/;
const field = 'buildConfigField "boolean", "OFRC_ANDROID_UPGRADE_TEST", "' + inspectorValue + '"';
if (fieldPattern.test(defaultBlock)) defaultBlock = defaultBlock.replace(fieldPattern, field);
else defaultBlock += "\n        " + field + "\n    ";
gradle = gradle.slice(0, defaultOpen + 1) + defaultBlock + gradle.slice(defaultClose);

gradle = updateBuildType(gradle, "release", {
  signWithRelease: true,
  debuggable: "false",
});

writeFileSync(gradlePath, gradle);
console.log(upgradeTestBuild
  ? "Configured a non-debuggable, permanently signed RELEASE upgrade-test APK with the test-only WebView inspector enabled."
  : "Configured a non-debuggable, permanently signed production APK with the test-only WebView inspector disabled.");
