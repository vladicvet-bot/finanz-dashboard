/*
 * Kleiner, eigener Leser für Excel- (.xlsx) und CSV-Dateien.
 *
 * Warum eigener Code statt einer grossen Bibliothek?
 *  - Deine Finanzdaten werden nur von Code verarbeitet, der hier im
 *    Repository steht und den man lesen kann.
 *  - Alles passiert im Browser. Es wird nichts hochgeladen.
 *
 * Eine .xlsx-Datei ist ein ZIP-Archiv mit XML-Dateien darin.
 * Wir entpacken es mit der eingebauten Browser-Funktion
 * "DecompressionStream" und lesen das erste Tabellenblatt.
 *
 * Ergebnis: eine Liste von Tabellenblättern [{ name, zeilen }].
 * zeilen ist ein Array von Zeilen; jede Zeile ist ein Array von Zellen.
 * Eine Zelle ist eine Zahl, ein Text oder ein Datum {datum: "JJJJ-MM-TT"}.
 */
(function () {
  "use strict";

  // ---------- ZIP entpacken ----------

  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // "End of central directory" suchen (steht am Ende der Datei)
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("KEIN_ZIP");

    const anzahl = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    const dateien = new Map();
    const decoder = new TextDecoder("utf-8");

    for (let n = 0; n < anzahl; n++) {
      if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("ZIP_DEFEKT");
      const methode = view.getUint16(pos + 10, true);
      const groesse = view.getUint32(pos + 20, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const kommentarLen = view.getUint16(pos + 32, true);
      const lokal = view.getUint32(pos + 42, true);
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      dateien.set(name, { methode, groesse, lokal });
      pos += 46 + nameLen + extraLen + kommentarLen;
    }

    async function lesen(name) {
      const eintrag = dateien.get(name);
      if (!eintrag) return null;
      const p = eintrag.lokal;
      const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
      const roh = bytes.subarray(start, start + eintrag.groesse);
      if (eintrag.methode === 0) return decoder.decode(roh);
      if (eintrag.methode !== 8) throw new Error("ZIP_METHODE");
      const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(strom).text();
    }

    return { lesen, namen: () => [...dateien.keys()] };
  }

  // ---------- Hilfen für XML ----------

  const parser = new DOMParser();
  function xml(text) {
    const doc = parser.parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("XML_DEFEKT");
    return doc;
  }
  // "*" = egal welcher Namensraum (manche Programme schreiben "x:c" statt "c")
  const alle = (el, tag) => Array.from(el.getElementsByTagNameNS("*", tag));
  const erstes = (el, tag) => el.getElementsByTagNameNS("*", tag)[0] || null;

  function pfad(basis, ziel) {
    if (ziel.startsWith("/")) return ziel.slice(1);
    const teile = basis.split("/").slice(0, -1);
    for (const t of ziel.split("/")) {
      if (t === "..") teile.pop(); else if (t !== ".") teile.push(t);
    }
    return teile.join("/");
  }

  // ---------- Datumsformate erkennen ----------

  const DATUM_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31,
    32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

  function istDatumsFormat(code) {
    if (!code) return false;
    const ohneText = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
    return /[dmyjt]/i.test(ohneText) && !/^(general|standard)$/i.test(ohneText.trim());
  }

  function serienzahlZuDatum(zahl, basis1904) {
    // Excel zählt Tage ab 1900 (bzw. 1904 auf alten Macs)
    const tage = Math.floor(zahl) + (basis1904 ? 1462 : 0);
    const ms = Math.round((tage - 25569) * 86400000);
    const d = new Date(ms);
    return { datum: d.toISOString().slice(0, 10) };
  }

  function spaltenIndex(ref) {
    let n = 0;
    for (const ch of ref) {
      const c = ch.charCodeAt(0);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  // ---------- XLSX lesen ----------

  async function leseXlsx(buffer) {
    const zip = await unzip(buffer);

    const wbText = await zip.lesen("xl/workbook.xml");
    if (!wbText) throw new Error("KEIN_EXCEL");
    const wb = xml(wbText);
    const pr = erstes(wb, "workbookPr");
    const basis1904 = !!pr && /^(1|true)$/.test(pr.getAttribute("date1904") || "");

    // Alle Tabellenblätter mit Namen und Pfad finden
    const blaetterXml = alle(wb, "sheet");
    if (!blaetterXml.length) throw new Error("KEIN_BLATT");
    const relsText = await zip.lesen("xl/_rels/workbook.xml.rels");
    const rels = relsText ? alle(xml(relsText), "Relationship") : [];
    const blaetterInfo = blaetterXml.map((blatt, i) => {
      const rId = blatt.getAttribute("r:id") ||
        blatt.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const rel = rels.find(r => r.getAttribute("Id") === rId);
      return {
        name: blatt.getAttribute("name") || `Blatt ${i + 1}`,
        pfad: rel ? pfad("xl/workbook.xml", rel.getAttribute("Target")) : `xl/worksheets/sheet${i + 1}.xml`,
      };
    });

    // Gemeinsame Texte (Excel speichert jeden Text nur einmal)
    const texte = [];
    const ssText = await zip.lesen("xl/sharedStrings.xml");
    if (ssText) {
      for (const si of alle(xml(ssText), "si")) {
        texte.push(alle(si, "t")
          .filter(t => t.parentNode.localName !== "rPh")
          .map(t => t.textContent).join(""));
      }
    }

    // Zellformate -> welche Zellen sind Datumszellen?
    const datumsStil = [];
    const stText = await zip.lesen("xl/styles.xml");
    if (stText) {
      const st = xml(stText);
      const eigene = new Map();
      for (const nf of alle(st, "numFmt")) {
        eigene.set(+nf.getAttribute("numFmtId"), nf.getAttribute("formatCode"));
      }
      const xfs = erstes(st, "cellXfs");
      if (xfs) {
        for (const xf of Array.from(xfs.children).filter(e => e.localName === "xf")) {
          const id = +xf.getAttribute("numFmtId");
          datumsStil.push(DATUM_FORMAT_IDS.has(id) || istDatumsFormat(eigene.get(id)));
        }
      }
    }

    const ergebnis = [];
    for (const info of blaetterInfo) {
      const blattText = await zip.lesen(info.pfad);
      if (!blattText) continue;
      ergebnis.push({ name: info.name, zeilen: leseBlatt(blattText, texte, datumsStil, basis1904) });
    }
    if (!ergebnis.length) throw new Error("KEIN_BLATT");
    return ergebnis;
  }

  function leseBlatt(blattText, texte, datumsStil, basis1904) {
    const zeilen = [];
    let naechsteZeile = 0;

    for (const row of alle(xml(blattText), "row")) {
      const r = row.getAttribute("r");
      const zeilenNr = r ? +r - 1 : naechsteZeile;
      naechsteZeile = zeilenNr + 1;
      const zeile = [];
      let naechsteSpalte = 0;

      for (const c of Array.from(row.children).filter(e => e.localName === "c")) {
        const ref = c.getAttribute("r");
        const spalte = ref ? spaltenIndex(ref) : naechsteSpalte;
        naechsteSpalte = spalte + 1;
        const typ = c.getAttribute("t") || "n";
        const v = erstes(c, "v");
        const roh = v ? v.textContent : "";
        let wert = null;

        if (typ === "s") wert = texte[+roh] ?? "";
        else if (typ === "inlineStr") wert = alle(c, "t").map(t => t.textContent).join("");
        else if (typ === "str") wert = roh;
        else if (typ === "b") wert = roh === "1";
        else if (typ === "d") wert = { datum: roh.slice(0, 10) };
        else if (typ === "e") wert = null;
        else if (roh !== "") {
          const zahl = Number(roh);
          const stil = +(c.getAttribute("s") || 0);
          wert = datumsStil[stil] ? serienzahlZuDatum(zahl, basis1904) : zahl;
        }
        zeile[spalte] = wert;
      }
      zeilen[zeilenNr] = zeile;
    }
    return Array.from(zeilen, z => z || []);
  }

  // ---------- CSV lesen ----------

  function leseCsv(text) {
    text = text.replace(/^﻿/, "");
    const ersteZeile = text.split(/\r?\n/, 1)[0];
    const trenner = [";", "\t", ","].map(t => [t, ersteZeile.split(t).length])
      .sort((a, b) => b[1] - a[1])[0][0];

    const zeilen = [];
    let zeile = [], feld = "", inAnf = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inAnf) {
        if (ch === '"' && text[i + 1] === '"') { feld += '"'; i++; }
        else if (ch === '"') inAnf = false;
        else feld += ch;
      } else if (ch === '"') inAnf = true;
      else if (ch === trenner) { zeile.push(feld); feld = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        zeile.push(feld); zeilen.push(zeile); zeile = []; feld = "";
      } else feld += ch;
    }
    if (feld !== "" || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
    return zeilen;
  }

  // ---------- Öffentliche Funktion ----------

  async function leseDatei(name, buffer) {
    const endung = (name.split(".").pop() || "").toLowerCase();
    if (endung === "csv" || endung === "txt" || endung === "tsv") {
      let text = new TextDecoder("utf-8").decode(buffer);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer);
      return [{ name, zeilen: leseCsv(text) }];
    }
    if (endung === "xls") throw new Error("ALTES_XLS");
    if (endung === "numbers") throw new Error("NUMBERS");
    return leseXlsx(buffer);
  }

  window.TabellenLeser = { leseDatei };
})();
