"""
Erzeugt ERFUNDENE Beispieldaten für das Finanz-Dashboard.

Alle Namen, Beträge und Buchungen sind frei erfunden.
Aufruf:  python3 tools/erzeuge_beispieldaten.py
Ergebnis: beispieldaten/beispiel-haushalt.xlsx

Benötigt: pip install openpyxl
"""

import random
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

random.seed(42)  # immer dieselben "Zufallszahlen" -> reproduzierbar

START_SALDO = 8_400.00
MONATE = [(2025, m) for m in range(1, 13)] + [(2026, m) for m in range(1, 11)]

# (Kategorie, Beschreibung, Betrag-von, Betrag-bis, Tag, Zahlungsmittel)
FIXKOSTEN = [
    ("Wohnen", "Miete Wohnung", 1850, 1850, 1, "Dauerauftrag"),
    ("Krankenkasse", "Prämie Grundversicherung", 412.40, 412.40, 3, "LSV"),
    ("Versicherungen", "Hausrat & Haftpflicht", 38.50, 38.50, 5, "eBill"),
    ("Telefon & Internet", "Abo Mobile & Internet", 79.90, 79.90, 12, "eBill"),
    ("Abos", "Streaming & Zeitung", 34.80, 34.80, 15, "Kreditkarte"),
    ("Mobilität", "Halbtax / Monatsabo", 89.00, 89.00, 2, "TWINT"),
]

VARIABEL = [
    # Kategorie, Beschreibungen, Anzahl/Monat, Betrag-von, -bis, Zahlungsmittel-Auswahl
    ("Lebensmittel", ["Migros", "Coop", "Denner", "Bäckerei", "Wochenmarkt"], (8, 12), 18, 115,
     ["Debitkarte", "Debitkarte", "TWINT", "Bar"]),
    ("Restaurant", ["Mittagessen", "Pizzeria", "Café", "Take-away"], (3, 6), 12, 85,
     ["Debitkarte", "TWINT", "Kreditkarte"]),
    ("Freizeit", ["Kino", "Fitness Einzeleintritt", "Konzert", "Bücher", "Ausflug"], (1, 4), 15, 120,
     ["Kreditkarte", "TWINT", "Debitkarte"]),
    ("Kleider", ["Kleider", "Schuhe"], (0, 2), 30, 160, ["Kreditkarte", "Debitkarte"]),
    ("Haushalt", ["Drogerie", "Haushaltwaren", "Brockenhaus"], (1, 3), 10, 70,
     ["Debitkarte", "TWINT", "Bar"]),
    ("Gesundheit", ["Apotheke", "Arztrechnung Selbstbehalt"], (0, 2), 15, 140,
     ["Debitkarte", "eBill"]),
    ("Mobilität", ["Billett", "Velo-Service", "Tanken Mietauto"], (1, 3), 8, 60,
     ["TWINT", "Debitkarte"]),
]


def tag(jahr, monat, wunsch):
    """Gültiger Tag im Monat (max. 28 -> immer gültig)."""
    return date(jahr, monat, min(wunsch, 28))


def betrag(von, bis):
    return round(random.uniform(von, bis) * 20) / 20  # auf 5 Rappen gerundet


buchungen = []  # (datum, kategorie, beschreibung, einnahme, ausgabe, zahlungsmittel)


def ausgabe(d, kat, text, b, zm):
    buchungen.append((d, kat, text, None, round(b, 2), zm))


def einnahme(d, kat, text, b, zm):
    buchungen.append((d, kat, text, round(b, 2), None, zm))


