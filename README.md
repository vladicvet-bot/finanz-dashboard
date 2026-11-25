# Finanz-Dashboard

Eine einfache Webseite für die privaten Haushaltsfinanzen. Sie läuft auf dem iPhone, dem iPad und dem PC.

Die Seite öffnet deine Excel-Datei und rechnet **alles direkt in deinem Browser** aus. Deine Daten werden **nicht hochgeladen**, an keinen Server geschickt und nie in dieses Repository gespeichert.

## Was das Dashboard zeigt

Eine Seite, die man von oben nach unten liest. Jede Karte beantwortet eine Frage:

0. **Geldfluss:** Einkommen → Konto (Privat, Gem. Konto) → wofür jedes Konto bezahlt. Daueraufträge zwischen deinen Konten werden als «Lohn → Gem. Konto» gezeigt.
1. **Wie viel besitze ich?** Nettovermögen als grosse Zahl, die Veränderung seit dem Vormonat und Balken pro Monat
2. **Wie lief dieser Monat?** Einnahmen und Ausgaben (fix und variabel) als Balken, dazu «Gespart» gross
3. **Bin ich im Budget?** ein Balken pro Topf (Privat, Gem. Konto)
4. **Wohin geht das Geld?** die grössten Kategorien und die Fixkosten als ein Balken
5. **Wo liegt mein Geld?** jedes Konto und jede Anlage, gruppiert nach Konten, Rücklage, Vorsorge, Investments, Schulden und Kinder
6. **Lohnen sich meine Investments?** pro Anlage eingezahlt gegenüber heutigem Wert, mit Gewinn oder Verlust
7. **Was muss ich beachten?** höchstens 3 Hinweise und die nächsten fälligen Rechnungen

Unter **«Mehr Details»** (zugeklappt) findest du die Monatsverläufe, die Sparquote, die Fixkosten nach Gruppe, den Cler-Topf, die Kennzahlen aus dem Sheet und alle Buchungen.

## Fixkosten – dein grösster Hebel

Oben im Reiter **«Fixkosten»** (braucht dein Finanz-Excel mit dem Blatt «Fixkosten») siehst du:
- **Fixkosten pro Monat und pro Jahr** und welchen **Anteil deines Einkommens** sie ausmachen (Durchschnitt der letzten 3 Monate). Sparen, Rücklagen und «nicht mitzählen» (z.B. Geschäftliches) sind separat ausgewiesen.
- die Aufteilung **nach Gruppe**
- **Kleine Posten:** wie viel alle Abos und alle Posten unter CHF 30 im Monat zusammen pro Jahr kosten
- **alle Posten, die teuersten zuerst**, pro Jahr gerechnet. Bei jedem Posten kannst du **«Prüfen»** oder **«Kündigen»** antippen. Oben siehst du dann sofort: *«Wenn du 2 Posten kündigst: + CHF … pro Jahr, Sparquote … → …»*. Die Markierungen bleiben nur auf deinem Gerät.
- **Kündigung bestätigen:** Nach «Kündigen» erscheint «✓ Kündigung bestätigen» mit «Gilt ab» (Monat). Ab diesem Monat zählt der Posten nicht mehr – weder bei den Fixkosten, im Geldfluss noch im Kalender. Er steht dann unter **«Gekündigt»** mit dem Betrag, den du pro Jahr sparst. Frühere Monate bleiben unverändert. «Rückgängig» holt ihn zurück.
- **Name oder Betrag ändern (✎):** z.B. nach einem Anbieterwechsel. Der Posten zeigt dann «umbenannt (Excel: …)». Dein Excel bleibt unverändert; die Änderung gilt nur auf diesem Gerät. Leer lassen = wieder der Wert aus dem Excel.
- **Konto und Bereich selbst zuordnen:** Bei jedem Posten kannst du das Konto (z.B. Privat oder Gem. Konto) und den Bereich ändern. Standard ist die Spalte «Konto» aus deinem Excel. Eigene Änderungen werden als «geändert» markiert und nur auf dem Gerät gespeichert.
- **Kalender** der nächsten 12 Monate: wann welche Jahres- und Quartalsrechnungen kommen. Dazu ein Hinweis, welche Posten noch keine Fälligkeit haben.

## Vermögen erfassen (jeden Monat am 30.)

Oben schaltest du zwischen **«Übersicht»** und **«Vermögen»** um.

