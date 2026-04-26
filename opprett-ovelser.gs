// Apps Script for å opprette "Øvelser"-arket med kolonnene ID, Navn, Type, Beskrivelse.
// Beskrivelsene hentes fra kolonne D i "Treningsmatrise" og splittes på em-tanken (—).
//
// Slik kjører du den (én gang):
// 1. Åpne regnearket -> Utvidelser -> Apps Script.
// 2. Lag en ny fil eller lim inn under den eksisterende koden.
// 3. I nedtrekksmenyen øverst: velg funksjonen "opprettOvelseSheet".
// 4. Trykk Kjør (Run). Godkjenn tilganger om bedt.
// 5. Et nytt ark "Øvelser" opprettes med 17 øvelser.
//
// Hvis du allerede har et "Øvelser"-ark, må du slette det først, eller skriptet
// vil refusere å overskrive.

function opprettOvelseSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('Treningsmatrise');
  if (!src) throw new Error('Finner ikke arket "Treningsmatrise"');

  let dst = ss.getSheetByName('Øvelser');
  if (dst) {
    SpreadsheetApp.getUi().alert('Arket "Øvelser" finnes allerede. Slett det først hvis du vil generere på nytt.');
    return;
  }
  dst = ss.insertSheet('Øvelser');

  const exercises = [
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
    { id: '16', name: 'Sidegange med strikk',                type: 'reps',        row: null },
  ];

  const rows = [['ID', 'Navn', 'Type', 'Beskrivelse']];
  for (const ex of exercises) {
    let desc = '';
    if (ex.row) {
      const cell = src.getRange(ex.row, 4).getValue();
      desc = extractDescription(String(cell || ''));
    }
    rows.push([ex.id, ex.name, ex.type, desc]);
  }

  dst.getRange(1, 1, rows.length, 4).setValues(rows);
  dst.getRange(1, 1, 1, 4).setFontWeight('bold');
  dst.setColumnWidth(1, 60);
  dst.setColumnWidth(2, 240);
  dst.setColumnWidth(3, 110);
  dst.setColumnWidth(4, 520);
  dst.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('Opprettet "Øvelser"-arket med ' + exercises.length + ' øvelser.');
}

function extractDescription(text) {
  // Splitt på em-tanke (—) og ta delen etter første forekomst.
  const idx = text.indexOf('—');
  if (idx >= 0) return text.slice(idx + 1).trim();
  return text.trim();
}
