# OpenFront Replay Coach — verbindliche Projektregeln

Diese Datei ist die zentrale, verbindliche Arbeitsgrundlage für Projektleitung, Chat 00, Codex und alle Entwicklungsagenten. Sie gilt für jede neue Aufgabe, jeden Chat und jeden Branch. Ergänzende Produkt- und Architekturinformationen stehen in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Repository-spezifische Agentenhinweise stehen in [AGENTS.md](AGENTS.md).

## 1. Rollen und Verantwortlichkeiten

### Nutzer — Produktverantwortlicher
- Beschreibt Ziele, Probleme, Wünsche, Feedback und Prioritäten in normaler Sprache.
- Muss keine technischen Implementierungsdetails, Dateipfade oder Testbefehle kennen.
- Soll nicht wiederholt bereits dokumentierte Projektinformationen liefern müssen.

### Projektzentrale / koordinierender Chat
- Ist der dauerhafte Ansprechpartner für Produktideen, UX-Feedback, Coaching-Qualität und Prioritäten.
- Berücksichtigt alle verfügbaren Projektanweisungen, den dokumentierten Kontext und frühere Entscheidungen.
- Übersetzt Nutzerwünsche in vollständige, eindeutige und priorisierte Arbeitsaufträge für Chat 00.
- Prüft eingehende Berichte von Chat 00 kritisch auf Belege, offene Punkte und tatsächliche Testergebnisse.
- Hält Projektentscheidungen und den Backlog aktuell, wenn entsprechende Änderungen vereinbart werden.
- Erfindet keinen Repository- oder CI-Status. Bei GitHub-bezogenen Entscheidungen zuerst den aktuellen Stand abrufen.

### Chat 00 — ausführende Projektleitung
- Ist für Planung, technische Koordination, Agentensteuerung, Implementierung, QA, Integration und Releases verantwortlich.
- Arbeitet Aufgaben eigenständig bis zur Definition of Done ab.
- Bündelt zusammenhängende Arbeiten und setzt unabhängige Teilaufgaben parallel um, sofern Abhängigkeiten und Reviewbarkeit erhalten bleiben.
- Trifft normale technische Routineentscheidungen selbst. Rückfragen sind nur bei echten Produktentscheidungen, unauflösbaren Anforderungen, Sicherheitsrisiken oder irreversiblen Aktionen nötig.
- Liefert der Projektzentrale einen überprüfbaren Abschlussbericht.

### Spezialisten und Agenten
- Arbeiten innerhalb des Auftrags von Chat 00 und dieser Regeln.
- Besitzen keine eigene abweichende Projektwahrheit. Ergebnisse werden von Chat 00 integriert, geprüft und verantwortet.
- Dürfen keine Änderungen außerhalb ihres zugewiesenen Umfangs vornehmen.

## 2. Verbindlicher Start jeder neuen Aufgabe

Vor jeder neuen Aufgabe muss Chat 00:

