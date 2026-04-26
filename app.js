// ============================================================
// TILSTAND (hva appen husker mens den kjører)
// ============================================================
const state = {
  token: null,           // Google OAuth-token
  view: 'exercises',     // hvilken fane som vises
  activeExercise: null,  // øvelsen som logges akkurat nå
  logCache: [],          // alle rader fra App_Logg-arket
  todayLogged: new Set(),// ID-er for øvelser logget i dag
  exercises: [],         // øvelseslista lastet fra Øvelser-arket
};

// ============================================================
// HJELPER: hent DOM-element på ID
// ============================================================
const $ = id => document.getElementById(id);

// ============================================================
// START – kjøres når siden er ferdig lastet
// ============================================================
window.addEventListener('load', () => {
  $('login-btn').addEventListener('click', requestToken);
  $('logout-btn').addEventListener('click', signOut);
  $('back-btn').addEventListener('click', () => setView('exercises'));
  setupNavigation();
});

// ============================================================
// GOOGLE INNLOGGING
// ============================================================
let tokenClient;

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (response) => {
      if (response.error) {
        alert('Innlogging feilet: ' + response.error);
        return;
      }
      state.token = response.access_token;
      sessionStorage.setItem('gtoken', state.token);
      showApp();
    },
  });
}

function requestToken() {
  if (!window.google?.accounts) {
    alert('Google laster inn – prøv igjen om ett sekund.');
    return;
  }
  if (!tokenClient) initTokenClient();
  tokenClient.requestAccessToken();
}

function signOut() {
  if (state.token) google.accounts.oauth2.revoke(state.token);
  state.token = null;
  sessionStorage.removeItem('gtoken');
  showLogin();
}

// ============================================================
// GOOGLE SHEETS API – lese og skrive data
// ============================================================

// Les en rekke celler fra et ark
async function sheetsGet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!res.ok) {
    if (res.status === 401) { signOut(); return []; }
    const data = await res.json();
    const err = new Error(data.error?.message || 'API-feil');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.values || [];
}

// Legg til rader på slutten av et ark
async function sheetsAppend(range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    if (res.status === 401) { signOut(); return; }
    const data = await res.json();
    throw new Error(data.error?.message || 'Skriving til ark feilet');
  }
}

// Opprett et nytt ark-fane i regnearket
async function createSheetTab() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: CONFIG.LOG_SHEET } } }],
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    // Ignorer feilen hvis arket allerede finnes
    if (!data.error?.message?.includes('already exists')) {
      throw new Error('Kunne ikke opprette loggark: ' + (data.error?.message || ''));
    }
  }
}

// Sjekk at App_Logg-arket finnes med riktige overskrifter
async function ensureLogSheet() {
  let rows;
  try {
    rows = await sheetsGet(CONFIG.LOG_SHEET + '!A1:G1');
  } catch (e) {
    if (e.status === 400) {
      throw new Error(
        'Finner ikke arket "App_Logg" i regnearket ditt.\n\n' +
        'Gjør dette i Google Sheets:\n' +
        '1. Klikk "+" nederst for å legge til et nytt ark\n' +
        '2. Gi det navnet: App_Logg\n' +
        '3. Skriv disse overskriftene i rad 1:\n' +
        '   A: Dato  B: Øvelse-ID  C: Øvelse  D: Sett  E: Reps  F: Vekt (kg)  G: Notat\n\n' +
        'Last deretter inn appen på nytt.'
      );
    }
    throw e;
  }

  // Skriv overskrifter hvis arket er tomt
  if (!rows || rows.length === 0) {
    await sheetsAppend(CONFIG.LOG_SHEET + '!A1', [
      ['Dato', 'Øvelse-ID', 'Øvelse', 'Sett', 'Reps', 'Vekt (kg)', 'Notat'],
    ]);
  }
}

// Hent øvelseslista fra Øvelser-arket
async function loadExercises() {
  let rows;
  try {
    rows = await sheetsGet(CONFIG.EXERCISE_SHEET + '!A2:D');
  } catch (e) {
    if (e.status === 400) {
      throw new Error(
        'Finner ikke arket "' + CONFIG.EXERCISE_SHEET + '" i regnearket ditt.\n\n' +
        'Kjør Apps Script-en "opprettOvelseSheet" først for å opprette det.'
      );
    }
    throw e;
  }
  state.exercises = rows
    .filter(r => r[0])
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1] || '').trim(),
      type: String(r[2] || 'reps_weight').trim(),
      description: String(r[3] || '').trim(),
    }));
}

