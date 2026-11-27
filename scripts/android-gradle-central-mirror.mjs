export const MAVEN_CENTRAL_MIRROR_URL = "https://maven-central-eu.storage-download.googleapis.com/maven2/";
export const MAVEN_CENTRAL_MIRROR_DECLARATION = "maven { url '" + MAVEN_CENTRAL_MIRROR_URL + "' }";

export function insertMavenCentralMirror(source) {
  const lines = source.split(/\r?\n/);
  const output = [];
  let centralCount = 0;
  let insertedCount = 0;

  for (const line of lines) {
    if (/^\s*mavenCentral\(\)\s*$/.test(line)) {
      centralCount += 1;
      const indentation = line.match(/^\s*/)[0];
      if (output.at(-1)?.trim() !== MAVEN_CENTRAL_MIRROR_DECLARATION) {
        output.push(indentation + MAVEN_CENTRAL_MIRROR_DECLARATION);
        insertedCount += 1;
      }
    }
    output.push(line);
  }

  if (centralCount === 0) {
    throw new Error("Generated Android root build.gradle does not declare mavenCentral(); refusing to apply an unverified repository patch.");
  }

  return { content: output.join("\n"), insertedCount };
}
