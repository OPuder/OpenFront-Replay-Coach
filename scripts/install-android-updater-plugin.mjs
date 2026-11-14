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
if (!activity.includes("ApkUpdaterPlugin")) {
  activity = activity.replace(/package\s+de\.openfront\.replaycoach\s*;/, "package de.openfront.replaycoach;\n\nimport android.os.Bundle;\nimport de.openfront.replaycoach.ApkUpdaterPlugin;");
  activity = activity.replace(/public class MainActivity extends BridgeActivity\s*\{\s*\}/, "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ApkUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}");
  if (!activity.includes("registerPlugin(ApkUpdaterPlugin.class)")) throw new Error("Capacitor MainActivity konnte nicht sicher für den APK-Updater erweitert werden.");
  await writeFile(activityPath, activity);
}

let manifest = await readFile(manifestPath, "utf8");
if (!manifest.includes(".updater-fileprovider")) {
  const provider = [
    '        <provider',
    '            android:name="androidx.core.content.FileProvider"',
    '            android:authorities="' + '
    '            android:exported="false"',
    '            android:grantUriPermissions="true">',
    '            <meta-data',
    '                android:name="android.support.FILE_PROVIDER_PATHS"',
    '                android:resource="@xml/replay_coach_update_paths" />',
    '        </provider>',
    ''
  ].join("\n");
  manifest = manifest.replace("</application>", provider + "    </application>");
  if (!manifest.includes(".updater-fileprovider")) throw new Error("AndroidManifest konnte den sicheren FileProvider nicht aufnehmen.");
  await writeFile(manifestPath, manifest);
}
console.log("Android APK updater plugin installed: verified download, SHA-256 check, FileProvider and Android package-installer handoff.");
 + '{applicationId}.updater-fileprovider"',
    '            android:exported="false"',
    '            android:grantUriPermissions="true">',
    '            <meta-data',
    '                android:name="android.support.FILE_PROVIDER_PATHS"',
    '                android:resource="@xml/replay_coach_update_paths" />',
    '        </provider>',
    ''
  ].join("\n");
  manifest = manifest.replace("</application>", provider + "    </application>");
  if (!manifest.includes(".updater-fileprovider")) throw new Error("AndroidManifest konnte den sicheren FileProvider nicht aufnehmen.");
  await writeFile(manifestPath, manifest);
}
console.log("Android APK updater plugin installed: verified download, SHA-256 check, FileProvider and Android package-installer handoff.");
