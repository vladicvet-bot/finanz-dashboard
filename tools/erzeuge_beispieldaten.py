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

ZAHLMITTEL = ["Raiffeisen", "Migros Kreditkarte", "Andere", ""]


def betrag(von, bis):
    return round(random.uniform(von, bis) * 20) / 20  # auf 5 Rappen gerundet


def tag(jahr, monat, t):
    return date(jahr, monat, min(t, 28))


# ---------------- Fixkosten ----------------
# Posten, Gruppe, Rhythmus, Betrag, Konto, Über Cler, Fällig
FIXKOSTEN = [
    ("Lohn netto", "Einnahme", "monatlich", 6400.00, "Privat", "nein", ""),
    ("Dauerauftrag ans Gem. Konto", "Überweisung", "monatlich", 1600.00, "Privat", "nein", ""),
    ("Dauerauftrag Rechnungstopf", "Überweisung", "monatlich", 520.00, "Privat", "nein", ""),
    ("Säule 3a", "Sparen & Investieren", "monatlich", 300.00, "Privat", "nein", ""),
    ("Miete", "Wohnen", "monatlich", 2100.00, "Gem. Konto", "nein", ""),
    ("Strom", "Wohnen", "vierteljährlich", 240.00, "Gem. Konto", "ja", "Jan, Apr, Jul, Okt"),
    ("Nebenkosten-Abrechnung", "Wohnen", "jährlich", 380.00, "Gem. Konto", "ja", "Mär"),
    ("Grundversicherung", "Krankenkasse", "monatlich", 398.50, "Privat", "nein", ""),
    ("Zusatzversicherung", "Krankenkasse", "jährlich", 620.00, "Privat", "ja", "Jan"),
    ("Zahnkontrolle", "Gesundheit", "halbjährlich", 160.00, "Privat", "ja", "Jun, Dez"),
    ("Handy-Abo", "Telefon & Abos", "monatlich", 29.90, "Privat", "nein", ""),
    ("Internet & TV", "Telefon & Abos", "monatlich", 69.00, "Gem. Konto", "nein", ""),
    ("Streaming", "Telefon & Abos", "monatlich", 22.90, "Privat", "nein", ""),
    ("Autoversicherung", "Auto & Mobilität", "jährlich", 980.00, "Privat", "ja", "Mai"),
    ("Verkehrssteuer", "Auto & Mobilität", "jährlich", 420.00, "Privat", "ja", "Feb"),
    ("Autoservice", "Auto & Mobilität", "jährlich", 650.00, "Privat", "ja", "Okt"),
    ("Fahrzeugprüfung", "Auto & Mobilität", "alle 3 Jahre", 300.00, "Privat", "ja", "Sep"),
    ("Hausratversicherung", "Versicherungen & Gebühren", "jährlich", 310.00, "Gem. Konto", "ja", "Apr"),
    ("Kontoführung", "Versicherungen & Gebühren", "vierteljährlich", 15.00, "Privat", "nein", "Mär, Jun, Sep, Dez"),
    ("Vereinsbeitrag", "Vereine & Diverses", "jährlich", 180.00, "Privat", "ja", "Mär"),
    ("Steuern (Raten)", "Steuern", "vierteljährlich", 1450.00, "Gem. Konto", "ja", "Feb, Mai, Aug, Nov"),
]
PRO_JAHR = {"monatlich": 12, "vierteljährlich": 4, "halbjährlich": 2, "jährlich": 1, "alle 3 Jahre": 1 / 3}

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
    if random.random() < 0.6 and tag(jahr, monat, 26) <= LETZTER_TAG:
        einnahmen.append((tag(jahr, monat, 26), "Pikett-Entschädigung", "Pikett", betrag(180, 520), "Privat", ""))
    if monat in (3, 9) and tag(jahr, monat, 14) <= LETZTER_TAG:
        einnahmen.append((tag(jahr, monat, 14), "Krankenkasse", "Rückerstattung", betrag(60, 240), "Privat", ""))
    if (jahr, monat) == (2026, 5):
        einnahmen.append((tag(jahr, monat, 8), "Verkauf Velo", "Andere", 350.00, "Privat", ""))

ausgaben.sort(key=lambda r: r[0])
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
# Aufbau wie im Finanz-Sheet: oben der Monat, darunter die Bereiche.
# Das Dashboard liest daraus nur «Budget variabel» (Topf · Budget).
ue.append(["Monat", "November 2026"])
ue.append([])
ue.append(["Budget variabel"])
ue.append(["Topf", "Budget", "Ausgegeben", "Übrig"])
for topf, budget in [("Privat", 1200.00), ("Gem. Konto", 1300.00)]:
    ue.append([topf, budget, None, None])
ue.append([])
ue.append(["Töpfe"])
ue.append(["Topf", "Einnahmen", "Fix & Sparen", "Variabel", "Übrig"])
ue["A4"].font = Font(bold=True)
ue["A10"].font = Font(bold=True)

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
    ws.append([posten, gruppe, rhythmus, b, round(b * PRO_JAHR[rhythmus] / 12, 2), konto, "", cler, faellig])
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
