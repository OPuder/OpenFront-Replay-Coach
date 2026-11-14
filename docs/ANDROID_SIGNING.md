# Dauerhafte Android-Signierung einrichten

Damit Android neue Versionen über die vorhandene Installation installieren kann, muss jede APK mit **demselben privaten Schlüssel** signiert werden. Der Schlüssel gehört dem Projektbetreiber und darf niemals in Git, in einen Release-Download oder in einen Chat hochgeladen werden.

## 1. Einmalig einen privaten Schlüssel erzeugen (Windows)

Installiere/öffne eine Java-Umgebung mit `keytool` (z. B. das JDK aus Android Studio). In PowerShell:

```powershell
keytool -genkeypair -v -keystore openfront-replay-coach-release.jks -alias replay-coach -keyalg RSA -keysize 4096 -validity 10000
```

- Lege ein starkes Passwort für den Keystore fest.
- Verwende für den Alias exakt `replay-coach`.
- Notiere das Schlüsselpasswort. Wenn `keytool` fragt, ob das Schlüsselpasswort dem Keystore-Passwort entsprechen soll, kannst du mit Enter dasselbe Passwort verwenden.
- Bewahre die Datei `openfront-replay-coach-release.jks` und die Passwörter sicher und getrennt gesichert auf. Wenn der Schlüssel verloren geht, können bestehende Installationen nicht mehr per Update aktualisiert werden.

## 2. Vier GitHub-Actions-Secrets hinterlegen

Öffne im Repository **Settings → Secrets and variables → Actions → New repository secret** und lege diese vier Secrets an:

| Secret-Name | Inhalt |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-Inhalt der JKS-Datei |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | `replay-coach` |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |

Für den Base64-Wert in PowerShell die Datei in die Zwischenablage kopieren:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\openfront-replay-coach-release.jks")) | Set-Clipboard
```

Den kopierten Inhalt direkt als Wert von `ANDROID_KEYSTORE_BASE64` in GitHub einfügen. Die JKS-Datei selbst nicht hochladen und nicht ins Repository legen.

## 3. Verhalten der Release-Pipeline

- Sind **alle vier** Secrets gesetzt, baut GitHub Actions eine Release-APK mit dem dauerhaften Schlüssel.
- Fehlt mindestens eines, bleibt der Build vorerst funktionsfähig und erzeugt eine Debug-signierte APK. Diese ist installierbar, aber Updates über eine bestehende Installation sind damit nicht zuverlässig.
- Sobald die Secrets gesetzt sind, werden alle folgenden Android-Releases mit demselben Schlüssel signiert. Eine bereits installierte Debug-APK muss einmalig deinstalliert werden, bevor die erste dauerhaft signierte APK installiert wird.
- Die App lädt eine neuere APK beim Start automatisch herunter und prüft Größe sowie SHA-256-Prüfsumme. Anschließend öffnet Android den Systemdialog. Android verlangt weiterhin eine Bestätigung; eine normale App darf sich nicht selbst lautlos aktualisieren.
- Beim ersten Update kann Android einmalig die Berechtigung zum Installieren unbekannter Apps verlangen. Nach der Freigabe erneut auf Aktualisieren tippen.
- Windows Installer und Portable ZIP sind davon unabhängig.

**Wichtig:** Keystore-Datei und Passwörter unbedingt dauerhaft sichern. Niemals einen neuen Schlüssel für spätere Releases erzeugen, solange die App unter derselben Android-Paket-ID weitergeführt wird.
