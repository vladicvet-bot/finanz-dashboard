/*
 * Rechenlogik des Dashboards.
 * Nimmt die Zeilen aus der Tabelle, erkennt die Spalten und
 * berechnet Monatswerte, Kategorien, Sparquote, Kontostand und Warnungen.
 * Alles läuft lokal im Browser.
 */
(function () {
  "use strict";

  // ---------- Spalten erkennen ----------

  // Mögliche Spaltennamen (klein geschrieben, ohne "(CHF)")
  const SPALTEN = {
    datum: ["datum", "date", "buchungsdatum"],
    kategorie: ["kategorie", "category", "rubrik"],
    beschreibung: ["beschreibung", "text", "buchungstext", "bezeichnung", "notiz"],
    einnahmen: ["einnahmen", "einnahme", "eingang", "gutschrift"],
    ausgaben: ["ausgaben", "ausgabe", "ausgang", "belastung"],
    zahlungsmittel: ["zahlungsmittel", "zahlungsart", "konto"],
    saldo: ["saldo", "kontostand"],
  };

  function normName(x) {
    return String(x ?? "").toLowerCase()
      .replace(/\(.*?\)/g, "").replace(/chf/g, "").replace(/[^a-zäöü]/g, "");
  }

  function findeKopfzeile(zeilen) {
    for (let i = 0; i < Math.min(zeilen.length, 15); i++) {
      const namen = (zeilen[i] || []).map(normName);
      const spalten = {};
      for (const [key, varianten] of Object.entries(SPALTEN)) {
        const idx = namen.findIndex(n => varianten.includes(n));
        if (idx >= 0) spalten[key] = idx;
      }
      if (spalten.datum !== undefined && (spalten.ausgaben !== undefined || spalten.einnahmen !== undefined)) {
        return { zeile: i, spalten };
      }
    }
    return null;
  }

  // ---------- Werte umwandeln ----------

  function zuDatum(wert) {
    if (wert == null || wert === "") return null;
    if (typeof wert === "object" && wert.datum) return wert.datum;
    if (typeof wert === "number") {
      // Unformatierte Excel-Datumszahl (z.B. 46000)
      if (wert > 20000 && wert < 80000) {
        return new Date(Math.round((wert - 25569) * 86400000)).toISOString().slice(0, 10);
      }
      return null;
    }
    const s = String(wert).trim();
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/); // 24.11.26 oder 24.11.2026
    if (m) {
      let j = +m[3];
      if (j < 100) j += 2000;
      return pruefe(j, +m[2], +m[1]);
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // 2026-11-24
    if (m) return pruefe(+m[1], +m[2], +m[3]);
    return null;
  }

  function pruefe(j, mo, t) {
    if (mo < 1 || mo > 12 || t < 1 || t > 31) return null;
    return `${j}-${String(mo).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
  }

  function zuBetrag(wert) {
    if (wert == null || wert === "") return null;
    if (typeof wert === "number") return isFinite(wert) ? wert : null;
    let s = String(wert).replace(/chf|fr\.?|\s|'|’|`/gi, "");
    if (s === "" || s === "-") return null;
    // "1234,50" -> "1234.50"; "1.234,50" -> "1234.50"
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function text(wert) {
    if (wert == null) return "";
    if (typeof wert === "object" && wert.datum) return wert.datum;
    return String(wert).trim();
  }

  // ---------- Buchungen aus Tabelle ----------

  function buchungenAusTabelle(zeilen) {
    const kopf = findeKopfzeile(zeilen);
    if (!kopf) {
      const fehler = new Error("KEINE_SPALTEN");
      throw fehler;
    }
    const s = kopf.spalten;
    const buchungen = [];
    let uebersprungen = 0;

    for (let i = kopf.zeile + 1; i < zeilen.length; i++) {
      const z = zeilen[i] || [];
      if (z.every(v => v == null || v === "")) continue; // leere Zeile
      const datum = zuDatum(z[s.datum]);
      const ein = s.einnahmen !== undefined ? zuBetrag(z[s.einnahmen]) : null;
      const aus = s.ausgaben !== undefined ? zuBetrag(z[s.ausgaben]) : null;
      if (!datum || (!ein && !aus)) { uebersprungen++; continue; }
      buchungen.push({
        datum,
        kategorie: text(z[s.kategorie]) || "Ohne Kategorie",
        beschreibung: text(z[s.beschreibung]),
        einnahme: Math.abs(ein || 0),
        ausgabe: Math.abs(aus || 0),
        zahlungsmittel: text(z[s.zahlungsmittel]) || "Unbekannt",
        saldo: s.saldo !== undefined ? zuBetrag(z[s.saldo]) : null,
        nr: buchungen.length, // ursprüngliche Reihenfolge
      });
    }
    if (!buchungen.length) throw new Error("KEINE_BUCHUNGEN");

    const gefunden = Object.keys(s);
    const fehlend = Object.keys(SPALTEN).filter(k => !gefunden.includes(k));
    return { buchungen, uebersprungen, fehlendeSpalten: fehlend };
  }

  // ---------- Monatswerte ----------

  const monatVon = d => d.slice(0, 7); // "2026-10"

  function naechsterMonat(m) {
    let [j, mo] = m.split("-").map(Number);
    mo++; if (mo > 12) { mo = 1; j++; }
    return `${j}-${String(mo).padStart(2, "0")}`;
  }

  function summiere(map, key, wert) {
    map[key] = (map[key] || 0) + wert;
  }

  function berechne(buchungen) {
    const sortiert = [...buchungen].sort((a, b) => a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.nr - b.nr);
    const erster = monatVon(sortiert[0].datum);
    const letzter = monatVon(sortiert[sortiert.length - 1].datum);

    // Lückenlose Monatsliste
    const monate = [];
    const proMonat = {};
    for (let m = erster; ; m = naechsterMonat(m)) {
      monate.push(m);
      proMonat[m] = {
        monat: m, einnahmen: 0, ausgaben: 0, nachKategorie: {}, einnahmenNachKategorie: {},
        nachZahlungsmittel: {}, buchungen: [], saldoEnde: null,
      };
      if (m === letzter || monate.length > 600) break;
    }

    const hatSaldo = sortiert.some(b => b.saldo != null);
    let laufend = 0;
    for (const b of sortiert) {
      const pm = proMonat[monatVon(b.datum)];
      pm.buchungen.push(b);
      pm.einnahmen += b.einnahme;
      pm.ausgaben += b.ausgabe;
      if (b.ausgabe) {
        summiere(pm.nachKategorie, b.kategorie, b.ausgabe);
        summiere(pm.nachZahlungsmittel, b.zahlungsmittel, b.ausgabe);
      }
      if (b.einnahme) summiere(pm.einnahmenNachKategorie, b.kategorie, b.einnahme);
      laufend += b.einnahme - b.ausgabe;
      if (hatSaldo) { if (b.saldo != null) pm.saldoEnde = b.saldo; }
      else pm.saldoEnde = laufend; // ohne Saldo-Spalte: selbst aufsummieren
    }

    // Monate ohne Saldo übernehmen den Wert vom Vormonat
    let vorher = null;
    for (const m of monate) {
      const pm = proMonat[m];
      if (pm.saldoEnde == null) pm.saldoEnde = vorher;
      vorher = pm.saldoEnde;
      pm.gespart = pm.einnahmen - pm.ausgaben;
      pm.sparquote = pm.einnahmen > 0 ? pm.gespart / pm.einnahmen : null;
    }

    // Gleitender Durchschnitt der Sparquote über 3 Monate
    monate.forEach((m, i) => {
      const fenster = monate.slice(Math.max(0, i - 2), i + 1).map(x => proMonat[x]);
      const ein = fenster.reduce((s, x) => s + x.einnahmen, 0);
      const aus = fenster.reduce((s, x) => s + x.ausgaben, 0);
      proMonat[m].sparquote3M = ein > 0 ? (ein - aus) / ein : null;
    });

    return { monate, proMonat, hatSaldo };
  }

  // Summen über mehrere Monate
  function zeitraum(daten, monate) {
    const r = { einnahmen: 0, ausgaben: 0, nachKategorie: {}, nachZahlungsmittel: {}, anzahlMonate: monate.length };
    for (const m of monate) {
      const pm = daten.proMonat[m];
      r.einnahmen += pm.einnahmen;
      r.ausgaben += pm.ausgaben;
      for (const [k, v] of Object.entries(pm.nachKategorie)) summiere(r.nachKategorie, k, v);
      for (const [k, v] of Object.entries(pm.nachZahlungsmittel)) summiere(r.nachZahlungsmittel, k, v);
    }
    return r;
  }

  // Durchschnitt einer Kategorie in den 3 Monaten vor "monat"
  function vormonate(daten, monat, anzahl = 3) {
    const i = daten.monate.indexOf(monat);
    return daten.monate.slice(Math.max(0, i - anzahl), i);
  }

  function durchschnittVorher(daten, monat, kategorie) {
    const vm = vormonate(daten, monat);
    if (!vm.length) return null;
    return vm.reduce((s, m) => s + (daten.proMonat[m].nachKategorie[kategorie] || 0), 0) / vm.length;
  }

  // ---------- Warnungen ----------

  function warnungen(daten, monat, einst, heute = new Date()) {
    const liste = [];
    const pm = daten.proMonat[monat];
    const fmt = window.Format;
    const vm = vormonate(daten, monat);

    const aktuellerMonat = heute.toISOString().slice(0, 7);
    if (monat === aktuellerMonat) {
      liste.push({ stufe: "info", titel: "Monat läuft noch",
        text: "Dieser Monat ist noch nicht vorbei. Vergleiche sind darum vorläufig." });
    }

    if (pm.einnahmen === 0 && pm.ausgaben > 0) {
      liste.push({ stufe: "kritisch", titel: "Keine Einnahmen",
        text: `In diesem Monat sind keine Einnahmen erfasst, aber ${fmt.chf(pm.ausgaben)} Ausgaben.` });
    } else if (pm.ausgaben > pm.einnahmen) {
      liste.push({ stufe: "kritisch", titel: "Mehr ausgegeben als eingenommen",
        text: `Die Ausgaben liegen ${fmt.chf(pm.ausgaben - pm.einnahmen)} über den Einnahmen.` });
    } else if (pm.sparquote != null && pm.sparquote * 100 < einst.minSparquote) {
      liste.push({ stufe: "warnung", titel: "Tiefe Sparquote",
        text: `Sparquote ${fmt.prozent(pm.sparquote)} – unter deinem Ziel von ${einst.minSparquote} %.` });
    }

    // Kategorien deutlich über dem Durchschnitt
    if (vm.length) {
      const ueber = [];
      for (const [kat, betrag] of Object.entries(pm.nachKategorie)) {
        const schnitt = durchschnittVorher(daten, monat, kat);
        const differenz = betrag - schnitt;
        if (differenz < 50) continue; // kleine Beträge ignorieren
        if (schnitt === 0) {
          ueber.push({ kat, betrag, differenz, text: `${fmt.chf(betrag)} – in den Vormonaten nichts` });
        } else if (betrag > schnitt * (1 + einst.kategorieProzent / 100)) {
          ueber.push({ kat, betrag, differenz,
            text: `${fmt.chf(betrag)} statt Ø ${fmt.chf(schnitt)} (+${Math.round((betrag / schnitt - 1) * 100)} %)` });
        }
      }
      ueber.sort((a, b) => b.differenz - a.differenz);
      for (const u of ueber) {
        liste.push({ stufe: "warnung", titel: `${u.kat} höher als üblich`, text: u.text });
      }
    }

    // Ungewöhnlich grosse Einzelausgaben (wiederkehrende wie Miete ausgenommen)
    const frueher = vm.flatMap(m => daten.proMonat[m].buchungen);
    for (const b of pm.buchungen) {
      if (b.ausgabe < einst.grosseAusgabe) continue;
      const wiederkehrend = frueher.some(f => f.kategorie === b.kategorie && f.ausgabe >= b.ausgabe * 0.8);
      if (wiederkehrend) continue;
      liste.push({ stufe: "warnung", titel: "Grosse Einzelausgabe",
        text: `${fmt.chf(b.ausgabe)} · ${b.beschreibung || b.kategorie} (${fmt.datum(b.datum)})` });
    }

    // Kontostand gesunken?
    const i = daten.monate.indexOf(monat);
    if (i > 0) {
      const vorher = daten.proMonat[daten.monate[i - 1]].saldoEnde;
      if (vorher != null && pm.saldoEnde != null && pm.saldoEnde < vorher - einst.grosseAusgabe) {
        liste.push({ stufe: "info", titel: "Kontostand gesunken",
          text: `${fmt.chf(vorher - pm.saldoEnde)} weniger als Ende Vormonat.` });
      }
    }

    if (!liste.some(w => w.stufe !== "info")) {
      liste.push({ stufe: "gut", titel: "Alles im grünen Bereich",
        text: "Keine auffälligen Veränderungen in diesem Monat." });
    }
    return liste;
  }

  window.Analyse = {
    buchungenAusTabelle, berechne, zeitraum, durchschnittVorher, warnungen,
    _test: { zuDatum, zuBetrag, normName },
  };
})();
