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
  const STANDARD_EINST = { kategorieProzent: 30, minSparquote: 10, grosseAusgabe: 500, umbuchungen: "Umbuchung" };
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
    quelle: null,          // { dateiname, geladenAm, beispiel }
    daten: null,           // Ergebnis von Analyse.berechne
    buchungen: [],
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
    KEINE_SPALTEN: "Die Spalten wurden nicht erkannt. Die erste Zeile braucht mindestens «Datum» und «Ausgaben» oder «Einnahmen».",
    KEINE_BUCHUNGEN: "Es wurden keine Buchungen mit Datum und Betrag gefunden.",
  };

  async function ladeAusPuffer(name, buffer, beispiel) {
    try {
      const zeilen = await window.TabellenLeser.leseDatei(name, buffer);
      const ergebnis = window.Analyse.buchungenAusTabelle(zeilen);
      zustand.quelle = { dateiname: name, geladenAm: new Date().toISOString(), beispiel };
      setzeBuchungen(ergebnis.buchungen, true);

      if (!beispiel) {
        const ok = speicherSchreiben(SPEICHER_DATEN, { quelle: zustand.quelle, buchungen: ergebnis.buchungen });
        if (!ok) melde("Die Daten konnten auf diesem Gerät nicht gespeichert werden (privates Surfen?). Das Dashboard funktioniert trotzdem.");
      }

      const teile = [`${ergebnis.buchungen.length} Buchungen geladen.`];
      const n = ergebnis.uebersprungen;
      if (n) teile.push(`${n} ${n === 1 ? "Zeile" : "Zeilen"} ohne Datum oder Betrag ${n === 1 ? "wurde" : "wurden"} übersprungen.`);
      const NAMEN = { kategorie: "Kategorie", einnahmen: "Einnahmen", ausgaben: "Ausgaben", zahlungsmittel: "Zahlungsmittel", saldo: "Saldo" };
      const fehlend = ergebnis.fehlendeSpalten.filter(s => NAMEN[s]).map(s => NAMEN[s]);
      if (fehlend.length) teile.push(`Spalte nicht gefunden: ${fehlend.join(", ")}.`);
      if (beispiel) teile.push("Das sind erfundene Beispieldaten.");
      melde(teile.join(" "));
    } catch (e) {
      console.error(e);
      melde(FEHLERTEXTE[e.message] || "Die Datei konnte nicht gelesen werden.", true);
    }
  }

  function setzeBuchungen(buchungen, neuerMonat) {
    zustand.buchungen = buchungen;
    zustand.daten = window.Analyse.berechne(buchungen, umbuchungsListe());
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
    if (!fehler) meldungTimer = setTimeout(() => { el.hidden = true; }, 8000);
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
    kennzahlen();
    warnungsliste();
    kategorien();
    zahlungsmittel();
    buchungsTabelle();
    einstellungenAnzeigen();
    zeichneDiagramme();
  }

  function statusZeile() {
    const q = zustand.quelle;
    $("status").textContent = q.beispiel
      ? "Beispieldaten (erfunden)"
      : `${q.dateiname} · auf diesem Gerät gespeichert`;
    $("datei-text").textContent = "Andere Datei";
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

    const kacheln = [
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
      {
        titel: "Kontostand Monatsende",
        wert: pm.saldoEnde != null ? Format.chf(pm.saldoEnde) : "–",
        vergleich: vor && vor.saldoEnde != null && pm.saldoEnde != null
          ? `${vergleich(`${pm.saldoEnde >= vor.saldoEnde ? "+" : "−"}${Format.chf(Math.abs(pm.saldoEnde - vor.saldoEnde))}`, pm.saldoEnde >= vor.saldoEnde ? "besser" : "schlechter")} vs. Vormonat`
          : "",
      },
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
    const liste = window.Analyse.warnungen(zustand.daten, zustand.monat, zustand.einst);
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
      balkenliste(el, eintraege, pm.ausgaben, (kat, betrag) => {
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

  // ---------- Tabelle ----------

  function buchungsTabelle() {
    const suche = $("suche").value.trim().toLowerCase();
    let liste, titel;
    if (suche) {
      liste = zustand.buchungen.filter(b =>
        [b.kategorie, b.beschreibung, b.zahlungsmittel, Format.datum(b.datum)].join(" ").toLowerCase().includes(suche));
      titel = `Suche: ${liste.length} Treffer`;
    } else {
      liste = zustand.daten.proMonat[zustand.monat].buchungen;
      titel = `Buchungen ${Format.monat(zustand.monat)}`;
    }
    $("buchungen-titel").textContent = titel;
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
        <td>${esc(b.beschreibung)}<span class="unterzeile">${esc(b.kategorie)}</span></td>
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

    // 3) Kontostand-Verlauf
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
    const datei = e.target.files[0];
    e.target.value = ""; // gleiche Datei nochmals wählbar
    if (!datei) return;
    await ladeAusPuffer(datei.name, await datei.arrayBuffer(), false);
  });

  $("beispiel").addEventListener("click", async () => {
    try {
      const antwort = await fetch("beispieldaten/beispiel-haushalt.xlsx");
      if (!antwort.ok) throw new Error();
      await ladeAusPuffer("beispiel-haushalt.xlsx", await antwort.arrayBuffer(), true);
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

  $("suche").addEventListener("input", buchungsTabelle);
  for (const id of ["e-kat", "e-spar", "e-gross", "e-umb"]) $(id).addEventListener("change", einstellungAendern);

  $("loeschen").addEventListener("click", () => {
    if (!confirm("Gespeicherte Finanzdaten von diesem Gerät löschen?\n\nDeine Excel-Datei selbst bleibt unverändert.")) return;
    speicherLoeschen(SPEICHER_DATEN);
    zustand.daten = null; zustand.quelle = null; zustand.buchungen = [];
    for (const id of Object.keys(diagramme)) { diagramme[id].destroy(); delete diagramme[id]; }
    $("dashboard").hidden = true;
    $("start").hidden = false;
    $("status").textContent = "Keine Datei geladen";
    $("datei-text").textContent = "Excel öffnen";
    melde("Die Daten wurden von diesem Gerät gelöscht.");
  });

  // Hell/Dunkel gewechselt -> Diagrammfarben neu setzen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (zustand.daten) zeichneDiagramme();
  });

  // ---------- Start ----------

  const gespeichert = speicherLesen(SPEICHER_DATEN);
  if (gespeichert && Array.isArray(gespeichert.buchungen) && gespeichert.buchungen.length) {
    zustand.quelle = gespeichert.quelle;
    setzeBuchungen(gespeichert.buchungen, true);
  }

  // Offline-Funktion (nur über https, z.B. GitHub Pages)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Modus weiter */ });
  }
})();
