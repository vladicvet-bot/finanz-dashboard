/*
 * Finanz-Dashboard – Bedienung und Anzeige.
 * Alles läuft im Browser. Gespeichert wird (falls gewünscht) nur im
 * Speicher dieses Browsers auf diesem Gerät ("localStorage").
 */
(function () {
  "use strict";

  // Fehlt ein Teil der App (z.B. von einem Werbe-/Tracking-Blocker blockiert), klar melden statt still abbrechen
  if (!window.Analyse || !window.TabellenLeser) {
    const el = document.getElementById("meldung");
    if (el) {
      el.classList.add("fehler");
      el.hidden = false;
      el.textContent = "Ein Teil der App konnte nicht geladen werden. Häufigste Ursache: ein Werbe- oder Tracking-Blocker " +
        "(z.B. uBlock, AdBlock). Bitte für diese Seite ausschalten und neu laden – oder die Seite in einem anderen Browser öffnen. " +
        "Hilft das nicht: Seite mit Ctrl + Shift + R neu laden.";
    }
    return;
  }

  // ---------- Zahlen- und Datumsformat (Schweiz) ----------

  const chfFormat = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });
  const zahlFormat = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
  const betragFormat = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monatLang = new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric", timeZone: "UTC" });
  const monatKurz = new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: "UTC" });

  const Format = {
    chf: v => (v < 0 ? "−" : "") + chfFormat.format(Math.abs(v)),
    zahl: v => zahlFormat.format(v),
    betrag: v => (v < 0 ? "−" : "") + betragFormat.format(Math.abs(v)), // ohne "CHF", für die Tabelle
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
    vermoegen: [],         // Stände aus dem Blatt «Vermögen»
    vmLokal: { eintraege: [], pikett: [], konten: [], ...(speicherLesen("finanzDashboard.vermoegenLokal.v1") || {}) },
    ansicht: "uebersicht",
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
    let neuesVermoegen = beispiel || zustand.quelle?.beispiel ? [] : zustand.vermoegen;

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
          if (e.vermoegen.length) neuesVermoegen = window.Analyse.vermoegenZusammenfuehren(e.vermoegen, neuesVermoegen);
          t = `✓ ${name}: ${e.anzahlAusgaben} Ausgaben, ${e.anzahlEinnahmen} Einnahmen, ${e.fixkosten.length} Fixkosten-Posten`;
          if (e.vermoegen.length) t += `, ${new Set(e.vermoegen.map(v => v.konto)).size} Konten/Anlagen im Vermögen`;
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
        zeilenText.push(`✗ ${name}: ${FEHLERTEXTE[err.message] || "Die Datei konnte nicht gelesen werden."}` +
          (err.details ? `\nGefundene Blätter und Spalten: ${err.details}\nErwartet z.B. ein Blatt «Fixkosten» mit Posten · Gruppe · Rhythmus · Betrag CHF, oder «Ausgaben» / «Vermögen».` : ""));
      }
    }
    if (!geladen) { melde(zeilenText.join("\n"), true); return; }

    alle.forEach((b, i) => { b.nr = i; });
    zustand.quelle = { geladenAm: new Date().toISOString(), beispiel };
    zustand.fixkosten = neueFixkosten;
    zustand.budgetsKonto = neueBudgets;
    zustand.kennzahlen = neueKennzahlen;
    zustand.vermoegen = neuesVermoegen;
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
      budgetsKonto: zustand.budgetsKonto, kennzahlen: zustand.kennzahlen, vermoegen: zustand.vermoegen,
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
    const daten = buchungen.map(b => b.datum).concat(zustand.vmLokal.pikett.map(p => p.datum)).sort();
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
    let alle = buchungen.concat(pikettBuchungen(buchungen), fix);
    A.zuordnen(alle, zustand.einst.regeln);
    if (topfSicht) alle = alle.filter(b => b.konto === zustand.kontoFilter);
    if (!alle.length) alle = buchungen.concat(fix);
    if (!alle.length) {
      // Nur Vermögen geladen: einen leeren Monat anlegen, damit die Seite funktioniert
      alle = [{ datum: `${heute}-01`, beschreibung: "", kategorie: "Nicht zugeordnet", kategorieDatei: "", zahlungsmittelDatei: "",
        konto: "Ohne Konto", einnahme: 0, ausgabe: 0, saldo: null, fix: true, nr: -1 }];
    }

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
    vermoegenKarten();
    if (zustand.ansicht === "fixkosten") fixkostenAnsicht();
    kacheln();
    fluss();
    gruppen();
    warnungsliste();
    budgetKarte();
    fixkostenKarten();
    sheetKennzahlen();
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
      : `${nurVermoegenGeladen() ? "Nur Vermögen" : istSheet ? "Finanz-Excel" : konten.length === 1 ? konten[0] : `${konten.length} Konten`} · auf diesem Gerät gespeichert`;
    // Übersicht ohne Einnahmen/Ausgaben: Hinweis statt leerer Nullen
    const leer = nurVermoegenGeladen();
    $("uebersicht-leer").hidden = !leer;
    for (const id of ["kacheln", "karte-fluss", "karte-gruppen", "spalte-budget-beachten"]) $(id).hidden = leer;
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

  // ---------- Warnungen ----------

  const ICONS = {
    kritisch: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    warnung: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17v.01"/></svg>',
    info: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/></svg>',
    gut: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  };
  const STUFEN_TEXT = { kritisch: "Achtung", warnung: "Warnung", info: "Info", gut: "OK" };

  function warnungsliste() {
    const alle = window.Analyse.warnungen(zustand.daten, zustand.monat,
      { ...zustand.einst, topfSicht: zustand.kontoFilter !== "alle", topf: zustand.kontoFilter });
    const reihenfolge = { kritisch: 0, warnung: 1, gut: 2, info: 3 };
    alle.sort((a, b) => reihenfolge[a.stufe] - reihenfolge[b.stufe]);
    // höchstens 3 Hinweise zeigen – die wichtigsten zuerst
    const wichtig = alle.filter(w => w.stufe !== "info");
    const liste = (wichtig.length ? wichtig : alle).slice(0, zustand.alleHinweise ? 99 : 3);
    const mehr = wichtig.length - liste.length;
    naechsteRechnungen();
    $("warnungen").innerHTML = liste.map(w => `
      <li class="warnung ${w.stufe}">
        ${ICONS[w.stufe]}
        <div><strong><span class="unsichtbar">${STUFEN_TEXT[w.stufe]}: </span>${esc(w.titel)}</strong><span>${esc(w.text)}</span></div>
      </li>`).join("") + (mehr > 0 ? `<li class="mehr"><button type="button" class="link-knopf" id="mehr-hinweise">+ ${mehr} weitere ${mehr === 1 ? "Hinweis" : "Hinweise"} anzeigen</button></li>` : "");
  }

  function naechsteRechnungen() {
    const el = $("naechste-rechnungen");
    if (!zustand.fixkosten.length) { el.innerHTML = ""; return; }
    const heute = new Date().toISOString().slice(0, 7);
    const ab = zustand.monat < heute ? heute : zustand.monat;
    const f = window.Analyse.faelligkeiten(zustand.fixkosten, ab, 2, fixOptionen()).filter(x => x.posten.length);
    el.innerHTML = f.length ? `<h3 class="unter-titel">Nächste Rechnungen</h3><ul class="kurzliste">${f.flatMap(x =>
      x.posten.slice(0, 3).map(p => `<li><span>${Format.monatKurz(x.monat)} · ${esc(p.posten)}</span><span>${Format.chf(p.betrag)}</span></li>`)).join("")}</ul>` : "";
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

  // ---------- Icons (eigene, einfache Linien-Icons) ----------

  const GRUPPEN_ICON = {
    "Wohnen": '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>',
    "Alltag": '<path d="M4 9.5h16l-1.6 9.5H5.6L4 9.5Z"/><path d="m8.5 9.5 2.5-5M15.5 9.5 13 4.5"/>',
    "Mobilität": '<path d="M5 16.5v-4l2-5h10l2 5v4Z"/><circle cx="8" cy="16.5" r="1.6"/><circle cx="16" cy="16.5" r="1.6"/>',
    "Gesundheit": '<path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 1.9C19 14.6 12 19 12 19Z"/>',
    "Freizeit": '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
    "Kinder": '<circle cx="12" cy="12" r="7.5"/><path d="M9.2 13.8a3.6 3.6 0 0 0 5.6 0"/><path d="M9.5 10h.01M14.5 10h.01"/>',
    "Abos & Telefon": '<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M11 17.5h2"/>',
    "Steuern & Versicherungen": '<path d="M12 3.5 5.5 6v5.5c0 4 2.8 7.3 6.5 8.9 3.7-1.6 6.5-4.9 6.5-8.9V6Z"/>',
    "Andere": '<circle cx="6.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="17.5" cy="12" r="1.2"/>',
    "Sparen": '<path d="m4 16 5.5-5.5 4 4L20 8"/><path d="M15 8h5v5"/>',
    "ein": '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    "aus": '<path d="M7 7l10 10"/><path d="M17 9v8H9"/>',
    "spar": '<path d="m4 16 5.5-5.5 4 4L20 8"/><path d="M15 8h5v5"/>',
  };
  const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24">${GRUPPEN_ICON[name] || GRUPPEN_ICON.Andere}</svg>`;
  // feste Farbe pro Hauptgruppe (Reihenfolge der Palette, nie zyklisch)
  const GRUPPEN_FARBE = {
    "Wohnen": "s1", "Alltag": "s2", "Mobilität": "s3", "Freizeit": "s4", "Gesundheit": "s5",
    "Kinder": "s6", "Abos & Telefon": "s7", "Steuern & Versicherungen": "s8", "Andere": "grau-fest",
  };

  // ---------- Trend-Kacheln ----------

  function kacheln() {
    const d = zustand.daten;
    const pm = d.proMonat[zustand.monat];
    const i = d.monate.indexOf(zustand.monat);
    const verlauf = d.monate.slice(Math.max(0, i - 5), i + 1);
    const vor = i > 0 ? d.proMonat[d.monate[i - 1]] : null;
    const gespart = pm.einnahmen - pm.ausgaben;
    const delta = (jetzt, vorher, mehrGut) => {
      if (!vor || !vorher) return "";
      const diff = (jetzt - vorher) / Math.abs(vorher);
      if (Math.abs(diff) < 0.005) return "gleich wie Vormonat";
      const gut = (diff > 0) === mehrGut;
      return `<span class="${gut ? "besser" : "schlechter"}">${diff > 0 ? "▲" : "▼"} ${Math.abs(Math.round(diff * 100))} %</span> vs. Vormonat`;
    };
    $("k-ein").textContent = Format.chf(pm.einnahmen);
    $("k-ein-unter").innerHTML = delta(pm.einnahmen, vor?.einnahmen, true);
    $("k-aus").textContent = Format.chf(pm.ausgaben);
    $("k-aus-unter").innerHTML = (pm.rueckerstattungen ? `nach ${Format.chf(pm.rueckerstattungen)} Rückerstattung · ` : "") + delta(pm.ausgaben, vor?.ausgaben, false);
    $("k-spar").textContent = Format.chf(gespart);
    $("k-spar").classList.toggle("negativ", gespart < 0);
    $("k-spar-unter").innerHTML = pm.einnahmen > 0
      ? `<span class="${gespart / pm.einnahmen * 100 >= zustand.einst.minSparquote ? "besser" : "schlechter"}">${Format.prozent(gespart / pm.einnahmen)}</span> Sparquote`
      : "keine Einnahmen";
    for (const k of document.querySelectorAll(".icon-kreis[data-icon]")) k.innerHTML = icon(k.dataset.icon);

    if (!window.Chart) return;
    const mini = (id, werte, farbName) => {
      const c = farbe(farbName);
      neu(id, {
        type: "line",
        data: { labels: verlauf.map(Format.monatKurz), datasets: [{
          data: werte, borderColor: c, backgroundColor: transparent(c, 0.15), fill: "origin",
          borderWidth: 2, tension: 0.4, pointRadius: werte.map((_, j) => j === werte.length - 1 ? 3 : 0), pointBackgroundColor: c,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false, beginAtZero: false } },
          layout: { padding: { top: 4, bottom: 2, left: 2, right: 4 } },
        },
      });
    };
    mini("chart-k-ein", verlauf.map(m => d.proMonat[m].einnahmen), "s1");
    mini("chart-k-aus", verlauf.map(m => d.proMonat[m].ausgaben), "s2");
    mini("chart-k-spar", verlauf.map(m => d.proMonat[m].einnahmen - d.proMonat[m].ausgaben), "gut");
  }

  // ---------- Geldfluss (eigenes SVG-Flussdiagramm) ----------

  function fluss() {
    const d = zustand.daten;
    const pm = d.proMonat[zustand.monat];
    $("fluss-monat").textContent = Format.monat(zustand.monat);
    const A = window.Analyse;
    const gruppenListe = A.nachHauptgruppe(pm);

    // Rechte Seite: Hauptgruppen (brutto), Sparen, Übrig
    const rechts = gruppenListe.map(g => ({ name: g.name, wert: g.summe, farbe: GRUPPEN_FARBE[g.name] || "grau-fest" }));
    if (pm.sparen > 0) rechts.push({ name: "Sparen & Investieren", wert: pm.sparen, farbe: "gut", icon: "Sparen" });
    const brutto = rechts.reduce((s, r) => s + r.wert, 0);

    // Linke Seite: Einkommen, Rückerstattungen, ggf. Fehlbetrag
    const links = [];
    const einkommenNachArt = {};
    for (const b of pm.buchungen) {
      if (!b.einnahme || b.umbuchung || /rückerstatt|rueckerstatt|erstattung|retoure/i.test(b.kategorie)) continue;
      const name = b.fix ? b.beschreibung : b.kategorie;
      einkommenNachArt[name] = (einkommenNachArt[name] || 0) + b.einnahme;
    }
    for (const [name, wert] of Object.entries(einkommenNachArt).sort((a, b) => b[1] - a[1])) links.push({ name, wert });
    if (pm.rueckerstattungen > 0) links.push({ name: "Rückerstattungen", wert: pm.rueckerstattungen });
    const linksSumme = links.reduce((s, l) => s + l.wert, 0);
    if (linksSumme > brutto + 0.5) rechts.push({ name: "Übrig", wert: linksSumme - brutto, farbe: "uebrig" });
    else if (brutto > linksSumme + 0.5) links.push({ name: "Aus Erspartem", wert: brutto - linksSumme, minus: true });
    const total = Math.max(linksSumme, brutto);
    if (total <= 0) { $("fluss").innerHTML = '<p class="leer">Keine Daten für diesen Monat.</p>'; return; }

    // Geometrie
    const breite = $("fluss").clientWidth || 600;
    const schmal = breite < 520;
    const W = breite, linksB = schmal ? 92 : 150, knotenB = 12;
    const rechtsX = schmal ? W - 150 : W - 260;
    const gap = 6, minH = 16;   // Mindesthöhe, damit kleine Posten lesbar bleiben
    const hoeheProCHF = 300 / total;
    const ein = pm.einnahmen || 1;
    const prozent = w => `${Math.round(w / ein * 100)} %`;

    let y = 4; const linksPos = links.map(l => { const h = Math.max(minH, l.wert * hoeheProCHF); const p = { ...l, y, h }; y += h + gap; return p; });
    const linksEnde = y;
    y = 4; const rechtsPos = rechts.map(r => { const h = Math.max(minH, r.wert * hoeheProCHF); const p = { ...r, y, h }; y += h + gap; return p; });
    const H = Math.max(linksEnde, y) + 4;

    // Bänder: der linke Block (alle Quellen zusammen) verteilt sich der Reihe nach auf die rechten Knoten
    const lx = linksB, rx = rechtsX;
    const linksOben = linksPos[0].y;
    let quelleY = linksOben;
    const linksGesamtH = linksPos[linksPos.length - 1].y + linksPos[linksPos.length - 1].h - linksOben;
    const rechtsWert = rechtsPos.reduce((s, r) => s + r.wert, 0);
    const baender = rechtsPos.map(r => {
      const h0 = r.wert / rechtsWert * linksGesamtH;   // Anteil am linken Block
      const y0 = quelleY; quelleY += h0;
      const mx = (lx + knotenB + rx) / 2;
      return `<path class="band f-${r.farbe}" d="M${lx + knotenB},${y0} C${mx},${y0} ${mx},${r.y} ${rx},${r.y} L${rx},${r.y + r.h} C${mx},${r.y + r.h} ${mx},${y0 + h0} ${lx + knotenB},${y0 + h0} Z"><title>${esc(r.name)}: ${Format.chf(r.wert)}</title></path>`;
    }).join("");

    const linksSvg = linksPos.map(l => `
      <rect class="knoten ${l.minus ? "f-schlecht" : "f-ein"}" x="${lx}" y="${l.y}" width="${knotenB}" height="${l.h}" rx="3"/>
      <text class="fluss-name" x="${lx - 8}" y="${l.y + l.h / 2 - (l.h > 30 ? 7 : 0)}" text-anchor="end" dominant-baseline="middle">${esc(kuerze(l.name, schmal ? 11 : 18))}</text>
      ${l.h > 30 ? `<text class="fluss-wert" x="${lx - 8}" y="${l.y + l.h / 2 + 9}" text-anchor="end" dominant-baseline="middle">${Format.zahl(l.wert)}</text>` : ""}`).join("");

    const rechtsSvg = rechtsPos.map(r => `
      <rect class="knoten f-${r.farbe}" x="${rx}" y="${r.y}" width="${knotenB}" height="${r.h}" rx="3"/>
      ${r.h > 30
        ? `<text class="fluss-name" x="${rx + knotenB + 8}" y="${r.y + r.h / 2 - 7}" dominant-baseline="middle">${esc(kuerze(r.name, schmal ? 14 : 26))}</text>
           <text class="fluss-wert" x="${rx + knotenB + 8}" y="${r.y + r.h / 2 + 9}" dominant-baseline="middle">${Format.zahl(r.wert)} · ${prozent(r.wert)}</text>`
        : `<text class="fluss-name" x="${rx + knotenB + 8}" y="${r.y + r.h / 2}" dominant-baseline="middle">${esc(kuerze(r.name, schmal ? 11 : 26))} <tspan class="fluss-wert">${prozent(r.wert)}</tspan></text>`}`).join("");

    $("fluss").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMinYMin meet">${baender}${linksSvg}${rechtsSvg}</svg>`;
  }

  function kuerze(t, n) { t = String(t); return t.length > n ? `${t.slice(0, n - 1)}…` : t; }

  // ---------- Ausgaben nach Bereich (2 Ebenen) ----------

  function gruppen() {
    const d = zustand.daten;
    const pm = d.proMonat[zustand.monat];
    const liste = window.Analyse.nachHauptgruppe(pm);
    const brutto = liste.reduce((s, g) => s + g.summe, 0);
    const ein = pm.einnahmen;
    $("gruppen-total").textContent = `Total ${Format.chf(brutto)}`;
    const max = liste.length ? liste[0].summe : 1;
    $("gruppen").innerHTML = liste.map(g => `
      <li>
        <details>
          <summary>
            <span class="icon-kreis f-bg-${GRUPPEN_FARBE[g.name] || "grau-fest"}">${icon(g.name)}</span>
            <span class="g-text">
              <span class="g-zeile"><span class="name">${esc(g.name)}</span><span class="betrag">${Format.chf(g.summe)}</span></span>
              <span class="spur" aria-hidden="true"><span class="fuellung f-${GRUPPEN_FARBE[g.name] || "grau-fest"}" data-breite="${Math.max(1, g.summe / max * 100).toFixed(1)}"></span></span>
              <span class="detail">${ein ? `${Math.round(g.summe / ein * 100)} % deines Einkommens` : ""}</span>
            </span>
          </summary>
          <ul class="unterliste">${g.kategorien.map(k => `<li><span>${esc(k.name)}${k.fix ? ' <em class="marke">fix</em>' : ""}</span><span>${Format.chf(k.betrag)}</span></li>`).join("")}</ul>
        </details>
      </li>`).join("") || '<li class="leer">Keine Ausgaben in diesem Monat.</li>';
    for (const f of $("gruppen").querySelectorAll("[data-breite]")) f.style.width = `${f.dataset.breite}%`;
  }

  // ---------- Vermögen ----------

  const ART_FARBE = { Konto: "s1", "Rücklage": "s3", Vorsorge: "s7", Investment: "s2", Kinder: "s5", Schulden: "s8", Andere: "grau-fest" };
  const ART_PLURAL = { Konto: "Konten", Investment: "Investments" };

  // Alle Vermögens-Erfassungen: aus dem Sheet + lokal erfasste (ohne Doppelte)
  function alleVermoegen() {
    if (zustand.quelle?.beispiel) return zustand.vermoegen || [];   // Beispiel nie mit echten Daten mischen
    return window.Analyse.vermoegenZusammenfuehren(zustand.vermoegen || [], zustand.vmLokal.eintraege);
  }

  // Karte «Vermögen total» in der Übersicht (bezogen auf den gewählten Monat)
  function vermoegenKarten() {
    const V = window.Analyse.vermoegenBerechnen(alleVermoegen());
    const leer = !V.monate.length;
    $("vm-leer").hidden = !leer;
    $("vm-diagramm").hidden = leer;
    if (leer) {
      $("vm-total").textContent = "–";
      $("vm-delta").textContent = "";
      $("vm-stand").textContent = "";
      if (diagramme["chart-vermoegen"]) { diagramme["chart-vermoegen"].destroy(); delete diagramme["chart-vermoegen"]; }
      vermoegenAnsicht();
      return;
    }
    const passend = zustand.monat ? V.monate.filter(m => m <= zustand.monat) : V.monate;
    const m = passend.length ? passend[passend.length - 1] : V.monate[0];
    const vm = V.proMonat[m];
    const i = V.monate.indexOf(m);
    const vor = i > 0 ? V.proMonat[V.monate[i - 1]] : null;

    $("vm-total").textContent = Format.chf(vm.total);
    let delta = vor ? deltaText(vm) : "";
    if (vm.kinder) delta += `${delta ? " · " : ""}ohne Kinder ${Format.chf(vm.ohneKinder)}`;
    $("vm-delta").innerHTML = delta;
    $("vm-stand").textContent = vm.stichtag ? `Stand ${Format.datum(vm.stichtag)}` : `Stand ${Format.monat(m)}`;

    const bis = V.monate.indexOf(m);
    const bereich = V.monate.slice(Math.max(0, bis - 11), bis + 1);
    if (window.Chart) {
      const s1 = farbe("s1");
      const opt = grundOptionen();
      opt.scales.y.ticks.callback = v => Format.zahl(v);
      opt.scales.y.beginAtZero = false;
      opt.plugins.tooltip.callbacks = {
        title: items => Format.monat(bereich[items[0].dataIndex]),
        label: c => ` Vermögen total: ${Format.chf(c.raw)}`,
      };
      neu("chart-vermoegen", {
        type: "bar",
        data: {
          labels: bereich.map(Format.monatKurz),
          datasets: [{
            label: "Vermögen total", data: bereich.map(x => V.proMonat[x].total),
            backgroundColor: bereich.map((x, j) => j === bereich.length - 1 ? s1 : transparent(s1, 0.4)),
            borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 36,
          }],
        },
        options: opt,
      });
    }
    vermoegenAnsicht();
  }

  // Veränderung zum Vormonat – nur über Konten, die in beiden Monaten vorkommen
  function deltaText(vm) {
    if (!vm || vm.veraenderung == null) return vm && vm.neueKonten ? `${vm.neueKonten} ${vm.neueKonten === 1 ? "Konto" : "Konten"} neu erfasst` : "";
    const diff = vm.veraenderung;
    let t = `<span class="${diff >= 0 ? "besser" : "schlechter"}">${diff >= 0 ? "▲ +" : "▼ −"}${Format.chf(Math.abs(diff))}</span> seit Vormonat`;
    if (vm.neueKonten) t += ` <span class="leise">(${vm.neueKonten} ${vm.neueKonten === 1 ? "Konto" : "Konten"} neu erfasst, nicht mitgerechnet)</span>`;
    return t;
  }

  // Ansicht «Vermögen» (immer der neuste Stichtag)
  function vermoegenAnsicht() {
    const A = window.Analyse;
    const V = A.vermoegenBerechnen(alleVermoegen());
    const leer = !V.monate.length;
    $("v-leer").hidden = !leer;
    for (const id of ["karte-verteilung", "karte-invest"]) $(id).hidden = leer;
    $("karte-pikett").hidden = zustand.quelle?.beispiel || !zustand.vmLokal.pikett.length;
    kopierKnopfText();
    pikettListe();
    if (leer) {
      $("v-total").textContent = "–";
      for (const id of ["v-delta", "v-teile", "v-stichtag", "v-konten-stand"]) $(id).textContent = "";
      $("v-uebernommen").hidden = true;
      $("v-konten").innerHTML = "";
      if (diagramme["chart-v-verlauf"]) { diagramme["chart-v-verlauf"].destroy(); delete diagramme["chart-v-verlauf"]; }
      return;
    }
    const m = V.monate[V.monate.length - 1];
    const vm = V.proMonat[m];
    const vor = V.monate.length > 1 ? V.proMonat[V.monate[V.monate.length - 2]] : null;

    $("v-total").textContent = Format.chf(vm.total);
    $("v-delta").innerHTML = vor ? deltaText(vm) : "";
    $("v-teile").textContent = vm.kinder ? `ohne Kinder ${Format.chf(vm.ohneKinder)} · davon Kinder ${Format.chf(vm.kinder)}` : "";
    $("v-stichtag").textContent = `Stichtag ${Format.datum(vm.stichtag || `${m}-30`)}`;
    $("v-uebernommen").hidden = !vm.uebernommen;
    $("v-uebernommen").textContent = vm.uebernommen
      ? `${vm.uebernommen} ${vm.uebernommen === 1 ? "Konto ist" : "Konten sind"} an diesem Stichtag nicht erfasst – fürs Total wird der letzte bekannte Stand verwendet (in der Tabelle markiert).` : "";

    // Summe pro Art (mit den Konten darunter)
    const gruppen = A.ARTEN.map(art => [art, vm.konten.filter(k => k.art === art).sort((a, b) => Math.abs(b.stand) - Math.abs(a.stand))])
      .filter(([, k]) => k.length);
    const maxAbs = Math.max(1, ...vm.konten.map(k => Math.abs(k.stand)));
    $("verteilung-stand").textContent = vm.stichtag ? Format.datum(vm.stichtag) : "";
    $("verteilung").innerHTML = gruppen.map(([art, konten]) => {
      const summe = konten.reduce((s, k) => s + k.stand, 0);
      return `<div class="gruppe ${art === "Schulden" ? "schulden" : ""} ${art === "Kinder" ? "kinder" : ""}">
        <div class="gruppe-kopf"><strong><i class="punkt f-${ART_FARBE[art]}"></i> ${esc(ART_PLURAL[art] || art)}</strong><span>${Format.chf(summe)}</span></div>
        <ul class="balken">${konten.map(k => `<li>
          <span class="name">${esc(k.konto)}${k.uebernommen ? ' <em class="marke">alt</em>' : ""}</span><span class="betrag">${Format.chf(k.stand)}</span>
          <div class="spur" aria-hidden="true"><div class="fuellung f-${ART_FARBE[art]}" data-breite="${Math.max(1, Math.abs(k.stand) / maxAbs * 100).toFixed(1)}"></div></div>
        </li>`).join("")}</ul>
      </div>`;
    }).join("");
    for (const f of $("verteilung").querySelectorAll("[data-breite]")) f.style.width = `${f.dataset.breite}%`;

    // Investments & Vorsorge: Gewinn, sobald «Eingezahlt» erfasst ist
    const inv = vm.konten.filter(k => k.art === "Investment" || k.art === "Vorsorge");
    $("karte-invest").hidden = !inv.length;
    const mitEin = inv.filter(k => k.eingezahlt);
    const maxI = Math.max(1, ...inv.map(k => Math.max(k.stand, k.eingezahlt || 0)));
    $("invest").innerHTML = inv.map(k => {
      if (!k.eingezahlt) {
        return `<li><div class="invest-kopf"><span class="name">${esc(k.konto)}</span><span>${Format.chf(k.stand)}</span></div>
          <div class="spur duenn"><div class="fuellung" data-breite="${(Math.max(0, k.stand) / maxI * 100).toFixed(1)}"></div></div>
          <div class="detail">«Eingezahlt» noch nicht erfasst – Gewinn folgt</div></li>`;
      }
      const gewinn = k.stand - k.eingezahlt;
      const prozent = gewinn / k.eingezahlt;
      return `<li>
        <div class="invest-kopf"><span class="name">${esc(k.konto)}</span>
          <span class="${gewinn >= 0 ? "besser" : "schlechter"}">${gewinn >= 0 ? "+" : "−"}${Format.chf(Math.abs(gewinn))} (${gewinn >= 0 ? "+" : "−"}${Format.prozent(Math.abs(prozent))})</span></div>
        <div class="spur duenn"><div class="fuellung grau" data-breite="${(k.eingezahlt / maxI * 100).toFixed(1)}"></div></div>
        <div class="spur duenn"><div class="fuellung" data-breite="${(Math.max(0, k.stand) / maxI * 100).toFixed(1)}"></div></div>
        <div class="detail">eingezahlt ${Format.chf(k.eingezahlt)} · heute ${Format.chf(k.stand)}</div>
      </li>`;
    }).join("");
    for (const f of $("invest").querySelectorAll("[data-breite]")) f.style.width = `${f.dataset.breite}%`;
    void mitEin;

    // Tabelle pro Konto
    $("v-konten-stand").textContent = vm.stichtag ? Format.datum(vm.stichtag) : "";
    const reihenfolge = k => A.ARTEN.indexOf(k.art);
    $("v-konten").innerHTML = [...vm.konten].sort((a, b) => reihenfolge(a) - reihenfolge(b) || b.stand - a.stand).map(k => `
      <tr class="${k.uebernommen ? "alt" : ""}">
        <td>${esc(k.konto)}${k.uebernommen ? `<span class="unterzeile-immer">nicht erfasst – Stand vom ${Format.datum(k.datum)}</span>` : ""}${k.notiz ? `<span class="notiz">${esc(k.notiz)}</span>` : ""}</td>
        <td><i class="punkt f-${ART_FARBE[k.art]}"></i> ${esc(k.art)}</td>
        <td class="zahl">${Format.betrag(k.stand)}</td>
        <td class="zahl">${k.veraenderung == null ? "–" : `<span class="${k.veraenderung >= 0 ? "plus" : "minus"}">${k.veraenderung >= 0 ? "+" : "−"}${Format.betrag(Math.abs(k.veraenderung))}</span>`}</td>
        <td class="zahl">${k.gewinn == null ? "" : `<span class="${k.gewinn >= 0 ? "plus" : "minus"}">${k.gewinn >= 0 ? "+" : "−"}${Format.betrag(Math.abs(k.gewinn))}</span>`}</td>
      </tr>`).join("") + `<tr class="summe"><td>Total</td><td></td><td class="zahl">${Format.betrag(vm.total)}</td><td class="zahl">${vm.veraenderung != null ? `${vm.veraenderung >= 0 ? "+" : "−"}${Format.betrag(Math.abs(vm.veraenderung))}` : "–"}</td><td></td></tr>`;

    // Verlauf: gestapelte Balken pro Art + Linie Total (eine Achse, CHF)
    if (!window.Chart) return;
    const bereich = V.monate.slice(-24);
    const arten = A.ARTEN.filter(art => bereich.some(x => V.proMonat[x].nachArt[art]));
    $("v-legende").innerHTML = arten.map(art => `<span><i class="punkt f-${ART_FARBE[art]}"></i>${esc(ART_PLURAL[art] || art)}</span>`).join("")
      + '<span><i class="linie s-text"></i>Total</span>';
    const opt = grundOptionen();
    opt.scales.x.stacked = true;
    opt.scales.y.stacked = true;
    opt.scales.y.ticks.callback = v => Format.zahl(v);
    // Achse nur so weit unter 0, wie die Schulden wirklich reichen
    const minus = Math.min(0, ...bereich.map(x => Object.values(V.proMonat[x].nachArt).filter(v => v < 0).reduce((s, v) => s + v, 0)));
    opt.scales.y.min = minus < 0 ? Math.floor(minus * 1.15 / 500) * 500 : 0;
    opt.scales.y.ticks.maxTicksLimit = 7;
    opt.plugins.tooltip.callbacks = {
      title: items => Format.monat(bereich[items[0].dataIndex]),
      label: c => c.raw ? ` ${c.dataset.label}: ${Format.chf(c.raw)}` : null,
    };
    neu("chart-v-verlauf", {
      type: "bar",
      data: {
        labels: bereich.map(Format.monatKurz),
        datasets: [
          ...arten.map(art => ({
            label: ART_PLURAL[art] || art, stack: "a",
            data: bereich.map(x => V.proMonat[x].nachArt[art] || 0),
            backgroundColor: farbe(ART_FARBE[art]), borderColor: farbe("flaeche"), borderWidth: 1,
            maxBarThickness: 36, order: 2,
          })),
          { type: "line", label: "Total", data: bereich.map(x => V.proMonat[x].total), borderColor: farbe("text"),
            backgroundColor: farbe("text"), borderWidth: 2, pointRadius: 3, pointBackgroundColor: farbe("text"), tension: 0.2, order: 1 },
        ],
      },
      options: opt,
    });
  }

  function pikettListe() {
    const liste = [...zustand.vmLokal.pikett].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12);
    $("v-pikett").innerHTML = liste.map(p => `<li><span>${Format.monat(p.datum.slice(0, 7))} · ${p.anzahl ?? "?"} ${p.anzahl === 1 ? "Dienst" : "Dienste"}${p.aufKK ? " · auf KK überwiesen" : " · noch nicht auf KK"}</span><span>${Format.chf(p.betrag)}</span></li>`).join("");
  }

  // ---------- Erfassung vom 30. ----------

  const ISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Stichtag: der 30. des laufenden Monats (im Februar der letzte Tag)
  const STICHTAG_TAG = 30;
  const stichtagMonat = () => {
    const h = new Date();
    const letzter = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
    return ISO(new Date(h.getFullYear(), h.getMonth(), Math.min(STICHTAG_TAG, letzter)));
  };

  // Kontenliste fürs Formular: alle bekannten Konten (aus Sheet + lokal + selbst hinzugefügt), nach Art sortiert
  function bekannteKonten() {
    const A = window.Analyse;
    const karte = new Map();
    for (const e of [...alleVermoegen()].sort((a, b) => a.datum.localeCompare(b.datum))) karte.set(e.konto, e.art);
    for (const k of zustand.vmLokal.konten) if (!karte.has(k.konto)) karte.set(k.konto, k.art);
    return [...karte.entries()].map(([konto, art]) => ({ konto, art }))
      .sort((a, b) => A.ARTEN.indexOf(a.art) - A.ARTEN.indexOf(b.art));
  }

  function erfassungZeile(k) {
    const mitEin = k.art === "Vorsorge" || k.art === "Investment";
    return `<div class="erf-zeile" data-konto="${esc(k.konto)}" data-art="${esc(k.art)}">
      <div class="erf-name"><i class="punkt f-${ART_FARBE[k.art] || "grau-fest"}"></i><span>${esc(k.konto)}</span><small>${esc(k.art)}</small></div>
      <label><span>Stand CHF</span><input type="text" inputmode="decimal" class="erf-stand" placeholder="–" autocomplete="off"></label>
      ${mitEin ? '<label><span>Eingezahlt CHF</span><input type="text" inputmode="decimal" class="erf-ein" placeholder="optional" autocomplete="off"></label>' : ''}
      <label class="erf-notiz"><span>Notiz</span><input type="text" class="erf-notiz-feld" placeholder="optional" autocomplete="off"></label>
    </div>`;
  }

  function oeffneErfassung() {
    if (zustand.quelle?.beispiel) {
      melde("Bei den Beispieldaten kann nichts erfasst werden. Lade zuerst dein Sheet oder tippe auf der Startseite auf «Nur Vermögen erfassen».", true);
      return;
    }
    $("erf-datum").value = stichtagMonat();
    const konten = bekannteKonten();
    $("erf-liste").innerHTML = konten.length ? konten.map(erfassungZeile).join("")
      : '<p class="klein-hinweis">Noch keine Konten bekannt. Füge zuerst deine Startdaten ein («Daten einfügen») oder lade dein Sheet – oder lege unten Konten an.</p>';
    for (const id of ["erf-p-anzahl", "erf-p-betrag"]) $(id).value = "";
    $("erf-p-kk").checked = false;
    $("erf-meldung").hidden = true;
    $("dlg-erfassung").showModal();
  }

  function speichereErfassung() {
    const A = window.Analyse;
    const datum = $("erf-datum").value;
    if (!datum) return;
    const vorhanden = new Set(alleVermoegen().map(A.vmSchluessel));
    const neu = [], uebersprungen = [], fehler = [];
    for (const z of $("erf-liste").querySelectorAll(".erf-zeile")) {
      const stand = z.querySelector(".erf-stand").value.trim();
      if (!stand) continue;                                  // leer = nicht erfasst
      const e = A.vermoegenEintrag({
        datum, konto: z.dataset.konto, art: z.dataset.art, stand,
        eingezahlt: z.querySelector(".erf-ein")?.value.trim() || "",
        notiz: z.querySelector(".erf-notiz-feld").value,
      });
      if (!e) { fehler.push(z.dataset.konto); continue; }
      if (vorhanden.has(A.vmSchluessel(e))) { uebersprungen.push(e.konto); continue; }  // nie überschreiben
      neu.push(e);
    }
    if (fehler.length) {
      $("erf-meldung").textContent = `Bitte prüfen (keine gültige Zahl): ${fehler.join(", ")}`;
      $("erf-meldung").hidden = false;
      return;
    }
    // Pikett
    let pikett = null;
    const betrag = A.zuBetrag($("erf-p-betrag").value);
    const anzahl = $("erf-p-anzahl").value === "" ? null : Number($("erf-p-anzahl").value);
    if (betrag || anzahl) {
      const schon = zustand.vmLokal.pikett.some(p => p.datum.slice(0, 7) === datum.slice(0, 7));
      if (schon) uebersprungen.push("Pikett (für diesen Monat schon erfasst)");
      else pikett = { datum, anzahl, betrag: Math.abs(betrag || 0), aufKK: $("erf-p-kk").checked };
    }
    if (!neu.length && !pikett) {
      $("erf-meldung").textContent = uebersprungen.length
        ? `Nichts Neues gespeichert – für diesen Stichtag gibt es schon Werte: ${uebersprungen.join(", ")}.`
        : "Es wurde nichts eingetragen.";
      $("erf-meldung").hidden = false;
      return;
    }
    zustand.vmLokal.eintraege.push(...neu);
    if (pikett) zustand.vmLokal.pikett.push(pikett);
    speichereVmLokal();
    const text = vermoegenTSV(neu);
    const kopiert = neu.length && navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false);
    $("dlg-erfassung").close();
    nachVermoegenAenderung();
    const info = `${neu.length} ${neu.length === 1 ? "Wert" : "Werte"} gespeichert${pikett ? " + Pikett" : ""}.` +
      (uebersprungen.length ? ` Nicht überschrieben: ${uebersprungen.join(", ")}.` : "");
    kopiert.then(ok => {
      if (ok) markiereKopiert(neu);
      zeigeKopieren(neu, pikett ? [pikett] : [], info, ok);
    });
  }

  // ---------- Daten einfügen ----------

  function importiereText() {
    const A = window.Analyse;
    const r = A.vermoegenAusText($("imp-text").value);
    const vorhanden = new Set(alleVermoegen().map(A.vmSchluessel));
    const neu = r.eintraege.filter(e => !vorhanden.has(A.vmSchluessel(e)) && (vorhanden.add(A.vmSchluessel(e)), true));
    const doppelt = r.eintraege.length - neu.length;
    if (!neu.length) {
      $("imp-meldung").textContent = r.eintraege.length ? `Alle ${doppelt} Zeilen sind schon vorhanden – nichts überschrieben.`
        : "Keine gültigen Zeilen gefunden. Erwartet: Stichtag · Konto / Anlage · Art · Stand CHF · Eingezahlt CHF · Notiz";
      $("imp-meldung").hidden = false;
      return;
    }
    zustand.vmLokal.eintraege.push(...neu);
    speichereVmLokal();
    $("dlg-import").close();
    $("imp-text").value = "";
    nachVermoegenAenderung();
    const teile = [`${neu.length} Vermögenswerte eingefügt.`];
    if (doppelt) teile.push(`${doppelt} schon vorhanden (nicht überschrieben).`);
    if (r.fehler.length) teile.push(`Zeilen ignoriert (unlesbar): ${r.fehler.join(", ")}.`);
    melde(teile.join(" "));
  }

  // ---------- Für Excel kopieren ----------

  const zahlSheet = v => v == null ? "" : (Math.round(v * 100) / 100).toFixed(2);
  function vermoegenTSV(liste) {
    return liste.map(e => [Format.datum(e.datum), e.konto, e.art, zahlSheet(e.stand), zahlSheet(e.eingezahlt), e.notiz || ""].join("\t")).join("\n");
  }
  function pikettTSV(liste) {
    return liste.map(p => [Format.datum(p.datum), "Pikett-Entschädigung", "Pikett", zahlSheet(p.betrag), "Privat",
      `${p.anzahl ?? "?"} Dienste · auf Kreditkarte überwiesen: ${p.aufKK ? "ja" : "nein"}`].join("\t")).join("\n");
  }
  // Noch nicht ins Excel kopierte Erfassungen (was schon im geladenen Excel steht, zählt als kopiert)
  function offeneErfassungen() {
    const A = window.Analyse;
    const imExcel = new Set((zustand.vermoegen || []).map(A.vmSchluessel));
    const pikettImExcel = m => zustand.buchungen.some(b => b.quelle === "sheet" && b.einnahme && /pikett/i.test(b.kategorieDatei) && b.datum.slice(0, 7) === m);
    return {
      eintraege: zustand.vmLokal.eintraege.filter(e => !e.kopiert && !imExcel.has(A.vmSchluessel(e))).sort((a, b) => a.datum.localeCompare(b.datum)),
      pikett: zustand.vmLokal.pikett.filter(p => !p.kopiert && !pikettImExcel(p.datum.slice(0, 7))).sort((a, b) => a.datum.localeCompare(b.datum)),
    };
  }

  function kopierKnopfText() {
    const o = offeneErfassungen();
    const n = o.eintraege.length + o.pikett.length;
    $("v-kopieren-alle").textContent = n ? `Für Excel kopieren (${n} neu)` : "Für Excel kopieren";
    $("v-kopieren-alle").classList.toggle("knopf-hinweis", n > 0);
  }

  function markiereKopiert(liste) {
    for (const e of liste) e.kopiert = true;
    speichereVmLokal();
    kopierKnopfText();
  }

  // Text in die Zwischenablage (mit Rückfall für ältere Browser)
  function inZwischenablage(text, feld) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => false);
    try { feld.select(); return Promise.resolve(document.execCommand("copy")); } catch { return Promise.resolve(false); }
  }

  function zeigeKopieren(eintraege, pikett, info, autoKopiert = false) {
    zustand.kopierListe = { eintraege, pikett };
    $("kop-info").textContent = `${info ? `${info} ` : ""}${autoKopiert
      ? "✓ Die Vermögenszeilen sind schon kopiert – öffne dein Excel, Blatt «Vermögen», tippe in Spalte A auf die erste leere Zeile und füge ein."
      : "Kopieren und im Excel in die erste leere Zeile (Spalte A) einfügen."}`;
    $("kop-vermoegen").value = vermoegenTSV(eintraege);
    $("kop-pikett").value = pikettTSV(pikett);
    $("kop-pikett-block").hidden = !pikett.length;
    $("kop-vermoegen").closest("form").querySelector('[data-kopiere="kop-vermoegen"]').textContent = autoKopiert ? "Kopiert ✓ (nochmals)" : "Kopieren";
    $("dlg-kopieren").showModal();
  }

  // ---------- Lokaler Speicher (Vermögen + Pikett) ----------

  const SPEICHER_VM = "finanzDashboard.vermoegenLokal.v1";
  function speichereVmLokal() {
    if (!speicherSchreiben(SPEICHER_VM, zustand.vmLokal)) {
      melde("Achtung: Die Erfassung konnte auf diesem Gerät nicht gespeichert werden (privates Surfen?). Bitte jetzt «Für Excel kopieren» nutzen.", true);
    }
  }

  // Nach jeder Änderung: alles neu rechnen (Pikett zählt als Einnahme)
  function nachVermoegenAenderung() {
    if (!zustand.quelle) zustand.quelle = { beispiel: false, geladenAm: new Date().toISOString() };
    setzeBuchungen(zustand.buchungen, !zustand.monat);
  }

  // Pikett-Erfassungen als Einnahme (wenn das Sheet für den Monat nicht schon Pikett enthält)
  function pikettBuchungen(buchungen) {
    if (zustand.quelle?.beispiel) return [];
    return zustand.vmLokal.pikett.filter(p => p.betrag > 0 && !buchungen.some(b =>
      b.einnahme && /pikett/i.test(`${b.kategorieDatei} ${b.beschreibung}`) && b.datum.slice(0, 7) === p.datum.slice(0, 7)))
      .map(p => ({
        datum: p.datum, beschreibung: "Pikett-Entschädigung", kategorieDatei: "Pikett", zahlungsmittelDatei: "",
        notiz: `${p.anzahl ?? "?"} Dienste${p.aufKK ? " · auf Kreditkarte überwiesen" : ""}`,
        konto: "Privat", einnahme: p.betrag, ausgabe: 0, saldo: null, quelle: "pikett", nr: 1e6,
      }));
  }

  // Sind nur Vermögenswerte geladen (keine Buchungen, keine Fixkosten, kein Pikett)?
  function nurVermoegenGeladen() {
    return !zustand.quelle?.beispiel && !zustand.buchungen.length && !zustand.fixkosten.length
      && !(zustand.vmLokal.pikett || []).length;
  }

  // ---------- Ansicht «Fixkosten» ----------

  const SPEICHER_FIXMARKEN = "finanzDashboard.fixMarken.v1";
  const fixMarken = speicherLesen(SPEICHER_FIXMARKEN) || {};
  const fixSchluessel = f => `${f.posten}|${f.gruppe}|${f.konto}`;
  const RHYTHMUS_KURZ = h => h >= 12 ? "monatlich" : h === 4 ? "vierteljährlich" : h === 2 ? "halbjährlich" : h === 1 ? "jährlich" : h < 1 ? `alle ${Math.round(1 / h)} Jahre` : `${h}× pro Jahr`;

  // Durchschnitt der letzten 3 abgeschlossenen Monate (Basis für Anteil am Einkommen und Sparquote)
  function basisMonate() {
    const d = zustand.daten;
    if (!d) return null;
    const jetzt = new Date().toISOString().slice(0, 7);
    let m = d.monate.filter(x => x < jetzt);
    if (!m.length) m = d.monate;
    m = m.slice(-3);
    const s = m.reduce((a, x) => ({ ein: a.ein + d.proMonat[x].einnahmen, aus: a.aus + d.proMonat[x].ausgaben }), { ein: 0, aus: 0 });
    return { monate: m, einnahmen: s.ein / m.length, ausgaben: s.aus / m.length };
  }

  function fixkostenAnsicht() {
    const A = window.Analyse;
    const opt = fixOptionen();
    const nicht = String(zustand.einst.umbuchungen || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
    const alle = zustand.fixkosten || [];
    // Haushalts-Fixkosten: echte Ausgaben, ohne «nicht mitzählen» (z.B. Geschäftliches)
    const posten = alle.filter(f => A.fixArtGenau(f, opt) === "ausgabe" && !nicht.includes(String(f.gruppe).toLowerCase()))
      .map(f => ({ ...f, jahr: f.betrag * f.haeufigkeit, marke: fixMarken[fixSchluessel(f)] || "" }))
      .sort((a, b) => b.jahr - a.jahr);
    const leer = !posten.length;
    $("fx-leer").hidden = !leer;
    for (const el of $("ansicht-fixkosten").querySelectorAll("article:not(#fx-leer)")) el.hidden = leer;
    if (leer) return;

    const proMonat = posten.reduce((s, f) => s + f.proMonat, 0);
    const basis = basisMonate();
    $("fx-monat").textContent = Format.chf(proMonat);
    $("fx-jahr").textContent = `= ${Format.chf(proMonat * 12)} pro Jahr · ${posten.length} Posten`;
    const weitere = [];
    let sparen = 0, ruecklagen = 0, geschaeft = 0;
    for (const f of alle) {
      const art = A.fixArtGenau(f, opt);
      if (art === "sparen") sparen += f.proMonat;
      else if (art === "ruecklage") ruecklagen += f.proMonat;
      else if (art === "ausgabe" && nicht.includes(String(f.gruppe).toLowerCase())) geschaeft += f.proMonat;
    }
    if (sparen) weitere.push(`Sparen ${Format.chf(sparen)}`);
    if (ruecklagen) weitere.push(`Rücklagen ${Format.chf(ruecklagen)}`);
    if (geschaeft) weitere.push(`nicht mitgezählt (z.B. Geschäftliches) ${Format.chf(geschaeft)}`);
    $("fx-ausserdem").textContent = weitere.length ? `Nicht enthalten, pro Monat: ${weitere.join(" · ")}` : "";

    // Anteil am Einkommen
    if (basis && basis.einnahmen > 0) {
      const anteil = proMonat / basis.einnahmen;
      $("fx-anteil").innerHTML = `<div class="ring" data-anteil="${Math.min(100, anteil * 100).toFixed(1)}"><span>${Math.round(anteil * 100)} %</span></div>
        <p>deines Einkommens<br><small>Ø ${basis.monate.length} ${basis.monate.length === 1 ? "Monat" : "Monate"}: ${Format.chf(basis.einnahmen)}</small></p>`;
      const ring = $("fx-anteil").querySelector(".ring");
      ring.style.setProperty("--anteil", `${ring.dataset.anteil}%`);
    } else $("fx-anteil").innerHTML = "";

    // Sparpotenzial aus den Markierungen
    const kuendigen = posten.filter(f => f.marke === "kuendigen");
    const pruefen = posten.filter(f => f.marke === "pruefen");
    const sumJahr = l => l.reduce((s, f) => s + f.jahr, 0);
    if (kuendigen.length || pruefen.length) {
      const plus = sumJahr(kuendigen);
      let quote = "";
      if (basis && basis.einnahmen > 0) {
        const alt = (basis.einnahmen - basis.ausgaben) / basis.einnahmen;
        const neu = (basis.einnahmen - basis.ausgaben + plus / 12) / basis.einnahmen;
        quote = ` · Sparquote <strong>${Format.prozent(alt)} → ${Format.prozent(neu)}</strong>`;
      }
      $("fx-potenzial").innerHTML = `
        ${kuendigen.length ? `<div class="fx-pot gut">${ICONS.gut}<div><strong>Wenn du ${kuendigen.length} ${kuendigen.length === 1 ? "Posten kündigst" : "Posten kündigst"}: + ${Format.chf(plus)} pro Jahr</strong>
          <span>= ${Format.chf(plus / 12)} pro Monat${quote}</span></div></div>` : ""}
        ${pruefen.length ? `<div class="fx-pot">${ICONS.info}<div><strong>${pruefen.length} ${pruefen.length === 1 ? "Posten" : "Posten"} zum Prüfen: ${Format.chf(sumJahr(pruefen))} pro Jahr</strong>
          <span>${pruefen.slice(0, 4).map(f => esc(f.posten)).join(", ")}${pruefen.length > 4 ? " …" : ""}</span></div></div>` : ""}`;
    } else {
      $("fx-potenzial").innerHTML = '<p class="hinweis">Tipp: Markiere unten Posten mit «Prüfen» oder «Kündigen», dann siehst du hier dein Sparpotenzial.</p>';
    }

    // Nach Gruppe (pro Jahr)
    const gruppen = {};
    for (const f of posten) gruppen[f.gruppe] = (gruppen[f.gruppe] || 0) + f.jahr;
    const gl = Object.entries(gruppen).sort((a, b) => b[1] - a[1]);
    balkenliste($("fx-gruppen"), gl, sumJahr(posten) || 1, g => ` · ${Format.chf(gruppen[g] / 12)}/Monat`);
    for (const d of $("fx-gruppen").querySelectorAll(".detail")) d.innerHTML = d.innerHTML.replace("der Ausgaben", "der Fixkosten");

    // Kleine Posten
    const abos = posten.filter(f => /abo|telefon|streaming|internet|handy/i.test(`${f.gruppe} ${f.posten}`));
    const klein = posten.filter(f => f.proMonat < 30);
    $("fx-klein").innerHTML = `
      ${abos.length ? `<div class="fx-zahl"><strong>${abos.length} Abos & Telefon</strong><span>${Format.chf(sumJahr(abos))} pro Jahr</span></div>` : ""}
      <div class="fx-zahl"><strong>${klein.length} Posten unter CHF 30/Monat</strong><span>zusammen ${Format.chf(sumJahr(klein))} pro Jahr</span></div>
      <ul class="kurzliste">${klein.sort((a, b) => b.jahr - a.jahr).slice(0, 8).map(f => `<li><span>${esc(f.posten)}</span><span>${Format.chf(f.jahr)}/Jahr</span></li>`).join("")}</ul>
      <p class="hinweis">Einzeln klein – zusammen oft ein schöner Betrag.</p>`;

    // Posten-Liste
    const zeigeAlle = zustand.fxAlle;
    const liste = zeigeAlle ? posten : posten.slice(0, 10);
    const maxJ = posten[0].jahr || 1;
    $("fx-posten").innerHTML = liste.map(f => `
      <li class="${f.marke}">
        <div class="fx-kopf">
          <span class="fx-name">${esc(f.posten)}</span>
          <span class="fx-betrag">${Format.chf(f.jahr)}<small>/Jahr</small></span>
        </div>
        <div class="spur" aria-hidden="true"><div class="fuellung" data-breite="${Math.max(1, f.jahr / maxJ * 100).toFixed(1)}"></div></div>
        <div class="fx-fuss">
          <span class="detail">${esc(f.gruppe)} · ${RHYTHMUS_KURZ(f.haeufigkeit)} ${Format.chf(f.betrag)} · ${esc(f.konto)}${f.ueberCler ? ' · <em class="marke">Cler</em>' : ""}</span>
          <span class="umschalter klein fx-marke" role="group" aria-label="Markierung für ${esc(f.posten)}">
            <button type="button" data-fx="${esc(fixSchluessel(f))}" data-marke="pruefen" aria-pressed="${f.marke === "pruefen"}">Prüfen</button>
            <button type="button" data-fx="${esc(fixSchluessel(f))}" data-marke="kuendigen" aria-pressed="${f.marke === "kuendigen"}">Kündigen</button>
          </span>
        </div>
      </li>`).join("");
    for (const el of $("fx-posten").querySelectorAll("[data-breite]")) el.style.width = `${el.dataset.breite}%`;
    $("fx-alle").hidden = posten.length <= 10;
    $("fx-alle").textContent = zeigeAlle ? "Nur die 10 teuersten zeigen" : `Alle ${posten.length} Posten anzeigen`;

    // Kalender 12 Monate
    const heute = new Date().toISOString().slice(0, 7);
    const kal = A.faelligkeiten(alle.filter(f => !nicht.includes(String(f.gruppe).toLowerCase())), heute, 12, opt);
    const maxK = Math.max(1, ...kal.map(k => k.summe));
    $("fx-kalender").innerHTML = kal.map(k => `
      <li>
        <span class="fx-k-monat">${Format.monatKurz(k.monat)}</span>
        <span class="fx-k-spur"><span class="fx-k-balken" data-breite="${(k.summe / maxK * 100).toFixed(1)}"></span></span>
        <span class="fx-k-betrag">${k.summe ? Format.chf(k.summe) : "–"}</span>
        <span class="fx-k-posten">${k.posten.map(p => `${esc(p.posten)}${p.ueberCler ? " (Cler)" : ""}`).join(", ")}</span>
      </li>`).join("");
    for (const el of $("fx-kalender").querySelectorAll("[data-breite]")) el.style.width = `${el.dataset.breite}%`;
    const ohne = posten.filter(f => f.haeufigkeit < 12 && !f.faellig.length);
    $("fx-kalender-fuss").textContent = ohne.length
      ? `Ohne Fälligkeit (im Excel bei «Fällig» ergänzen): ${ohne.map(f => f.posten).join(", ")}.` : "";
  }

  // ---------- Ansicht wechseln ----------

  function zeigeAnsicht(name) {
    zustand.ansicht = name;
    $("ansicht-uebersicht").hidden = name !== "uebersicht";
    $("ansicht-vermoegen").hidden = name !== "vermoegen";
    $("ansicht-fixkosten").hidden = name !== "fixkosten";
    $("monatswahl").hidden = name !== "uebersicht";
    setzeUmschalter("ansicht", "data-ansicht", name);
    try { sessionStorage.setItem("finanzDashboard.ansicht", name); } catch { /* egal */ }
    if (name === "vermoegen") vermoegenAnsicht();
    else if (name === "fixkosten") fixkostenAnsicht();
    else zeichneDiagramme();
    window.scrollTo({ top: 0 });
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
    // In der neuen Übersicht nicht mehr angezeigt (die Töpfe stehen in der Budget-Karte)
    const konten = zustand.alleKonten || [];
    const el = $("konto-filter");
    el.hidden = true;
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
    zustand.alleHinweise = false;
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
    melde(`Lese ${dateien.map(d => d.name).join(", ")} …`);
    const gelesen = [], fehler = [];
    for (const d of dateien) {
      try {
        if (!d.size) throw new Error("LEER");
        gelesen.push({ name: d.name, buffer: await d.arrayBuffer() });
      } catch (err) {
        console.error(err);
        fehler.push(d.name);
      }
    }
    if (fehler.length) {
      melde(`✗ ${fehler.join(", ")}: Die Datei konnte nicht gelesen werden. Liegt sie in OneDrive, ist sie vermutlich nur online gespeichert (Wolken-Symbol). ` +
        "Lösung: Im Explorer Rechtsklick auf die Datei → «Immer auf diesem Gerät beibehalten», kurz warten und nochmals wählen. " +
        "Oder auf onedrive.live.com: Datei öffnen → Datei → Kopie speichern → Kopie herunterladen, und die heruntergeladene Datei wählen. " +
        "Ist die Datei gerade in Excel geöffnet, Excel zuerst schliessen.", true);
    }
    if (gelesen.length) await ladeDateien(gelesen);
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

  $("warnungen").addEventListener("click", e => {
    if (e.target.id !== "mehr-hinweise") return;
    zustand.alleHinweise = true;
    warnungsliste();
  });

  for (const b of document.querySelectorAll("[data-ansicht]")) b.addEventListener("click", () => zeigeAnsicht(b.dataset.ansicht));
  document.addEventListener("click", e => {
    if (e.target.closest("[data-zu-vermoegen]")) zeigeAnsicht("vermoegen");
    const zu = e.target.closest("[data-schliessen]");
    if (zu) zu.closest("dialog").close();
    const kop = e.target.closest("[data-kopiere]");
    if (kop) {
      const feld = $(kop.dataset.kopiere);
      inZwischenablage(feld.value, feld).then(ok => {
        kop.textContent = ok ? "Kopiert ✓" : "Bitte Text markieren und kopieren";
        if (ok && zustand.kopierListe) {
          markiereKopiert(kop.dataset.kopiere === "kop-pikett" ? zustand.kopierListe.pikett : zustand.kopierListe.eintraege);
        }
      });
    }
  });
  $("fx-posten").addEventListener("click", e => {
    const b = e.target.closest("[data-fx]");
    if (!b) return;
    const k = b.dataset.fx;
    fixMarken[k] = fixMarken[k] === b.dataset.marke ? "" : b.dataset.marke;
    if (!fixMarken[k]) delete fixMarken[k];
    speicherSchreiben(SPEICHER_FIXMARKEN, fixMarken);
    fixkostenAnsicht();
  });
  $("fx-alle").addEventListener("click", () => { zustand.fxAlle = !zustand.fxAlle; fixkostenAnsicht(); });
  $("v-erfassen").addEventListener("click", oeffneErfassung);
  $("v-import").addEventListener("click", () => {
    if (zustand.quelle?.beispiel) { melde("Bei den Beispieldaten kann nichts eingefügt werden.", true); return; } $("imp-meldung").hidden = true; $("dlg-import").showModal(); });
  $("v-kopieren-alle").addEventListener("click", () => {
    const o = offeneErfassungen();
    if (o.eintraege.length || o.pikett.length) {
      zeigeKopieren(o.eintraege, o.pikett, `${o.eintraege.length} Vermögenswerte${o.pikett.length ? ` und ${o.pikett.length}× Pikett` : ""} sind noch nicht im Excel.`);
      return;
    }
    const lokal = [...zustand.vmLokal.eintraege].sort((a, b) => a.datum.localeCompare(b.datum));
    zeigeKopieren(lokal, [...zustand.vmLokal.pikett].sort((a, b) => a.datum.localeCompare(b.datum)),
      lokal.length ? `Alles ist schon kopiert. Hier nochmals alle ${lokal.length} in der App erfassten Werte.` : "Noch keine Werte in der App erfasst.");
  });
  $("form-erfassung").addEventListener("submit", e => { e.preventDefault(); speichereErfassung(); });
  $("form-import").addEventListener("submit", e => { e.preventDefault(); importiereText(); });
  $("erf-konto-neu").addEventListener("click", () => {
    const konto = (prompt("Name des Kontos / der Anlage:") || "").trim();
    if (!konto) return;
    const art = window.Analyse.vermoegenEintrag({ datum: "2000-01-01", konto, art: prompt("Art: Konto, Rücklage, Vorsorge, Investment, Schulden oder Kinder", "Konto") || "Konto", stand: 0 }).art;
    if (!zustand.vmLokal.konten.some(k => k.konto === konto)) { zustand.vmLokal.konten.push({ konto, art }); speichereVmLokal(); }
    $("erf-liste").querySelector(".klein-hinweis")?.remove();
    $("erf-liste").insertAdjacentHTML("beforeend", erfassungZeile({ konto, art }));
  });
  $("start-vermoegen").addEventListener("click", () => {
    zustand.quelle = { beispiel: false, geladenAm: new Date().toISOString() };
    setzeBuchungen([], true);
    zeigeAnsicht("vermoegen");
  });

  $("details").addEventListener("toggle", () => { if ($("details").open && zustand.daten) zeichneDiagramme(); });

  $("suche").addEventListener("input", buchungsTabelle);
  for (const id of ["e-kat", "e-spar", "e-gross", "e-umb", "e-regeln", "e-ignorieren", "e-ruecklagen", "e-cler-saldo", "e-cler-ein"]) $(id).addEventListener("change", einstellungAendern);

  $("loeschen").addEventListener("click", () => {
    if (!confirm("Gespeicherte Finanzdaten von diesem Gerät löschen – auch die hier erfassten Vermögenswerte und Pikett?\n\nTipp: vorher «Für Excel kopieren» nutzen. Deine Excel-Datei selbst bleibt unverändert.")) return;
    speicherLoeschen(SPEICHER_DATEN);
    speicherLoeschen(SPEICHER_VM);
    zustand.vmLokal = { eintraege: [], pikett: [], konten: [] };
    zustand.daten = null; zustand.quelle = null; zustand.buchungen = []; zustand.fixkosten = []; zustand.budgetsKonto = {}; zustand.kennzahlen = null; zustand.vermoegen = [];
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

  let flussTimer;
  window.addEventListener("resize", () => {
    clearTimeout(flussTimer);
    flussTimer = setTimeout(() => { if (zustand.daten) fluss(); }, 150);
  });

  // Hell/Dunkel gewechselt -> Diagrammfarben neu setzen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (zustand.daten) { zeichneDiagramme(); vermoegenKarten(); kacheln(); }
  });

  // ---------- Start ----------

  const gespeichert = speicherLesen(SPEICHER_DATEN);
  const nurVermoegen = !gespeichert && (zustand.vmLokal.eintraege.length || zustand.vmLokal.pikett.length);
  if (gespeichert && Array.isArray(gespeichert.buchungen) &&
      (gespeichert.buchungen.length || (gespeichert.fixkosten || []).length || (gespeichert.vermoegen || []).length)) {
    zustand.quelle = { beispiel: false, geladenAm: gespeichert.geladenAm || gespeichert.quelle?.geladenAm };
    zustand.fixkosten = gespeichert.fixkosten || [];
    zustand.budgetsKonto = gespeichert.budgetsKonto || {};
    zustand.kennzahlen = gespeichert.kennzahlen || null;
    zustand.vermoegen = gespeichert.vermoegen || [];
    setzeBuchungen(gespeichert.buchungen, true);
  } else if (nurVermoegen) {
    zustand.quelle = { beispiel: false, geladenAm: new Date().toISOString() };
    setzeBuchungen([], true);
  }
  if (zustand.daten) {
    let a = "uebersicht";
    try { a = sessionStorage.getItem("finanzDashboard.ansicht") || a; } catch { /* egal */ }
    zeigeAnsicht(nurVermoegenGeladen() ? "vermoegen" : a);
  }

  // Offline-Funktion (nur über https, z.B. GitHub Pages)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Modus weiter */ });
  }
})();
