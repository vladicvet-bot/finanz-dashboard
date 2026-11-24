# Finanz-Dashboard

Eine einfache Webseite für die privaten Haushaltsfinanzen. Sie läuft auf dem iPhone, dem iPad und dem PC.

Die Seite öffnet deine Excel-Datei und rechnet **alles direkt in deinem Browser** aus. Deine Daten werden **nicht hochgeladen**, an keinen Server geschickt und nie in dieses Repository gespeichert.

## Was das Dashboard zeigt

- **Kennzahlen** für den gewählten Monat: Einnahmen, Ausgaben, gesparter Betrag mit Sparquote und Kontostand am Monatsende
- **Einnahmen und Ausgaben pro Monat** als Balkendiagramm. Tippst du auf einen Monat, wird er ausgewählt.
- **Ausgaben nach Kategorie**, jeweils mit Vergleich zum Durchschnitt der letzten 3 Monate
- **Sparquote und Trend** mit gleitendem 3-Monats-Durchschnitt und deinem Ziel
- **Kontostand-Verlauf** aus der Spalte «Saldo»
- **Ausgaben nach Zahlungsmittel**, zum Beispiel Debitkarte, TWINT, Bar oder eBill
- **Hinweise bei Auffälligkeiten**:
  - Eine Kategorie liegt mehr als 30 % über ihrem Durchschnitt.
  - Die Sparquote liegt unter 10 %.
  - Es gibt eine Einzelausgabe ab CHF 500, die nicht regelmässig vorkommt (Miete zählt also nicht).
  - Du hast mehr ausgegeben als eingenommen.

  Die Grenzwerte kannst du unten auf der Seite unter «Einstellungen und Daten» ändern.
- **Buchungsliste** mit Suche

## Empfohlen: dein Finanz-Sheet als Excel

Am besten liest das Dashboard dein Finanz-Sheet (Google Sheets oder Excel) mit diesen Blättern:

| Blatt | Spalten |
|---|---|
| **Ausgaben** | Datum · Was / Geschäft · Kategorie · Betrag CHF · Konto · Zahlmittel · Notiz |
| **Einnahmen** | Datum · Was / Quelle · Art · Betrag CHF · Konto · Notiz |
| **Fixkosten** | Posten · Gruppe · Rhythmus · Betrag CHF · Pro Monat · Konto · Notiz · Über Cler · Fällig |

Aus dem Blatt **Übersicht** wird nur die Tabelle «Budget variabel» (Topf · Budget) gelesen. Alles andere, auch der «Jahresplan», berechnet das Dashboard selbst.

Damit zeigt das Dashboard zusätzlich:
- **Fixkosten nach Gruppe.** «Pro Monat» rechnet das Dashboard immer selbst aus (Betrag ÷ Teiler: monatlich 1, vierteljährlich 3, halbjährlich 6, jährlich 12, alle 3 Jahre 36). So gilt es:
  - «Einnahme» zählt als feste Einnahme, zum Beispiel der Lohn und der 13. Monatslohn.
  - «Sparen & Investieren» zählt als gespart. **Ausnahme:** Rücklagen wie Ferien oder Weiterbildung zählen nicht, weil sie später ausgegeben werden.
  - «Überweisung» ist eine Umbuchung zwischen eigenen Konten.
  - **Interne Einzahlungen:** Steht eine Überweisung (zum Beispiel Privat → Gem. Konto) beim anderen Konto nochmals als «Einnahme», erkennt das Dashboard das am gleichen Betrag und zählt sie im Total nur einmal.
  - **Planwerte** wie «Pikettdienst» zählen nicht, weil das Tatsächliche im Blatt Einnahmen steht.
  - Die Stichwörter für Rücklagen und Planwerte kannst du unter «Einstellungen und Daten» anpassen.
- **Zwei Sichten:**
  - **Alle Konten** ist der ganze Haushalt: interne Überweisungen heben sich auf, und Geschäftliches («nicht mitzählen») bleibt draussen.
  - **Ein Konto** (Topf) zeigt es wie die Tabelle «Töpfe» im Sheet: **Einnahmen · Fix & Sparen · Variabel · Übrig**.
- **Kennzahlen aus deinem Sheet**, zum Beispiel Kreditkarte Schulden oder Limite, so wie sie beim Herunterladen berechnet waren.
- **Fällige Rechnungen** der nächsten 3 Monate, gemäss der Spalte «Fällig» (zum Beispiel `Feb, Mai, Aug, Nov`).
- **Cler-Topf:** Wie viel muss monatlich einbezahlt werden, und reicht der Topf für die nächsten 12 Monate? Dafür trägst du den aktuellen Cler-Kontostand unter «Einstellungen und Daten» ein.
- **Budget variabel pro Topf** (= Konto, z.B. Privat und Gem. Konto). Das Budget liest das Dashboard aus der Tabelle «Budget variabel» (Spalten `Topf · Budget`) im Blatt **Übersicht**. Was ausgegeben wurde, rechnet es für jeden Monat selbst aus den variablen Ausgaben dieses Kontos.
- **Konto-Filter** «Alle Konten / Gem. Konto / Privat»

