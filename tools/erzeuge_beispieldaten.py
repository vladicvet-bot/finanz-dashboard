"""
Erzeugt ERFUNDENE Beispieldaten für das Finanz-Dashboard – im Format
eines Finanz-Sheets mit den Blättern «Ausgaben», «Einnahmen» und «Fixkosten».

Alle Posten, Händler und Beträge sind frei erfunden.
Aufruf:  python3 tools/erzeuge_beispieldaten.py
Ergebnis: beispieldaten/beispiel-finanzen.xlsx

Benötigt: pip install openpyxl
"""

import random
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

random.seed(42)  # immer dieselben "Zufallszahlen" -> reproduzierbar

MONATE = [(2025, m) for m in range(1, 13)] + [(2026, m) for m in range(1, 12)]
LETZTER_TAG = date(2026, 11, 20)  # der aktuelle Monat ist noch nicht fertig

ZAHLMITTEL = ["Raiffeisen", "Migros Kreditkarte", "Andere", "", ""]  # oft unbekannt (leer)


def betrag(von, bis):
    return round(random.uniform(von, bis) * 20) / 20  # auf 5 Rappen gerundet


def tag(jahr, monat, t):
    return date(jahr, monat, min(t, 28))


# ---------------- Fixkosten ----------------
# Posten, Gruppe, Rhythmus, Betrag (pro Rechnung), Konto, Über Cler, Fällig
FIXKOSTEN = [
    ("Lohn netto", "Einnahme", "monatlich", 6400.00, "Privat", False, ""),
    ("13. Monatslohn", "Einnahme", "jährlich", 6400.00, "Privat", False, "Dez"),
    ("Pikettdienst (Planwert)", "Einnahme", "monatlich", 300.00, "Privat", False, ""),
    ("Einzahlung von Privat", "Einnahme", "monatlich", 1600.00, "Gem. Konto", False, ""),
    ("Einzahlung Partner/in", "Einnahme", "monatlich", 1500.00, "Gem. Konto", False, ""),
    ("Überweisung aufs Gem. Konto", "Überweisung", "monatlich", 1600.00, "Privat", False, ""),
    ("Rest aufs Rechnungskonto", "Überweisung", "monatlich", 520.00, "Privat", False, ""),
    ("Kreditkarte Rückzahlung", "Überweisung", "monatlich", 400.00, "Privat", False, ""),
    ("Säule 3a", "Sparen & Investieren", "monatlich", 300.00, "Privat", False, ""),
    ("Rücklage Ferien", "Sparen & Investieren", "monatlich", 200.00, "Privat", False, ""),
    ("Rücklage Weiterbildung", "Sparen & Investieren", "monatlich", 100.00, "Privat", False, ""),
    ("Miete", "Wohnen", "monatlich", 2100.00, "Gem. Konto", False, ""),
    ("Strom", "Wohnen", "vierteljährlich", 240.00, "Gem. Konto", True, "Jan, Apr, Jul, Okt"),
    ("Nebenkosten-Abrechnung", "Wohnen", "jährlich", 380.00, "Gem. Konto", True, "Mär"),
    ("Grundversicherung", "Krankenkasse", "monatlich", 398.50, "Privat", False, ""),
    ("Zusatzversicherung", "Krankenkasse", "jährlich", 620.00, "Privat", True, "Jan"),
    ("Zahnkontrolle", "Gesundheit", "jährlich", 180.00, "Privat", True, ""),
    ("Handy-Abo", "Telefon & Abos", "monatlich", 29.90, "Privat", False, ""),
    ("Internet & TV", "Telefon & Abos", "monatlich", 69.00, "Gem. Konto", False, ""),
    ("Streaming", "Telefon & Abos", "monatlich", 22.90, "Privat", False, ""),
    ("Autoversicherung", "Auto & Mobilität", "jährlich", 980.00, "Privat", True, "Mai"),
    ("Verkehrssteuer", "Auto & Mobilität", "jährlich", 420.00, "Privat", True, "Feb"),
    ("Autoservice", "Auto & Mobilität", "jährlich", 650.00, "Privat", True, "Okt"),
    ("Fahrzeugprüfung", "Auto & Mobilität", "alle 3 Jahre", 300.00, "Privat", True, "Sep"),
    ("Hausratversicherung", "Versicherungen & Gebühren", "jährlich", 310.00, "Gem. Konto", True, "Apr"),
    ("Kontoführung", "Versicherungen & Gebühren", "vierteljährlich", 15.00, "Privat", False, "Mär, Jun, Sep, Dez"),
    ("Vereinsbeitrag", "Vereine & Diverses", "jährlich", 180.00, "Privat", True, "Mär"),
    ("Steuern (Raten)", "Steuern", "vierteljährlich", 1450.00, "Gem. Konto", True, "Feb, Mai, Aug, Nov"),
]
TEILER = {"monatlich": 1, "vierteljährlich": 3, "halbjährlich": 6, "jährlich": 12, "alle 3 Jahre": 36}

