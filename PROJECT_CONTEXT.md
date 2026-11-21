# OpenFront Replay Coach — Projektkontext

Dieses Dokument hält den dauerhaften Produkt- und Architekturkontext fest. Es ist bewusst keine Momentaufnahme offener PRs oder Branches: deren Status muss bei jeder Aufgabe live in GitHub geprüft werden.

## Produkt

OpenFront Replay Coach analysiert OpenFront-Spielaufzeichnungen und erstellt spielerbezogene Match-Reviews sowie langfristige Coaching-Auswertungen. Zielplattformen sind Windows Desktop und Android; eine mobile Web/PWA-Erfahrung gehört zum Produkt, ist aber nicht als vierter Release-Download vorgesehen.

Der Nutzen liegt darin, nachvollziehbar zu erklären:
- welche Entscheidung der ausgewählte Spieler getroffen hat,
- welche Spielsituation durch die Replay-Daten belegt ist,
- welche Folgen beobachtet wurden,
- welche alternative Entscheidung plausibel gewesen wäre,
- welche konkrete Lektion sich daraus ergibt.

Die Anwendung muss verifizierte Fakten, Beobachtungen, Heuristiken und Unsicherheit sichtbar unterscheiden.

## Produktfunktionen und UX-Schwerpunkte

- Import und Verarbeitung unterstützter OpenFront-Replays sowie Spieler-/Match-Historie.
- Rekonstruktion des Spielverlaufs mit der passenden originalen OpenFront-Engine.
- Spielerbezogene Match-Coaching-Berichte und Timeline.
- Langfristige Analyse vergleichbarer Matches und wiederkehrender Muster.
- Visualisierung von Spielzuständen, Territorien, Fronten und Ereignissen, soweit durch Engine-/Replay-Daten belegt.
- Lokale Speicherung der Match- und Analyseergebnisse.
- Update Center für die unterstützten Desktop- und Android-Ausgaben.

Coaching hat Vorrang vor Rohstatistiken. Die wichtigsten Erkenntnisse sollen schnell erkennbar und mit Zeitpunkten und Evidenz nachvollziehbar sein.

## Technische Leitplanken aus dem aktuellen Repository

### Engine und Replay-Verarbeitung
- Unterstützte Replay-Aufzeichnungen werden mit exakt passenden OpenFront-Engine-Revisionen rekonstruiert.
- Die Engine-Auswahl erfolgt über den aufgezeichneten vollständigen `gitCommit`; es darf keinen stillen Fallback auf eine andere Version geben.
- Die Engine-Integration und ihre vorbereiteten Revisionen sind in `ENGINE_INTEGRATION.md` und `engine-build/engines.json` dokumentiert.
- Hash-Abweichungen sind eine harte Verifikationsgrenze. Daten hinter der ersten Abweichung dürfen nicht als verifizierter Spielverlauf behandelt werden.
- Engine-Snapshots und Replay-Intents sind die Evidenzgrundlage für Coach-Auswertungen; aus Aggregaten dürfen keine nicht belegten Tile-Owner, Routen oder Kampfursachen abgeleitet werden.

### Analyse und Coaching
- Coaching muss auf den ausgewählten Spieler bezogen sein.
- Longitudinal-Vergleiche müssen vergleichbare Spielmodi und Spieltypen isolieren.
- Wiederkehrende Muster benötigen mehrere passende, verifizierte Matches.
- Aktuelle Grenzen und Heuristiken müssen in den passenden technischen Dokumenten transparent bleiben.
- Fachliche Anforderungen an handlungsorientierte Berichte sind in `docs/ACTIONABLE_COACHING.md` beschrieben.

### Speicherung und Verarbeitung
- Match-/Replay-Daten und Analysen werden lokal in den vorhandenen Persistenzmechanismen verwaltet, insbesondere IndexedDB im Renderer.
- Import und Batch-Analyse sollen isoliert, abbrechbar, wiederaufnehmbar und idempotent sein.
- Änderungen an Persistenzschema oder Migration müssen bestehende Nutzerdaten erhalten.

### Plattformen und Updates
- Windows basiert auf Electron und stellt Installer sowie Portable-Paket bereit.
- Android basiert auf Capacitor und wird als APK ausgeliefert.
- Die Update-Mechanismen der Plattformen sind bestehende, getrennte Integrationen. Sie dürfen nicht durch einen konkurrierenden zweiten Update-Stack ersetzt werden.
- Sicherheitsprüfungen, SHA-256-Integrität, Paketidentität und Android-Signaturkontinuität sind zwingend.
- Der Release-Prozess ist auf Windows Installer, Windows Portable ZIP und Android APK ausgerichtet.
- Details stehen in `docs/AUTO_UPDATES.md`, `docs/ANDROID_SIGNING.md` und `docs/QUALITY_ASSURANCE.md`.

## CI und Qualitätssicherung

Die relevanten Workflow-Dateien liegen unter `.github/workflows/`, aktuell unter anderem:
- `build-windows.yml`
- `validate-android.yml`
- `replay-compatibility.yml`
- `validate-engine.yml`
- `update-validation.yml`
- `integration-e2e.yml`
- `release-on-main.yml`

Welche Workflows für eine Änderung verpflichtend sind, ist anhand der aktuellen Workflow-Konfiguration, Branch-/PR-Checks und Änderungsauswirkung zu bestimmen. Dateinamen allein beweisen keinen erfolgreichen Lauf.

Weitere Verträge und Testgrenzen sind in `docs/QUALITY_ASSURANCE.md` und `docs/INTEGRATION_E2E.md` beschrieben.

## Arbeitsweise mit mehreren Chats und Agenten

- Dieser Kontext ist die gemeinsame Ausgangsbasis für alle Projekt-Chats.
- Der koordinierende Chat sammelt Produktfeedback und erzeugt vollständige Aufträge für Chat 00.
- Chat 00 prüft den aktuellen Repository-Stand und koordiniert Spezialisten/Agenten.
- Spezialisten liefern begrenzte, überprüfbare Ergebnisse; Chat 00 verantwortet die Integration.
- Der Nutzer muss technische Details nicht wiederholen oder selbst in Dateipfade und Testpläne übersetzen.

## Dynamische Informationen

Folgende Informationen sind absichtlich nicht dauerhaft hier festgeschrieben, weil sie sich ständig ändern:
- aktueller `main`-Commit,
- offene/geschlossene PRs und Issues,
- aktive Branches und parallele Agentenarbeiten,
- CI- und Release-Status,
- aktuell bestätigte Fehler und Prioritäten.

Diese Informationen sind vor jeder darauf aufbauenden Entscheidung direkt aus GitHub und dem aktuellen Arbeitsverzeichnis abzurufen. Alte Chatberichte sind nur Hinweise, keine aktuelle Statusquelle.

## Maßgebliche Dokumente

- `PROJECT_RULES.md` — verbindliche Regeln für Zusammenarbeit, Entwicklung, GitHub, QA und Releases.
- `AGENTS.md` — kurze Einstiegsvorgaben für Codex und andere Coding-Agenten.
- `ENGINE_INTEGRATION.md` — Engine-/Replay-Vertrag.
- `docs/ACTIONABLE_COACHING.md` — Evidenz- und Coaching-Anforderungen.
- `docs/QUALITY_ASSURANCE.md` — QA- und Release-Gates.
- `docs/INTEGRATION_E2E.md` — Cross-Modul- und E2E-Verträge.