// Hent alle loggede rader og finn hva som er logget i dag
async function loadLogData() {
  const rows = await sheetsGet(CONFIG.LOG_SHEET + '!A:G');
  state.logCache = rows.slice(1); // hopp over overskriftsraden

  const today = todayStr();
  state.todayLogged.clear();
  for (const row of state.logCache) {
    if (row[0] === today) state.todayLogged.add(row[1]);
  }
}

// ============================================================
// NAVIGASJON
// ============================================================
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

function setView(view) {
  state.view = view;
  state.activeExercise = null;

  // Oppdater aktiv nav-knapp
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Skjul tilbake-knapp og oppdater tittel
  $('back-btn').classList.add('hidden');

  if (view === 'exercises') {
    $('page-title').textContent = 'Øvelser';
    renderExercises();
  } else if (view === 'history') {
    $('page-title').textContent = 'Historikk';
    renderHistorySelect();
  }
}

// ============================================================
// VISNING: ØVELSESLISTE
// ============================================================
function renderExercises() {
  const styrke  = state.exercises.filter(e => e.type === 'reps_weight' || e.type === 'reps' || e.type === 'rounds');
  const tøyning = state.exercises.filter(e => e.type === 'hold');

  $('content').innerHTML = `
    <div class="exercise-list">
      <div class="section-title">Styrke og mobilisering</div>
      ${styrke.map(ex => exerciseCardHTML(ex)).join('')}
      <div class="section-title">Tøyning</div>
      ${tøyning.map(ex => exerciseCardHTML(ex)).join('')}
      <button class="btn-add-exercise" id="btn-add-exercise">+ Ny øvelse</button>
    </div>
  `;

  document.querySelectorAll('.exercise-card').forEach(card => {
    card.addEventListener('click', () => startLog(card.dataset.id));
  });
  $('btn-add-exercise')?.addEventListener('click', openNewExerciseForm);
}

function exerciseCardHTML(ex) {
  const lastLog = getLastLog(ex.id);
  const doneToday = state.todayLogged.has(ex.id);
  return `
    <div class="exercise-card ${doneToday ? 'done' : ''}" data-id="${ex.id}">
      <div class="exercise-header">
        <span class="exercise-num">${ex.id}</span>
        <span class="exercise-name">${ex.name}</span>
        ${doneToday ? '<span class="done-badge">✓</span>' : ''}
      </div>
      <div class="exercise-last">
        ${lastLog ? formatLastLog(lastLog, ex.type) : '<span class="no-log">Ikke logget ennå</span>'}
      </div>
    </div>
  `;
}

// ============================================================
// VISNING: LOGG ÉN ØVELSE
// ============================================================
function startLog(exerciseId) {
  const ex = state.exercises.find(e => e.id === exerciseId);
  state.activeExercise = ex;

  $('page-title').textContent = ex.name;
  $('back-btn').classList.remove('hidden');

  // Deaktiver begge nav-knapper visuelt mens vi logger
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  let setsHTML = '';

  if (ex.type === 'hold') {
    setsHTML = `
      <div class="hold-message">
        Utfør tøyningen og trykk "Marker som utført" når du er ferdig.
      </div>
    `;
  } else {
    const isWeight = ex.type === 'reps_weight';
    const isRounds = ex.type === 'rounds';

    setsHTML = `
      <div class="sets-header ${isWeight ? '' : 'reps-only'}">
        <span>Sett</span>
        <span>${isRounds ? 'Runder' : 'Reps'}</span>
        ${isWeight ? '<span>Vekt (kg)</span>' : ''}
      </div>
    `;

    const maxSets = 4;
    for (let i = 1; i <= maxSets; i++) {
      const last = getLastSetForSet(ex.id, i);
      setsHTML += setRowHTML(i, ex.type, last);
    }
  }

  $('content').innerHTML = `
    <div class="log-form">
      <div class="log-date">${formatDate(new Date())}</div>
      ${ex.description ? `<div class="log-description">${ex.description}</div>` : ''}
      ${setsHTML}
      <div class="log-note">
        <label>Notat (valgfritt)</label>
        <input type="text" id="log-note" placeholder="F.eks. føltes tungt i dag" />
      </div>
      <button class="btn-primary save-btn" id="save-btn">
        ${ex.type === 'hold' ? 'Marker som utført' : 'Lagre økt'}
      </button>
    </div>
  `;

  $('save-btn').addEventListener('click', saveLog);

  setupLogFormInteractions();
}

