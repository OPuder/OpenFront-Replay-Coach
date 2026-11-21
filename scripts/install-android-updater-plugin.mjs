import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const javaRoot = path.join(root, "android/app/src/main/java/de/openfront/replaycoach");
const xmlRoot = path.join(root, "android/app/src/main/res/xml");
const manifestPath = path.join(root, "android/app/src/main/AndroidManifest.xml");
const activityPath = path.join(javaRoot, "MainActivity.java");
const templateRoot = path.join(root, "android-updater-template");

await mkdir(javaRoot, { recursive: true });
await mkdir(xmlRoot, { recursive: true });
await cp(path.join(templateRoot, "ApkUpdaterPlugin.java"), path.join(javaRoot, "ApkUpdaterPlugin.java"));
await cp(path.join(templateRoot, "replay_coach_update_paths.xml"), path.join(xmlRoot, "replay_coach_update_paths.xml"));

let activity = await readFile(activityPath, "utf8");
if (!activity.includes("import android.os.Bundle;")) {
  activity = activity.replace(/package\s+de\.openfront\.replaycoach\s*;/,
    "package de.openfront.replaycoach;\n\nimport android.os.Bundle;");
}
if (!activity.includes("import android.webkit.WebView;")) {
  activity = activity.replace("import android.os.Bundle;", "import android.os.Bundle;\nimport android.webkit.WebView;");
}
if (!activity.includes("import de.openfront.replaycoach.ApkUpdaterPlugin;")) {
  activity = activity.replace("import android.webkit.WebView;", "import android.webkit.WebView;\nimport de.openfront.replaycoach.ApkUpdaterPlugin;");
}
if (!activity.includes("registerPlugin(ApkUpdaterPlugin.class)")) {
  activity = activity.replace(/public class MainActivity extends BridgeActivity\s*\{\s*\}/,
    "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ApkUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}");
}
if (!activity.includes("WebView.setWebContentsDebuggingEnabled")) {
  activity = activity.replace("super.onCreate(savedInstanceState);",
    "if (BuildConfig.OFRC_ANDROID_UPGRADE_TEST) {\n            WebView.setWebContentsDebuggingEnabled(true);\n        }\n        super.onCreate(savedInstanceState);");
}
if (!activity.includes("registerPlugin(ApkUpdaterPlugin.class)") || !activity.includes("WebView.setWebContentsDebuggingEnabled(true)")) {
  throw new Error("Capacitor MainActivity could not be configured for the updater plugin and test-only WebView inspector.");
}
await writeFile(activityPath, activity);

// Keep BuildConfig available for every Android build variant. The default is
// always false; the signed release upgrade-test build explicitly overrides it.
const gradlePath = path.join(root, "android/app/build.gradle");
let gradle = await readFile(gradlePath, "utf8");
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
const androidMatch = /android\s*\{/.exec(gradle);
if (!androidMatch) throw new Error("Generated Android Gradle file has no android block.");
const androidOpen = gradle.indexOf("{", androidMatch.index);
let androidClose = findClosingBrace(gradle, androidOpen, "android");
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
  androidClose = findClosingBrace(gradle, androidOpen, "android");
}
const defaultMatch = /defaultConfig\s*\{/.exec(gradle);
if (!defaultMatch) throw new Error("Generated Android Gradle file has no defaultConfig block.");
const defaultOpen = gradle.indexOf("{", defaultMatch.index);
const defaultClose = findClosingBrace(gradle, defaultOpen, "defaultConfig");
let defaultBlock = gradle.slice(defaultOpen + 1, defaultClose);
if (!/buildConfigField\s+"boolean",\s*"OFRC_ANDROID_UPGRADE_TEST"/.test(defaultBlock)) {
  defaultBlock += '\n        buildConfigField "boolean", "OFRC_ANDROID_UPGRADE_TEST", "false"\n    ';
  gradle = gradle.slice(0, defaultOpen + 1) + defaultBlock + gradle.slice(defaultClose);
}
await writeFile(gradlePath, gradle);

let manifest = await readFile(manifestPath, "utf8");
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace("<application", '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application');
}
if (!manifest.includes(".updater-fileprovider")) {
  const provider = [
    '        <provider',
    '            android:name="androidx.core.content.FileProvider"',
    '            android:authorities="' + String.fromCharCode(36) + '{applicationId}.updater-fileprovider"',
    '            android:exported="false"',
    '            android:grantUriPermissions="true">',
    '            <meta-data',
    '                android:name="android.support.FILE_PROVIDER_PATHS"',
    '                android:resource="@xml/replay_coach_update_paths" />',
    '        </provider>',
    ''
  ].join("\n");
  manifest = manifest.replace("</application>", provider + "    </application>");
}
if (!manifest.includes(".updater-fileprovider") || !manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  throw new Error("AndroidManifest konnte die sichere APK-Installation nicht vollständig konfigurieren.");
}
await writeFile(manifestPath, manifest);
console.log("Android APK updater plugin installed: verified download, SHA-256 check, FileProvider and Android package-installer handoff.");