for jahr, monat in MONATE:
    # --- Einnahmen ---
    lohn = 6_250.00 if jahr == 2025 else 6_420.00  # Lohnerhöhung 2026
    einnahme(tag(jahr, monat, 25), "Lohn", "Nettolohn", lohn, "Überweisung")
    if monat == 12:
        einnahme(tag(jahr, monat, 20), "Lohn", "13. Monatslohn", lohn, "Überweisung")
    if monat in (4, 9):
        einnahme(tag(jahr, monat, 10), "Nebeneinkommen", "Verkauf Ricardo", betrag(60, 240), "TWINT")
    if monat == 6:
        einnahme(tag(jahr, monat, 14), "Rückerstattung", "Rückerstattung Krankenkasse", 186.30, "Überweisung")

    # --- Fixkosten ---
    for kat, text, von, bis, t, zm in FIXKOSTEN:
        ausgabe(tag(jahr, monat, t), kat, text, betrag(von, bis), zm)

    # --- Variable Ausgaben ---
    for kat, texte, (n_min, n_max), von, bis, zms in VARIABEL:
        for _ in range(random.randint(n_min, n_max)):
            ausgabe(tag(jahr, monat, random.randint(1, 28)), kat, random.choice(texte),
                    betrag(von, bis), random.choice(zms))

    # --- Jährliche / besondere Ausgaben ---
    if monat == 3:
        ausgabe(tag(jahr, monat, 20), "Steuern", "Steuerrate Kanton/Gemeinde", 2_150.00, "eBill")
    if monat == 9:
        ausgabe(tag(jahr, monat, 20), "Steuern", "Steuerrate Kanton/Gemeinde", 2_150.00, "eBill")
    if monat == 7 and jahr == 2025:
        ausgabe(tag(jahr, monat, 8), "Ferien", "Ferienwohnung Tessin", 1_280.00, "Kreditkarte")
    if monat == 12:
        ausgabe(tag(jahr, monat, 15), "Geschenke", "Weihnachtsgeschenke", betrag(280, 420), "Kreditkarte")

    # --- ABSICHTLICHE AUFFÄLLIGKEITEN (zum Testen der Warnungen) ---
    if (jahr, monat) == (2026, 8):
        ausgabe(tag(jahr, monat, 3), "Ferien", "Flug & Hotel Lissabon", 2_890.00, "Kreditkarte")
        ausgabe(tag(jahr, monat, 9), "Ferien", "Ferien Ausgaben vor Ort", 640.00, "Kreditkarte")
    if (jahr, monat) == (2026, 10):
        # Restaurant deutlich teurer als sonst
        for d, text, b in [(4, "Geburtstagsessen", 186.50), (11, "Firmenapéro", 92.00),
                           (18, "Abendessen", 134.00), (24, "Brunch", 78.50)]:
            ausgabe(tag(jahr, monat, d), "Restaurant", text, b, "Kreditkarte")
        # Grosse, unregelmässige Einzelausgabe
        ausgabe(tag(jahr, monat, 14), "Gesundheit", "Zahnarzt", 890.00, "eBill")
        ausgabe(tag(jahr, monat, 21), "Haushalt", "Neue Waschmaschine (Anteil)", 640.00, "Debitkarte")

# Nach Datum sortieren und laufenden Saldo berechnen
buchungen.sort(key=lambda b: b[0])

wb = Workbook()
ws = wb.active
ws.title = "Buchungen"
ws.append(["Datum", "Kategorie", "Beschreibung", "Einnahmen (CHF)", "Ausgaben (CHF)",
           "Zahlungsmittel", "Saldo"])

saldo = START_SALDO
for d, kat, text, ein, aus, zm in buchungen:
    saldo = round(saldo + (ein or 0) - (aus or 0), 2)
    ws.append([d, kat, text, ein, aus, zm, saldo])

# Formatierung wie in einer normalen Haushalts-Excel
for zelle in ws[1]:
    zelle.font = Font(bold=True)
    zelle.fill = PatternFill("solid", fgColor="DDEBF7")
for zeile in ws.iter_rows(min_row=2):
    zeile[0].number_format = "dd.mm.yyyy"  # Kurzformat-Datum
    for z in (zeile[3], zeile[4], zeile[6]):
        z.number_format = "#,##0.00"
for spalte, breite in zip("ABCDEFG", (12, 20, 32, 16, 16, 16, 14)):
    ws.column_dimensions[spalte].width = breite
ws.freeze_panes = "A2"

ziel = Path(__file__).resolve().parent.parent / "beispieldaten" / "beispiel-haushalt.xlsx"
ziel.parent.mkdir(exist_ok=True)
wb.save(ziel)
print(f"{len(buchungen)} erfundene Buchungen gespeichert in {ziel}")
