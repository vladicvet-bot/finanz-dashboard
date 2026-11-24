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
      b.zahlungsmittel = b.zahlungsmittelDatei
        || (b.quelle === "sheet" ? "Karte unbekannt" : erkenneZahlungsmittel(b.beschreibung))
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
        sparen: 0, fixAusgaben: 0, variabelNachKategorie: {}, variabelNachKonto: {},
      };
      if (m === letzter || monate.length > 600) break;
    }

    for (const b of sortiert) {
      const pm = proMonat[monatVon(b.datum)];
      b.umbuchung = !!b.transfer || istUmbuchung.has(b.kategorie.toLowerCase());
      pm.buchungen.push(b);
      if (b.umbuchung) {
        if (b.sparen) { pm.sparen += b.ausgabe; continue; }
        if (b.fix) continue; // feste Daueraufträge zwischen eigenen Konten: nicht extra melden
        pm.umbuchungRaus += b.ausgabe;
        pm.umbuchungRein += b.einnahme;
        continue;
      }
      pm.einnahmen += b.einnahme;
      pm.ausgaben += b.ausgabe;
      if (b.ausgabe) {
        summiere(pm.nachKategorie, b.kategorie, b.ausgabe);
        if (b.fix) pm.fixAusgaben += b.ausgabe;
        else {
          summiere(pm.nachZahlungsmittel, b.zahlungsmittel, b.ausgabe);
          summiere(pm.variabelNachKategorie, b.kategorie, b.ausgabe);
          summiere(pm.variabelNachKonto, b.konto, b.ausgabe);
        }
      }
      if (b.einnahme) summiere(pm.einnahmenNachKategorie, b.kategorie, b.einnahme);
    }

    // Kontostand: pro Konto der letzte Saldo des Monats, dann alle Konten zusammenzählen.
    // Konten ohne Saldo-Spalte werden ab 0 selbst aufsummiert.
    // (Sheet-Buchungen und Fixkosten haben keinen Kontostand und werden hier übersprungen.)
    const konten = [...new Set(sortiert.map(b => b.konto))];
    const mitSaldo = new Set(konten.filter(k => sortiert.some(b => b.konto === k && b.saldo != null)));
    const stand = {};
    for (const m of monate) {
      const pm = proMonat[m];
      for (const b of pm.buchungen) {
        if (b.fix || b.quelle === "sheet") continue;
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
      hatKontostand: Object.keys(stand).length > 0,
      hatFix: sortiert.some(b => b.fix),
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

    if (einst.nurAusgaben) {
      // Einzelnes Konto gewählt: Einnahmen/Sparquote sind hier nicht aussagekräftig
    } else if (pm.einnahmen === 0 && pm.ausgaben > 0) {
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
      if (b.umbuchung || b.fix || b.ausgabe < einst.grosseAusgabe) continue;
      const wiederkehrend = frueher.some(f => f.kategorie === b.kategorie && f.ausgabe >= b.ausgabe * 0.8);
      if (wiederkehrend) continue;
      liste.push({ stufe: "warnung", titel: "Grosse Einzelausgabe",
        text: `${fmt.chf(b.ausgabe)} · ${b.beschreibung || b.kategorie} (${fmt.datum(b.datum)})` });
    }

    // Budget pro Topf (Konto) überschritten (nur variable Ausgaben)
    const budgets = einst.budgetsKonto || {};
    for (const [topf, budget] of Object.entries(budgets)) {
      if (!(topf in pm.variabelNachKonto) && einst.nurAusgaben) continue;
      const ist = pm.variabelNachKonto[topf] || 0;
      if (ist > budget) {
        liste.push({ stufe: "warnung", titel: `Budget ${topf} überschritten`,
          text: `${fmt.chf(ist)} von ${fmt.chf(budget)} – ${fmt.chf(ist - budget)} zu viel.` });
      }
    }

    if (pm.umbuchungRaus || pm.umbuchungRein) {
      const teile = [];
      if (pm.umbuchungRaus) teile.push(`${fmt.chf(pm.umbuchungRaus)} raus`);
      if (pm.umbuchungRein) teile.push(`${fmt.chf(pm.umbuchungRein)} rein`);
      liste.push({ stufe: "info", titel: "Nicht mitgezählt",
        text: `Umbuchungen u.ä.: ${teile.join(", ")} – zählen nicht als Einnahmen oder Ausgaben.` });
    }

    if (!liste.some(w => w.stufe !== "info")) {
      liste.push({ stufe: "gut", titel: "Alles im grünen Bereich",
        text: "Keine auffälligen Veränderungen in diesem Monat." });
    }
    return liste;
  }

  // =====================================================================
  //  SHEET-FORMAT: Arbeitsmappe mit den Blättern «Ausgaben», «Einnahmen»
  //  und «Fixkosten» (z.B. aus Google Sheets als .xlsx heruntergeladen)
  // =====================================================================

  const SHEET_SPALTEN = {
    datum: ["datum", "date"],
    was: ["wasgeschäft", "wasquelle", "was", "geschäft", "quelle", "beschreibung", "text"],
    kategorie: ["kategorie", "art", "category"],
    betrag: ["betrag", "betragin", "amount"],
    konto: ["konto"],
    zahlmittel: ["zahlmittel", "zahlungsmittel"],
    notiz: ["notiz", "bemerkung"],
    posten: ["posten", "bezeichnung"],
    gruppe: ["gruppe"],
    rhythmus: ["rhythmus", "intervall"],
    promonat: ["promonat"],
    uebercler: ["übercler", "uebercler"],
    faellig: ["fällig", "faellig", "fälligkeit"],
    topf: ["topf"],
    budget: ["budget"],
  };

  function findeKopf(zeilen, pflicht, maxZeilen = 15) {
    for (let i = 0; i < Math.min(zeilen.length, maxZeilen); i++) {
      const namen = (zeilen[i] || []).map(normName);
      const s = {};
      for (const [key, varianten] of Object.entries(SHEET_SPALTEN)) {
        const idx = namen.findIndex(n => varianten.includes(n));
        if (idx >= 0) s[key] = idx;
      }
      if (pflicht.every(k => s[k] !== undefined)) return { zeile: i, s };
    }
    return null;
  }

  const blattSuchen = (blaetter, name) => blaetter.find(b => normName(b.name) === name);

  // Buchungen aus «Ausgaben» oder «Einnahmen»
  function leseSheetBuchungen(blatt, richtung) {
    const kopf = blatt && findeKopf(blatt.zeilen, ["datum", "betrag"]);
    if (!kopf) return { buchungen: [], uebersprungen: 0 };
    const s = kopf.s;
    const buchungen = [];
    let uebersprungen = 0;
    for (let i = kopf.zeile + 1; i < blatt.zeilen.length; i++) {
      const z = blatt.zeilen[i] || [];
      if (z.every(v => v == null || v === "")) continue;
      const datum = zuDatum(z[s.datum]);
      const betrag = Math.abs(zuBetrag(z[s.betrag]) || 0);
      if (!datum || !betrag) { uebersprungen++; continue; }
      buchungen.push({
        datum,
        beschreibung: text(z[s.was]),
        notiz: s.notiz !== undefined ? text(z[s.notiz]) : "",
        kategorieDatei: s.kategorie !== undefined ? text(z[s.kategorie]) : "",
        zahlungsmittelDatei: s.zahlmittel !== undefined ? text(z[s.zahlmittel]) : "",
        konto: (s.konto !== undefined && text(z[s.konto])) || "Ohne Konto",
        einnahme: richtung === "ein" ? betrag : 0,
        ausgabe: richtung === "aus" ? betrag : 0,
        saldo: null,
        quelle: "sheet",
      });
    }
    return { buchungen, uebersprungen };
  }

  // Rhythmus -> Anzahl Zahlungen pro Jahr
  function proJahr(rhythmus) {
    const r = String(rhythmus || "").toLowerCase();
    if (/alle\s*3\s*jahr/.test(r)) return 1 / 3;
    if (/alle\s*2\s*jahr/.test(r)) return 1 / 2;
    if (/viertel|quartal|3\s*monat/.test(r)) return 4;
    if (/halb/.test(r)) return 2;
    if (/monat/.test(r)) return 12;
    if (/jähr|jaehr|jahr/.test(r)) return 1;
    if (/woche/.test(r)) return 52;
    return 12;
  }

  const MONATE_KURZ = ["jan", "feb", "mär", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];
  function leseFaellig(wert, haeufigkeit) {
    const t = String(wert ?? "").toLowerCase().replace(/mar(?!k)/g, "mär").replace(/märz/g, "mär");
    const monate = new Set();
    for (const teil of t.split(/[^a-zäöü0-9]+/)) {
      const i = MONATE_KURZ.findIndex(m => teil.startsWith(m));
      if (i >= 0) monate.add(i + 1);
      else if (/^\d{1,2}$/.test(teil) && +teil >= 1 && +teil <= 12) monate.add(+teil);
    }
    if (!monate.size && haeufigkeit >= 12) for (let m = 1; m <= 12; m++) monate.add(m);
    return [...monate].sort((a, b) => a - b);
  }

  function istJa(wert) {
    if (wert === true) return true;
    return /^(ja|j|x|yes|y|true|wahr|1|✓|✔)$/i.test(String(wert ?? "").trim());
  }

  // Art eines Fixkosten-Postens anhand der Gruppe
  function fixArt(gruppe) {
    const g = String(gruppe || "").toLowerCase();
    if (/^einnahme/.test(g)) return "einnahme";
    if (/sparen|invest/.test(g)) return "sparen";
    if (/überweisung|ueberweisung|umbuchung|übertrag/.test(g)) return "transfer";
    return "ausgabe";
  }

  function leseFixkosten(blatt) {
    const kopf = blatt && findeKopf(blatt.zeilen, ["posten", "betrag"]);
    if (!kopf) return [];
    const s = kopf.s;
    const liste = [];
    for (let i = kopf.zeile + 1; i < blatt.zeilen.length; i++) {
      const z = blatt.zeilen[i] || [];
      const posten = text(z[s.posten]);
      const betrag = Math.abs(zuBetrag(z[s.betrag]) || 0);
      if (!posten || !betrag) continue;
      const rhythmus = s.rhythmus !== undefined ? text(z[s.rhythmus]) : "monatlich";
      const haeufigkeit = proJahr(rhythmus);
      const pm = s.promonat !== undefined ? zuBetrag(z[s.promonat]) : null;
      liste.push({
        posten,
        gruppe: (s.gruppe !== undefined && text(z[s.gruppe])) || "Fixkosten",
        rhythmus,
        haeufigkeit,
        betrag,
        proMonat: pm != null && pm !== 0 ? Math.abs(pm) : betrag * haeufigkeit / 12,
        konto: (s.konto !== undefined && text(z[s.konto])) || "Ohne Konto",
        ueberCler: s.uebercler !== undefined ? istJa(z[s.uebercler]) : false,
        faellig: leseFaellig(s.faellig !== undefined ? z[s.faellig] : "", haeufigkeit),
      });
    }
    return liste;
  }

  // Budget pro Topf (= Konto) aus der Tabelle «Budget variabel» im Blatt Übersicht
  function leseBudgetsAusUebersicht(blatt) {
    const kopf = blatt && findeKopf(blatt.zeilen, ["topf", "budget"], 80);
    if (!kopf) return {};
    const budgets = {};
    for (let i = kopf.zeile + 1; i < blatt.zeilen.length; i++) {
      const z = blatt.zeilen[i] || [];
      const topf = text(z[kopf.s.topf]);
      if (!topf) break; // Ende der Tabelle
      if (/^(total|summe|gesamt)/i.test(topf)) continue;
      const b = zuBetrag(z[kopf.s.budget]);
      if (b) budgets[topf] = Math.abs(b);
    }
    return budgets;
  }

  /*
   * Liest eine Datei (alle Blätter). Erkennt das Sheet-Format; sonst wird
   * das erste Blatt mit erkennbaren Spalten als Haushaltsbuch/Bank-Export gelesen.
   */
  function ausArbeitsmappe(blaetter, dateiname = "") {
    const ausgabenBlatt = blattSuchen(blaetter, "ausgaben");
    if (ausgabenBlatt) {
      const aus = leseSheetBuchungen(ausgabenBlatt, "aus");
      const ein = leseSheetBuchungen(blattSuchen(blaetter, "einnahmen"), "ein");
      const fixkosten = leseFixkosten(blattSuchen(blaetter, "fixkosten"));
      const budgets = leseBudgetsAusUebersicht(blattSuchen(blaetter, "übersicht") || blattSuchen(blaetter, "uebersicht"));
      const buchungen = aus.buchungen.concat(ein.buchungen)
        .sort((a, b) => a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
      if (!buchungen.length && !fixkosten.length) throw new Error("KEINE_BUCHUNGEN");
      buchungen.forEach((b, i) => { b.nr = i; });
      return {
        typ: "sheet", buchungen, fixkosten, budgets,
        anzahlAusgaben: aus.buchungen.length, anzahlEinnahmen: ein.buchungen.length,
        uebersprungen: aus.uebersprungen + ein.uebersprungen,
        von: buchungen.length ? buchungen[0].datum : null,
        bis: buchungen.length ? buchungen[buchungen.length - 1].datum : null,
      };
    }
    let letzterFehler = new Error("KEINE_SPALTEN");
    for (const blatt of blaetter) {
      try {
        return { typ: "tabelle", fixkosten: [], ...buchungenAusTabelle(blatt.zeilen, dateiname) };
      } catch (e) { letzterFehler = e; }
    }
    throw letzterFehler;
  }

  // Fixkosten als (geglättete) Monatsbuchungen, damit sie in Monatssummen,
  // Sparquote und Kategorien mitzählen.
  function fixBuchungen(fixkosten, monate) {
    const liste = [];
    for (const m of monate) {
      for (const f of fixkosten) {
        const art = fixArt(f.gruppe);
        liste.push({
          datum: `${m}-01`,
          beschreibung: f.posten,
          kategorieDatei: art === "einnahme" ? "Feste Einnahmen" : f.gruppe,
          zahlungsmittelDatei: "Fixkosten",
          konto: f.konto,
          einnahme: art === "einnahme" ? f.proMonat : 0,
          ausgabe: art === "einnahme" ? 0 : f.proMonat,
          saldo: null,
          fix: true,
          transfer: art === "transfer" || art === "sparen",
          sparen: art === "sparen",
          nr: -1,
        });
      }
    }
    return liste;
  }

  // Welche Fixkosten werden in den nächsten Monaten fällig?
  function faelligkeiten(fixkosten, abMonat, anzahl = 3) {
    const r = [];
    let m = abMonat;
    for (let i = 0; i < anzahl; i++) {
      const mo = +m.slice(5, 7);
      const posten = fixkosten.filter(f => fixArt(f.gruppe) === "ausgabe" && f.haeufigkeit < 12 && f.faellig.includes(mo));
      const monatlich = fixkosten.filter(f => fixArt(f.gruppe) === "ausgabe" && f.haeufigkeit >= 12);
      r.push({
        monat: m,
        posten: posten.sort((a, b) => b.betrag - a.betrag),
        summe: posten.reduce((s, f) => s + f.betrag, 0),
        summeCler: posten.filter(f => f.ueberCler).reduce((s, f) => s + f.betrag, 0),
        monatlichSumme: monatlich.reduce((s, f) => s + f.betrag, 0),
      });
      m = naechsterMonat(m);
    }
    return r;
  }

  // Monatliche Einzahlung, die der Cler-Topf braucht (alle Posten «Über Cler», geglättet)
  function clerBedarfProMonat(fixkosten) {
    return fixkosten.filter(f => f.ueberCler && fixArt(f.gruppe) === "ausgabe")
      .reduce((s, f) => s + f.proMonat, 0);
  }

  // Simulation: reicht der Cler-Topf die nächsten 12 Monate?
  function clerPrognose(fixkosten, startSaldo, einzahlung, abMonat, anzahl = 12) {
    let saldo = startSaldo;
    let m = abMonat;
    const verlauf = [];
    for (let i = 0; i < anzahl; i++) {
      const mo = +m.slice(5, 7);
      const raus = fixkosten
        .filter(f => f.ueberCler && fixArt(f.gruppe) === "ausgabe" && f.faellig.includes(mo))
        .reduce((s, f) => s + f.betrag, 0);
      saldo = saldo + einzahlung - raus;
      verlauf.push({ monat: m, raus, saldo });
      m = naechsterMonat(m);
    }
    return verlauf;
  }



  window.Analyse = {
    buchungenAusTabelle, ausArbeitsmappe, zuordnen, berechne, zeitraum, durchschnittVorher, warnungen,
    fixBuchungen, faelligkeiten, clerBedarfProMonat, clerPrognose, monatVon, naechsterMonat,
    STANDARD_REGELN,
    _test: { zuDatum, zuBetrag, normName },
  };
})();