# ---------------- Variable Ausgaben ----------------
# Kategorie, Geschäfte, Anzahl/Monat, Betrag von–bis, Konto
VARIABEL = [
    ("Lebensmittel", ["Migros", "Coop", "Lidl", "Denner", "Bäckerei", "Dorfladen"], (9, 13), 12, 140, "Gem. Konto"),
    ("Auswärts & Kaffee", ["Café", "Restaurant", "Kantine", "Take-away", "Pizzeria"], (4, 8), 6, 75, "Privat"),
    ("Auto & Parkplatz", ["Tankstelle", "Parkhaus", "Waschanlage", "ÖV-Billett"], (2, 4), 4, 95, "Privat"),
    ("Kleider & Coiffeur", ["Coiffeur", "Kleidergeschäft", "Sportgeschäft"], (0, 2), 35, 160, "Privat"),
    ("Gesundheit & Apotheke", ["Apotheke", "Drogerie"], (0, 2), 9, 70, "Privat"),
    ("Freizeit & Geschenke", ["Kino", "Bergbahn", "Buchhandlung", "Geschenk", "Konzert"], (1, 3), 15, 130, "Privat"),
    ("Haushalt & Diverses", ["Baumarkt", "Möbelhaus", "Online-Bestellung", "Ökihof"], (1, 3), 10, 120, "Gem. Konto"),
]

ausgaben = []   # (datum, was, kategorie, betrag, konto, zahlmittel, notiz)
einnahmen = []  # (datum, was, art, betrag, konto, notiz)

for jahr, monat in MONATE:
    for kat, orte, (n_min, n_max), von, bis, konto in VARIABEL:
        for _ in range(random.randint(n_min, n_max)):
            d = tag(jahr, monat, random.randint(1, 28))
            if d > LETZTER_TAG:
                continue
            ausgaben.append((d, random.choice(orte), kat, betrag(von, bis), konto, random.choice(ZAHLMITTEL), ""))

    if (jahr, monat) in [(2025, 7), (2026, 7)]:
        ausgaben.append((tag(jahr, monat, 12), "Ferienwohnung", "Freizeit & Geschenke", 1240.00, "Gem. Konto", "Migros Kreditkarte", ""))
    if monat == 12:
        ausgaben.append((tag(jahr, monat, 18), "Weihnachtsgeschenke", "Freizeit & Geschenke", betrag(250, 400), "Privat", "Raiffeisen", ""))

    # ABSICHTLICHE AUFFÄLLIGKEITEN im Oktober 2026 (zum Testen der Warnungen)
    if (jahr, monat) == (2026, 10):
        ausgaben.append((tag(jahr, monat, 9), "Städtereise Hotel", "Freizeit & Geschenke", 865.40, "Privat", "Migros Kreditkarte", "EUR 912.00"))
        ausgaben.append((tag(jahr, monat, 21), "Möbelhaus Sofa", "Haushalt & Diverses", 720.00, "Gem. Konto", "Raiffeisen", ""))
        for d, was, b in [(3, "Restaurant", 92.50), (14, "Geburtstagsessen", 168.00), (25, "Brunch", 64.00)]:
            ausgaben.append((tag(jahr, monat, d), was, "Auswärts & Kaffee", b, "Privat", "Raiffeisen", ""))

    # Einnahmen (der Lohn steht bei den Fixkosten)
    if random.random() < 0.8 and tag(jahr, monat, 26) <= LETZTER_TAG:
        einnahmen.append((tag(jahr, monat, 26), "Pikett-Entschädigung", "Pikett", betrag(180, 520), "Privat", ""))
    if monat in (3, 9) and tag(jahr, monat, 14) <= LETZTER_TAG:
        einnahmen.append((tag(jahr, monat, 14), "Krankenkasse", "Rückerstattung", betrag(60, 240), "Privat", ""))
    if (jahr, monat) == (2026, 5):
        einnahmen.append((tag(jahr, monat, 8), "Verkauf Velo", "Andere", 350.00, "Privat", ""))

ausgaben.sort(key=lambda r: r[0])
# Wie im echten Sheet: nicht ganz sortiert (ältere Einträge später unten angehängt)
nachtraege = [ausgaben.pop(random.randrange(len(ausgaben))) for _ in range(25)]
ausgaben.extend(nachtraege)
einnahmen.sort(key=lambda r: r[0])

# ---------------- Excel schreiben ----------------
KOPF_STIL = (Font(bold=True), PatternFill("solid", fgColor="DDEBF7"))


def kopf(ws, spalten, breiten):
    ws.append(spalten)
    for z in ws[1]:
        z.font, z.fill = KOPF_STIL
    for i, b in enumerate(breiten):
        ws.column_dimensions[chr(65 + i)].width = b
    ws.freeze_panes = "A2"