// Autofokus, Enter-navigering og auto-kopi fra forrige sett
function setupLogFormInteractions() {
  const setRows = Array.from(document.querySelectorAll('.set-row'));
  const inputs = Array.from(document.querySelectorAll('.set-row input'));
  const noteInput = $('log-note');

  // Autofokus på første reps-felt (bare når det finnes sett å fylle ut)
  if (inputs[0]) inputs[0].focus();

  // Enter hopper til neste felt; fra siste input hopper den til notat → lagre
  inputs.forEach((input, idx) => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = inputs[idx + 1];
      if (next) next.focus();
      else if (noteInput) noteInput.focus();
      else saveLog();
    });
  });
  noteInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveLog(); }
  });

  // Kopier forrige (fylte) sett inn i tomt sett når reps får fokus
  setRows.forEach((row, idx) => {
    const reps = row.querySelector('.set-reps');
    reps?.addEventListener('focus', () => {
      if (reps.value) return;
      for (let i = idx - 1; i >= 0; i--) {
        const prev = setRows[i];
        const prevReps = prev.querySelector('.set-reps')?.value;
        if (!prevReps) continue;
        reps.value = prevReps;
        const weight = row.querySelector('.set-weight');
        const prevWeight = prev.querySelector('.set-weight')?.value;
        if (weight && prevWeight) weight.value = prevWeight;
        return;
      }
    });
  });
}

