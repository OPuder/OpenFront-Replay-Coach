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
  activity = activity.replace(
    /package\s+de\.openfront\.replaycoach\s*;/,
    "package de.openfront.replaycoach;\n\nimport android.os.Bundle;\nimport de.openfront.replaycoach.ApkUpdaterPlugin;"
  );
  activity = activity.replace(
    /public class MainActivity extends BridgeActivity\s*\{\s*\}/,
    "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ApkUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}"
  );
  if (!activity.includes("registerPlugin(ApkUpdaterPlugin.class)")) {
    throw new Error("Capacitor MainActivity konnte nicht sicher für den APK-Updater erweitert werden.");
  }
}
if (!activity.includes("import android.webkit.WebView;")) {
  activity = activity.replace(
    /import android\.os\.Bundle\s*;/,
    "import android.os.Bundle;\nimport android.webkit.WebView;"
  );
}
if (!activity.includes("ApplicationInfo.FLAG_DEBUGGABLE")) {
  const onCreatePattern = /public void onCreate\(Bundle savedInstanceState\)\s*\{/;
  if (!onCreatePattern.test(activity)) {
    throw new Error("Capacitor MainActivity besitzt keine erwartete onCreate-Methode für die Debug-WebView-Konfiguration.");
  }
  activity = activity.replace(
    onCreatePattern,
    match => match + "\n        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }"
  );
}
if (!activity.includes("ApplicationInfo.FLAG_DEBUGGABLE")) {
  throw new Error("Capacitor MainActivity konnte WebView-Inspektion für Debug-Builds nicht sicher aktivieren.");
}
await writeFile(activityPath, activity);

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
console.log("Android APK updater plugin installed: verified download, SHA-256 check, FileProvider, package-installer handoff and debug-only WebView inspection.");