**So erfasst du:**
1. Tippe in der Ansicht «Vermögen» auf **«＋ Erfassung vom 30.»**. Der Stichtag ist schon auf den 30. des laufenden Monats gesetzt (im Februar auf den letzten Tag).
2. Trag pro Konto den **Stand CHF** ein. Leere Felder bedeuten «nicht erfasst», es wird nichts geschätzt.
   - **Schulden** (Kreditkarte) darfst du positiv eintippen, sie werden negativ gespeichert.
   - **Eingezahlt CHF** gibt es nur bei Vorsorge und Investment, das Feld ist freiwillig.
   - **Fremdwährung:** den CHF-Wert eintragen, den Originalbetrag in die Notiz (z.B. `EUR 120.00`).
3. Trag die **Pikett-Entschädigung** des Monats ein: Anzahl Dienste, Betrag, ob schon auf die Kreditkarte überwiesen. Sie zählt als Einnahme des Monats.
4. Nach dem Speichern zeigt die App die neuen Zeilen **fürs Sheet** an. Mit **«Kopieren»** übernimmst du sie und fügst sie im Sheet in die Blätter «Vermögen» bzw. «Einnahmen» ein. So bleibt dein Sheet die Hauptquelle, und alle Geräte bleiben synchron.

**Regeln:**
- Neue Erfassungen werden **immer angehängt**. Gibt es für einen Stichtag und ein Konto schon einen Wert, wird er **nie überschrieben**.
- Werte aus dem Sheet und Werte aus der App werden zusammengeführt, ohne Doppelte (gleicher Stichtag + Konto).
- Das **Total** ist die Summe aller Stände: Schulden zählen negativ, Kinderkonten zählen mit und werden zusätzlich separat gezeigt («ohne Kinder»).
- **«± Vormonat»** vergleicht nur Konten, die in beiden Monaten erfasst sind. Neu erfasste Konten werden ausgewiesen, aber nicht mitgerechnet.
- Ist ein Konto an einem Stichtag nicht erfasst, verwendet das Total dessen letzten bekannten Stand. In der Tabelle ist das markiert.
- **Art selbst wählen:** In der Tabelle «Konten am Stichtag» kannst du bei jedem Konto die Art ändern (Konto, Rücklage, Vorsorge, Investment, Schulden, Kinder, Andere), falls es falsch eingeordnet ist. Die Änderung gilt für alle Monate und nur auf diesem Gerät. Neue Erfassungen und «Für Excel kopieren» verwenden schon die neue Art. Wählst du wieder die ursprüngliche Art, verschwindet die Anpassung.

**Startdaten oder Verlauf übernehmen:** Mit **«Daten einfügen»** fügst du eine Tabelle ein, eine Zeile pro Konto: `Stichtag · Konto / Anlage · Art · Stand CHF · Eingezahlt CHF · Notiz`. Die Spalten sind mit Tabulator getrennt (aus Excel/Sheets kopiert) oder mit Semikolon. Daraus lernt die App auch deine Kontenliste fürs Formular.

**Gespeichert** werden die Erfassungen nur in diesem Browser auf diesem Gerät. Kopier sie darum nach jeder Erfassung ins Sheet. Mit «Für Excel kopieren» bekommst du jederzeit alle hier erfassten Werte.

## Empfohlen: dein Finanz-Sheet als Excel

Am besten liest das Dashboard dein Finanz-Sheet (Google Sheets oder Excel) mit diesen Blättern:

| Blatt | Spalten |
|---|---|
| **Ausgaben** | Datum · Was / Geschäft · Kategorie · Betrag CHF · Konto · Zahlmittel · Notiz |
| **Einnahmen** | Datum · Was / Quelle · Art · Betrag CHF · Konto · Notiz |
| **Fixkosten** | Posten · Gruppe · Rhythmus · Betrag CHF · Pro Monat · Konto · Notiz · Über Cler · Fällig |

| **Vermögen** | Stichtag · Konto / Anlage · Art · Stand CHF · Eingezahlt CHF · Notiz |

**Blatt «Vermögen»:** Einmal im Monat, am letzten Tag des Monats, trägst du pro Konto und Anlage eine Zeile mit dem Stand ein. Das dauert etwa 5 Minuten.
- **Art:** Konto · Rücklage · Vorsorge · Investment · Schulden · Kinder
- **Schulden**, zum Beispiel die Kreditkarte, trägst du als negativen Betrag ein.
- **Eingezahlt CHF** brauchst du nur bei Vorsorge und Investments, also die Summe aller bisherigen Einzahlungen. Damit zeigt das Dashboard Gewinn oder Verlust.
- **Kinderkonten** werden separat gezeigt und zählen nicht zum Nettovermögen.
- Fehlt ein Konto in einem Monat, übernimmt das Dashboard den letzten bekannten Stand.

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
js/rechnen.js               Erkennt Spalten/Bank-Formate, Kategorie-Regeln, rechnet Monate,
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