function setRowHTML(setNum, type, last) {
  const isWeight = type === 'reps_weight';
  const lastReps   = last?.reps   || '';
  const lastWeight = last?.weight || '';

  return `
    <div class="set-row ${isWeight ? '' : 'reps-only'}" data-set="${setNum}">
      <span class="set-num">${setNum}</span>
      <input type="number" class="set-reps"
        placeholder="${lastReps || (type === 'rounds' ? 'runder' : 'reps')}"
        inputmode="numeric" min="0" />
      ${isWeight
        ? `<input type="text" class="set-weight"
            placeholder="${lastWeight || 'kg'}"
            inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" />`
        : ''}
    </div>
  `;
}

async function saveLog() {
  const ex = state.activeExercise;
  const note = $('log-note')?.value || '';
  const today = todayStr();
  const rows = [];

  if (ex.type === 'hold') {
    rows.push([today, ex.id, ex.name, 1, '', '', note]);
  } else {
    document.querySelectorAll('.set-row').forEach(row => {
      const setNum = row.dataset.set;
      const reps   = row.querySelector('.set-reps')?.value;
      const weight = (row.querySelector('.set-weight')?.value || '').replace('.', ',');
      if (reps) rows.push([today, ex.id, ex.name, setNum, reps, weight, note]);
    });

    if (rows.length === 0) {
      alert('Fyll inn reps for minst ett sett!');
      return;
    }
  }

  const btn = $('save-btn');
  btn.textContent = 'Lagrer...';
  btn.disabled = true;

  try {
    await sheetsAppend(CONFIG.LOG_SHEET + '!A:G', rows);
    // Oppdater cache lokalt uten å laste på nytt
    state.logCache.push(...rows);
    state.todayLogged.add(ex.id);

    btn.textContent = '✓ Lagret!';
    setTimeout(() => setView('exercises'), 700);
  } catch (err) {
    btn.textContent = 'Lagre økt';
    btn.disabled = false;
    alert('Lagring feilet: ' + err.message);
  }
}

// ============================================================
// VISNING: HISTORIKK
// ============================================================
function renderHistorySelect() {
  const tab = state.historyTab || 'sessions';

  $('content').innerHTML = `
    <div class="history-view">
      <div class="history-tabs">
        <button class="history-tab ${tab === 'sessions' ? 'active' : ''}" data-tab="sessions">Økter</button>
        <button class="history-tab ${tab === 'exercise' ? 'active' : ''}" data-tab="exercise">Per øvelse</button>
      </div>
      <div id="history-content"></div>
    </div>
  `;

  document.querySelectorAll('.history-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.historyTab = btn.dataset.tab;
      renderHistorySelect();
    });
  });

  if (tab === 'sessions') renderSessions();
  else renderExerciseFilter();
}

function renderSessions() {
  const container = $('history-content');
  const byDate = {};
  for (const row of state.logCache) {
    const date = row[0];
    if (!date) continue;
    (byDate[date] = byDate[date] || []).push(row);
  }

  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length === 0) {
    container.innerHTML = '<p class="no-data">Ingen økter logget ennå.</p>';
    return;
  }

  let html = '';
  for (const date of dates) {
    const byExercise = {};
    const exerciseOrder = [];
    for (const r of byDate[date]) {
      const exId = r[1];
      if (!byExercise[exId]) { byExercise[exId] = []; exerciseOrder.push(exId); }
      byExercise[exId].push(r);
    }

    html += `
      <div class="history-session">
        <div class="history-date">${formatDateStr(date)}</div>
        ${exerciseOrder.map(id => sessionExerciseHTML(id, byExercise[id])).join('')}
      </div>
    `;
  }
  container.innerHTML = html;
}

function sessionExerciseHTML(exId, rows) {
  const ex = state.exercises.find(e => e.id === exId);
  const name = ex ? ex.name : exId;
  const type = ex?.type;
  const isWeight = type === 'reps_weight';
  const isHold = type === 'hold';
  const note = rows.find(r => r[6])?.[6] || '';

  const setsText = isHold
    ? '<span class="session-sets-muted">Utført</span>'
    : rows.map(r => {
        const reps = r[4] || '–';
        return isWeight ? `${reps}×${r[5] || '–'}` : `${reps}`;
      }).join(' · ');

  return `
    <div class="session-exercise">
      <span class="exercise-num">${exId}</span>
      <span class="session-exercise-name">${name}</span>
      <span class="session-sets">${setsText}</span>
      ${note ? `<span class="session-note">📝 ${note}</span>` : ''}
    </div>
  `;
}

function renderExerciseFilter() {
  const loggbare = state.exercises.filter(e => e.type !== 'hold');
  const container = $('history-content');

  container.innerHTML = `
    <div class="history-select">
      <label>Velg øvelse</label>
      <select id="history-exercise">
        <option value="">– Velg øvelse –</option>
        ${loggbare.map(ex =>
          `<option value="${ex.id}">${ex.id}. ${ex.name}</option>`
        ).join('')}
      </select>
    </div>
    <div id="history-table"></div>
  `;

  $('history-exercise').addEventListener('change', e => renderHistoryTable(e.target.value));
}

function renderHistoryTable(exerciseId) {
  if (!exerciseId) return;

  const ex   = state.exercises.find(e => e.id === exerciseId);
  const rows = state.logCache.filter(r => r[1] === exerciseId);
  const container = $('history-table');

  if (rows.length === 0) {
    container.innerHTML = '<p class="no-data">Ingen data logget ennå for denne øvelsen.</p>';
    return;
  }

  // Grupper etter dato
  const byDate = {};
  for (const row of rows) {
    if (!byDate[row[0]]) byDate[row[0]] = [];
    byDate[row[0]].push(row);
  }

  const isWeight = ex.type === 'reps_weight';
  const isRounds = ex.type === 'rounds';
  const repsLabel = isRounds ? 'Runder' : 'Reps';

  let html = '';
  for (const date of Object.keys(byDate).sort().reverse()) {
    const sets = byDate[date];
    html += `
      <div class="history-session">
        <div class="history-date">${formatDateStr(date)}</div>
        <table class="history-table-inner">
          <thead>
            <tr>
              <th>Sett</th>
              <th>${repsLabel}</th>
              ${isWeight ? '<th>Vekt</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${sets.map(s => `
              <tr>
                <td>${s[3]}</td>
                <td>${s[4]}</td>
                ${isWeight ? `<td>${s[5] ? s[5] + ' kg' : '–'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${sets[0]?.[6] ? `<div class="history-note">📝 ${sets[0][6]}</div>` : ''}
      </div>
    `;
  }

  container.innerHTML = html;
}