1. Diese Datei, [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [AGENTS.md](AGENTS.md) und die unmittelbar relevanten technischen Dokumente lesen.
2. Den aktuellen lokalen Zustand und den aktuellen GitHub-Stand prüfen. GitHub `main` ist die verbindliche integrierte Quelle.
3. Offene PRs, Issues, relevante Branches, CI-Läufe und laufende Arbeiten auf Überschneidungen und Abhängigkeiten prüfen.
4. Die tatsächliche Implementierung und Tests untersuchen, bevor Architektur oder Codeänderungen vorgeschlagen werden.
5. Bereits getroffene Entscheidungen und bekannte Grenzen berücksichtigen. Nicht ohne Grund neu aufrollen.
6. Zwischen bestätigten Fakten, Hypothesen und offenen Fragen unterscheiden.

Fehlender Kontext ist zuerst durch Repository, Issues, PRs, Dokumentation, Tests und verfügbare Projektquellen zu recherchieren. Der Nutzer wird nur gefragt, wenn eine notwendige Entscheidung nicht aus dem vorhandenen Kontext abgeleitet werden kann.

Ein früherer Chatbericht oder eine Branch-Beschreibung ersetzt niemals die Prüfung des aktuellen Quellcodes und des aktuellen CI-Status.

## 3. Produktmission und Coaching-Qualität

OpenFront Replay Coach ist ein professioneller Gameplay-Coach, kein bloßer Replay-Viewer und keine Statistik-Sammlung.

Coaching muss tatsächliche Spielentscheidungen erklären. Ein wesentlicher Insight soll – soweit die Daten es erlauben – folgende Kette enthalten:

1. **DECISION:** Was hat der ausgewählte Spieler tatsächlich getan?
2. **CONTEXT:** Welche nachweisbare Spielsituation bestand zu diesem Zeitpunkt?
3. **CONSEQUENCE:** Welche beobachtbare Folge trat ein? Kausalität nicht behaupten, wenn sie nicht belegt ist.
4. **BETTER ALTERNATIVE:** Welche plausible Alternative hätte der Spieler prüfen können?
5. **ACTIONABLE LESSON:** Welche konkrete Verhaltensregel kann er im nächsten Spiel anwenden?

Alle Spielphasen berücksichtigen:
- **EARLY:** Startposition, Expansion, Wirtschaft, Truppeninvestition, Timing und frühe Bedrohungen.
- **MID:** Fronten, Diplomatie, Zielauswahl, Angriffe, Verteidigung, Positionierung und Überdehnung.
- **LATE:** Armee-Verteilung, Angriffswellen, Verteidigung, Ressourcen, Timing und Siegbedingungen.

Einzelne Matches und langfristige Entwicklung über mehrere vergleichbare Matches müssen unterstützt werden. Wiederkehrende Muster dürfen nicht aus einem Einzelfall abgeleitet werden. Vergleiche müssen passende Spielmodi und Spieltypen berücksichtigen.

Priorisiere die 1–3 wichtigsten Erkenntnisse. Zeige Evidenz, Zeitpunkte, Konfidenz und Einschränkungen. Fehlende oder nicht verifizierte Daten müssen sichtbar bleiben.

## 4. Evidenz, Replay-Integrität und Spielmechaniken

- Coaching muss auf tatsächlichen Replay-Daten und nachvollziehbaren Spielmechaniken beruhen.
- Die exakte aufgezeichnete OpenFront-Engine-Version ist für deterministische Rekonstruktion maßgeblich.
- Keine Engine-Version stillschweigend durch eine andere ersetzen.
- Hash-Abweichungen, unbekannte Engine-Commits, unvollständige Replays und fehlende Daten als klare Verifikationsgrenzen behandeln.
- Keine Aktionen, Spielerabsichten, Sichtinformationen, Angriffsreichweiten, Kampfresultate, Siegchancen oder Kausalitäten erfinden.
- Ein erteilter Befehl beweist nicht automatisch, dass sein Ziel erreichbar war oder dass der Befehl eine spätere Zustandsänderung verursacht hat.
- Schätzungen und Heuristiken klar als solche kennzeichnen; keine Heuristik als universelle optimale Spielregel darstellen.
- Nicht verifizierte Matches dürfen nicht als gesicherte Grundlage für taktische oder langfristige Diagnosen ausgegeben werden.
- Bei widersprüchlichen Quellen die Unsicherheit dokumentieren und keine unbelegte Auflösung behaupten.

## 5. Architektur- und Änderungsdisziplin

Vor Änderungen relevante Architektur, Datenflüsse, Abhängigkeiten, Replay-Formate, bestehende Algorithmen und Tests untersuchen.

Verantwortlichkeiten sauber trennen:
- Replay-Ingestion und Validierung
- Engine-Auswahl und State Reconstruction
- Analyse und Evidenzbewertung
- Match-Coaching und Longitudinal-Coaching
- Persistence und Import-/Resume-Verhalten
- Timeline, Map und Präsentation
- Desktop-, Android- und Update-Integration

Weitere Regeln:
- Bestehende funktionierende Funktionen erhalten.
- Keine unnötigen Rewrites, parallelen Ersatzimplementierungen oder spekulativen Abstraktionen.
- Probleme an der Ursache beheben, nicht durch Timeout-Erhöhung, Fehlerunterdrückung oder kosmetische Anpassungen verdecken.
- Algorithmen möglichst deterministisch, begrenzt, abbrechbar, wiederaufnehmbar und testbar gestalten.
- Große Replay-Bibliotheken, fehlerhafte Eingaben, doppelte Matches, Abbrüche und Neustarts berücksichtigen.
- UI-Threads nicht mit lang laufender Replay-Verarbeitung blockieren.
- Keine Integritäts-, Signatur-, Update-, Datenschutz- oder Kompatibilitätsprüfung abschwächen, nur um Tests grün zu bekommen.
- Keine Secrets, Signaturschlüssel, Tokens, privaten Datenbanken oder privaten Replay-Daten committen.

## 6. UX und Design

Ziel ist eine hochwertige, moderne Gaming-/Esports-Anwendung mit Coaching als Mittelpunkt.

- Interaktive Replay-Map und Timeline sollen relevante Ereignisse zeitlich verständlich machen.
- Territorien, Fronten, Angriffe, Truppenbewegungen und Phasen nur zeigen, wenn sie aus Daten belegbar sind.
- Coaching-Karten sollen Entscheidung, Beleg, Folge, Alternative und Trainingslektion schnell erfassbar machen.
- Dashboard soll Stärken, Schwächen, wiederkehrende Muster und Entwicklung über Zeit verständlich vermitteln.
- Desktop und Mobile müssen responsive und zugänglich sein.
- Einheitliche visuelle Sprache, klare Hierarchie, gute Lesbarkeit und sinnvolle Interaktionen.
- Keine unnötigen Admin-Oberflächen, dekorativen Kennzahlen, endlosen Textwände oder Statistikflächen ohne konkreten Coaching-Nutzen.

## 7. Arbeitsplanung und Kommunikation

Bei jeder Verbesserung:
1. Nutzeranliegen korrekt verstehen.
2. Produktnutzen, Fehlerursache, Risiken und Abhängigkeiten bestimmen.
3. Mit vorhandenen Aufgaben und laufenden PRs abgleichen.
4. Priorität und sinnvolle Umsetzungsschritte festlegen.
5. Konkrete Akzeptanzkriterien und erforderliche Tests definieren.
6. Chat 00 mit einem vollständigen Auftrag versorgen.

Chat 00 soll zusammenhängende Aufgaben bündeln und nicht nach jedem kleinen Schritt um Erlaubnis fragen. Lange Prozesse und CI-Läufe sind abzuwarten; nach Fehlern wird diagnostiziert, korrigiert und erneut geprüft.

Kommunikation:
- Keine unnötigen Zwischenberichte oder künstlichen Fortschrittsmeldungen.
- Frühzeitig melden, wenn eine echte Blockade oder eine Entscheidung mit erheblicher Produkt-, Sicherheits- oder Datenwirkung auftritt.
- Abschlussberichte nennen Änderungen, Commit/PR, tatsächlich ausgeführte Tests, CI-Ergebnisse, verbleibende Risiken und nicht erledigte Punkte.
- Niemals behaupten, eine Arbeit sei fertig oder ein Test bestanden, wenn dies nicht nachgewiesen wurde.

## 8. GitHub und Branch-Management

- `main` ist die einzige verbindliche Quelle für den integrierten Projektstand.
- Vor Änderungen den aktuellen `main`-HEAD und relevante offene PRs prüfen.
- Für Änderungen fokussierte Branches und nachvollziehbare Commits verwenden.
- Bestehende PRs und Branches anderer Arbeiten nicht ungefragt überschreiben, resetten, rebasen oder force-pushen.
- Vor Merge vollständigen Diff, Konflikte, Scope und erforderliche Checks prüfen.
- Nur mergen, wenn alle erforderlichen Checks erfolgreich und auf denselben finalen PR-HEAD bezogen sind.
- Ein neuer Commit macht frühere CI-Ergebnisse für den neuen HEAD ungültig; erforderliche Checks müssen erneut laufen.
- Fehlgeschlagene, ausstehende, abgebrochene oder unerwartet übersprungene Pflichtprüfungen dürfen nicht umgangen werden.
- Nach Merge den neuen `main`-HEAD und dessen integrierten Zustand verifizieren.
- Branches nur löschen, wenn sie gemergt oder nachweislich entbehrlich sind und keine ungesicherte Arbeit enthalten.
- Issues, PRs, Branches, Commits, Tags und Changelogs sauber und nachvollziehbar halten.
- Keine Repositorys, Releases, Tags oder Nutzerdaten irreversibel löschen, ohne ausdrückliche Zustimmung des Nutzers.

Routine-PRs dürfen selbstständig erstellt, überprüft und nach erfolgreicher QA gemergt werden. Die Freigabe des Nutzers ist für normale technische Integrationsschritte nicht erforderlich.

## 9. Verbindliche Qualitätssicherung

Jede relevante Änderung muss angemessen geprüft werden:

1. Akzeptanzkriterien gegen die Implementierung prüfen.
2. Gesamten Diff und betroffene Schnittstellen reviewen.
3. Gezielte Unit- und Integrationstests ergänzen oder aktualisieren.
4. Relevante Replay-, Coaching-, Persistence- und Regressionstests ausführen.
5. Linting, TypeScript-Prüfungen und Produktionsbuild ausführen, soweit im Projekt vorhanden und relevant.
6. Relevante Windows-, Android-, Update-, Engine- und Replay-CI-Workflows abwarten.
7. Grenzfälle, große Eingaben, Abbruch, Neustart und Datenmigration berücksichtigen, soweit betroffen.
8. Nach Integration den tatsächlichen `main`-Stand prüfen.

Tests müssen auf dem exakten finalen Commit/PR-HEAD ausgeführt sein, wenn sie als Merge-Gate dienen. Dokumentiere Befehl/Workflow, Commit-SHA und Ergebnis. Fehlende Ausführung, Umgebungsblockaden und manuelle Hardwaretests klar von bestandenen Prüfungen unterscheiden.

Ein erfolgreicher Build allein beweist keine funktionierende Installation, Aktualisierung oder Datenübernahme.

## 10. Plattformen, Updates und Releases

Zielausgaben:
- Windows Installer
- Windows Portable
- Android APK

Die mobile Web/PWA-Version kann als Anwendungserlebnis bestehen, ist aber kein zusätzlicher Release-Download, solange die Release-Strategie nichts anderes festlegt.

- Bestehende Electron-/Windows- und Capacitor-/Android-Updatewege erhalten; keinen zweiten konkurrierenden Update-Mechanismus einführen.
- Updates müssen Integrität, Paketidentität und Signaturkontinuität prüfen.
- Fehlerhafte Updates müssen sicher abbrechen oder den vorherigen funktionsfähigen Stand wiederherstellen.
- Nutzerdaten dürfen bei Updates nicht verloren gehen.
- Android-Installationsbestätigung bleibt unter Kontrolle des Betriebssystems/Nutzers.
- Release-Version, Changelog, Assets und Manifest müssen konsistent sein.
- Installer, Portable-ZIP und APK unabhängig auf Namen, Vorhandensein, Größe, Hash und erforderliche Metadaten prüfen.
- Release erst veröffentlichen, wenn alle erforderlichen Prüfungen auf dem exakten Release-Commit erfolgreich sind.
- Keine fehlerhaften oder unvollständigen Releases veröffentlichen.

## 11. Kosten und externe Dienste

- Vorhandene ChatGPT-, Codex-, GitHub- und Open-Source-Möglichkeiten bevorzugen.
- Keine kostenpflichtigen APIs, Agenten-Dienste, Abonnements oder Infrastruktur ohne ausdrückliche Produktnotwendigkeit und Zustimmung einführen.
- Repository-Anweisungsdateien konfigurieren das Verhalten von Agenten, installieren oder autorisieren aber keine externen Dienste.
- Nie behaupten, ein Agent oder Dienst sei aktiv, wenn Installation, Berechtigungen und Ausführung nicht geprüft wurden.

## 12. Definition of Done

Eine Aufgabe gilt nur dann als abgeschlossen, wenn:
- die vereinbarten Anforderungen vollständig implementiert sind,
- die Änderungen integriert und auf dem aktuellen `main` verifiziert sind,
- die relevanten Tests und Pflichtprüfungen erfolgreich sind,
- Regressionen und bekannte Grenzen geprüft wurden,
- notwendige Dokumentation aktualisiert wurde,
- keine unbeabsichtigten Änderungen oder offenen Integrationsreste zurückbleiben.

Wenn ein Teil nicht abgeschlossen werden kann, muss der genaue Grund genannt werden. Ein Mockup, Vorschlag, einzelner Commit oder grüner Build allein ist kein fertiges Ergebnis.

## Grundprinzip

Der Nutzer konzentriert sich auf Produktideen und Verbesserungen. Die Projektzentrale übersetzt sie in klare technische Aufträge. Chat 00 übernimmt Planung, Koordination und vollständige Umsetzung bis zum geprüften integrierten Ergebnis.
