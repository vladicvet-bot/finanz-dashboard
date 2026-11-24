/*
 * Rechenlogik des Dashboards.
 * Nimmt die Zeilen aus der Tabelle, erkennt die Spalten und
 * berechnet Monatswerte, Kategorien, Sparquote, Kontostand und Warnungen.
 * Alles läuft lokal im Browser.
 */
(function () {
  "use strict";

  // ---------- Spalten erkennen ----------

  // Mögliche Spaltennamen (klein, ohne Leer- und Sonderzeichen, ohne "(CHF)").
  // Funktioniert für das eigene Haushaltsbuch UND für Bank-Exporte.
  const SPALTEN = {
    datum: ["datum", "date", "buchungsdatum", "bookedat", "booked", "buchungstag"],
    kategorie: ["kategorie", "category", "rubrik"],
    beschreibung: ["beschreibung", "text", "buchungstext", "bezeichnung", "notiz", "description", "mitteilung"],
    einnahmen: ["einnahmen", "einnahme", "eingang", "gutschrift", "gutschriften"],
    ausgaben: ["ausgaben", "ausgabe", "ausgang", "belastung", "belastungen"],
    betrag: ["betrag", "creditdebitamount", "amount", "betragin"], // ein Betrag mit Vorzeichen (Bank)
    zahlungsmittel: ["zahlungsmittel", "zahlungsart"],
    saldo: ["saldo", "kontostand", "balance"],
    konto: ["iban", "kontonummer", "konto"],
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
      const hatBetrag = ["ausgaben", "einnahmen", "betrag"].some(k => spalten[k] !== undefined);
      if (spalten.datum !== undefined && hatBetrag) return { zeile: i, spalten, namen };
    }
    return null;
  }

  // Welche Bank? (nur für einen verständlichen Kontonamen)
  function erkenneBank(namen) {
    if (namen.includes("bookedat") && namen.includes("creditdebitamount")) return "Raiffeisen";
    return "Konto";
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
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // 2026-11-24 (auch "2026-11-24 00:00:00.0")
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
    let s = String(wert).replace(/chf|fr\.?|\s|'|’|`/gi, "").replace(/−/g, "-");
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
    return String(wert).trim().replace(/\s+/g, " ");
  }

  // IBAN nie vollständig speichern: nur die letzten 4 Ziffern
  function kontoName(bank, iban) {
    const ziffern = String(iban || "").replace(/\s/g, "");
    return ziffern.length >= 4 ? `${bank} ···${ziffern.slice(-4)}` : bank;
  }

  // ---------- Buchungen aus Tabelle ----------

  function buchungenAusTabelle(zeilen, dateiname = "") {
    const kopf = findeKopfzeile(zeilen);
    if (!kopf) throw new Error("KEINE_SPALTEN");
    const s = kopf.spalten;
    const istBank = s.betrag !== undefined && s.einnahmen === undefined && s.ausgaben === undefined;
    const bank = istBank ? erkenneBank(kopf.namen) : null;
    let buchungen = [];
    let uebersprungen = 0;
    let iban = "";

    for (let i = kopf.zeile + 1; i < zeilen.length; i++) {
      const z = zeilen[i] || [];
      if (z.every(v => v == null || v === "")) continue; // leere Zeile
      const datum = zuDatum(z[s.datum]);
      let ein, aus;
      if (istBank) {
        const b = zuBetrag(z[s.betrag]);
        ein = b > 0 ? b : 0;
        aus = b < 0 ? -b : 0;
      } else {
        ein = Math.abs((s.einnahmen !== undefined ? zuBetrag(z[s.einnahmen]) : 0) || 0);
        aus = Math.abs((s.ausgaben !== undefined ? zuBetrag(z[s.ausgaben]) : 0) || 0);
      }
      if (!datum || (!ein && !aus)) { uebersprungen++; continue; }
      if (s.konto !== undefined && !iban) iban = text(z[s.konto]);
      buchungen.push({
        datum,
        kategorieDatei: s.kategorie !== undefined ? text(z[s.kategorie]) : "",
        zahlungsmittelDatei: s.zahlungsmittel !== undefined ? text(z[s.zahlungsmittel]) : "",
        beschreibung: text(z[s.beschreibung]),
        einnahme: ein,
        ausgabe: aus,
        saldo: s.saldo !== undefined ? zuBetrag(z[s.saldo]) : null,
      });
    }
    if (!buchungen.length) throw new Error("KEINE_BUCHUNGEN");

    // Banken liefern oft die neueste Buchung zuerst -> umdrehen,
    // damit der Saldo der letzten Buchung eines Tages stimmt.
    if (buchungen[0].datum > buchungen[buchungen.length - 1].datum) buchungen.reverse();

    const konto = istBank ? kontoName(bank, iban) : "Haushaltsbuch";
    buchungen.forEach((b, i) => { b.konto = konto; b.nr = i; });
    const daten = buchungen.map(b => b.datum).sort();

    const wichtig = istBank ? ["saldo"] : ["kategorie", "zahlungsmittel", "saldo"];
    const fehlend = wichtig.filter(k => s[k] === undefined);
    return {
      buchungen, uebersprungen, fehlendeSpalten: fehlend,
      konto, istBank, von: daten[0], bis: daten[daten.length - 1],
    };
  }

  // ---------- Kategorien und Zahlungsmittel zuordnen ----------

  // Standard-Regeln: "Stichwort, Stichwort => Kategorie". Die erste passende Zeile gewinnt.
  const STANDARD_REGELN = [
    "# Umbuchungen zuerst (zählen nicht als Einnahme/Ausgabe)",
    "übertrag, kontoübertrag, sparkonto, säule 3a, vorsorgekonto, revolut, kreditkarte, viseca, cembra, migros bank => Umbuchung",
    "lohn, gehalt, salär, salaire => Lohn",
    "miete, mietzins, nebenkosten => Wohnen",
    "css, helsana, swica, sanitas, concordia, visana, assura, groupe mutuel, kpt, atupri, sympany, krankenkasse => Krankenkasse",
    "mobiliar, axa, allianz, generali, helvetia, baloise, smile.direct => Versicherungen",
    "swisscom, sunrise, salt mobile, yallo, wingo, init7 => Telefon & Internet",
    "netflix, spotify, apple.com, disney, youtube => Abos",
    "steueramt, steuerverwaltung, gemeindesteuer, staatssteuer => Steuern",
    "migros, coop, denner, aldi, lidl, volg, landi, bäckerei => Lebensmittel",
    "restaurant, mcdonald, burger king, starbucks, pizzeria, take away => Restaurant",
    "sbb, zvv, bls, postauto, mobility, tankstelle, shell, avia, socar, migrol, parking, parkhaus => Mobilität",
    "apotheke, amavita, sun store, zahnarzt, arzt, physio, spital => Gesundheit",
    "kino, pathé, fitness, ticketcorner, eventim => Freizeit",
    "zalando, h&m, zara, c&a, ochsner => Kleider",
    "ikea, jumbo, hornbach, bauhaus, digitec, galaxus, interdiscount, mediamarkt, amazon => Einkäufe",
    "bancomat, bargeldbezug, geldautomat => Bargeld",
  ].join("\n");

  function leseRegeln(textRegeln) {
    const regeln = [];
    for (const zeile of String(textRegeln || "").split(/\r?\n/)) {
      if (!zeile.trim() || zeile.trim().startsWith("#")) continue;
      const teile = zeile.split(/=>|->/);
      if (teile.length !== 2) continue;
      const kategorie = teile[1].trim();
      const woerter = teile[0].split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      if (kategorie && woerter.length) regeln.push({ woerter, kategorie });
    }
    return regeln;
  }

  function regelKategorie(beschreibung, regeln) {
    const t = beschreibung.toLowerCase();
    for (const r of regeln) if (r.woerter.some(w => t.includes(w))) return r.kategorie;
    return "";
  }

  const ZAHLUNGSMITTEL_REGELN = [
    [/twint/i, "TWINT"],
    [/bargeld|bancomat|geldautomat|\batm\b/i, "Bargeldbezug"],
    [/ebill|e-rechnung/i, "eBill"],
    [/\blsv\b|lastschrift|direct debit/i, "LSV"],
    [/dauerauftrag|standing order/i, "Dauerauftrag"],
    [/debit|maestro|v pay|karte|card|einkauf|kauf\/dienstleistung/i, "Debitkarte"],
    [/e-banking|überweisung|zahlung|auftrag|gutschrift|transfer/i, "Überweisung"],
  ];

  function erkenneZahlungsmittel(beschreibung) {
    for (const [muster, name] of ZAHLUNGSMITTEL_REGELN) if (muster.test(beschreibung)) return name;
    return "";
  }

  // Ältere gespeicherte Daten (vor dem Bank-Import) umwandeln
  function migriere(b) {
    if (b.kategorieDatei === undefined) {
      b.kategorieDatei = b.kategorie === "Ohne Kategorie" ? "" : (b.kategorie || "");
      b.zahlungsmittelDatei = b.zahlungsmittel === "Unbekannt" ? "" : (b.zahlungsmittel || "");
    }
    if (!b.konto) b.konto = "Haushaltsbuch";
  }

  // Setzt b.kategorie und b.zahlungsmittel (aus Datei, sonst aus Regeln)
  function zuordnen(buchungen, regelText) {
    const regeln = leseRegeln(regelText);
    for (const b of buchungen) {
      migriere(b);
      b.kategorie = b.kategorieDatei || regelKategorie(b.beschreibung, regeln)
        || (b.einnahme ? "Sonstige Einnahmen" : "Nicht zugeordnet");
      b.zahlungsmittel = b.zahlungsmittelDatei || erkenneZahlungsmittel(b.beschreibung)
        || (b.konto === "Haushaltsbuch" ? "Unbekannt" : b.konto);
    }
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

  // umbuchungen: Liste von Kategorienamen, die nur Geld verschieben
  // (z.B. aufs Sparkonto). Sie zählen nicht als Einnahme oder Ausgabe.
  function berechne(buchungen, umbuchungen = []) {
    const istUmbuchung = new Set(umbuchungen.map(k => k.trim().toLowerCase()).filter(Boolean));
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
        nachZahlungsmittel: {}, buchungen: [], saldoEnde: null, umbuchungRaus: 0, umbuchungRein: 0,
      };
      if (m === letzter || monate.length > 600) break;
    }

    for (const b of sortiert) {
      const pm = proMonat[monatVon(b.datum)];
      b.umbuchung = istUmbuchung.has(b.kategorie.toLowerCase());
      pm.buchungen.push(b);
      if (b.umbuchung) {
        pm.umbuchungRaus += b.ausgabe;
        pm.umbuchungRein += b.einnahme;
        continue;
      }
      pm.einnahmen += b.einnahme;
      pm.ausgaben += b.ausgabe;
      if (b.ausgabe) {
        summiere(pm.nachKategorie, b.kategorie, b.ausgabe);
        summiere(pm.nachZahlungsmittel, b.zahlungsmittel, b.ausgabe);
      }
      if (b.einnahme) summiere(pm.einnahmenNachKategorie, b.kategorie, b.einnahme);
    }

    // Kontostand: pro Konto der letzte Saldo des Monats, dann alle Konten zusammenzählen.
    // Konten ohne Saldo-Spalte werden ab 0 selbst aufsummiert.
    const konten = [...new Set(sortiert.map(b => b.konto))];
    const mitSaldo = new Set(konten.filter(k => sortiert.some(b => b.konto === k && b.saldo != null)));
    const stand = {};
    for (const m of monate) {
      const pm = proMonat[m];
      for (const b of pm.buchungen) {
        if (mitSaldo.has(b.konto)) { if (b.saldo != null) stand[b.konto] = b.saldo; }
        else stand[b.konto] = (stand[b.konto] || 0) + b.einnahme - b.ausgabe;
      }
      const werte = Object.values(stand);
      pm.saldoEnde = werte.length ? werte.reduce((a, b) => a + b, 0) : null;
      pm.saldoProKonto = { ...stand };
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

    return {
      monate, proMonat, konten,
      hatSaldo: konten.every(k => mitSaldo.has(k)),
    };
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
      if (b.umbuchung || b.ausgabe < einst.grosseAusgabe) continue;
      const wiederkehrend = frueher.some(f => f.kategorie === b.kategorie && f.ausgabe >= b.ausgabe * 0.8);
      if (wiederkehrend) continue;
      liste.push({ stufe: "warnung", titel: "Grosse Einzelausgabe",
        text: `${fmt.chf(b.ausgabe)} · ${b.beschreibung || b.kategorie} (${fmt.datum(b.datum)})` });
    }

    if (pm.umbuchungRaus || pm.umbuchungRein) {
      const teile = [];
      if (pm.umbuchungRaus) teile.push(`${fmt.chf(pm.umbuchungRaus)} weggebucht`);
      if (pm.umbuchungRein) teile.push(`${fmt.chf(pm.umbuchungRein)} hergebucht`);
      liste.push({ stufe: "info", titel: "Umbuchungen",
        text: `${teile.join(", ")} – zählen nicht als Einnahmen oder Ausgaben.` });
    }

    if (!liste.some(w => w.stufe !== "info")) {
      liste.push({ stufe: "gut", titel: "Alles im grünen Bereich",
        text: "Keine auffälligen Veränderungen in diesem Monat." });
    }
    return liste;
  }

  window.Analyse = {
    buchungenAusTabelle, zuordnen, berechne, zeitraum, durchschnittVorher, warnungen,
    STANDARD_REGELN,
    _test: { zuDatum, zuBetrag, normName },
  };
})();
