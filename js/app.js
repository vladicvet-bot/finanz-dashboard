/*
 * Finanz-Dashboard – Bedienung und Anzeige.
 * Alles läuft im Browser. Gespeichert wird (falls gewünscht) nur im
 * Speicher dieses Browsers auf diesem Gerät ("localStorage").
 */
(function () {
  "use strict";

  // ---------- Zahlen- und Datumsformat (Schweiz) ----------

  const chfFormat = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });
  const zahlFormat = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
  const betragFormat = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monatLang = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric", timeZone: "UTC" });
  const monatKurz = new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: "UTC" });

  const Format = {
    chf: v => (v < 0 ? "−" : "") + chfFormat.format(Math.abs(v)),
    zahl: v => zahlFormat.format(v),
    betrag: v => betragFormat.format(v), // ohne "CHF", für die Tabelle
    prozent: v => `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1).replace(".0", "")} %`,
    datum: iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`,
    monat: m => monatLang.format(new Date(`${m}-01T00:00:00Z`)),
    monatKurz: m => `${monatKurz.format(new Date(`${m}-01T00:00:00Z`)).replace(".", "")} ${m.slice(2, 4)}`,
  };
  window.Format = Format;

  // ---------- Speicher ----------

  const SPEICHER_DATEN = "finanzDashboard.daten.v1";
  const SPEICHER_EINST = "finanzDashboard.einstellungen.v1";
  const STANDARD_EINST = {
    kategorieProzent: 30, minSparquote: 10, grosseAusgabe: 500, umbuchungen: "Umbuchung",
    regeln: window.Analyse.STANDARD_REGELN,
    clerSaldo: "", clerEinzahlung: "",
    ignorierePosten: "Pikett",               // Planwerte, die anderswo tatsächlich erfasst werden
    ruecklagen: "Ferien, Weiterbildung",     // «Sparen & Investieren», das später ausgegeben wird
  };
  const umbuchungsListe = () => String(zustand.einst.umbuchungen || "").split(",");

  function speicherLesen(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function speicherSchreiben(key, wert) {
    try { localStorage.setItem(key, JSON.stringify(wert)); return true; } catch { return false; }
  }
  function speicherLoeschen(key) {
    try { localStorage.removeItem(key); } catch { /* nichts */ }
  }

  // ---------- Zustand ----------

  const zustand = {
    quelle: null,          // { geladenAm, beispiel }
    daten: null,           // Ergebnis von Analyse.berechne
    buchungen: [],         // echte Buchungen (ohne Fixkosten)
    fixkosten: [],         // Posten aus dem Blatt «Fixkosten»
    budgetsKonto: {},      // Budget pro Topf (Konto) aus dem Blatt «Übersicht»
    kennzahlen: null,      // Kennzahlen aus dem Blatt «Übersicht»
    kontoFilter: "alle",   // "alle" oder ein Kontoname
    monat: null,           // ausgewählter Monat "JJJJ-MM"
    zeitraum: "12",        // "12" oder "alle"
    katModus: "monat",     // "monat" oder "zeitraum"
    einst: { ...STANDARD_EINST, ...(speicherLesen(SPEICHER_EINST) || {}) },
  };
  const diagramme = {};

  const $ = id => document.getElementById(id);

  // ---------- Datei laden ----------

  const FEHLERTEXTE = {
    KEIN_ZIP: "Die Datei ist keine gültige Excel-Datei (.xlsx).",
    KEIN_EXCEL: "Die Datei ist keine gültige Excel-Datei (.xlsx).",
    ZIP_DEFEKT: "Die Excel-Datei scheint beschädigt zu sein.",
    ZIP_METHODE: "Diese Excel-Datei ist in einem unbekannten Format gespeichert.",
    XML_DEFEKT: "Die Excel-Datei konnte nicht gelesen werden.",
    KEIN_BLATT: "In der Excel-Datei wurde kein Tabellenblatt gefunden.",
    ALTES_XLS: "Das alte Format .xls wird nicht unterstützt. Bitte in Excel mit «Speichern unter» als .xlsx speichern.",
    NUMBERS: "Numbers-Dateien bitte zuerst exportieren: In Numbers «Ablage → Exportieren → Excel».",
    KEINE_SPALTEN: "Die Spalten wurden nicht erkannt. Nötig sind mindestens ein Datum und ein Betrag (oder «Einnahmen»/«Ausgaben»).",
    KEINE_BUCHUNGEN: "Es wurden keine Buchungen mit Datum und Betrag gefunden.",
  };

  /*
   * Lädt eine oder mehrere Dateien und fügt sie zu den vorhandenen Daten hinzu.
   * Gleiches Konto + gleicher Zeitraum -> die neue Datei ersetzt die alten
   * Buchungen dieses Zeitraums (so gibt es keine Doppelten).
   */
  async function ladeDateien(dateien, beispiel = false) {
    const NAMEN = { kategorie: "Kategorie", zahlungsmittel: "Zahlungsmittel", saldo: "Saldo" };
    let alle = beispiel || zustand.quelle?.beispiel ? [] : [...zustand.buchungen];
    const zeilenText = [];
    let geladen = 0, fehler = false;
    let neueFixkosten = beispiel || zustand.quelle?.beispiel ? [] : zustand.fixkosten;
    let neueBudgets = beispiel || zustand.quelle?.beispiel ? {} : zustand.budgetsKonto;
    let neueKennzahlen = beispiel || zustand.quelle?.beispiel ? null : zustand.kennzahlen;

    for (const { name, buffer } of dateien) {
      try {
        const blaetter = await window.TabellenLeser.leseDatei(name, buffer);
        const e = window.Analyse.ausArbeitsmappe(blaetter, name);
        let t;
        if (e.typ === "sheet") {
          // Finanz-Sheet: ersetzt die Sheet-Buchungen im selben Zeitraum
          if (e.von) alle = alle.filter(b => !(b.quelle === "sheet" && b.datum >= e.von && b.datum <= e.bis));
          alle = alle.concat(e.buchungen);
          if (e.fixkosten.length) neueFixkosten = e.fixkosten;
          if (Object.keys(e.budgets).length) neueBudgets = e.budgets;
          if (e.kennzahlen && e.kennzahlen.werte.length) neueKennzahlen = e.kennzahlen;
          t = `✓ ${name}: ${e.anzahlAusgaben} Ausgaben, ${e.anzahlEinnahmen} Einnahmen, ${e.fixkosten.length} Fixkosten-Posten`;
          if (e.von) t += ` · ${Format.datum(e.von)} – ${Format.datum(e.bis)}`;
          if (e.uebersprungen) t += ` · ${e.uebersprungen} Zeilen ohne Datum/Betrag übersprungen`;
          zeilenText.push(t);
          geladen++;
          continue;
        }
        alle = alle.filter(b => !(b.konto === e.konto && b.datum >= e.von && b.datum <= e.bis)).concat(e.buchungen);
        t = `✓ ${name}: ${e.buchungen.length} Buchungen · ${e.konto} · ${Format.datum(e.von)} – ${Format.datum(e.bis)}`;
        const n = e.uebersprungen;
        if (n) t += ` · ${n} ${n === 1 ? "Zeile" : "Zeilen"} ohne Datum/Betrag übersprungen`;
        const fehlend = e.fehlendeSpalten.map(s => NAMEN[s]).filter(Boolean);
        if (fehlend.length) t += ` · Spalte nicht gefunden: ${fehlend.join(", ")}`;
        zeilenText.push(t);
        geladen++;
      } catch (err) {
        console.error(err);
        fehler = true;
        zeilenText.push(`✗ ${name}: ${FEHLERTEXTE[err.message] || "Die Datei konnte nicht gelesen werden."}`);
      }
    }
    if (!geladen) { melde(zeilenText.join("\n"), true); return; }

    alle.forEach((b, i) => { b.nr = i; });
    zustand.quelle = { geladenAm: new Date().toISOString(), beispiel };
    zustand.fixkosten = neueFixkosten;
    zustand.budgetsKonto = neueBudgets;
    zustand.kennzahlen = neueKennzahlen;
    zustand.kontoFilter = "alle";
    setzeBuchungen(alle, true);

    if (beispiel) zeilenText.push("Das sind erfundene Beispieldaten.");
    else if (!speichern()) zeilenText.push("Die Daten konnten auf diesem Gerät nicht gespeichert werden (privates Surfen?). Das Dashboard funktioniert trotzdem.");
    const konten = zustand.daten.konten;
    const quellen = new Set(zustand.buchungen.map(b => b.quelle === "sheet" ? "sheet" : b.konto === "Haushaltsbuch" ? "hb" : "bank"));
    if (quellen.size > 1) {
      zeilenText.push("Achtung: Verschiedene Quellen (Finanz-Sheet, Haushaltsbuch, Bank-Export) sind gleichzeitig geladen. Dieselben Ausgaben könnten doppelt zählen. Nicht benötigte Konten kannst du unter «Einstellungen und Daten» entfernen.");
    }
    const offen = zustand.buchungen.filter(b => b.kategorie === "Nicht zugeordnet").length;
    if (offen) zeilenText.push(`${offen} Buchungen ohne Kategorie – Regeln dafür kannst du unter «Einstellungen und Daten» ergänzen.`);
    melde(zeilenText.join("\n"), fehler);
  }

  function speichern() {
    const daten = zustand.buchungen.map(({ umbuchung, ...rest }) => rest);
    return speicherSchreiben(SPEICHER_DATEN, {
      version: 3, geladenAm: zustand.quelle.geladenAm, buchungen: daten, fixkosten: zustand.fixkosten,
      budgetsKonto: zustand.budgetsKonto, kennzahlen: zustand.kennzahlen,
    });
  }

  function fixOptionen() {
    return {
      ignorieren: zustand.einst.ignorierePosten,
      ruecklagen: zustand.einst.ruecklagen,
      nichtMitzaehlen: zustand.einst.umbuchungen,
    };
  }

  function setzeBuchungen(buchungen, neuerMonat) {
    const A = window.Analyse;
    zustand.buchungen = buchungen;
    zustand.einst.budgetsKonto = zustand.budgetsKonto;

    // Monate: von der ersten Buchung bis heute (bzw. letzte Buchung)
    const daten = buchungen.map(b => b.datum).sort();
    const heute = new Date().toISOString().slice(0, 7);
    let von = daten.length ? A.monatVon(daten[0]) : heute;
    let bis = daten.length ? A.monatVon(daten[daten.length - 1]) : heute;
    if (zustand.fixkosten.length && bis < heute && buchungen.every(b => b.quelle === "sheet")) bis = heute;
    const monate = [];
    for (let m = von; monate.length < 600; m = A.naechsterMonat(m)) { monate.push(m); if (m === bis) break; }

    // Konto-Filter: «alle» = Haushalts-Sicht, ein Konto = Topf-Sicht wie im Sheet
    zustand.alleKonten = [...new Set(buchungen.map(b => b.konto).concat(zustand.fixkosten.map(f => f.konto)))].sort();
    if (zustand.kontoFilter !== "alle" && !zustand.alleKonten.includes(zustand.kontoFilter)) zustand.kontoFilter = "alle";
    const topfSicht = zustand.kontoFilter !== "alle";

    const fix = A.fixBuchungen(zustand.fixkosten, monate, { ...fixOptionen(), topfSicht });
    let alle = buchungen.concat(fix);
    A.zuordnen(alle, zustand.einst.regeln);
    if (topfSicht) alle = alle.filter(b => b.konto === zustand.kontoFilter);
    if (!alle.length) alle = buchungen.concat(fix);

    // In der Topf-Sicht zählt (wie im Sheet) auch «nicht mitzählen» als Abgang
    zustand.daten = A.berechne(alle, topfSicht ? ["Umbuchung"] : umbuchungsListe());
    if (neuerMonat || !zustand.daten.proMonat[zustand.monat]) {
      zustand.monat = letzterVollerMonat(zustand.daten.monate);
    }
    $("start").hidden = true;
    $("dashboard").hidden = false;
    alles();
  }

  // Standard: der neueste Monat (oder der vorherige, wenn der neueste erst begonnen hat)
  function letzterVollerMonat(monate) {
    const letzter = monate[monate.length - 1];
    const heute = new Date();
    const jetzt = heute.toISOString().slice(0, 7);
    if (letzter === jetzt && heute.getDate() < 10 && monate.length > 1) return monate[monate.length - 2];
    return letzter;
  }

  // ---------- Meldungen ----------

  let meldungTimer;
  function melde(text, fehler = false) {
    const el = $("meldung");
    el.textContent = text;
    el.classList.toggle("fehler", fehler);
    el.hidden = false;
    clearTimeout(meldungTimer);
    if (!fehler) meldungTimer = setTimeout(() => { el.hidden = true; }, 6000 + text.length * 40);
  }

  // ---------- Alles neu zeichnen ----------

  function bereichMonate() {
    const m = zustand.daten.monate;
    if (zustand.zeitraum === "alle") return m;
    const sel = m.indexOf(zustand.monat);
    const ende = sel >= m.length - 12 ? m.length : sel + 1;
    return m.slice(Math.max(0, ende - 12), ende);
  }

  function alles() {
    statusZeile();
    monatsauswahl();
    kontoFilterAnzeigen();
    kennzahlen();
    warnungsliste();
    budgetKarte();
    fixkostenKarten();
    sheetKennzahlen();
    kategorien();
    zahlungsmittel();
    buchungsTabelle();
    einstellungenAnzeigen();
    zeichneDiagramme();
  }

  function statusZeile() {
    const q = zustand.quelle;
    const istSheet = zustand.buchungen.some(b => b.quelle === "sheet") || zustand.fixkosten.length;
    const konten = zustand.daten.konten;
    $("status").textContent = q.beispiel
      ? "Beispieldaten (erfunden)"
      : `${istSheet ? "Finanz-Sheet" : konten.length === 1 ? konten[0] : `${konten.length} Konten`} · auf diesem Gerät gespeichert`;
    $("datei-text").textContent = "Datei hinzufügen";
    kontenListe();
    offeneBuchungen();
    $("speicher-info").textContent = q.beispiel
      ? "Die Beispieldaten werden nicht gespeichert."
      : `Gespeichert in diesem Browser seit ${new Date(q.geladenAm).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })}. Nur auf diesem Gerät.`;
    $("loeschen").hidden = !!q.beispiel;
  }

  function monatsauswahl() {
    const sel = $("monat");
    const monate = zustand.daten.monate;
    sel.innerHTML = "";
    for (const m of [...monate].reverse()) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = Format.monat(m);
      sel.appendChild(opt);
    }
    sel.value = zustand.monat;
    const i = monate.indexOf(zustand.monat);
    $("monat-zurueck").disabled = i <= 0;
    $("monat-vor").disabled = i >= monate.length - 1;
  }

  // ---------- Kennzahlen ----------

  function vergleich(text, richtung) {
    // richtung: "besser", "schlechter" oder ""
    return `<span class="${richtung}">${text}</span>`;
  }

  function veraenderung(jetzt, vorher, mehrIstGut) {
    if (vorher == null || vorher === 0) return "";
    const diff = (jetzt - vorher) / Math.abs(vorher);
    if (Math.abs(diff) < 0.005) return "±0 %";
    const richtung = (diff > 0) === mehrIstGut ? "besser" : "schlechter";
    return vergleich(`${diff > 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))} %`, richtung);
  }

  function kennzahlen() {
    const d = zustand.daten;
    const pm = d.proMonat[zustand.monat];
    const i = d.monate.indexOf(zustand.monat);
    const vor = i > 0 ? d.proMonat[d.monate[i - 1]] : null;
    const vm = d.monate.slice(Math.max(0, i - 3), i).map(m => d.proMonat[m]);
    const schnittAus = vm.length ? vm.reduce((s, x) => s + x.ausgaben, 0) / vm.length : null;

    const fixTeil = {
      titel: "Davon Fixkosten",
      wert: Format.chf(pm.fixAusgaben),
      vergleich: pm.ausgaben ? `${Math.round(pm.fixAusgaben / pm.ausgaben * 100)} % der Ausgaben · Variabel ${Format.chf(pm.ausgaben - pm.fixAusgaben)}` : "",
    };
    const variabel = pm.ausgaben - pm.fixAusgaben;
    const uebrig = pm.einnahmen - pm.ausgaben;
    const kacheln = zustand.kontoFilter !== "alle" ? [
      {
        titel: `Einnahmen ${zustand.kontoFilter}`, wert: Format.chf(pm.einnahmen),
        vergleich: "inkl. Einzahlungen von anderen Konten",
      },
      {
        titel: "Fix & Sparen", wert: Format.chf(pm.fixAusgaben),
        vergleich: "alles Feste, das dieses Konto verlässt",
      },
      {
        titel: "Variabel", wert: Format.chf(variabel),
        vergleich: `${pm.buchungen.filter(b => !b.fix && b.ausgabe).length} Zahlungen`,
      },
      {
        titel: "Übrig", wert: Format.chf(uebrig),
        vergleich: vergleich(uebrig >= 0 ? "im Plus" : "im Minus", uebrig >= 0 ? "besser" : "schlechter") + " · wie «Töpfe» im Sheet",
      },
    ] : [
      {
        titel: "Einnahmen", wert: Format.chf(pm.einnahmen),
        vergleich: vor ? `${veraenderung(pm.einnahmen, vor.einnahmen, true) || "–"} vs. Vormonat` : "",
      },
      {
        titel: "Ausgaben", wert: Format.chf(pm.ausgaben),
        vergleich: schnittAus != null ? `${veraenderung(pm.ausgaben, schnittAus, false) || "–"} vs. Ø 3 Monate` : "",
      },
      {
        titel: "Gespart",
        wert: Format.chf(pm.gespart),
        vergleich: pm.sparquote != null
          ? `Sparquote ${vergleich(Format.prozent(pm.sparquote), pm.sparquote * 100 < zustand.einst.minSparquote ? "schlechter" : "besser")}`
          : "keine Einnahmen",
      },
      d.hatKontostand ? {
        titel: "Kontostand Monatsende",
        wert: pm.saldoEnde != null ? Format.chf(pm.saldoEnde) : "–",
        vergleich: vor && vor.saldoEnde != null && pm.saldoEnde != null
          ? `${vergleich(`${pm.saldoEnde >= vor.saldoEnde ? "+" : "−"}${Format.chf(Math.abs(pm.saldoEnde - vor.saldoEnde))}`, pm.saldoEnde >= vor.saldoEnde ? "besser" : "schlechter")} vs. Vormonat`
          : "",
      } : fixTeil,
    ];

    $("kennzahlen").innerHTML = kacheln.map(k => `
      <div class="kennzahl">
        <div class="kennzahl-titel">${k.titel}</div>
        <div class="kennzahl-wert">${k.wert}</div>
        <div class="kennzahl-vergleich">${k.vergleich}</div>
      </div>`).join("");
  }

  // ---------- Warnungen ----------

  const ICONS = {
    kritisch: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    warnung: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17v.01"/></svg>',
    info: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/></svg>',
    gut: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  };
  const STUFEN_TEXT = { kritisch: "Achtung", warnung: "Warnung", info: "Info", gut: "OK" };

  function warnungsliste() {
    const liste = window.Analyse.warnungen(zustand.daten, zustand.monat,
      { ...zustand.einst, topfSicht: zustand.kontoFilter !== "alle", topf: zustand.kontoFilter });
    const reihenfolge = { kritisch: 0, warnung: 1, info: 2, gut: 3 };
    liste.sort((a, b) => reihenfolge[a.stufe] - reihenfolge[b.stufe]);
    $("warnungen").innerHTML = liste.map(w => `
      <li class="warnung ${w.stufe}">
        ${ICONS[w.stufe]}
        <div><strong><span class="unsichtbar">${STUFEN_TEXT[w.stufe]}: </span>${esc(w.titel)}</strong><span>${esc(w.text)}</span></div>
      </li>`).join("");
  }

  // ---------- Balkenlisten ----------

  function balkenliste(el, eintraege, gesamt, detailFn) {
    if (!eintraege.length) {
      el.innerHTML = '<li><span class="leer">Keine Ausgaben in diesem Zeitraum.</span></li>';
      return;
    }
    const max = eintraege[0][1];
    el.innerHTML = eintraege.map(([name, betrag]) => `
      <li>
        <span class="name">${esc(name)}</span>
        <span class="betrag">${Format.chf(betrag)}</span>
        <div class="spur" aria-hidden="true"><div class="fuellung" data-breite="${Math.max(1, (betrag / max) * 100).toFixed(1)}"></div></div>
        <span class="detail">${Math.round((betrag / gesamt) * 100)} % der Ausgaben${detailFn ? detailFn(name, betrag) : ""}</span>
      </li>`).join("");
    // Breite per JavaScript setzen (die Sicherheitsregel verbietet style="…" im HTML)
    for (const f of el.querySelectorAll("[data-breite]")) f.style.width = `${f.dataset.breite}%`;
  }

  function kategorien() {
    const d = zustand.daten;
    const el = $("kategorien");
    if (zustand.katModus === "monat") {
      const pm = d.proMonat[zustand.monat];
      const eintraege = Object.entries(pm.nachKategorie).sort((a, b) => b[1] - a[1]);
      $("kat-fuss").textContent = pm.umbuchungRaus || pm.umbuchungRein
        ? `Nicht mitgezählt: Umbuchungen (${Format.chf(pm.umbuchungRaus + pm.umbuchungRein)})` : "";
      const nurFix = new Set(Object.keys(pm.nachKategorie).filter(k => !(k in pm.variabelNachKategorie)));
      balkenliste(el, eintraege, pm.ausgaben, (kat, betrag) => {
        if (nurFix.has(kat)) return " · Fixkosten";
        const schnitt = window.Analyse.durchschnittVorher(d, zustand.monat, kat);
        if (schnitt == null) return "";
        if (schnitt === 0) return " · neu diesen Monat";
        const diff = betrag / schnitt - 1;
        const hoch = diff * 100 > zustand.einst.kategorieProzent && betrag - schnitt >= 50;
        const txt = `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))} % vs. Ø`;
        return ` · ${hoch ? `<span class="hoch">${txt}</span>` : txt}`;
      });
    } else {
      const bereich = bereichMonate();
      const z = window.Analyse.zeitraum(d, bereich);
      $("kat-fuss").textContent = "";
      const eintraege = Object.entries(z.nachKategorie)
        .map(([k, v]) => [k, v / bereich.length]).sort((a, b) => b[1] - a[1]);
      balkenliste(el, eintraege, z.ausgaben / bereich.length, () => " · pro Monat");
    }
  }

  function zahlungsmittel() {
    const pm = zustand.daten.proMonat[zustand.monat];
    $("zm-zeitraum").textContent = Format.monat(zustand.monat);
    const anzahl = {};
    for (const b of pm.buchungen) if (b.ausgabe) anzahl[b.zahlungsmittel] = (anzahl[b.zahlungsmittel] || 0) + 1;
    const eintraege = Object.entries(pm.nachZahlungsmittel).sort((a, b) => b[1] - a[1]);
    balkenliste($("zahlungsmittel"), eintraege, pm.ausgaben,
      name => ` · ${anzahl[name]} ${anzahl[name] === 1 ? "Zahlung" : "Zahlungen"}`);
  }

  // ---------- Konto-Filter ----------

  function kontoFilterAnzeigen() {
    const konten = zustand.alleKonten || [];
    const el = $("konto-filter");
    el.hidden = konten.length < 2;
    if (el.hidden) return;
    el.innerHTML = ["alle", ...konten].map(k =>
      `<button type="button" data-konto="${esc(k)}" aria-pressed="${k === zustand.kontoFilter}">${k === "alle" ? "Alle Konten" : esc(k)}</button>`).join("");
  }

  // ---------- Budget ----------

  function budgetKarte() {
    const alleBudgets = zustand.budgetsKonto || {};
    const karte = $("karte-budget");
    const namen = Object.keys(alleBudgets).filter(k => zustand.kontoFilter === "alle" || k === zustand.kontoFilter);
    const budgets = Object.fromEntries(namen.map(k => [k, alleBudgets[k]]));
    karte.hidden = !namen.length;
    if (!namen.length) return;
    const pm = zustand.daten.proMonat[zustand.monat];
    let summeB = 0, summeI = 0;
    $("budget").innerHTML = namen.map(kat => {
      const budget = budgets[kat];
      const ist = pm.variabelNachKonto[kat] || 0;
      summeB += budget; summeI += ist;
      const anteil = Math.min(100, (ist / budget) * 100);
      const ueber = ist > budget;
      return `<li class="${ueber ? "ueber" : ""}">
        <span class="name">${esc(kat)}</span>
        <span class="betrag">${Format.chf(ist)}</span>
        <div class="spur" aria-hidden="true"><div class="fuellung" data-breite="${Math.max(1, anteil).toFixed(1)}"></div></div>
        <span class="detail">von ${Format.chf(budget)} · ${ueber ? `<span class="hoch">${Format.chf(ist - budget)} überschritten</span>` : `noch ${Format.chf(budget - ist)} übrig`}</span>
      </li>`;
    }).join("");
    for (const f of $("budget").querySelectorAll("[data-breite]")) f.style.width = `${f.dataset.breite}%`;
    $("budget-summe").textContent = `Total ${Format.chf(summeI)} von ${Format.chf(summeB)}`;
  }

  // ---------- Fixkosten, Fälligkeiten, Cler-Topf ----------

  function fixkostenKarten() {
    const A = window.Analyse;
    const fk = zustand.fixkosten.filter(f => zustand.kontoFilter === "alle" || f.konto === zustand.kontoFilter);
    for (const id of ["karte-fix", "karte-faellig", "karte-cler"]) $(id).hidden = !zustand.fixkosten.length;
    if (!zustand.fixkosten.length) return;

    // 1) Fixkosten pro Monat nach Gruppe
    const opt = { ...fixOptionen(), topfSicht: zustand.kontoFilter !== "alle" };
    const ue = A.fixUebersicht(fk, opt);
    const eintraege = Object.entries(ue.nachGruppe).sort((a, b) => b[1] - a[1]);
    const total = eintraege.reduce((s, e) => s + e[1], 0);
    balkenliste($("fix-gruppen"), eintraege, total || 1, null);
    for (const d of $("fix-gruppen").querySelectorAll(".detail")) d.textContent = d.textContent.replace("der Ausgaben", "der Fixkosten");
    $("fix-summe").textContent = `${Format.chf(total)} pro Monat`;
    const teile = [];
    if (ue.einnahmen) teile.push(`Feste Einnahmen ${Format.chf(ue.einnahmen)}`);
    if (ue.sparen) teile.push(`Sparen & Investieren ${Format.chf(ue.sparen)}`);
    if (ue.ruecklagen) teile.push(`Rücklagen ${Format.chf(ue.ruecklagen)}`);
    if (ue.transfer) teile.push(`Überweisungen ${Format.chf(ue.transfer)}`);
    if (ue.intern && !opt.topfSicht) teile.push(`interne Einzahlungen ${Format.chf(ue.intern)} (nicht doppelt gezählt)`);
    if (ue.ignoriert) teile.push(`ignorierte Planwerte ${Format.chf(ue.ignoriert)}`);
    $("fix-fuss").textContent = `${teile.length ? `Ausserdem pro Monat: ${teile.join(" · ")}. ` : ""}Jahresbeträge sind auf 12 Monate verteilt.`;

    // 2) Fälligkeiten der nächsten 3 Monate (ab dem gewählten Monat)
    const heute = new Date().toISOString().slice(0, 7);
    const ab = zustand.monat < heute ? heute : zustand.monat;
    const faellig = A.faelligkeiten(fk, ab, 3, opt);
    $("faellig-unbekannt").textContent = ue.ohneFaellig
      ? `${ue.ohneFaellig} ${ue.ohneFaellig === 1 ? "Posten hat" : "Posten haben"} noch keine Fälligkeit und ${ue.ohneFaellig === 1 ? "fehlt" : "fehlen"} hier.` : "";
    $("faellig").innerHTML = faellig.map(f => `
      <li>
        <div class="faellig-kopf"><strong>${Format.monat(f.monat)}</strong><span>${f.summe ? Format.chf(f.summe) : "–"}</span></div>
        ${f.posten.length ? `<ul>${f.posten.map(p => `<li><span>${esc(p.posten)}${p.ueberCler ? ' <em class="marke">Cler</em>' : ""}</span><span>${Format.chf(p.betrag)}</span></li>`).join("")}</ul>`
          : '<p class="leer">Keine Jahres-/Quartalsrechnungen fällig.</p>'}
      </li>`).join("");

    // 3) Cler-Topf: Bedarf und Prognose
    const bedarf = A.clerBedarfProMonat(zustand.fixkosten);
    const saldo = parseFloat(String(zustand.einst.clerSaldo || (zustand.quelle?.beispiel ? "2400" : "")).replace(/['’\s]/g, "").replace(",", "."));
    const einzahlungEingabe = parseFloat(String(zustand.einst.clerEinzahlung).replace(/['’\s]/g, "").replace(",", "."));
    const einzahlung = isFinite(einzahlungEingabe) ? einzahlungEingabe : bedarf;
    const box = $("cler-inhalt");
    let html = `<p class="cler-bedarf">Nötige Einzahlung: <strong>${Format.chf(bedarf)}</strong> pro Monat
      <span>(alle Posten «Über Cler», auf 12 Monate verteilt)</span></p>`;
    if (isFinite(saldo)) {
      const verlauf = A.clerPrognose(zustand.fixkosten, saldo, einzahlung, heute, 12);
      const tiefst = verlauf.reduce((min, v) => v.saldo < min.saldo ? v : min, verlauf[0]);
      const ok = tiefst.saldo >= 0;
      html += `<div class="cler-status ${ok ? "ok" : "knapp"}">${ok ? ICONS.gut : ICONS.kritisch}
        <div><strong>${ok ? "Der Cler-Topf reicht für die nächsten 12 Monate." : "Achtung: Der Cler-Topf reicht nicht!"}</strong>
        <span>Tiefster Stand ${Format.chf(tiefst.saldo)} Ende ${Format.monat(tiefst.monat)} · gerechnet mit ${Format.chf(einzahlung)} Einzahlung pro Monat.</span></div></div>
        <ul class="cler-verlauf">${verlauf.filter(v => v.raus).map(v =>
          `<li><span>${Format.monatKurz(v.monat)}</span><span>−${Format.chf(v.raus)}</span><span class="${v.saldo < 0 ? "hoch" : ""}">${Format.chf(v.saldo)}</span></li>`).join("")}</ul>`;
    } else {
      html += `<p class="hinweis">Trag unter «Einstellungen und Daten» den aktuellen Kontostand des Cler-Kontos ein. Dann rechnet das Dashboard aus, ob der Topf für die nächsten 12 Monate reicht.</p>`;
    }
    box.innerHTML = html;
  }

  // ---------- Kennzahlen aus dem Sheet ----------

  function sheetKennzahlen() {
    const k = zustand.kennzahlen;
    $("karte-sheet").hidden = !k || !k.werte.length;
    if ($("karte-sheet").hidden) return;
    $("sheet-monat").textContent = k.monat ? `Stand Export: ${Format.monat(k.monat.slice(0, 7))}` : "";
    $("sheet-werte").innerHTML = k.werte.map(w => {
      const prozent = /quote|%|anteil/i.test(w.label) && Math.abs(w.wert) <= 1.5;
      const anzahl = /tage|anzahl|monate|stück/i.test(w.label);
      const wert = prozent ? Format.prozent(w.wert) : anzahl ? Format.zahl(w.wert) : Format.chf(w.wert);
      return `<li><span>${esc(w.label)}</span><span class="betrag">${wert}</span></li>`;
    }).join("");
  }

  // ---------- Tabelle ----------

  function buchungsTabelle() {
    const suche = $("suche").value.trim().toLowerCase();
    let liste, titel;
    if (suche) {
      liste = zustand.buchungen.filter(b => !b.fix &&
        [b.kategorie, b.beschreibung, b.zahlungsmittel, Format.datum(b.datum)].join(" ").toLowerCase().includes(suche));
      titel = `Suche: ${liste.length} Treffer`;
    } else {
      liste = zustand.daten.proMonat[zustand.monat].buchungen.filter(b => !b.fix);
      titel = `Buchungen ${Format.monat(zustand.monat)}`;
    }
    $("buchungen-titel").textContent = titel;
    // Saldo-Spalte nur zeigen, wenn es Saldo-Werte gibt
    document.querySelector(".tabelle").classList.toggle("ohne-saldo", !liste.some(b => b.saldo != null));
    liste = [...liste].sort((a, b) => a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : b.nr - a.nr).slice(0, 500);
    $("buchungen").innerHTML = liste.map(b => {
      const betrag = b.umbuchung
        ? `<span class="umb">${b.einnahme ? "+" : "−"}${Format.betrag(b.einnahme || b.ausgabe)}</span>`
        : b.einnahme
          ? `<span class="plus">+${Format.betrag(b.einnahme)}</span>`
          : `−${Format.betrag(b.ausgabe)}`;
      return `<tr>
        <td>${Format.datum(b.datum).slice(0, 6)}<span class="jahr">${b.datum.slice(0, 4)}</span></td>
        <td>${esc(b.kategorie)}</td>
        <td>${esc(b.beschreibung)}${b.notiz ? `<span class="notiz">${esc(b.notiz)}</span>` : ""}<span class="unterzeile">${esc(b.kategorie)}</span></td>
        <td>${esc(b.zahlungsmittel)}</td>
        <td class="zahl">${betrag}</td>
        <td class="zahl">${b.saldo != null ? Format.betrag(b.saldo) : ""}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="6">Keine Buchungen gefunden.</td></tr>';
  }

  // ---------- Diagramme (Chart.js) ----------

  function farbe(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  }
  function transparent(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function grundOptionen() {
    const leise = farbe("text-leise");
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: farbe("flaeche"),
          titleColor: farbe("text"),
          bodyColor: farbe("text-2"),
          borderColor: farbe("achse"),
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: farbe("achse") },
          ticks: { color: leise, maxRotation: 0, autoSkipPadding: 8 },
        },
        y: {
          grid: { color: farbe("linie") },
          border: { display: false },
          ticks: { color: leise, maxTicksLimit: 6 },
        },
      },
    };
  }

  function zeichneDiagramme() {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;

    const d = zustand.daten;
    const bereich = bereichMonate();
    const labels = bereich.map(Format.monatKurz);
    const s1 = farbe("s1"), s2 = farbe("s2"), s7 = farbe("s7");
    const gewaehlt = bereich.indexOf(zustand.monat);
    const hervorheben = (c) => bereich.map((_, i) => i === gewaehlt ? c : transparent(c, 0.45));

    // 1) Einnahmen und Ausgaben pro Monat
    const opt1 = grundOptionen();
    opt1.scales.y.ticks.callback = v => Format.zahl(v);
    opt1.plugins.tooltip.callbacks = {
      title: items => Format.monat(bereich[items[0].dataIndex]),
      label: c => ` ${c.dataset.label}: ${Format.chf(c.raw)}`,
      footer: items => {
        const pm = d.proMonat[bereich[items[0].dataIndex]];
        return `Gespart: ${Format.chf(pm.gespart)}`;
      },
    };
    opt1.plugins.tooltip.footerColor = farbe("text");
    opt1.onClick = (evt, el, chart) => {
      const pts = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, false);
      if (pts.length) waehleMonat(bereich[pts[0].index]);
    };
    neu("chart-monate", {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Einnahmen", data: bereich.map(m => d.proMonat[m].einnahmen), backgroundColor: hervorheben(s1),
            borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 22, categoryPercentage: 0.7, barPercentage: 0.9 },
          { label: "Ausgaben", data: bereich.map(m => d.proMonat[m].ausgaben), backgroundColor: hervorheben(s2),
            borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 22, categoryPercentage: 0.7, barPercentage: 0.9 },
        ],
      },
      options: opt1,
    });

    // 2) Sparquote und Trend
    const opt2 = grundOptionen();
    opt2.scales.y.ticks.callback = v => `${v} %`;
    opt2.plugins.tooltip.callbacks = {
      title: items => Format.monat(bereich[items[0].dataIndex]),
      label: c => c.raw == null ? null : ` ${c.dataset.label}: ${c.raw.toFixed(1)} %`,
    };
    const pct = v => v == null ? null : Math.round(v * 1000) / 10;
    neu("chart-sparquote", {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Sparquote", data: bereich.map(m => pct(d.proMonat[m].sparquote)), borderColor: s1, backgroundColor: s1,
            borderWidth: 2, pointRadius: bereich.map((_, i) => i === gewaehlt ? 5 : 3), pointHoverRadius: 6,
            pointBorderColor: farbe("flaeche"), pointBorderWidth: 2, tension: 0.25 },
          { label: "Ø 3 Monate", data: bereich.map(m => pct(d.proMonat[m].sparquote3M)), borderColor: s7, backgroundColor: s7,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.35 },
          { label: "Ziel", data: bereich.map(() => zustand.einst.minSparquote), borderColor: farbe("text-leise"),
            backgroundColor: farbe("text-leise"), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0 },
        ],
      },
      options: opt2,
    });

    // 3) Kontostand-Verlauf (nur wenn Saldo-Daten vorhanden)
    $("karte-saldo").hidden = !d.hatKontostand;
    if (!d.hatKontostand) { if (diagramme["chart-saldo"]) { diagramme["chart-saldo"].destroy(); delete diagramme["chart-saldo"]; } return; }
    const opt3 = grundOptionen();
    opt3.scales.y.ticks.callback = v => Format.zahl(v);
    opt3.plugins.tooltip.callbacks = {
      title: items => `Ende ${Format.monat(bereich[items[0].dataIndex])}`,
      label: c => ` Kontostand: ${Format.chf(c.raw)}`,
    };
    $("saldo-quelle").textContent = d.hatSaldo ? "Monatsende" : "berechnet (keine Saldo-Spalte)";
    neu("chart-saldo", {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Kontostand", data: bereich.map(m => d.proMonat[m].saldoEnde),
          borderColor: s1, backgroundColor: transparent(s1, 0.10), fill: "origin",
          borderWidth: 2, tension: 0.25, pointBorderColor: farbe("flaeche"), pointBorderWidth: 2,
          pointBackgroundColor: s1, pointRadius: bereich.map((_, i) => i === gewaehlt ? 5 : 3), pointHoverRadius: 6,
        }],
      },
      options: opt3,
    });
  }

  function neu(id, konfig) {
    if (diagramme[id]) diagramme[id].destroy();
    diagramme[id] = new Chart($(id), konfig);
  }

  // ---------- Einstellungen ----------

  function einstellungenAnzeigen() {
    $("e-kat").value = zustand.einst.kategorieProzent;
    $("e-spar").value = zustand.einst.minSparquote;
    $("e-gross").value = zustand.einst.grosseAusgabe;
    $("e-umb").value = zustand.einst.umbuchungen;
    $("e-ignorieren").value = zustand.einst.ignorierePosten ?? "";
    $("e-ruecklagen").value = zustand.einst.ruecklagen ?? "";
    $("e-cler-saldo").value = zustand.einst.clerSaldo ?? "";
    $("e-cler-ein").value = zustand.einst.clerEinzahlung ?? "";
    $("e-cler-ein").placeholder = zustand.fixkosten.length
      ? Format.betrag(window.Analyse.clerBedarfProMonat(zustand.fixkosten)) : "";
    if (document.activeElement !== $("e-regeln")) $("e-regeln").value = zustand.einst.regeln;
  }

  // Liste der geladenen Konten (mit "Entfernen")
  function kontenListe() {
    const el = $("konten");
    const proKonto = {};
    for (const b of zustand.buchungen) {
      const name = b.quelle === "sheet" ? "Finanz-Sheet" : b.konto;
      const k = proKonto[name] ||= { anzahl: 0, von: b.datum, bis: b.datum };
      k.anzahl++;
      if (b.datum < k.von) k.von = b.datum;
      if (b.datum > k.bis) k.bis = b.datum;
    }
    el.innerHTML = Object.entries(proKonto).map(([name, k]) => `
      <li>
        <div><strong>${esc(name)}</strong>
        <span>${k.anzahl} Buchungen · ${Format.datum(k.von)} – ${Format.datum(k.bis)}${name === "Finanz-Sheet" && zustand.fixkosten.length ? ` · ${zustand.fixkosten.length} Fixkosten-Posten` : ""}</span></div>
        ${zustand.quelle.beispiel ? "" : `<button class="knopf knopf-klein" type="button" data-entfernen="${esc(name)}">Entfernen</button>`}
      </li>`).join("");
  }

  // Häufigste Texte ohne Kategorie -> Hilfe beim Regeln-Schreiben
  function offeneBuchungen() {
    const zaehler = {};
    for (const b of zustand.buchungen) {
      if (b.kategorie !== "Nicht zugeordnet") continue;
      const t = (b.beschreibung || "(ohne Text)").slice(0, 60);
      const z = zaehler[t] ||= { anzahl: 0, summe: 0 };
      z.anzahl++; z.summe += b.ausgabe;
    }
    const liste = Object.entries(zaehler).sort((a, b) => b[1].summe - a[1].summe).slice(0, 10);
    $("offen-box").hidden = !liste.length;
    $("offen").innerHTML = liste.map(([t, z]) =>
      `<li><span>${esc(t)}</span><span class="betrag">${z.anzahl}× · ${Format.chf(z.summe)}</span></li>`).join("");
  }

  function einstellungAendern() {
    const lese = (id, std, min, max) => {
      const v = Number($(id).value);
      return isFinite(v) && $(id).value !== "" ? Math.min(max, Math.max(min, v)) : std;
    };
    zustand.einst = {
      kategorieProzent: lese("e-kat", STANDARD_EINST.kategorieProzent, 5, 500),
      minSparquote: lese("e-spar", STANDARD_EINST.minSparquote, 0, 90),
      grosseAusgabe: lese("e-gross", STANDARD_EINST.grosseAusgabe, 50, 100000),
      umbuchungen: $("e-umb").value.split(",").map(s => s.trim()).filter(Boolean).join(", "),
      regeln: $("e-regeln").value,
      ignorierePosten: $("e-ignorieren").value.trim(),
      ruecklagen: $("e-ruecklagen").value.trim(),
      clerSaldo: $("e-cler-saldo").value.trim(),
      clerEinzahlung: $("e-cler-ein").value.trim(),
    };
    speicherSchreiben(SPEICHER_EINST, zustand.einst);
    setzeBuchungen(zustand.buchungen, false); // neu rechnen
  }

  // ---------- Bedienung ----------

  function waehleMonat(m) {
    if (!zustand.daten.proMonat[m]) return;
    zustand.monat = m;
    alles();
  }

  function setzeUmschalter(gruppe, attr, wert) {
    for (const b of document.querySelectorAll(`[${attr}]`)) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === wert));
    }
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  $("datei").addEventListener("change", async e => {
    const dateien = Array.from(e.target.files);
    e.target.value = ""; // gleiche Datei nochmals wählbar
    if (!dateien.length) return;
    await ladeDateien(await Promise.all(dateien.map(async d => ({ name: d.name, buffer: await d.arrayBuffer() }))));
  });

  $("beispiel").addEventListener("click", async () => {
    try {
      const antwort = await fetch("beispieldaten/beispiel-finanzen.xlsx");
      if (!antwort.ok) throw new Error();
      await ladeDateien([{ name: "beispiel-finanzen.xlsx", buffer: await antwort.arrayBuffer() }], true);
    } catch {
      melde("Die Beispieldaten konnten nicht geladen werden. (Beim direkten Öffnen der Datei vom Computer geht das nicht – bitte über die Webadresse öffnen.)", true);
    }
  });

  $("monat").addEventListener("change", e => waehleMonat(e.target.value));
  $("monat-zurueck").addEventListener("click", () => {
    const m = zustand.daten.monate; waehleMonat(m[m.indexOf(zustand.monat) - 1]);
  });
  $("monat-vor").addEventListener("click", () => {
    const m = zustand.daten.monate; waehleMonat(m[m.indexOf(zustand.monat) + 1]);
  });

  for (const b of document.querySelectorAll("[data-zeitraum]")) {
    b.addEventListener("click", () => {
      zustand.zeitraum = b.dataset.zeitraum;
      setzeUmschalter("zeitraum", "data-zeitraum", zustand.zeitraum);
      kategorien(); zeichneDiagramme();
    });
  }
  for (const b of document.querySelectorAll("[data-kat]")) {
    b.addEventListener("click", () => {
      zustand.katModus = b.dataset.kat;
      setzeUmschalter("kat", "data-kat", zustand.katModus);
      kategorien();
    });
  }

  $("konto-filter").addEventListener("click", e => {
    const knopf = e.target.closest("[data-konto]");
    if (!knopf) return;
    zustand.kontoFilter = knopf.dataset.konto;
    setzeBuchungen(zustand.buchungen, false);
  });

  $("suche").addEventListener("input", buchungsTabelle);
  for (const id of ["e-kat", "e-spar", "e-gross", "e-umb", "e-regeln", "e-ignorieren", "e-ruecklagen", "e-cler-saldo", "e-cler-ein"]) $(id).addEventListener("change", einstellungAendern);

  $("loeschen").addEventListener("click", () => {
    if (!confirm("Gespeicherte Finanzdaten von diesem Gerät löschen?\n\nDeine Excel-Datei selbst bleibt unverändert.")) return;
    speicherLoeschen(SPEICHER_DATEN);
    zustand.daten = null; zustand.quelle = null; zustand.buchungen = []; zustand.fixkosten = []; zustand.budgetsKonto = {}; zustand.kennzahlen = null;
    for (const id of Object.keys(diagramme)) { diagramme[id].destroy(); delete diagramme[id]; }
    $("dashboard").hidden = true;
    $("start").hidden = false;
    $("status").textContent = "Keine Datei geladen";
    $("datei-text").textContent = "Datei öffnen";
    melde("Die Daten wurden von diesem Gerät gelöscht.");
  });

  $("konten").addEventListener("click", e => {
    const knopf = e.target.closest("[data-entfernen]");
    if (!knopf) return;
    const konto = knopf.dataset.entfernen;
    if (!confirm(`Alle Buchungen von «${konto}» von diesem Gerät entfernen?`)) return;
    const rest = zustand.buchungen.filter(b => konto === "Finanz-Sheet" ? b.quelle !== "sheet" : (b.konto !== konto || b.quelle === "sheet"));
    if (konto === "Finanz-Sheet") zustand.fixkosten = [];
    if (!rest.length && !zustand.fixkosten.length) { $("loeschen").click(); return; }
    rest.forEach((b, i) => { b.nr = i; });
    setzeBuchungen(rest, false);
    speichern();
    melde(`«${konto}» wurde entfernt.`);
  });

  $("regeln-standard").addEventListener("click", () => {
    if (!confirm("Deine Regeln durch die Standard-Regeln ersetzen?")) return;
    $("e-regeln").value = window.Analyse.STANDARD_REGELN;
    einstellungAendern();
  });

  // Hell/Dunkel gewechselt -> Diagrammfarben neu setzen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (zustand.daten) zeichneDiagramme();
  });

  // ---------- Start ----------

  const gespeichert = speicherLesen(SPEICHER_DATEN);
  if (gespeichert && Array.isArray(gespeichert.buchungen) &&
      (gespeichert.buchungen.length || (gespeichert.fixkosten || []).length)) {
    zustand.quelle = { beispiel: false, geladenAm: gespeichert.geladenAm || gespeichert.quelle?.geladenAm };
    zustand.fixkosten = gespeichert.fixkosten || [];
    zustand.budgetsKonto = gespeichert.budgetsKonto || {};
    zustand.kennzahlen = gespeichert.kennzahlen || null;
    setzeBuchungen(gespeichert.buchungen, true);
  }

  // Offline-Funktion (nur über https, z.B. GitHub Pages)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Modus weiter */ });
  }
})();
