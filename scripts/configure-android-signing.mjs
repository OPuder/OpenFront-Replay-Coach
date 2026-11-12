import { readFileSync, writeFileSync } from "node:fs";

const keystorePath = process.env.ANDROID_KEYSTORE_PATH;
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;

if (!keystorePath || !storePassword || !keyAlias || !keyPassword) {
  throw new Error("Permanent Android signing requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD.");
}

const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");

if (!/android\s*\{/.test(gradle) || !/buildTypes\s*\{\s*release\s*\{/.test(gradle)) {
  throw new Error("Could not locate android { ... } and buildTypes { release { ... } } in generated app/build.gradle.");
}
if (gradle.includes("signingConfigs.release")) {
  throw new Error("Release signing configuration already exists; refusing to insert it twice.");
}

gradle = gradle.replace(
  /android\s*\{/,
  `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
`
);

gradle = gradle.replace(
  /(buildTypes\s*\{\s*release\s*\{)/,
  `$1
            signingConfig signingConfigs.release`
);

writeFileSync(gradlePath, gradle);
console.log("Configured permanent Android release signing.");