// ============================================================
// HJELPEFUNKSJONER
// ============================================================

function getLastLog(exerciseId) {
  const rows = state.logCache.filter(r => r[1] === exerciseId);
  return rows.length ? rows[rows.length - 1] : null;
}

function getLastSetForSet(exerciseId, setNum) {
  const rows = state.logCache.filter(
    r => r[1] === exerciseId && String(r[3]) === String(setNum)
  );
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return { reps: last[4], weight: last[5] };
}

function formatLastLog(row, type) {
  if (type === 'hold')         return '<span class="last-log">Strekk</span>';
  if (type === 'rounds')       return `<span class="last-log">Sist: ${row[4] || '–'} runder (sett ${row[3]})</span>`;
  if (type === 'reps_weight')  return `<span class="last-log">Sist: ${row[4] || '–'} reps @ ${row[5] ? row[5] + ' kg' : '–'} (sett ${row[3]})</span>`;
  return `<span class="last-log">Sist: ${row[4] || '–'} reps (sett ${row[3]})</span>`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatDate(date) {
  return date.toLocaleDateString('no-NO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateStr(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('no-NO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ============================================================
// LEGG TIL NY ØVELSE
// ============================================================
function openNewExerciseForm() {
  // Foreslå neste ledige numeriske ID
  const numericIds = state.exercises
    .map(e => parseInt(e.id, 10))
    .filter(n => !isNaN(n));
  const nextId = numericIds.length ? Math.max(...numericIds) + 1 : 1;

  $('page-title').textContent = 'Ny øvelse';
  $('back-btn').classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  $('content').innerHTML = `
    <div class="new-exercise-form">
      <div class="form-row">
        <label for="new-id">Nummer / ID</label>
        <input type="text" id="new-id" value="${nextId}" />
      </div>
      <div class="form-row">
        <label for="new-name">Navn</label>
        <input type="text" id="new-name" placeholder="F.eks. Sidegange med strikk" />
      </div>
      <div class="form-row">
        <label for="new-type">Type</label>
        <select id="new-type">
          <option value="reps_weight">Reps + vekt</option>
          <option value="reps">Reps (uten vekt)</option>
          <option value="rounds">Runder</option>
          <option value="hold">Tøyning / hold</option>
        </select>
      </div>
      <div class="form-row">
        <label for="new-desc">Beskrivelse (valgfritt)</label>
        <textarea id="new-desc" rows="4" placeholder="Hvordan utføres øvelsen"></textarea>
      </div>
      <button class="btn-primary" id="save-new">Lagre øvelse</button>
    </div>
  `;

  $('save-new').addEventListener('click', saveNewExercise);
  setTimeout(() => $('new-name').focus(), 50);
}

async function saveNewExercise() {
  const id   = $('new-id').value.trim();
  const name = $('new-name').value.trim();
  const type = $('new-type').value;
  const desc = $('new-desc').value.trim();

  if (!id || !name) {
    alert('ID og navn må fylles inn.');
    return;
  }
  if (state.exercises.some(e => e.id === id)) {
    alert('ID-en "' + id + '" finnes allerede. Velg en annen.');
    return;
  }

  const btn = $('save-new');
  btn.textContent = 'Lagrer...';
  btn.disabled = true;

  try {
    await sheetsAppend(CONFIG.EXERCISE_SHEET + '!A:D', [[id, name, type, desc]]);
    state.exercises.push({ id, name, type, description: desc });
    setView('exercises');
  } catch (err) {
    btn.textContent = 'Lagre øvelse';
    btn.disabled = false;
    alert('Kunne ikke lagre: ' + err.message);
  }
}

// ============================================================
// SKJERMBYTTE
// ============================================================
function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('main-screen').classList.add('hidden');
}

async function showApp() {
  $('login-screen').classList.add('hidden');
  $('main-screen').classList.remove('hidden');
  $('content').innerHTML = '<div class="loading">Kobler til Google Sheets…</div>';

  try {
    await ensureLogSheet();
    await loadExercises();
    await loadLogData();
    setView('exercises');
  } catch (err) {
    $('content').innerHTML = `<div class="error">Feil ved lasting: ${err.message}</div>`;
  }
}
