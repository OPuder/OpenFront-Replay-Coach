package de.openfront.replaycoach;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        final String expectedDigest = call.getString("digest");
        final Double sizeValue = call.getDouble("size");
        final long expectedSize = sizeValue == null ? -1L : sizeValue.longValue();
        if (url == null || !url.startsWith("https://github.com/OPuder/OpenFront-Replay-Coach/releases/download/")) {
            call.reject("Ungültige Update-Quelle."); return;
        }
        if (expectedDigest == null || !expectedDigest.matches("(?i)^sha256:[a-f0-9]{64}$")) {
            call.reject("Die Release-Prüfsumme fehlt oder ist ungültig."); return;
        }
        if (expectedSize < 1 || expectedSize > 100L * 1024L * 1024L) {
            call.reject("Die APK-Größe ist ungültig oder überschreitet 100 MB."); return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            File apk = new File(getContext().getCacheDir(), "replay-coach-update.apk");
            try {
                if (!apk.isFile() || apk.length() != expectedSize || !hashFile(apk).equalsIgnoreCase(expectedDigest.substring(7))) {
                    connection = (HttpURLConnection) new URL(url).openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(90000);
                    connection.setRequestProperty("User-Agent", "OpenFront-Replay-Coach-Android");
                    connection.connect();
                    if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                        throw new IllegalStateException("APK-Download fehlgeschlagen (HTTP " + connection.getResponseCode() + ").");
                    }
                    File temp = new File(getContext().getCacheDir(), "replay-coach-update.tmp");
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    long total = 0;
                    try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temp)) {
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = input.read(buffer)) != -1) {
                            total += read;
                            if (total > expectedSize) throw new IllegalStateException("Die APK ist größer als im Release angegeben.");
                            output.write(buffer, 0, read);
                            digest.update(buffer, 0, read);
                        }
                        output.getFD().sync();
                    }
                    String actual = toHex(digest.digest());
                    if (total != expectedSize || !actual.equalsIgnoreCase(expectedDigest.substring(7))) {
                        temp.delete();
                        throw new SecurityException("Die APK-Prüfsumme stimmt nicht. Die Datei wurde verworfen.");
                    }
                    if (apk.exists() && !apk.delete()) throw new IllegalStateException("Alte Update-Datei kann nicht ersetzt werden.");
                    if (!temp.renameTo(apk)) throw new IllegalStateException("Die geprüfte APK kann nicht gespeichert werden.");
                }
                getActivity().runOnUiThread(() -> openInstaller(call, apk));
            } catch (Exception error) {
                call.reject("Android-Update fehlgeschlagen: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "ReplayCoachApkUpdater").start();
    }

    private void openInstaller(PluginCall call, File apk) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                call.reject("Bitte erlaube einmalig die Installation unbekannter Apps für OpenFront Replay Coach und tippe danach erneut auf Aktualisieren.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".updater-fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(install);
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("fileName", apk.getName());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android-Installationsdialog konnte nicht geöffnet werden: " + error.getMessage(), error);
        }
    }

    private String hashFile(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return toHex(digest.digest());
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }
}