**So holst du die Excel-Datei:**
- **Google Sheets am PC:** Datei → Herunterladen → Microsoft Excel (.xlsx)
- **Google Sheets auf iPhone/iPad:** ⋯ → Teilen und exportieren → Kopie senden → Excel → «In Dateien sichern»
- **Excel:** die Datei direkt wählen

Das Dashboard verbindet sich bewusst **nicht** mit Google, so bleibt die Netzwerk-Sperre bestehen. Für neue Zahlen lädst du die Datei einfach erneut. Sie ersetzt die Buchungen im gleichen Zeitraum.

**Geschäftliches ausblenden:** Unter «Einstellungen und Daten → nicht mitzählen» trägst du die Kategorie oder Gruppe ein, zum Beispiel deinen Firmennamen. Diese Angabe bleibt nur auf deinem Gerät.

## Andere Formate: einfaches Haushaltsbuch

Die erste Zeile enthält diese Spaltennamen (die Reihenfolge ist egal):

| Datum | Kategorie | Beschreibung | Einnahmen (CHF) | Ausgaben (CHF) | Zahlungsmittel | Saldo |
|---|---|---|---|---|---|---|
| 01.10.2026 | Wohnen | Miete Wohnung | | 1850.00 | Dauerauftrag | 7200.00 |
| 25.10.2026 | Lohn | Nettolohn | 6420.00 | | Überweisung | 13620.00 |

- Alle Buchungen stehen auf **einem Tabellenblatt**. Es wird das erste Blatt gelesen.
- Beträge sind **positive Zahlen**: Einnahmen in die eine Spalte, Ausgaben in die andere.
- Das Datum darf als Excel-Datum oder als Text wie `24.11.2026` oder `24.11.26` eingetragen sein.
- Eine Titelzeile über der Kopfzeile und leere Zeilen stören nicht.
- **Umbuchungen** (zum Beispiel aufs oder vom Sparkonto) bekommen die Kategorie **«Umbuchung»**. Sie zählen dann nicht als Einnahme oder Ausgabe, und die Sparquote stimmt. Unter «Einstellungen und Daten» kannst du weitere Kategorien als Umbuchung festlegen, zum Beispiel `Sparkonto, Säule 3a`.
- Unterstützt werden `.xlsx` und `.csv`. Eine alte `.xls`-Datei speicherst du in Excel mit «Speichern unter» als `.xlsx`. Aus Numbers exportierst du mit «Ablage → Exportieren → Excel».

### Bank-Exporte (CSV)

Statt oder zusätzlich zum Haushaltsbuch kannst du die **CSV-Exporte deiner Bank** öffnen. Getestet ist das Format der **Raiffeisenbank** (Spalten `IBAN, Booked At, Text, Credit/Debit Amount, Balance, Valuta Date`). Andere Banken mit Datum, Text und Betrag funktionieren oft auch.

- **Mehrere Dateien** gleichzeitig wählen oder später mit «Datei hinzufügen» ergänzen. Jedes Konto wird separat geführt, der Kontostand ist die Summe aller Konten.
- **Keine Doppelten:** Lädst du einen neuen Export vom gleichen Konto, ersetzt er die alten Buchungen im selben Zeitraum.
- **Kategorien** werden aus dem Buchungstext erkannt, zum Beispiel «Migros» → Lebensmittel. Die Regeln kannst du unter «Einstellungen und Daten» anpassen. Dort siehst du auch die häufigsten Texte, die noch keine Kategorie haben.
- **Umbuchungen** zwischen deinen eigenen Konten (Sparkonto, Revolut-Aufladung, Kreditkarten-Rechnung) erkennen die Standard-Regeln als «Umbuchung». So zählt nichts doppelt.
- **Datenschutz:** Von der IBAN werden nur die letzten 4 Ziffern gespeichert, zum Beispiel «Raiffeisen ···1234».
- **Achtung:** Lade nicht dieselben Ausgaben doppelt, zum Beispiel das Haushaltsbuch **und** den Bank-Export für denselben Zeitraum. Das Dashboard warnt dich in diesem Fall.

Zum Ausprobieren gibt es **erfundene Beispieldaten** im Sheet-Format unter [`beispieldaten/beispiel-finanzen.xlsx`](beispieldaten/beispiel-finanzen.xlsx). Auf der Startseite lädst du sie mit «Beispieldaten ansehen».

## Datenschutz – so ist er umgesetzt

