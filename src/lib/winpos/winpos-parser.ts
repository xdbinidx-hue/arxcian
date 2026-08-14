/**
 * Winpos-myyjäraportin lukija (Arxcian)
 * ------------------------------------
 * Lukee Winposin kassapalvelimen lähettämän .xls-liitteen ja palauttaa
 * jäsennellyn datan. Toimii Next.js:n serveripuolella (route handler,
 * server action, cron-job) — ei selaimessa.
 *
 * Riippuvuus:  npm i xlsx
 * Käyttö:      const raportti = parseWinposReport(buffer, { filename });
 *
 * Suunniteltu kestämään raporttimuodon muutoksia:
 * sarakkeet tunnistetaan otsikon NIMEN perusteella, ei paikan.
 * Jos raporttiin joskus lisätään myymälä- tai päivämääräsarake,
 * tämä lukija poimii ne automaattisesti ilman koodimuutoksia.
 */

import * as XLSX from 'xlsx';
import { kokoNimi, onTuntematon } from './winpos-myyjat';

/* ------------------------------------------------------------------ */
/* Tyypit                                                              */
/* ------------------------------------------------------------------ */

export interface WinposRivi {
  /** Myyjän koodi Winposissa, esim. "12". Säilytetään tekstinä (etunollat). */
  koodi: string;
  /** Myyjän koko nimi (nimikartasta). Jos myyjää ei löydy kartasta, sama kuin nimiRaaka. */
  nimi: string;
  /** Nimi täsmälleen niin kuin se on Winposissa, esim. "Kasperi K.". Jäljitettävyyttä varten. */
  nimiRaaka: string;
  /** Myymälä, jos raportissa on sarake sille. Muuten null. */
  myymala: string | null;
  /** Päivämäärä (YYYY-MM-DD), jos raportissa on sarake sille. Muuten null. */
  pvm: string | null;
  myynti: number;
  kate: number;
  palautus: number;
  alennus: number;
  kuitit: number;
  /** kate / myynti * 100, null jos myynti on 0 */
  katePct: number | null;
  /** myynti / kuitit, null jos kuitteja 0 */
  keskikuitti: number | null;
}

export interface WinposSummary {
  myynti: number;
  kate: number;
  palautus: number;
  alennus: number;
  kuitit: number;
  katePct: number | null;
  keskikuitti: number | null;
}

export interface WinposRaportti {
  /** Vakaa tunniste — sama raportti tuottaa aina saman id:n. Estä tuplatuonti tällä. */
  reportId: string;
  /** Päivä jolloin raportti ajettiin ulos, tiedostonimestä. */
  ajopvm: string | null;
  tiedostonimi: string | null;
  /** Yksi rivi per raportin rivi, sellaisenaan. */
  rivit: WinposRivi[];
  /** Rivit yhdistettynä myyjäkoodin mukaan (monta riviä per myyjä yhdistyy). */
  myyjat: WinposRivi[];
  /** Koko raportin summa (laskettu riveistä). */
  summary: WinposSummary;
  /** Winposin oma Yhteensä-rivi, jos löytyi. Vertailua varten. */
  ilmoitettuSumma: WinposSummary | null;
  /** Löytyikö raportista myymälä-/päivämääräerittely. */
  onMyymalaSarake: boolean;
  onPvmSarake: boolean;
  /** Huomiot ja varoitukset — näytä nämä käyttöliittymässä, älä niele hiljaa. */
  varoitukset: string[];
}

/* ------------------------------------------------------------------ */
/* Apufunktiot                                                         */
/* ------------------------------------------------------------------ */