wb = Workbook()
ue = wb.active
ue.title = "Übersicht"
# Aufbau wie im Finanz-Sheet: Spalte A leer, alles ab Spalte B.
# Das Dashboard liest daraus «Budget variabel» (Zeile 8–11) und die Kennzahlen (Zeile 18–33).
def setze(zeile, spalte, wert):
    ue.cell(zeile, spalte, wert)

setze(4, 2, "Monat"); setze(4, 3, date(2026, 11, 1)); ue.cell(4, 3).number_format = "mmmm yyyy"
setze(7, 2, "Budget variabel – gewählter Monat")
for i, t in enumerate(["Topf", "Budget", "Ausgegeben", "Übrig"]):
    setze(8, 2 + i, t)
setze(9, 2, "Gem. Konto"); setze(9, 3, 1300.00)
setze(10, 2, "Privat"); setze(10, 3, 1200.00)
setze(11, 2, "Total"); setze(11, 3, 2500.00)
setze(13, 2, "Töpfe – gewählter Monat")
for i, t in enumerate(["Topf", "Einnahmen", "Fix & Sparen", "Variabel", "Übrig"]):
    setze(14, 2 + i, t)
setze(15, 2, "Gem. Konto"); setze(15, 3, 3100.00); setze(15, 6, 120.00)
setze(16, 2, "Privat"); setze(16, 3, 7240.00); setze(16, 6, 310.00)
kennzahlen = [("Einnahmen total", 8740.00), ("Fixkosten total", 5320.00), ("Variabel total", 1850.00),
              ("Übrig total", 430.00), ("Sparquote", 0.12), ("Dauerauftrag Rechnungskonto Gem.", 400.00),
              ("Rücklagen pro Monat", 300.00), ("Säule 3a pro Monat", 300.00), ("Dauerauftrag Rechnungskonto Privat", 520.00),
              ("Fixkosten pro Tag", 177.33), None, ("Kreditkarte Schulden", 640.00), ("Kreditkarte Limite", 5000.00),
              ("Offene Rechnungen", 0.00), ("Budget übrig", 380.00), ("Tage bis Monatsende", 10)]
for i, k in enumerate(kennzahlen):
    if k:
        setze(18 + i, 2, k[0]); setze(18 + i, 6, k[1])
for i, t in enumerate(["Kategorie", "Ausgegeben", "Anteil"]):
    setze(36, 2 + i, t)
setze(46, 2, "Total")
for z in (7, 8, 13, 14, 36):
    ue.cell(z, 2).font = Font(bold=True)

ws = wb.create_sheet("Ausgaben")
kopf(ws, ["Datum", "Was / Geschäft", "Kategorie", "Betrag CHF", "Konto", "Zahlmittel", "Notiz"], (12, 26, 22, 12, 12, 20, 16))
for r in ausgaben:
    ws.append(list(r))
    ws.cell(ws.max_row, 1).number_format = "dd.mm.yyyy"
    ws.cell(ws.max_row, 4).number_format = "#,##0.00"

ws = wb.create_sheet("Fixkosten")
kopf(ws, ["Posten", "Gruppe", "Rhythmus", "Betrag CHF", "Pro Monat", "Konto", "Notiz", "Über Cler", "Fällig"],
     (28, 26, 16, 12, 12, 12, 14, 10, 20))
for posten, gruppe, rhythmus, b, konto, cler, faellig in FIXKOSTEN:
    zeile = ws.max_row + 1
    # «Pro Monat» als Formel – so testen wir, dass das Dashboard selbst rechnet
    ws.append([posten, gruppe, rhythmus, b, f"=ROUND(D{zeile}/{TEILER[rhythmus]},2)", konto, "", cler, faellig])
    ws.cell(ws.max_row, 4).number_format = "#,##0.00"
    ws.cell(ws.max_row, 5).number_format = "#,##0.00"

ws = wb.create_sheet("Einnahmen")
kopf(ws, ["Datum", "Was / Quelle", "Art", "Betrag CHF", "Konto", "Notiz"], (12, 26, 16, 12, 12, 16))
for r in einnahmen:
    ws.append(list(r))
    ws.cell(ws.max_row, 1).number_format = "dd.mm.yyyy"
    ws.cell(ws.max_row, 4).number_format = "#,##0.00"

jp = wb.create_sheet("Jahresplan")
jp.append(["Jahresplan – wird im Sheet berechnet (für das Dashboard nicht nötig)"])

ziel = Path(__file__).resolve().parent.parent / "beispieldaten" / "beispiel-finanzen.xlsx"
ziel.parent.mkdir(exist_ok=True)
wb.save(ziel)
print(f"{len(ausgaben)} Ausgaben, {len(einnahmen)} Einnahmen, {len(FIXKOSTEN)} Fixkosten -> {ziel}")