1. **Kein Upload.** Die Excel-Datei wird nur im Browser gelesen. Den Code dafür findest du in `js/xlsx-reader.js`. Es wird keine fremde Excel-Bibliothek verwendet.
2. **Netzwerk-Sperre.** Eine Sicherheitsregel in `index.html` (die «Content-Security-Policy») verbietet dem Browser, Verbindungen zu anderen Servern aufzubauen. Selbst ein Fehler im Code könnte so keine Daten verschicken.
3. **Keine fremden Server.** Auch die Diagramm-Bibliothek (Chart.js) liegt im Repository unter `vendor/`. Es gibt keine Schriften, kein Tracking und keine Statistik von anderen Anbietern.
4. **Keine echten Daten im Repository.** Die Datei `.gitignore` sorgt dafür, dass Git **alle** Excel-, CSV- und Numbers-Dateien ignoriert. Die einzige Ausnahme sind die Beispieldaten.
5. **Speichern nur auf deinem Gerät.** Damit du die Datei nicht jedes Mal neu wählen musst, merkt sich der Browser die Buchungen. Sie liegen nur in diesem Browser auf diesem Gerät. Auf anderen Geräten musst du die Datei einmal separat öffnen. Löschen kannst du sie jederzeit unter «Einstellungen und Daten → Daten von diesem Gerät löschen».

> **Gut zu wissen (iPhone/iPad):** Safari löscht gespeicherte Webseiten-Daten, wenn du eine Seite 7 Tage lang nicht benutzt. Fügst du die Seite zum Home-Bildschirm hinzu (siehe unten), passiert das nicht. Deine Excel-Datei selbst ist davon nie betroffen.

### Selbst nachprüfen, dass nichts hochgeladen wird

Am PC in Chrome, Edge oder Firefox:

1. Drücke `F12`, um die Entwicklerwerkzeuge zu öffnen.
2. Wähle den Tab **«Netzwerk»** (Network).
3. Öffne deine Excel-Datei.

Du siehst nur Dateien von der eigenen Seite (`.js`, `.css`, Icons) und keine Anfrage an einen anderen Server.

## Benutzen

### Auf dem iPhone oder iPad

1. Öffne die Webadresse der Seite in **Safari** (siehe «Online stellen» unten).
2. Tippe auf **«Excel-Datei wählen»** und wähle deine Datei aus der Dateien-App, aus iCloud Drive oder aus OneDrive.
3. Als App auf dem Home-Bildschirm: Tippe auf **Teilen** (Quadrat mit Pfeil), dann auf **«Zum Home-Bildschirm»**. Danach startet die Seite wie eine App und funktioniert auch ohne Internet.

### Am PC

Öffne die Webadresse im Browser und klicke auf **«Excel-Datei wählen»**.

### Daten aktualisieren

Hast du in deiner Excel neue Buchungen eingetragen, wähle die Datei einfach erneut über «Andere Datei». Die alten Daten werden dabei ersetzt.

## Online stellen (GitHub Pages)

Online gestellt wird **nur der Programmcode** dieser Seite. Deine Finanzdaten liegen nie auf GitHub.

**Wichtig:** Bei einem **privaten** Repository gibt es GitHub Pages nur mit einem kostenpflichtigen Abo (GitHub Pro). Du hast zwei Möglichkeiten:

- **A) Repository öffentlich machen** (gewählt). Das ist gratis und unbedenklich, weil darin nur Code und erfundene Beispieldaten liegen. Vorher solltest du kurz prüfen, dass wirklich keine echte Datei im Repository ist (`git ls-files` zeigt alle Dateien). Auf GitHub: **Settings → General → ganz unten «Danger Zone» → Change visibility → Make public**.
- **B) GitHub Pro abonnieren** und das Repository privat lassen. Die Webseite selbst ist auch dann öffentlich erreichbar, sie enthält aber keine Daten.

So schaltest du die Seite ein:

1. Den Code in den Branch `main` übernehmen, zum Beispiel über einen Pull Request.
2. Auf GitHub: **Settings → Pages → Source: «Deploy from a branch» → Branch `main`, Ordner `/ (root)` → Save**.
3. Nach 1–2 Minuten ist die Seite erreichbar unter: `https://<dein-github-name>.github.io/finanz-dashboard/`

## Für später: Dateien im Projekt

```
index.html                  Die Webseite (mit Netzwerk-Sperre)
css/style.css               Aussehen (hell/dunkel, iPhone/iPad/PC)
js/xlsx-reader.js           Liest Excel und CSV direkt im Browser
js/analyse.js               Erkennt Spalten/Bank-Formate, Kategorie-Regeln, rechnet Monate,
                            Sparquote, Kontostand und Warnungen aus
js/app.js                   Bedienung, Diagramme und Speichern auf dem Gerät
vendor/chart.umd.min.js     Diagramm-Bibliothek Chart.js 4.5.1 (MIT-Lizenz)
sw.js, manifest.webmanifest Offline-Funktion und «App» auf dem Home-Bildschirm
beispieldaten/              Erfundene Beispieldaten (einzige erlaubte Excel-Datei)
tools/erzeuge_beispieldaten.py  Erzeugt die Beispieldaten neu
```

Beispieldaten neu erzeugen: `pip install openpyxl` und danach `python3 tools/erzeuge_beispieldaten.py`

Nach Änderungen am Code erhöhst du in `sw.js` die Zeile `VERSION`, damit iPhone und iPad die neue Version laden.

Zum lokalen Testen am PC: Starte im Projektordner `python3 -m http.server` und öffne `http://localhost:8000`.