/** Pyöristää 2 desimaaliin. Excelistä tulee esim. 2491.4001 → 2491.4 */
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Normalisoi otsikkotekstin vertailua varten: pienet kirjaimet, ei välejä. */
const norm = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Muuttaa solun luvuksi. Kestää sekä oikeat numerot että tekstimuodot:
 * "1 188,16" (suomalainen), "1,188.16" (englantilainen), "-256,75", "".
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  let s = String(value).trim();
  if (s === '' || s === '-') return 0;

  // Poista valuutta, sitovat välilyönnit ja tavalliset tuhaterottimet
  s = s.replace(/[€\s ]/g, '');

  const pilkku = s.lastIndexOf(',');
  const piste = s.lastIndexOf('.');
  if (pilkku > piste) {
    // Suomalainen: pilkku on desimaalierotin, piste tuhaterotin
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Englantilainen: piste desimaalierotin, pilkku tuhaterotin
    s = s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Muuttaa solun päivämääräksi muotoon YYYY-MM-DD, tai null. */
function toDateString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  // Excelin sarjanumero (päiviä 1.1.1900 alkaen)
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }

  const s = String(value).trim();
  // 13.8.2026 tai 13.08.26
  const fi = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (fi) {
    const [, d, m, yRaw] = fi;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // 2026-08-13
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  return null;
}

