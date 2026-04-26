// Apps Script for å importere historiske økter fra "Treningsmatrise"-arket til "App_Logg".
//
// Slik kjører du den (én gang):
// 1. Slett først alle data-rader i App_Logg bortsett fra overskriftsraden.
// 2. Åpne regnearket i nettleseren -> Utvidelser -> Apps Script.
// 3. Slett alt som står i Code.gs fra før, og lim inn hele innholdet i denne fila.
// 4. Trykk Lagre (diskett-ikon).
// 5. I nedtrekksmenyen øverst: velg funksjonen "migrerTilAppLogg".
// 6. Trykk Kjør (Run). Godkjenn tilganger første gang (samme Google-konto).
// 7. Vent til du får popup "Importert X rader til App_Logg".
//
// ADVARSEL: Ikke kjør skriptet to ganger - da får du duplikater.
// Hvis det går galt: slett alle rader i App_Logg (behold overskriftsraden) og kjør på nytt.

function migrerTilAppLogg() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('Treningsmatrise');
  const dst = ss.getSheetByName('App_Logg');

  if (!src) throw new Error('Finner ikke arket "Treningsmatrise"');
  if (!dst) throw new Error('Finner ikke arket "App_Logg"');

  const DATE_ROW = 5;
  const FIRST_DATE_COL = 5; // E
  const SETS = 4;

  // Øvelser i samme rekkefølge som i matrisen, én blokk på 4 rader hver
  const EXERCISES = [
    { id: '1A', name: 'Mobilisering hofte – kasse-steg',     type: 'reps',        row: 8  },
    { id: '1B', name: 'Mobilisering hofte – ettbens knebøy', type: 'reps',        row: 12 },
    { id: '2',  name: 'Pallof press m/strikk',               type: 'reps_weight', row: 16 },
    { id: '3',  name: 'Knebøy i smith-stativ',               type: 'reps_weight', row: 20 },
    { id: '4',  name: 'Knestående tøyning lår/hofte',        type: 'hold',        row: 24 },
    { id: '5',  name: 'Markløft',                            type: 'reps_weight', row: 28 },
    { id: '6',  name: 'Tøyning av sete',                     type: 'hold',        row: 32 },
    { id: '7',  name: 'Incline benkpress i Smith',           type: 'reps_weight', row: 36 },
    { id: '8',  name: 'Tøyning bryst og rygg',               type: 'hold',        row: 40 },
    { id: '9',  name: 'Pull-up (med strikk)',                type: 'reps',        row: 44 },
    { id: '10', name: 'Utside hofte strekk',                 type: 'hold',        row: 48 },
    { id: '11', name: 'Pec dec',                             type: 'reps_weight', row: 52 },
    { id: '12', name: 'Farmers Walk',                        type: 'rounds',      row: 56 },
    { id: '13', name: 'Skulderpress én side',                type: 'reps_weight', row: 60 },
    { id: '14', name: 'Skulderpress to sider',               type: 'reps_weight', row: 64 },
    { id: '15', name: 'Deadbug',                             type: 'reps',        row: 68 },
  ];

  const lastCol = src.getLastColumn();
  const dateHeader = src.getRange(DATE_ROW, FIRST_DATE_COL, 1, lastCol - FIRST_DATE_COL + 1).getValues()[0];

  const datePairs = [];
  for (let i = 0; i < dateHeader.length; i += 2) {
    const iso = toIsoDate(dateHeader[i]);
    if (iso) datePairs.push({ col: FIRST_DATE_COL + i, date: iso });
  }

  if (datePairs.length === 0) {
    SpreadsheetApp.getUi().alert('Fant ingen gyldige datoer i rad ' + DATE_ROW + ' fra kolonne E og utover.');
    return;
  }

  const out = [];
  for (const ex of EXERCISES) {
    for (const dp of datePairs) {
      const block = src.getRange(ex.row, dp.col, SETS, 2).getValues();

      if (ex.type === 'hold') {
        const touched = block.some(r => r.some(v => v !== '' && v !== null));
        if (touched) out.push([dp.date, ex.id, ex.name, 1, '', '', '']);
      } else {
        for (let s = 0; s < SETS; s++) {
          const [reps, weight] = block[s];
          if (reps === '' || reps === null) continue;
          out.push([dp.date, ex.id, ex.name, s + 1, reps, (weight == null ? '' : weight), '']);
        }
      }
    }
  }

  if (out.length === 0) {
    SpreadsheetApp.getUi().alert('Fant ingen data å importere.');
    return;
  }

  dst.getRange(dst.getLastRow() + 1, 1, out.length, 7).setValues(out);
  SpreadsheetApp.getUi().alert('Importert ' + out.length + ' rader til App_Logg.');
}

function toIsoDate(val) {
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  if (typeof val === 'string' && val.trim()) {
    const m = val.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (m) {
      let d = m[1], mo = m[2], y = m[3];
      if (y.length === 2) y = '20' + y;
      return y + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0');
    }
  }
  return null;
}
