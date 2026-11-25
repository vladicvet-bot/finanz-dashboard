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
        sparen: 0, fixAusgaben: 0, variabelNachKategorie: {}, variabelNachKonto: {}, rueckerstattungen: 0,
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
      // Rückerstattungen sind kein Einkommen: sie verringern die Ausgaben
      if (b.einnahme && /rückerstatt|rueckerstatt|erstattung|retoure/i.test(b.kategorie)) {
        pm.rueckerstattungen += b.einnahme;
        pm.ausgaben -= b.einnahme;
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

    if (pm.einnahmen === 0 && pm.ausgaben > 0) {
      liste.push({ stufe: "kritisch", titel: "Keine Einnahmen",
        text: `In diesem Monat sind keine Einnahmen erfasst, aber ${fmt.chf(pm.ausgaben)} Ausgaben.` });
    } else if (pm.ausgaben > pm.einnahmen) {
      liste.push({ stufe: "kritisch", titel: "Mehr ausgegeben als eingenommen",
        text: `Die Ausgaben liegen ${fmt.chf(pm.ausgaben - pm.einnahmen)} über den Einnahmen.` });
    } else if (!einst.topfSicht && pm.sparquote != null && pm.sparquote * 100 < einst.minSparquote) {
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
      if (einst.topfSicht && einst.topf !== topf) continue;
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
    datum: ["datum", "date", "stichtag"],
    was: ["wasgeschäft", "wasquelle", "was", "geschäft", "quelle", "beschreibung", "text"],
    kategorie: ["kategorie", "art", "category"],
    betrag: ["betrag", "betragin", "amount"],
    konto: ["konto", "kontoanlage", "anlage"],
    zahlmittel: ["zahlmittel", "zahlungsmittel"],
    stand: ["stand", "kontostand", "wert"],
    eingezahlt: ["eingezahlt", "einbezahlt", "einzahlungen"],
    notiz: ["notiz", "bemerkung"],
    posten: ["posten", "bezeichnung", "name", "position"],
    gruppe: ["gruppe"],
    rhythmus: ["rhythmus", "intervall", "turnus", "häufigkeit", "zahlungsrhythmus"],
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

  // Blatt nach Namen suchen: zuerst exakt, sonst enthält (z.B. «Fixkosten 2026»)
  const blattSuchen = (blaetter, name) => blaetter.find(b => normName(b.name) === name)
    || blaetter.find(b => normName(b.name).includes(name));

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
      liste.push({
        posten,
        gruppe: (s.gruppe !== undefined && text(z[s.gruppe])) || "Fixkosten",
        rhythmus,
        haeufigkeit,
        betrag,
        // «Pro Monat» wird immer neu berechnet (Betrag ÷ Teiler), weil ein
        // Export statt Werten auch Formeln enthalten kann.
        proMonat: Math.round(betrag * haeufigkeit / 12 * 100) / 100,
        konto: (s.konto !== undefined && text(z[s.konto])) || "Ohne Konto",
        ueberCler: s.uebercler !== undefined ? istJa(z[s.uebercler]) : false,
        faellig: leseFaellig(s.faellig !== undefined ? z[s.faellig] : "", haeufigkeit),
      });
    }
    markiereInterneEinzahlungen(liste);
    return liste;
  }

  /*
   * Eine Überweisung von Konto A (z.B. Privat) erscheint bei Konto B
   * (z.B. Gem. Konto) nochmals als «Einnahme». Gleicher Betrag + Rhythmus
   * -> diese Einnahme ist eine interne Einzahlung. Jede Überweisung wird
   * höchstens einer Einnahme zugeordnet.
   */
  function markiereInterneEinzahlungen(liste) {
    const frei = liste.filter(f => fixArt(f.gruppe) === "einnahme");
    for (const u of liste.filter(f => fixArt(f.gruppe) === "transfer")) {
      const i = frei.findIndex(e => e.konto !== u.konto && Math.abs(e.betrag - u.betrag) < 0.01 && e.haeufigkeit === u.haeufigkeit);
      if (i >= 0) { frei[i].interneEinzahlung = true; frei[i].vonKonto = u.konto; frei.splice(i, 1); }
    }
  }

  const enthaeltWort = (text, liste) => {
    const t = String(text || "").toLowerCase();
    return liste.some(w => w && t.includes(w));
  };
  const wortListe = text => String(text || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);

  /*
   * Art eines Fixkosten-Postens unter Berücksichtigung der Einstellungen:
   * "einnahme" | "intern" | "ausgabe" | "sparen" | "ruecklage" | "transfer" | "ignorieren"
   */
  function fixArtGenau(f, opt = {}) {
    if (enthaeltWort(f.posten, wortListe(opt.ignorieren))) return "ignorieren";
    const art = fixArt(f.gruppe);
    if (art === "einnahme" && f.interneEinzahlung) return "intern";
    if (art === "sparen" && enthaeltWort(f.posten, wortListe(opt.ruecklagen))) return "ruecklage";
    return art;
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

  // ---------- Hauptgruppen (Ebene 1) für Kategorien (Ebene 2) ----------

  const HAUPTGRUPPEN = [
    ["Kinder", /kind/],
    ["Wohnen", /wohn|miete|haushalt|nebenkosten|strom|energie|möbel/],
    ["Alltag", /lebensmittel|auswärts|restaurant|kaffee|kleid|coiffeur|alltag|drogerie|körperpflege/],
    ["Mobilität", /auto|mobil|parkplatz|öv|verkehr|velo|benzin|tank/],
    ["Gesundheit", /gesund|kranken|apotheke|arzt|zahn/],
    ["Freizeit", /freizeit|geschenk|ferien|verein|hobby|sport|reise|ausgang/],
    ["Abos & Telefon", /telefon|abo|internet|handy|streaming/],
    ["Steuern & Versicherungen", /steuer|versicher|gebühr|rechnung|bank/],
  ];
  const HAUPTGRUPPEN_NAMEN = HAUPTGRUPPEN.map(h => h[0]).concat("Andere");

  function hauptgruppe(kategorie) {
    const k = String(kategorie || "").toLowerCase();
    const treffer = HAUPTGRUPPEN.find(([, re]) => re.test(k));
    return treffer ? treffer[0] : "Andere";
  }

  // Bereich einer Buchung: eigene Zuordnung (falls gesetzt), sonst aus der Kategorie
  const bereichVon = b => b.bereich || hauptgruppe(b.kategorie);

  // Ausgaben eines Monats nach Bereich (Ebene 1), mit den Einzelkategorien darunter
  function nachHauptgruppe(pm) {
    const gruppen = {};
    for (const b of pm.buchungen) {
      if (!b.ausgabe || b.umbuchung) continue;
      const name = bereichVon(b);
      const g = gruppen[name] ||= { name, summe: 0, kat: {} };
      g.summe += b.ausgabe;
      const k = g.kat[b.kategorie] ||= { name: b.kategorie, betrag: 0, fix: true };
      k.betrag += b.ausgabe;
      if (!b.fix) k.fix = false;
    }
    return Object.values(gruppen).map(g => ({ name: g.name, summe: g.summe,
      kategorien: Object.values(g.kat).sort((a, b) => b.betrag - a.betrag) }))
      .sort((a, b) => b.summe - a.summe);
  }

  // ---------- Blatt «Vermögen»: Stände pro Konto/Anlage und Stichtag ----------

  const ARTEN = ["Konto", "Rücklage", "Vorsorge", "Investment", "Schulden", "Kinder", "Andere"];
  function normArt(a) {
    const t = String(a || "").toLowerCase();
    if (/kind/.test(t)) return "Kinder";
    if (/schuld|kredit|hypo/.test(t)) return "Schulden";
    if (/vorsorge|3a|säule|pensions/.test(t)) return "Vorsorge";
    if (/invest|depot|aktie|fonds|etf|krypto|crypto/.test(t)) return "Investment";
    if (/rücklage|ruecklage|reserve/.test(t)) return "Rücklage";
    if (/konto|bank|spar/.test(t)) return "Konto";
    return "Andere";
  }

  function leseVermoegen(blatt) {
    const kopf = blatt && findeKopf(blatt.zeilen, ["datum", "konto", "stand"]);
    if (!kopf) return [];
    const s = kopf.s;
    const liste = [];
    for (let i = kopf.zeile + 1; i < blatt.zeilen.length; i++) {
      const z = blatt.zeilen[i] || [];
      const datum = zuDatum(z[s.datum]);
      const konto = text(z[s.konto]);
      const stand = zuBetrag(z[s.stand]);
      if (!datum || !konto || stand == null) continue;
      const art = normArt(s.kategorie !== undefined ? z[s.kategorie] : "");
      const e = s.eingezahlt !== undefined ? zuBetrag(z[s.eingezahlt]) : null;
      liste.push({
        datum, konto, art,
        stand: art === "Schulden" ? -Math.abs(stand) : stand,
        eingezahlt: e != null && (art === "Vorsorge" || art === "Investment") ? Math.abs(e) : null,
        notiz: s.notiz !== undefined ? text(z[s.notiz]) : "",
      });
    }
    return liste;
  }

  /*
   * Pro Monat der letzte bekannte Stand jedes Kontos.
   * Fehlt ein Konto in einem Monat, wird für das TOTAL der letzte bekannte Stand
   * verwendet – gespeichert wird nichts, und die Anzeige markiert diese Konten
   * als «übernommen».
   * total = Summe aller Stände (Schulden negativ, inkl. Kinder)
   */
  function vermoegenBerechnen(eintraege) {
    eintraege = (eintraege || []).filter(e => e && e.datum && e.konto && e.stand != null && isFinite(e.stand));
    if (!eintraege.length) return { monate: [], proMonat: {} };
    const sortiert = [...eintraege].sort((a, b) => a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
    const erster = monatVon(sortiert[0].datum);
    const letzter = monatVon(sortiert[sortiert.length - 1].datum);
    const monate = [];
    for (let m = erster; monate.length < 600; m = naechsterMonat(m)) { monate.push(m); if (m === letzter) break; }
    const stand = new Map();
    const proMonat = {};
    let i = 0, vorher = null;
    for (const m of monate) {
      let datum = null;
      while (i < sortiert.length && monatVon(sortiert[i].datum) === m) {
        stand.set(sortiert[i].konto, sortiert[i]);
        datum = sortiert[i].datum;
        i++;
      }
      const konten = [...stand.values()].map(k => {
        const v = vorher && vorher.konten.find(x => x.konto === k.konto);
        return {
          ...k,
          uebernommen: monatVon(k.datum) !== m,
          veraenderung: v ? k.stand - v.stand : null,
          gewinn: (k.art === "Vorsorge" || k.art === "Investment") && k.eingezahlt ? k.stand - k.eingezahlt : null,
        };
      });
      const nachArt = {};
      for (const k of konten) nachArt[k.art] = (nachArt[k.art] || 0) + k.stand;
      const total = konten.reduce((s, k) => s + k.stand, 0);
      // Veränderung nur über Konten, die es auch im Vormonat gab (neue Konten verfälschen sonst)
      const vergleichbar = konten.filter(k => k.veraenderung != null);
      const neueKonten = vorher ? konten.filter(k => k.veraenderung == null) : [];
      proMonat[m] = vorher = {
        veraenderung: vergleichbar.length ? vergleichbar.reduce((s, k) => s + k.veraenderung, 0) : null,
        neueKonten: neueKonten.length,
        neuSumme: neueKonten.reduce((s, k) => s + k.stand, 0),
        monat: m, stichtag: datum, konten,
        total,
        netto: total,                         // (früherer Name, = total)
        kinder: nachArt.Kinder || 0,
        ohneKinder: total - (nachArt.Kinder || 0),
        nachArt,
        uebernommen: konten.filter(k => k.uebernommen).length,
      };
    }
    return { monate, proMonat };
  }

  // Schlüssel für «gleiche Erfassung»: Stichtag + Konto
  const vmSchluessel = e => `${e.datum}|${String(e.konto).trim().toLowerCase()}`;

  // Sheet- und lokale Erfassungen zusammenführen, ohne Doppelte (das Sheet hat Vorrang)
  function vermoegenZusammenfuehren(ausSheet, lokal) {
    const gesehen = new Set((ausSheet || []).map(vmSchluessel));
    return (ausSheet || []).concat((lokal || []).filter(e => !gesehen.has(vmSchluessel(e))));
  }

  // Eine Erfassung normalisieren (Regeln: Schulden negativ, «Eingezahlt» nur Vorsorge/Investment)
  function vermoegenEintrag(roh) {
    const art = normArt(roh.art);
    let stand = typeof roh.stand === "number" ? roh.stand : zuBetrag(roh.stand);
    if (stand == null || !isFinite(stand)) return null;
    if (art === "Schulden") stand = -Math.abs(stand);
    let eingezahlt = roh.eingezahlt === "" || roh.eingezahlt == null ? null
      : typeof roh.eingezahlt === "number" ? roh.eingezahlt : zuBetrag(roh.eingezahlt);
    if (!(art === "Vorsorge" || art === "Investment")) eingezahlt = null;
    return {
      datum: zuDatum(roh.datum) || roh.datum, konto: String(roh.konto || "").trim(), art,
      stand: Math.round(stand * 100) / 100,
      eingezahlt: eingezahlt != null && isFinite(eingezahlt) ? Math.abs(eingezahlt) : null,
      notiz: String(roh.notiz || "").trim(),
    };
  }

  // Eingefügte Tabelle (Tab, Semikolon) -> Einträge
  function vermoegenAusText(text) {
    const ergebnis = { eintraege: [], fehler: [] };
    String(text || "").split(/\r?\n/).forEach((zeile, n) => {
      if (!zeile.trim()) return;
      const t = zeile.includes("\t") ? zeile.split("\t") : zeile.split(";");
      const datum = zuDatum(t[0]);
      if (!datum) { if (n > 0 || !/stichtag|datum/i.test(zeile)) ergebnis.fehler.push(n + 1); return; }
      const e = vermoegenEintrag({ datum, konto: t[1], art: t[2], stand: t[3], eingezahlt: t[4], notiz: t.slice(5).join(" ").trim() });
      if (e && e.konto) ergebnis.eintraege.push(e); else ergebnis.fehler.push(n + 1);
    });
    return ergebnis;
  }

  /*
   * Liest eine Datei (alle Blätter). Erkennt das Sheet-Format; sonst wird
   * das erste Blatt mit erkennbaren Spalten als Haushaltsbuch/Bank-Export gelesen.
   */
  function ausArbeitsmappe(blaetter, dateiname = "") {
    // Blätter am Namen ODER an den Spalten erkennen
    const nachKopf = pflicht => blaetter.find(b => findeKopf(b.zeilen, pflicht));
    const ausgabenBlatt = blattSuchen(blaetter, "ausgaben");
    const vermoegenBlatt = blattSuchen(blaetter, "vermögen") || blattSuchen(blaetter, "vermoegen")
      || nachKopf(["datum", "konto", "stand"]);
    const fixkostenBlatt = blattSuchen(blaetter, "fixkosten") || nachKopf(["posten", "betrag", "rhythmus"]);
    if (ausgabenBlatt || vermoegenBlatt || fixkostenBlatt) {
      const vermoegen = leseVermoegen(vermoegenBlatt);
      const aus = leseSheetBuchungen(ausgabenBlatt, "aus");
      const ein = leseSheetBuchungen(blattSuchen(blaetter, "einnahmen"), "ein");
      const fixkosten = leseFixkosten(fixkostenBlatt);
      const uebersicht = blattSuchen(blaetter, "übersicht") || blattSuchen(blaetter, "uebersicht");
      const budgets = leseBudgetsAusUebersicht(uebersicht);
      const kennzahlen = leseKennzahlen(uebersicht);
      const buchungen = aus.buchungen.concat(ein.buchungen)
        .sort((a, b) => a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);
      if (!buchungen.length && !fixkosten.length && !vermoegen.length) throw new Error("KEINE_BUCHUNGEN");
      buchungen.forEach((b, i) => { b.nr = i; });
      return {
        typ: "sheet", buchungen, fixkosten, budgets, kennzahlen, vermoegen,
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
    // Hilfe für die Fehlersuche: Blattnamen und Spaltenüberschriften (nur Texte, keine Werte)
    letzterFehler.details = blaetter.map(b => {
      const kopf = (b.zeilen.find(z => z && z.some(v => typeof v === "string" && v.trim())) || [])
        .filter(v => typeof v === "string" && v.trim()).slice(0, 9).map(v => v.trim().slice(0, 25));
      return `«${b.name}»: ${kopf.length ? kopf.join(" · ") : "(leer)"}`;
    }).join(" | ");
    throw letzterFehler;
  }

  /*
   * Fixkosten als (geglättete) Monatsbuchungen, damit sie in Monatssummen,
   * Sparquote und Kategorien mitzählen.
   *
   * Haushalts-Sicht (alle Konten): Überweisungen und interne Einzahlungen
   *   heben sich auf und zählen nicht; Sparen zählt als gespart;
   *   Rücklagen zählen weder als Ausgabe noch als gespart.
   * Topf-Sicht (ein Konto): wie im Sheet – alles, was das Konto verlässt,
   *   zählt unter «Fix & Sparen», auch Überweisungen und Rücklagen.
   */
  function fixBuchungen(fixkosten, monate, opt = {}) {
    const liste = [];
    for (const f of fixkosten) {
      const art = fixArtGenau(f, opt);
      if (art === "ignorieren") continue;
      if (!opt.topfSicht && (art === "intern" || art === "transfer" || art === "ruecklage")) continue;
      const istEinnahme = art === "einnahme" || art === "intern";
      for (const m of monate) {
        liste.push({
          datum: `${m}-01`,
          beschreibung: f.posten,
          kategorieDatei: istEinnahme ? "Feste Einnahmen" : f.gruppe,
          zahlungsmittelDatei: "Fixkosten",
          konto: f.konto,
          einnahme: istEinnahme ? f.proMonat : 0,
          ausgabe: istEinnahme ? 0 : f.proMonat,
          saldo: null,
          fix: true,
          bereich: f.bereich || "",
          transfer: !opt.topfSicht && art === "sparen",
          sparen: !opt.topfSicht && art === "sparen",
          nr: -1,
        });
      }
    }
    return liste;
  }

  // Zusammenfassung der Fixkosten pro Monat (für die Fixkosten-Karte)
  function fixUebersicht(fixkosten, opt = {}) {
    const r = { nachGruppe: {}, einnahmen: 0, intern: 0, sparen: 0, ruecklagen: 0, transfer: 0, ignoriert: 0, ohneFaellig: 0 };
    const nicht = wortListe(opt.nichtMitzaehlen);
    for (const f of fixkosten) {
      const art = fixArtGenau(f, opt);
      if (art === "ignorieren") { r.ignoriert += f.proMonat; continue; }
      if (art === "einnahme") { r.einnahmen += f.proMonat; continue; }
      if (art === "intern") { r.intern += f.proMonat; continue; }
      if (art === "sparen") { r.sparen += f.proMonat; continue; }
      if (art === "ruecklage") { r.ruecklagen += f.proMonat; continue; }
      if (art === "transfer") { r.transfer += f.proMonat; continue; }
      if (!opt.topfSicht && nicht.includes(String(f.gruppe).toLowerCase())) continue;
      r.nachGruppe[f.gruppe] = (r.nachGruppe[f.gruppe] || 0) + f.proMonat;
      if (f.haeufigkeit < 12 && !f.faellig.length) r.ohneFaellig++;
    }
    return r;
  }

  // Kennzahlen (Bezeichnung in Spalte B, Wert in Spalte F) und Monat aus der Übersicht
  function leseKennzahlen(blatt) {
    const r = { monat: null, werte: [] };
    if (!blatt) return r;
    const zeilen = blatt.zeilen;
    const namen = i => (zeilen[i] || []).map(normName);
    let start = -1, ende = zeilen.length;
    for (let i = 0; i < Math.min(zeilen.length, 120); i++) {
      const z = zeilen[i] || [];
      const n = namen(i);
      if (n.includes("monat") && r.monat == null) {
        const j = n.indexOf("monat");
        r.monat = zuDatum(z[j + 1]);
      }
      if (n.includes("topf") && n.includes("fixsparen")) start = i + 1;
      if (start >= 0 && i > start && n.includes("kategorie") && n.includes("anteil")) { ende = i; break; }
    }
    if (start < 0) return r;
    const kontoNamen = new Set();
    for (let i = start; i < ende; i++) {
      const z = zeilen[i] || [];
      const label = typeof z[1] === "string" ? z[1].trim() : "";
      const wert = typeof z[5] === "number" ? z[5] : zuBetrag(z[5]);
      if (!label || wert == null) continue;
      // die zwei Zeilen direkt unter der Töpfe-Kopfzeile sind die Töpfe selbst
      if (i <= start + 1 && typeof z[2] === "number") { kontoNamen.add(label); continue; }
      if (kontoNamen.has(label)) continue;
      r.werte.push({ label, wert });
    }
    return r;
  }

  // Welche Fixkosten werden in den nächsten Monaten fällig?
  function faelligkeiten(fixkosten, abMonat, anzahl = 3, opt = {}) {
    fixkosten = fixkosten.filter(f => fixArtGenau(f, opt) === "ausgabe");
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
    fixBuchungen, fixUebersicht, fixArtGenau, faelligkeiten, vermoegenBerechnen, ARTEN,
    vermoegenZusammenfuehren, vermoegenEintrag, vermoegenAusText, vmSchluessel,
    nachHauptgruppe, HAUPTGRUPPEN_NAMEN, hauptgruppe, bereichVon, clerBedarfProMonat, clerPrognose, monatVon, naechsterMonat,
    STANDARD_REGELN,
    _test: { zuDatum, zuBetrag, normName },
    zuDatum, zuBetrag,
  };
})();