/** Kevyt, riippuvuudeton hash (FNV-1a) vakaan reportId:n muodostamiseen. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Poimii ajopäivän tiedostonimestä, esim. "Winpos 20260813 8395348.xls". */
function ajopvmTiedostonimesta(filename?: string | null): string | null {
  if (!filename) return null;
  const m = filename.match(/(20\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/* ------------------------------------------------------------------ */
/* Sarakkeiden tunnistus                                               */
/* ------------------------------------------------------------------ */

/**
 * Sarakkeet tunnistetaan otsikon sisällön perusteella.
 * Avainsanat ovat listoja, koska Winposin sanamuoto voi vaihdella
 * raporttipohjan ja kieliasetuksen mukaan.
 */
const SARAKKEET = {
  koodi: ['koodi', 'myyjäkoodi', 'myyjänro', 'nro'],
  nimi: ['nimi', 'myyjä', 'myyjän nimi'],
  myynti: ['myynti'],
  kate: ['kate'],
  palautus: ['palautus', 'palautukset'],
  alennus: ['alennus', 'alennukset'],
  kuitit: ['kuitti', 'kuittien', 'kuittien määrä', 'tapahtumat'],
  myymala: ['myymälä', 'toimipiste', 'kauppa', 'liike', 'kassa', 'piste', 'yksikkö'],
  pvm: ['pvm', 'päivä', 'päiväys', 'päivämäärä', 'aika'],
} as const;

type SarakeAvain = keyof typeof SARAKKEET;

function tunnistaSarakkeet(otsikkorivi: unknown[]): Partial<Record<SarakeAvain, number>> {
  const map: Partial<Record<SarakeAvain, number>> = {};

  otsikkorivi.forEach((solu, idx) => {
    const teksti = norm(solu);
    if (!teksti) return;

    for (const avain of Object.keys(SARAKKEET) as SarakeAvain[]) {
      if (map[avain] !== undefined) continue; // ensimmäinen osuma voittaa
      const osuu = SARAKKEET[avain].some((sana) => teksti.includes(sana));
      if (osuu) {
        map[avain] = idx;
        return;
      }
    }
  });

  return map;
}

/* ------------------------------------------------------------------ */
/* Pääfunktio                                                          */
/* ------------------------------------------------------------------ */

export interface ParseOptions {
  /** Alkuperäinen tiedostonimi — käytetään ajopäivän poimimiseen. */
  filename?: string;
  /** Jos raportissa ei ole päivämääräsaraketta, tämän voi asettaa käsin. */
  oletusPvm?: string;
}

export function parseWinposReport(
  input: ArrayBuffer | Uint8Array | Buffer,
  options: ParseOptions = {},
): WinposRaportti {
  const varoitukset: string[] = [];

  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  const wb = XLSX.read(data, { type: 'array', cellDates: false });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Winpos-raportissa ei ole yhtään välilehteä.');

  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });

  // 1) Etsi otsikkorivi (se jolla on sekä myyjän tunniste että myynti)
  const otsikkoIdx = matrix.findIndex((rivi) => {
    const tekstit = rivi.map(norm);
    const onNimi = tekstit.some((t) => t === 'nimi' || t.includes('myyjä'));
    const onMyynti = tekstit.some((t) => t.includes('myynti'));
    return onNimi && onMyynti;
  });

  if (otsikkoIdx === -1) {
    throw new Error(
      'Otsikkoriviä ei löytynyt. Odotettiin saraketta "Nimi" ja "Myynti". ' +
        'Onko tiedosto varmasti Winposin myyjäraportti?',
    );
  }

  const sarake = tunnistaSarakkeet(matrix[otsikkoIdx]);

  for (const pakollinen of ['nimi', 'myynti'] as SarakeAvain[]) {
    if (sarake[pakollinen] === undefined) {
      throw new Error(`Pakollista saraketta "${pakollinen}" ei löytynyt raportista.`);
    }
  }

  const onMyymalaSarake = sarake.myymala !== undefined;
  const onPvmSarake = sarake.pvm !== undefined;

  if (!onMyymalaSarake) {
    varoitukset.push(
      'Raportissa ei ole myymäläsaraketta — rivejä ei voi kohdistaa myymälään. ' +
        'Sama myyjä voi esiintyä monella rivillä (yksi per myymälä).',
    );
  }
  if (!onPvmSarake) {
    varoitukset.push(
      'Raportissa ei ole päivämääräsaraketta — luvut ovat koko jakson summia, ' +
        'joten päiväkohtaista kehitystä ei voi laskea.',
    );
  }

  // 2) Lue rivit otsikon jälkeen, pysähdy Yhteensä-riviin
  const solu = (rivi: unknown[], avain: SarakeAvain): unknown => {
    const idx = sarake[avain];
    return idx === undefined ? null : rivi[idx];
  };

  const rivit: WinposRivi[] = [];
  const tuntemattomat = new Set<string>();
  let ilmoitettuSumma: WinposSummary | null = null;

  for (let i = otsikkoIdx + 1; i < matrix.length; i++) {
    const rivi = matrix[i];
    if (!rivi || rivi.every((c) => c === null || c === '')) continue;

    // Yhteensä-rivi: Winpos kirjoittaa sen vaihtelevaan sarakkeeseen
    // (koodi, nimi tai ensimmäinen sarake), joten etsitään koko riviltä.
    const onYhteensa = rivi.some((c) => {
      const t = norm(c);
      return t.startsWith('yhteensä') || t.startsWith('yhteens') || t === 'total' || t.startsWith('kaikki yht');
    });

    const myynti = r2(toNumber(solu(rivi, 'myynti')));
    const kate = r2(toNumber(solu(rivi, 'kate')));
    const palautus = r2(toNumber(solu(rivi, 'palautus')));
    const alennus = r2(toNumber(solu(rivi, 'alennus')));
    const kuitit = Math.round(toNumber(solu(rivi, 'kuitit')));

    if (onYhteensa) {
      ilmoitettuSumma = {
        myynti,
        kate,
        palautus,
        alennus,
        kuitit,
        katePct: myynti !== 0 ? r2((kate / myynti) * 100) : null,
        keskikuitti: kuitit !== 0 ? r2(myynti / kuitit) : null,
      };
      continue;
    }

    const nimiRaaka = String(solu(rivi, 'nimi') ?? '').trim();
    const koodi = String(solu(rivi, 'koodi') ?? '').trim();
    if (!nimiRaaka && !koodi) continue; // roskarivi

    if (onTuntematon(koodi, nimiRaaka)) tuntemattomat.add(`${nimiRaaka} (koodi ${koodi || '?'})`);

    rivit.push({
      koodi,
      nimi: kokoNimi(koodi, nimiRaaka),
      nimiRaaka,
      myymala: onMyymalaSarake ? String(solu(rivi, 'myymala') ?? '').trim() || null : null,
      pvm: onPvmSarake ? toDateString(solu(rivi, 'pvm')) : (options.oletusPvm ?? null),
      myynti,
      kate,
      palautus,
      alennus,
      kuitit,
      katePct: myynti !== 0 ? r2((kate / myynti) * 100) : null,
      keskikuitti: kuitit !== 0 ? r2(myynti / kuitit) : null,
    });
  }

  if (rivit.length === 0) {
    throw new Error('Raportista ei löytynyt yhtään myyjäriviä.');
  }

  if (tuntemattomat.size > 0) {
    varoitukset.push(
      `Nimikartasta puuttuu ${tuntemattomat.size} myyjä(ä): ${Array.from(tuntemattomat).join(', ')}. ` +
        'Lisää heidät tiedostoon winpos-myyjat.ts — luvut ovat siihen asti oikein, ' +
        'mutta nimi näkyy Winposin lyhyessä muodossa.',
    );
  }

  // 3) Summat
  const summaa = (kentta: 'myynti' | 'kate' | 'palautus' | 'alennus' | 'kuitit', lista: WinposRivi[]) =>
    r2(lista.reduce((acc, x) => acc + x[kentta], 0));

  const kokoaSummary = (lista: WinposRivi[]): WinposSummary => {
    const myynti = summaa('myynti', lista);
    const kate = summaa('kate', lista);
    const kuitit = Math.round(summaa('kuitit', lista));
    return {
      myynti,
      kate,
      palautus: summaa('palautus', lista),
      alennus: summaa('alennus', lista),
      kuitit,
      katePct: myynti !== 0 ? r2((kate / myynti) * 100) : null,
      keskikuitti: kuitit !== 0 ? r2(myynti / kuitit) : null,
    };
  };

  const summary = kokoaSummary(rivit);

  // 4) Tarkistus Winposin omaa Yhteensä-riviä vastaan
  if (ilmoitettuSumma) {
    const heitto = Math.abs(ilmoitettuSumma.myynti - summary.myynti);
    if (heitto > 0.05) {
      varoitukset.push(
        `Laskettu myynti (${summary.myynti} €) ei täsmää Winposin Yhteensä-riviin ` +
          `(${ilmoitettuSumma.myynti} €). Erotus ${r2(heitto)} € — osa riveistä on ehkä jäänyt lukematta.`,
      );
    }
    if (ilmoitettuSumma.kuitit !== summary.kuitit) {
      varoitukset.push(
        `Kuittimäärä ei täsmää: laskettu ${summary.kuitit}, Winpos ilmoittaa ${ilmoitettuSumma.kuitit}.`,
      );
    }
  } else {
    varoitukset.push('Yhteensä-riviä ei löytynyt, joten summia ei voitu ristiintarkistaa.');
  }

  // 5) Yhdistä rivit myyjittäin (avaimena koodi, tai nimi jos koodia ei ole)
  const myyjaMap = new Map<string, WinposRivi>();
  for (const rivi of rivit) {
    const avain = rivi.koodi || rivi.nimi.toLowerCase();
    const nykyinen = myyjaMap.get(avain);
    if (!nykyinen) {
      myyjaMap.set(avain, { ...rivi, myymala: null, pvm: null });
      continue;
    }
    nykyinen.myynti = r2(nykyinen.myynti + rivi.myynti);
    nykyinen.kate = r2(nykyinen.kate + rivi.kate);
    nykyinen.palautus = r2(nykyinen.palautus + rivi.palautus);
    nykyinen.alennus = r2(nykyinen.alennus + rivi.alennus);
    nykyinen.kuitit += rivi.kuitit;
  }

  const myyjat = Array.from(myyjaMap.values())
    .map((m) => ({
      ...m,
      katePct: m.myynti !== 0 ? r2((m.kate / m.myynti) * 100) : null,
      keskikuitti: m.kuitit !== 0 ? r2(m.myynti / m.kuitit) : null,
    }))
    .sort((a, b) => b.myynti - a.myynti);

  // 6) Vakaa tunniste tuplatuonnin estoon
  const tunnistePohja = rivit
    .map((r) => `${r.koodi}|${r.myymala ?? ''}|${r.pvm ?? ''}|${r.myynti}|${r.kuitit}`)
    .join(';');

  return {
    reportId: `winpos-${hash(tunnistePohja)}`,
    ajopvm: ajopvmTiedostonimesta(options.filename),
    tiedostonimi: options.filename ?? null,
    rivit,
    myyjat,
    summary,
    ilmoitettuSumma,
    onMyymalaSarake,
    onPvmSarake,
    varoitukset,
  };
}
