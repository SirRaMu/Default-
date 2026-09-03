'use strict';

/* ============================================================
   Kopfrechnen Trainer – App-Logik
   Struktur:
   1) Konfiguration (Schwierigkeitsstufen pro Rechenart)
   2) Aufgabengenerator
   3) State (aktuelle Session)
   4) Screen-Steuerung (Setup / Quiz / Ergebnis)
   5) Persistenz (localStorage: letzte Einstellungen + Verlauf)
   ============================================================ */

// Muss bei jeder Änderung zusammen mit dem neuesten Eintrag in
// changelog.json aktualisiert werden - zeigt in den Einstellungen, welche
// Version tatsächlich gerade läuft (nicht, welche ggf. schon online steht).
const APP_VERSION = '2.21';

const STORAGE_KEYS = {
  settings: 'kopfrechnen.settings.v1',
  history: 'kopfrechnen.history.v1',
  trickCount: 'kopfrechnen.trickCount.v1',
  highscores: 'kopfrechnen.highscores.v1',
  theme: 'kopfrechnen.theme.v1',
  accent: 'kopfrechnen.accent.v1',
  notes: 'kopfrechnen.notes.v1',
  flashcards: 'kopfrechnen.flashcards.v1',
  trash: 'kopfrechnen.trash.v1',
};

// Akzentfarben-Paletten für die Farbgestaltung in den Einstellungen.
// Jede Palette hat eigene Hell-/Dunkel-Varianten, damit die Farbe in
// beiden Modi gut lesbar und stimmig bleibt.
const ACCENT_PALETTES = {
  indigo: {
    light: { primary: '#4f46e5', primaryDark: '#4338ca', accent: '#0ea5e9' },
    dark: { primary: '#818cf8', primaryDark: '#6366f1', accent: '#38bdf8' },
  },
  green: {
    light: { primary: '#16a34a', primaryDark: '#15803d', accent: '#22c55e' },
    dark: { primary: '#4ade80', primaryDark: '#22c55e', accent: '#86efac' },
  },
  orange: {
    light: { primary: '#ea580c', primaryDark: '#c2410c', accent: '#f97316' },
    dark: { primary: '#fb923c', primaryDark: '#f97316', accent: '#fdba74' },
  },
  pink: {
    light: { primary: '#db2777', primaryDark: '#be185d', accent: '#ec4899' },
    dark: { primary: '#f472b6', primaryDark: '#ec4899', accent: '#f9a8d4' },
  },
  teal: {
    light: { primary: '#0d9488', primaryDark: '#0f766e', accent: '#14b8a6' },
    dark: { primary: '#2dd4bf', primaryDark: '#14b8a6', accent: '#5eead4' },
  },
  violet: {
    light: { primary: '#7c3aed', primaryDark: '#6d28d9', accent: '#a855f7' },
    dark: { primary: '#a78bfa', primaryDark: '#8b5cf6', accent: '#c4b5fd' },
  },
};

const OPERATIONS = ['add', 'sub', 'mul', 'div'];

const OP_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷' };

const OP_LABEL = {
  add: 'Addition',
  sub: 'Subtraktion',
  mul: 'Multiplikation',
  div: 'Division',
};

// Zahlenbereiche je Rechenart & Schwierigkeit
const DIFFICULTY = {
  easy: {
    label: 'Leicht',
    hint: 'Kleine Zahlen bis 20, 1×1 bis 10.',
    add: { min: 1, max: 20 },
    sub: { min: 1, max: 20 },
    mul: { min: 1, max: 10 },
    div: { min: 1, max: 10 },
  },
  medium: {
    label: 'Mittel',
    hint: 'Zahlen bis 100, 1×1 bis 20.',
    add: { min: 1, max: 100 },
    sub: { min: 1, max: 100 },
    mul: { min: 2, max: 20 },
    div: { min: 2, max: 20 },
  },
  hard: {
    label: 'Schwer',
    hint: 'Zahlen bis 1000, zweistellig × zweistellig.',
    add: { min: 10, max: 1000 },
    sub: { min: 10, max: 1000 },
    mul: { min: 10, max: 99 },
    div: { min: 10, max: 99 },
  },
  expert: {
    label: 'Experte',
    hint: 'Große Zahlen bis 10000, anspruchsvolle Multiplikation.',
    add: { min: 100, max: 10000 },
    sub: { min: 100, max: 10000 },
    mul: { min: 12, max: 999 },
    div: { min: 12, max: 999 },
  },
};

/* ---------------- Aufgabengenerator ---------------- */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// Zeigt eine Zahl auf Deutsch an (Komma statt Punkt als Dezimaltrennzeichen).
function fmtDe(n) {
  return String(n).replace('.', ',');
}

// Wandelt eine mit Komma eingegebene Zahl in eine JS-Zahl um.
function parseDeInput(input) {
  return Number(input.replace(',', '.'));
}

// Vergleich mit kleiner Toleranz statt strikter Gleichheit, damit
// Kommazahlen (z.B. bei Einheiten umrechnen) nicht an Fließkomma-
// Rundungsungenauigkeiten scheitern.
function answersMatch(given, answer) {
  return Math.abs(given - answer) < 1e-9;
}

function pickOperation(selectedOps) {
  const pool = selectedOps.includes('mix') ? OPERATIONS : selectedOps;
  return pool[randInt(0, pool.length - 1)];
}

function generateQuestion(selectedOps, difficultyKey) {
  const op = pickOperation(selectedOps);
  const range = DIFFICULTY[difficultyKey][op];
  let a, b, answer;

  switch (op) {
    case 'add': {
      a = randInt(range.min, range.max);
      b = randInt(range.min, range.max);
      answer = a + b;
      break;
    }
    case 'sub': {
      // Ergebnis bleibt nicht-negativ
      a = randInt(range.min, range.max);
      b = randInt(range.min, range.max);
      if (b > a) [a, b] = [b, a];
      answer = a - b;
      break;
    }
    case 'mul': {
      a = randInt(range.min, range.max);
      b = randInt(2, Math.min(range.max, difficultyKey === 'easy' ? 10 : difficultyKey === 'medium' ? 20 : 12));
      answer = a * b;
      break;
    }
    case 'div': {
      // ganzzahlige Division: erst Ergebnis + Divisor wählen, dann Dividend bilden
      b = randInt(2, Math.min(range.max, difficultyKey === 'easy' ? 10 : difficultyKey === 'medium' ? 20 : 12));
      answer = randInt(range.min, range.max);
      a = answer * b;
      break;
    }
    default:
      throw new Error('Unbekannte Operation: ' + op);
  }

  return {
    op,
    text: `${a} ${OP_SYMBOL[op]} ${b} =`,
    answer,
  };
}

/* ---------------- State ---------------- */

const state = {
  setup: {
    category: 'basic', // 'basic' | 'advanced'
    operations: ['add'],
    advancedTopics: ['pct'],
    einheitenDecimal: false, // nur beim Thema "Einheiten": auch Kommazahlen zulassen
    karteRichtung: 'front', // Karteikarten lernen: 'front' (Vorne→Hinten), 'back' (Hinten→Vorne) oder 'mixed'
    difficulty: 'easy',
    mode: 'count', // 'count' | 'time'
    count: 10,
    time: 60,
  },
  session: null, // wird beim Start befüllt
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state.setup, saved);
  } catch (e) {
    /* ignore corrupt storage */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.setup));
  } catch (e) {
    /* storage may be unavailable (private mode) */
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function pushHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  history.splice(10); // nur die letzten 10 behalten
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  } catch (e) {
    /* ignore */
  }
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.highscores);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function highscoreKey(category, timeLimit) {
  return `${category}-${timeLimit}`;
}

function getHighscore(timeLimit) {
  return loadHighscores()[timeLimit] || 0;
}

function saveHighscoreIfBetter(timeLimit, value) {
  const scores = loadHighscores();
  const current = scores[timeLimit] || 0;
  if (value <= current) return false;
  scores[timeLimit] = value;
  try {
    localStorage.setItem(STORAGE_KEYS.highscores, JSON.stringify(scores));
  } catch (e) {
    /* ignore */
  }
  return true;
}

/* ---------------- DOM-Referenzen ---------------- */

const el = (id) => document.getElementById(id);

const screens = {};
document.querySelectorAll('.screen[data-screen]').forEach((section) => {
  screens[section.dataset.screen] = section;
});

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].hidden = key !== name;
  }
  el('home-btn').hidden = name === 'home';
  window.scrollTo(0, 0);
}

/**
 * Jeder Klick auf ein Element mit data-goto="<screen>" navigiert dorthin -
 * deckt Menüpunkte, Zurück-Pfeile und den Home-Button einheitlich ab.
 */
function initGlobalNav() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-goto]');
    if (!btn) return;
    showScreen(btn.dataset.goto);
  });

  el('home-btn').addEventListener('click', () => {
    if (!screens.quiz.hidden) {
      if (timerHandle) clearInterval(timerHandle);
      if (state.session) state.session.finished = true;
    }
    showScreen('home');
  });
}

/* ---------------- Setup-Screen ---------------- */

function initSetupScreen() {
  // Kategorie-Umschalter (Grundlegend / Erweitert)
  Array.from(document.querySelectorAll('#category-toggle .chip')).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.category = btn.dataset.category;
      renderSetup();
    });
  });

  // Erweiterte Rechenart-Chips
  Array.from(document.querySelectorAll('#adv-op-group .chip')).forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.advOp;
      if (op === 'mix') {
        state.setup.advancedTopics = ['mix'];
      } else {
        let topics = state.setup.advancedTopics.filter((o) => o !== 'mix');
        if (topics.includes(op)) {
          topics = topics.filter((o) => o !== op);
        } else {
          topics.push(op);
        }
        state.setup.advancedTopics = topics.length ? topics : ['pct'];
      }
      renderSetup();
    });
  });

  // Rechenart-Chips
  const opButtons = Array.from(document.querySelectorAll('#op-group .chip'));
  opButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op;
      if (op === 'mix') {
        state.setup.operations = ['mix'];
      } else {
        let ops = state.setup.operations.filter((o) => o !== 'mix');
        if (ops.includes(op)) {
          ops = ops.filter((o) => o !== op);
        } else {
          ops.push(op);
        }
        state.setup.operations = ops.length ? ops : ['add'];
      }
      renderSetup();
    });
  });

  // Schwierigkeits-Chips
  const diffButtons = Array.from(document.querySelectorAll('#diff-group .chip'));
  diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.difficulty = btn.dataset.diff;
      renderSetup();
    });
  });

  // Einheiten: Ganze Zahlen / Mit Komma
  Array.from(document.querySelectorAll('#einheiten-decimal-group .pill')).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.einheitenDecimal = btn.dataset.einheitenDecimal === 'true';
      renderSetup();
    });
  });

  // Modus-Chips
  const modeButtons = Array.from(document.querySelectorAll('#mode-group .chip'));
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.mode = btn.dataset.mode;
      renderSetup();
    });
  });

  // Anzahl-Pills
  Array.from(document.querySelectorAll('#count-pill-group .pill')).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.count = Number(btn.dataset.count);
      renderSetup();
    });
  });

  // Zeit-Pills
  Array.from(document.querySelectorAll('#time-pill-group .pill')).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.setup.time = Number(btn.dataset.time);
      renderSetup();
    });
  });

  // "Terme rechnen"- bzw. "Einheiten rechnen"-Banner springen direkt mit
  // vorausgewählter Kategorie/Thema auf den normalen Kopfrechnen-Setup-Screen.
  el('terme-rechnen-btn').addEventListener('click', () => {
    state.setup.category = 'advanced';
    state.setup.advancedTopics = ['terme'];
    renderSetup();
  });
  el('einheiten-rechnen-btn').addEventListener('click', () => {
    state.setup.category = 'advanced';
    state.setup.advancedTopics = ['einheiten'];
    renderSetup();
  });

  el('start-btn').addEventListener('click', startSession);
  el('clear-history-btn').addEventListener('click', () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.history);
    } catch (e) {
      /* ignore */
    }
    renderHistory();
  });

  renderSetup();
  renderHistory();
}

// Zwei Stellen zeigen denselben "Ganze Zahlen / Mit Komma"-Umschalter für
// Einheiten umrechnen (Kopfrechnen-Setup und "Lernen & Üben"-Screen) - beide
// greifen auf denselben state.setup.einheitenDecimal zu und werden hier
// gemeinsam synchron gehalten.
function syncEinheitenDecimalUI() {
  document.querySelectorAll('#einheiten-decimal-group .pill, #einheiten-uebung-decimal-group .pill').forEach((btn) => {
    btn.classList.toggle('selected', (btn.dataset.einheitenDecimal === 'true') === state.setup.einheitenDecimal);
  });
  el('einheiten-komma-erklaerung').hidden = !state.setup.einheitenDecimal;
}

function initEinheitenUebungToggle() {
  el('einheiten-uebung-decimal-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pill');
    if (!btn) return;
    state.setup.einheitenDecimal = btn.dataset.einheitenDecimal === 'true';
    syncEinheitenDecimalUI();
    saveSettings();
  });
  syncEinheitenDecimalUI();
}

function renderSetup() {
  const isAdvanced = state.setup.category === 'advanced';

  document.querySelectorAll('#category-toggle .chip').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.category === state.setup.category);
  });
  el('op-group').hidden = isAdvanced;
  el('adv-op-group').hidden = !isAdvanced;

  document.querySelectorAll('#op-group .chip').forEach((btn) => {
    btn.classList.toggle('selected', state.setup.operations.includes(btn.dataset.op));
  });
  document.querySelectorAll('#adv-op-group .chip').forEach((btn) => {
    btn.classList.toggle('selected', state.setup.advancedTopics.includes(btn.dataset.advOp));
  });

  el('einheiten-decimal-row').hidden = !(isAdvanced && state.setup.advancedTopics.includes('einheiten'));
  syncEinheitenDecimalUI();

  document.querySelectorAll('#diff-group .chip').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.diff === state.setup.difficulty);
  });
  document.querySelectorAll('#mode-group .chip').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.mode === state.setup.mode);
  });
  document.querySelectorAll('#count-pill-group .pill').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.count) === state.setup.count);
  });
  document.querySelectorAll('#time-pill-group .pill').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.time) === state.setup.time);
  });

  el('count-options').hidden = state.setup.mode !== 'count';
  el('time-options').hidden = state.setup.mode !== 'time';

  el('diff-hint').textContent = isAdvanced
    ? ADVANCED_DIFFICULTY_HINT[state.setup.difficulty]
    : DIFFICULTY[state.setup.difficulty].hint;

  el('setup-highscore').hidden = state.setup.mode !== 'time';
  if (state.setup.mode === 'time') {
    el('setup-highscore-time').textContent = state.setup.time;
    el('setup-highscore-category').textContent = isAdvanced ? 'Erweitert' : 'Grundlegend';
    el('setup-highscore-value').textContent = getHighscore(highscoreKey(state.setup.category, state.setup.time));
  }

  saveSettings();
}

function renderHistory() {
  const history = loadHistory();
  const card = el('history-card');
  const list = el('history-list');
  list.innerHTML = '';

  if (!history.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  for (const entry of history) {
    const li = document.createElement('li');
    const date = new Date(entry.date);
    const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
      ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    let categoryLabel;
    if (entry.category === 'advanced') {
      const topics = entry.advancedTopics || [];
      categoryLabel = 'Erweitert: ' + (topics.includes('mix')
        ? 'Gemischt'
        : topics.map((t) => ADVANCED_TOPIC_LABEL[t]).join(', '));
    } else {
      const opsLabel = entry.operations.includes('mix')
        ? 'Gemischt'
        : entry.operations.map((o) => OP_LABEL[o]).join(', ');
      categoryLabel = `${opsLabel} · ${DIFFICULTY[entry.difficulty].label}`;
    }

    li.innerHTML = `
      <span class="h-meta">${dateStr} · ${categoryLabel}</span>
      <span class="h-score">${entry.accuracy}%</span>
    `;
    list.appendChild(li);
  }
}

/* ---------------- Learn-Screen ---------------- */

/* ---------------- Trick-Übungen (Schritt für Schritt) ---------------- */

// Zahlenbereiche der erweiterten Themen je Schwierigkeitsstufe.
const ADV_DIFFICULTY = {
  pct: {
    easy: { gSteps: 10, pMin: 5, pMax: 50, pChangeMax: 25 },
    medium: { gSteps: 20, pMin: 2, pMax: 90, pChangeMax: 50 },
    hard: { gSteps: 60, pMin: 2, pMax: 95, pChangeMax: 80 },
    expert: { gSteps: 150, pMin: 2, pMax: 99, pChangeMax: 150 },
  },
  pq: {
    easy: { baseMax: 4, halfMax: 2 },
    medium: { baseMax: 6, halfMax: 3 },
    hard: { baseMax: 9, halfMax: 4 },
    expert: { baseMax: 12, halfMax: 6 },
  },
  lgs: {
    easy: { xyMax: 4, coefMax: 2 },
    medium: { xyMax: 6, coefMax: 4 },
    hard: { xyMax: 9, coefMax: 5 },
    expert: { xyMax: 12, coefMax: 6 },
  },
  diffq: {
    easy: { aMax: 2, bMax: 2, xMax: 3 },
    medium: { aMax: 4, bMax: 4, xMax: 4 },
    hard: { aMax: 6, bMax: 6, xMax: 6 },
    expert: { aMax: 9, bMax: 9, xMax: 8 },
  },
  diffeq: {
    easy: { a0Min: -3, a0Max: 5, kPool: [-1, 1, 2], dMax: 5 },
    medium: { a0Min: -5, a0Max: 8, kPool: [-2, -1, 1, 2], dMax: 8 },
    hard: { a0Min: -8, a0Max: 12, kPool: [-3, -2, 2, 3], dMax: 12 },
    expert: { a0Min: -12, a0Max: 20, kPool: [-3, -2, 2, 3, 4], dMax: 15 },
  },
  terme: {
    easy: { coefMax: 5, constMax: 5, valMax: 5 },
    medium: { coefMax: 9, constMax: 9, valMax: 9 },
    hard: { coefMax: 14, constMax: 14, valMax: 14 },
    expert: { coefMax: 20, constMax: 20, valMax: 20 },
  },
  einheiten: {
    easy: { valMax: 9 },
    medium: { valMax: 20 },
    hard: { valMax: 60 },
    expert: { valMax: 99 },
  },
};

const ADVANCED_DIFFICULTY_HINT = {
  easy: 'Kleinere, freundlichere Zahlen.',
  medium: 'Mittlere Zahlengröße (Standard).',
  hard: 'Größere Zahlen, mehr Rechenaufwand.',
  expert: 'Große Zahlen, anspruchsvollste Variante.',
};

function advCfg(group, diff) {
  const tiers = ADV_DIFFICULTY[group];
  return tiers[diff] || tiers.medium;
}

// Erzeugt einen Pool aus positiven und negativen Ganzzahlen bis maxAbs (ohne 0).
function signedPool(maxAbs) {
  const pool = [];
  for (let n = 1; n <= maxAbs; n++) {
    pool.push(n, -n);
  }
  return pool;
}

// Einheiten-Listen für "Einheiten umrechnen": jede Einheit trägt ihren Wert
// in der jeweils kleinsten Basiseinheit (mm/mg/ml), damit sich der
// Umrechnungsfaktor zwischen zwei benachbarten Einheiten einfach berechnen
// lässt. Es werden bewusst nur benachbarte Einheiten abgefragt (z.B. cm↔m,
// nicht mm↔km), damit die Umrechnungszahlen im Kopf machbar bleiben.
const LAENGE_UNITS = [
  { id: 'mm', label: 'mm', toBase: 1 },
  { id: 'cm', label: 'cm', toBase: 10 },
  { id: 'm', label: 'm', toBase: 1000 },
  { id: 'km', label: 'km', toBase: 1000000 },
];
const GEWICHT_UNITS = [
  { id: 'mg', label: 'mg', toBase: 1 },
  { id: 'g', label: 'g', toBase: 1000 },
  { id: 'kg', label: 'kg', toBase: 1000000 },
  { id: 't', label: 't', toBase: 1000000000 },
];
const VOLUMEN_UNITS = [
  { id: 'ml', label: 'ml', toBase: 1 },
  { id: 'l', label: 'l', toBase: 1000 },
  { id: 'hl', label: 'hl', toBase: 100000 },
];

/**
 * Baut eine Umrechnungsaufgabe zwischen zwei benachbarten Einheiten aus
 * "units". Die Richtung (größer→kleiner = multiplizieren, kleiner→größer =
 * dividieren) wird zufällig gewählt; der "unbekannte" Wert wird so
 * konstruiert, dass immer ein ganzzahliges Ergebnis herauskommt (das
 * Zahlenfeld kennt kein Komma).
 */
function buildEinheitenProblem(units, diff = 'medium', allowDecimal = false) {
  const cfg = advCfg('einheiten', diff);
  const i = randInt(0, units.length - 2);
  const small = units[i];
  const big = units[i + 1];
  const factor = big.toBase / small.toBase; // immer eine Zehnerpotenz (10, 100 oder 1000)
  const bigToSmall = pick([true, false]);

  // Im Komma-Modus darf die "freie" Seite (die Zahl, aus der die andere
  // berechnet wird) Nachkommastellen haben - maximal so viele, wie der
  // Umrechnungsfaktor Nullen hat, damit die berechnete Seite garantiert
  // exakt aufgeht (z.B. Faktor 100 -> höchstens 2 Nachkommastellen).
  const maxDecimals = Math.min(2, Math.log10(factor));
  const decimals = allowDecimal ? randInt(1, maxDecimals) : 0;
  const scale = 10 ** decimals;
  const freeValue = randInt(1, cfg.valMax * scale) / scale;

  let fromUnit, toUnit, fromValue, answer;
  if (bigToSmall) {
    fromUnit = big; toUnit = small;
    fromValue = freeValue;
    answer = Math.round(fromValue * factor * 1000) / 1000;
  } else {
    fromUnit = small; toUnit = big;
    answer = freeValue;
    fromValue = Math.round(answer * factor * 1000) / 1000;
  }

  return {
    headline: `${fmtDe(fromValue)} ${fromUnit.label} = ? ${toUnit.label}`,
    resultText: `${fmtDe(fromValue)} ${fromUnit.label} = ${fmtDe(answer)} ${toUnit.label}`,
    steps: [
      { prompt: `Hilfswert: Wie viele ${small.label} sind 1 ${big.label}?`, answer: factor },
      { prompt: `${fmtDe(fromValue)} ${fromUnit.label} ${bigToSmall ? '×' : '÷'} ${factor} = ? ${toUnit.label}`, answer },
    ],
  };
}

const TRICKS = {
  'add-leftright': {
    build() {
      const a = randInt(100, 899);
      const b = randInt(100, 899);
      const ha = Math.floor(a / 100) * 100;
      const hb = Math.floor(b / 100) * 100;
      const ta = Math.floor((a % 100) / 10) * 10;
      const tb = Math.floor((b % 100) / 10) * 10;
      const ua = a % 10;
      const ub = b % 10;
      return {
        headline: `${a} + ${b} = ?`,
        steps: [
          { prompt: `Hunderter zusammen: ${ha} + ${hb} =`, answer: ha + hb },
          { prompt: `Zehner zusammen: ${ta} + ${tb} =`, answer: ta + tb },
          { prompt: `Einer zusammen: ${ua} + ${ub} =`, answer: ua + ub },
          { prompt: `Alles zusammen: ${ha + hb} + ${ta + tb} + ${ua + ub} =`, answer: a + b },
        ],
      };
    },
  },

  'add-round': {
    build() {
      const round = randInt(2, 9) * 100;
      const delta = randInt(1, 4);
      const a = round - delta;
      const b = randInt(10, 89);
      return {
        headline: `${a} + ${b} = ?`,
        steps: [
          { prompt: `Runde ${a} auf ${round}: ${round} + ${b} =`, answer: round + b },
          { prompt: `Jetzt ${delta} wieder abziehen: ${round + b} − ${delta} =`, answer: a + b },
        ],
      };
    },
  },

  'sub-complement': {
    build() {
      const round = 1000;
      let sub = randInt(105, 895);
      if (sub % 10 === 0) sub += 1;
      const nextTen = Math.ceil(sub / 10) * 10;
      const diff1 = nextTen - sub;
      let nextHundred = Math.ceil(nextTen / 100) * 100;
      if (nextHundred === nextTen) nextHundred += 100;
      const diff2 = nextHundred - nextTen;
      const diff3 = round - nextHundred;
      return {
        headline: `${round} − ${sub} = ?`,
        steps: [
          { prompt: `Von ${sub} zur nächsten Zehnerzahl ${nextTen}: wie weit?`, answer: diff1 },
          { prompt: `Von ${nextTen} zur nächsten Hunderterzahl ${nextHundred}: wie weit?`, answer: diff2 },
          { prompt: `Von ${nextHundred} bis ${round}: wie weit?`, answer: diff3 },
          { prompt: `Zusammenzählen: ${diff1} + ${diff2} + ${diff3} =`, answer: round - sub },
        ],
      };
    },
  },

  'sub-round': {
    build() {
      const round = randInt(2, 9) * 100;
      const delta = randInt(1, 4);
      const sub = round - delta;
      const a = sub + randInt(50, 400);
      return {
        headline: `${a} − ${sub} = ?`,
        steps: [
          { prompt: `Runde ${sub} auf ${round}: ${a} − ${round} =`, answer: a - round },
          { prompt: `Jetzt ${delta} wieder dazuzählen: ${a - round} + ${delta} =`, answer: a - sub },
        ],
      };
    },
  },

  'mul-distribute': {
    build() {
      let a = randInt(11, 99);
      if (a % 10 === 0) a += 1;
      const b = randInt(2, 9);
      const tens = Math.floor(a / 10) * 10;
      const units = a % 10;
      return {
        headline: `${a} × ${b} = ?`,
        steps: [
          { prompt: `${tens} × ${b} =`, answer: tens * b },
          { prompt: `${units} × ${b} =`, answer: units * b },
          { prompt: `Zusammen: ${tens * b} + ${units * b} =`, answer: a * b },
        ],
      };
    },
  },

  'mul-fixed': {
    build() {
      const n = randInt(12, 88);
      const variant = pick(['5', '25', '9']);
      if (variant === '5') {
        return {
          headline: `${n} × 5 = ?`,
          steps: [
            { prompt: `${n} × 10 =`, answer: n * 10 },
            { prompt: `${n * 10} ÷ 2 =`, answer: n * 5 },
          ],
        };
      }
      if (variant === '25') {
        return {
          headline: `${n} × 25 = ?`,
          steps: [
            { prompt: `${n} × 100 =`, answer: n * 100 },
            { prompt: `${n * 100} ÷ 4 =`, answer: n * 25 },
          ],
        };
      }
      return {
        headline: `${n} × 9 = ?`,
        steps: [
          { prompt: `${n} × 10 =`, answer: n * 10 },
          { prompt: `${n * 10} − ${n} =`, answer: n * 9 },
        ],
      };
    },
  },

  'mul-eleven': {
    build() {
      const a = randInt(10, 99);
      const d1 = Math.floor(a / 10);
      const d2 = a % 10;
      const sum = d1 + d2;
      if (sum < 10) {
        return {
          headline: `${a} × 11 = ?`,
          steps: [
            { prompt: `Ziffernsumme: ${d1} + ${d2} =`, answer: sum },
            { prompt: `Einsetzen: ${d1}_${sum}_${d2} → Ergebnis =`, answer: a * 11 },
          ],
        };
      }
      return {
        headline: `${a} × 11 = ?`,
        steps: [
          { prompt: `Ziffernsumme: ${d1} + ${d2} =`, answer: sum },
          { prompt: `Übertrag: vordere Ziffer wird ${d1}+1=${d1 + 1}, Ergebnis =`, answer: a * 11 },
        ],
      };
    },
  },

  'mul-square': {
    build() {
      const base = randInt(2, 9) * 10;
      const x = randInt(1, 9);
      const sign = pick([1, -1]);
      const n = base + sign * x;
      return {
        headline: `${n}² = ?`,
        steps: [
          { prompt: `${base}² =`, answer: base * base },
          { prompt: `2 × ${base} × ${x} =`, answer: 2 * base * x },
          { prompt: `${x}² =`, answer: x * x },
          {
            prompt: sign === 1
              ? `${base * base} + ${2 * base * x} + ${x * x} =`
              : `${base * base} − ${2 * base * x} + ${x * x} =`,
            answer: n * n,
          },
        ],
      };
    },
  },

  'mul-nearby': {
    build() {
      const m = randInt(15, 95);
      const x = randInt(2, 9);
      const a = m - x;
      const b = m + x;
      return {
        headline: `${a} × ${b} = ?`,
        steps: [
          { prompt: `Mittelwert m = ${m} → m² =`, answer: m * m },
          { prompt: `Abstand x = ${x} → x² =`, answer: x * x },
          { prompt: `${m * m} − ${x * x} =`, answer: a * b },
        ],
      };
    },
  },

  'div-invert': {
    build() {
      const variant = pick(['5', '25']);
      if (variant === '5') {
        const n = randInt(6, 90) * 5;
        return {
          headline: `${n} ÷ 5 = ?`,
          steps: [
            { prompt: `${n} × 2 =`, answer: n * 2 },
            { prompt: `${n * 2} ÷ 10 =`, answer: n / 5 },
          ],
        };
      }
      const n = randInt(4, 40) * 25;
      return {
        headline: `${n} ÷ 25 = ?`,
        steps: [
          { prompt: `${n} × 4 =`, answer: n * 4 },
          { prompt: `${n * 4} ÷ 100 =`, answer: n / 25 },
        ],
      };
    },
  },

  'div-simplify': {
    build() {
      const f = pick([2, 3, 5]);
      const divisor2 = randInt(2, 9);
      const result = randInt(3, 40);
      const divisor = divisor2 * f;
      const dividend = result * divisor;
      return {
        headline: `${dividend} ÷ ${divisor} = ?`,
        steps: [
          { prompt: `Beide durch ${f} teilen: ${dividend} ÷ ${f} =`, answer: dividend / f },
          { prompt: `${divisor} ÷ ${f} =`, answer: divisor / f },
          { prompt: `${dividend / f} ÷ ${divisor / f} =`, answer: result },
        ],
      };
    },
  },

  'div-estimate': {
    build() {
      const d = randInt(12, 39);
      let q = randInt(12, 39);
      if (q % 10 === 0) q += 1;
      const estimate = Math.floor(q / 10) * 10;
      const dividend = d * q;
      const product = d * estimate;
      const remainder = dividend - product;
      const remainderQuotient = q - estimate;
      return {
        headline: `${dividend} ÷ ${d} = ?`,
        steps: [
          { prompt: `Grob geschätzt ≈ ${estimate}. Probe: ${d} × ${estimate} =`, answer: product },
          { prompt: `Rest: ${dividend} − ${product} =`, answer: remainder },
          { prompt: `${remainder} ÷ ${d} =`, answer: remainderQuotient },
          { prompt: `Ergebnis: ${estimate} + ${remainderQuotient} =`, answer: q },
        ],
      };
    },
  },

  'term-vereinfachen': {
    build(diff = 'medium') {
      const cfg = advCfg('terme', diff);
      const a = randInt(2, cfg.coefMax);
      const b = randInt(2, cfg.coefMax);
      const c = randInt(1, cfg.constMax);
      const bSign = pick([1, -1]);
      const cSign = pick([1, -1]);
      const partial = a + bSign * b;
      const result = partial + cSign * c;
      const bTerm = `${bSign === 1 ? '+' : '−'} ${b}x`;
      const cTerm = `${cSign === 1 ? '+' : '−'} ${c}x`;
      return {
        headline: `${a}x ${bTerm} ${cTerm} = ?x`,
        steps: [
          { prompt: `Fasse zuerst die ersten beiden Glieder zusammen: ${a}x ${bTerm} = ___x. Welche Zahl gehört vor das x?`, answer: partial },
          { prompt: `Jetzt noch das dritte Glied dazu: ${partial}x ${cTerm} = ___x. Welche Zahl gehört vor das x?`, answer: result },
        ],
      };
    },
  },

  'term-klammern': {
    build(diff = 'medium') {
      const cfg = advCfg('terme', diff);
      const a = randInt(2, cfg.coefMax);
      const b = randInt(2, cfg.coefMax);
      const c = randInt(1, cfg.constMax);
      return {
        headline: `${a}(${b}x + ${c}) = ?x + ?`,
        vars: { a, b, c },
        steps: [
          { prompt: `Multipliziere zuerst mit dem x-Glied: ${a} · ${b}x = ___x. Welche Zahl gehört vor das x?`, answer: a * b },
          { prompt: `Jetzt mit der Zahl: ${a} · ${c} =`, answer: a * c },
        ],
      };
    },
  },

  'term-einsetzen': {
    build(diff = 'medium') {
      const cfg = advCfg('terme', diff);
      const a = randInt(2, cfg.coefMax);
      const b = randInt(2, cfg.coefMax);
      const xVal = randInt(1, cfg.valMax) * pick([1, -1]);
      const yVal = randInt(1, cfg.valMax) * pick([1, -1]);
      const ax = a * xVal;
      const by = b * yVal;
      const result = ax + by;
      const fmtMul = (coef, val) => (val < 0 ? `${coef} · (${val})` : `${coef} · ${val}`);
      return {
        headline: `${a}x + ${b}y für x=${xVal}, y=${yVal} = ?`,
        steps: [
          { prompt: `Setze x=${xVal} ein: ${fmtMul(a, xVal)} =`, answer: ax },
          { prompt: `Setze y=${yVal} ein: ${fmtMul(b, yVal)} =`, answer: by },
          { prompt: `Addiere beide Werte: ${ax} ${by >= 0 ? '+' : '−'} ${Math.abs(by)} =`, answer: result },
        ],
      };
    },
  },

  'einheiten-laenge': {
    build(diff = 'medium', opts = {}) {
      return buildEinheitenProblem(LAENGE_UNITS, diff, opts.allowDecimal);
    },
  },

  'einheiten-gewicht': {
    build(diff = 'medium', opts = {}) {
      return buildEinheitenProblem(GEWICHT_UNITS, diff, opts.allowDecimal);
    },
  },

  'einheiten-volumen': {
    build(diff = 'medium', opts = {}) {
      return buildEinheitenProblem(VOLUMEN_UNITS, diff, opts.allowDecimal);
    },
  },

  'pct-value': {
    build(diff = 'medium') {
      const cfg = advCfg('pct', diff);
      const g = randInt(1, cfg.gSteps) * 100;
      const p = randInt(cfg.pMin, cfg.pMax);
      const unit = g / 100;
      const w = unit * p;
      return {
        headline: `Wie viel sind ${p}% von ${g}?`,
        steps: [
          { prompt: `1% von ${g}: ${g} ÷ 100 =`, answer: unit },
          { prompt: `${p}% davon: ${unit} × ${p} =`, answer: w },
        ],
        resultText: `${p}% von ${g} = ${w}`,
      };
    },
  },

  'pct-base': {
    build(diff = 'medium') {
      const cfg = advCfg('pct', diff);
      const g = randInt(1, cfg.gSteps) * 100;
      const p = randInt(cfg.pMin, cfg.pMax);
      const unit = g / 100;
      const w = unit * p;
      return {
        headline: `${w} sind ${p}% von wie viel?`,
        steps: [
          { prompt: `${w} ÷ ${p} = 1% des Grundwerts =`, answer: unit },
          { prompt: `Grundwert: ${unit} × 100 =`, answer: g },
        ],
        resultText: `${w} sind ${p}% von ${g}`,
      };
    },
  },

  'pct-rate': {
    build(diff = 'medium') {
      const cfg = advCfg('pct', diff);
      const g = randInt(1, cfg.gSteps) * 100;
      const p = randInt(cfg.pMin, cfg.pMax);
      const unit = g / 100;
      const w = unit * p;
      return {
        headline: `Wie viel % sind ${w} von ${g}?`,
        steps: [
          { prompt: `1% von ${g}: ${g} ÷ 100 =`, answer: unit },
          { prompt: `${w} ÷ ${unit} =`, answer: p },
        ],
        resultText: `${w} sind ${p}% von ${g}`,
      };
    },
  },

  'pct-change': {
    build(diff = 'medium') {
      const cfg = advCfg('pct', diff);
      const g = randInt(1, cfg.gSteps) * 100;
      const p = randInt(cfg.pMin, cfg.pChangeMax);
      const sign = pick([1, -1]);
      const unit = g / 100;
      const change = unit * p;
      const result = g + sign * change;
      return {
        headline: `${g} wird um ${p}% ${sign === 1 ? 'erhöht' : 'gesenkt'}. Neuer Wert?`,
        steps: [
          { prompt: `1% von ${g}: ${g} ÷ 100 =`, answer: unit },
          { prompt: `${p}% davon: ${unit} × ${p} =`, answer: change },
          {
            prompt: sign === 1
              ? `Neuer Wert: ${g} + ${change} =`
              : `Neuer Wert: ${g} − ${change} =`,
            answer: result,
          },
        ],
        resultText: `${g} ${sign === 1 ? '+' : '−'} ${p}% = ${result}`,
      };
    },
  },

  'diff-quotient': {
    build(diff = 'medium') {
      const cfg = advCfg('diffq', diff);
      const a = randInt(1, cfg.aMax);
      const b = randInt(-cfg.bMax, cfg.bMax);
      const x1 = randInt(-cfg.xMax, cfg.xMax);
      let x2 = randInt(-cfg.xMax, cfg.xMax);
      while (x2 === x1) x2 = randInt(-cfg.xMax, cfg.xMax);
      const fx1 = a * x1 * x1 + b * x1;
      const fx2 = a * x2 * x2 + b * x2;
      const dy = fx2 - fx1;
      const dx = x2 - x1;
      const m = dy / dx;
      const bTerm = b >= 0 ? `+ ${b}x` : `− ${Math.abs(b)}x`;
      const bOp = b >= 0 ? '+' : '−';

      return {
        headline: `f(x) = ${a}x² ${bTerm}\nx₁ = ${x1}, x₂ = ${x2}`,
        steps: [
          { prompt: `f(${x1}) = ${a}×(${x1})² ${bOp} ${Math.abs(b)}×(${x1}) =`, answer: fx1 },
          { prompt: `f(${x2}) = ${a}×(${x2})² ${bOp} ${Math.abs(b)}×(${x2}) =`, answer: fx2 },
          { prompt: `Δy = f(${x2}) − f(${x1}) = ${fx2} − (${fx1}) =`, answer: dy },
          { prompt: `Δx = ${x2} − (${x1}) =`, answer: dx },
          { prompt: `m = Δy ÷ Δx = ${dy} ÷ ${dx} =`, answer: m },
        ],
        resultText: `Differenzenquotient m = ${m}`,
      };
    },
  },

  'diff-equation': {
    build(diff = 'medium') {
      const cfg = advCfg('diffeq', diff);
      const a0 = randInt(cfg.a0Min, cfg.a0Max);
      const k = pick(cfg.kPool);
      const d = randInt(-cfg.dMax, cfg.dMax);
      const a1 = k * a0 + d;
      const a2 = k * a1 + d;
      const a3 = k * a2 + d;
      const dTerm = d >= 0 ? `+ ${d}` : `− ${Math.abs(d)}`;

      return {
        headline: `a₀ = ${a0}, aₙ₊₁ = ${k}·aₙ ${dTerm}`,
        steps: [
          { prompt: `a₁ = ${k}×${a0} ${dTerm} =`, answer: a1 },
          { prompt: `a₂ = ${k}×${a1} ${dTerm} =`, answer: a2 },
          { prompt: `a₃ = ${k}×${a2} ${dTerm} =`, answer: a3 },
        ],
        resultText: `a₁=${a1}, a₂=${a2}, a₃=${a3}`,
      };
    },
  },

  'pq-formula': {
    build(diff = 'medium') {
      const cfg = advCfg('pq', diff);
      const base = randInt(-cfg.baseMax, cfg.baseMax);
      let diffHalf = randInt(-cfg.halfMax, cfg.halfMax);
      if (base === 0 && diffHalf === 0) diffHalf = 1;
      // Differenz ist immer gerade -> p/2 bleibt ganzzahlig
      const rootA = base + diffHalf;
      const rootB = base - diffHalf;
      const x1 = Math.max(rootA, rootB);
      const x2 = Math.min(rootA, rootB);

      const p = -(x1 + x2);
      const q = x1 * x2;
      const halfP = -p / 2;
      const halfPSq = halfP * halfP;
      const discriminant = halfPSq - q;
      const root = Math.abs(x1 - x2) / 2;
      const pTerm = p >= 0 ? `+ ${p}x` : `− ${Math.abs(p)}x`;
      const qTerm = q >= 0 ? `+ ${q}` : `− ${Math.abs(q)}`;

      return {
        headline: `x² ${pTerm} ${qTerm} = 0`,
        steps: [
          { prompt: `−p/2 =`, answer: halfP },
          { prompt: `(p/2)² = ${halfP}² =`, answer: halfPSq },
          { prompt: `(p/2)² − q = ${halfPSq} − (${q}) =`, answer: discriminant },
          { prompt: `√${discriminant} =`, answer: root },
          { prompt: `x₁ = ${halfP} + ${root} =`, answer: x1 },
          { prompt: `x₂ = ${halfP} − ${root} =`, answer: x2 },
        ],
        resultText: `x₁ = ${x1}, x₂ = ${x2}`,
      };
    },
  },

  'lgs-einsetzen': {
    build(diff = 'medium') {
      const cfg = advCfg('lgs', diff);
      const coefPool = signedPool(cfg.coefMax);
      let x0, y0, m, a, b;
      do {
        x0 = randInt(-cfg.xyMax, cfg.xyMax);
        y0 = randInt(-cfg.xyMax, cfg.xyMax);
        m = randInt(-cfg.coefMax, cfg.coefMax);
        a = pick(coefPool);
        b = pick(coefPool);
      } while (a + b * m === 0);
      const c = y0 - m * x0;
      const d = a * x0 + b * y0;
      const bm = b * m;
      const bc = b * c;
      const xCoeff = a + bm;
      const rhs = d - bc;

      return {
        headline: `I: y = ${m}x ${c >= 0 ? '+' : '−'} ${Math.abs(c)}\nII: ${a}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)}y = ${d}`,
        steps: [
          { prompt: `I in II einsetzen, Klammer auflösen: ${b} × ${m} =`, answer: bm },
          { prompt: `${b} × ${c} =`, answer: bc },
          { prompt: `x-Koeffizienten zusammenfassen: ${a} + ${bm} =`, answer: xCoeff },
          { prompt: `Zahlen zusammenfassen: ${d} − (${bc}) =`, answer: rhs },
          { prompt: `x = ${rhs} ÷ ${xCoeff} =`, answer: x0 },
          { prompt: `y mit I: ${m} × ${x0} ${c >= 0 ? '+' : '−'} ${Math.abs(c)} =`, answer: y0 },
        ],
        resultText: `x = ${x0}, y = ${y0}`,
      };
    },
  },

  'lgs-gleichsetzen': {
    build(diff = 'medium') {
      const cfg = advCfg('lgs', diff);
      let x0, y0, m1, m2;
      do {
        x0 = randInt(-cfg.xyMax, cfg.xyMax);
        y0 = randInt(-cfg.xyMax, cfg.xyMax);
        m1 = randInt(-cfg.coefMax, cfg.coefMax);
        m2 = randInt(-cfg.coefMax, cfg.coefMax);
      } while (m1 === m2);
      const c1 = y0 - m1 * x0;
      const c2 = y0 - m2 * x0;
      const mDiff = m1 - m2;
      const cDiff = c2 - c1;

      return {
        headline: `I: y = ${m1}x ${c1 >= 0 ? '+' : '−'} ${Math.abs(c1)}\nII: y = ${m2}x ${c2 >= 0 ? '+' : '−'} ${Math.abs(c2)}`,
        steps: [
          { prompt: `Gleichsetzen, x-Koeffizienten: ${m1} − (${m2}) =`, answer: mDiff },
          { prompt: `Zahlen: ${c2} − (${c1}) =`, answer: cDiff },
          { prompt: `x = ${cDiff} ÷ ${mDiff} =`, answer: x0 },
          { prompt: `y mit I: ${m1} × ${x0} ${c1 >= 0 ? '+' : '−'} ${Math.abs(c1)} =`, answer: y0 },
        ],
        resultText: `x = ${x0}, y = ${y0}`,
      };
    },
  },

  'lgs-addition': {
    build(diff = 'medium') {
      const cfg = advCfg('lgs', diff);
      const coefPool = signedPool(cfg.coefMax);
      let x0, y0, a1, b1, a2;
      do {
        x0 = randInt(-cfg.xyMax, cfg.xyMax);
        y0 = randInt(-cfg.xyMax, cfg.xyMax);
        a1 = pick(coefPool);
        b1 = pick(coefPool);
        a2 = pick(coefPool);
      } while (a1 + a2 === 0);
      const b2 = -b1;
      const d1 = a1 * x0 + b1 * y0;
      const d2 = a2 * x0 + b2 * y0;
      const aSum = a1 + a2;
      const dSum = d1 + d2;
      const yRhs = d1 - a1 * x0;

      return {
        headline: `I: ${a1}x ${b1 >= 0 ? '+' : '−'} ${Math.abs(b1)}y = ${d1}\nII: ${a2}x ${b2 >= 0 ? '+' : '−'} ${Math.abs(b2)}y = ${d2}`,
        steps: [
          { prompt: `Addieren (y fällt weg): ${a1} + (${a2}) =`, answer: aSum },
          { prompt: `${d1} + (${d2}) =`, answer: dSum },
          { prompt: `x = ${dSum} ÷ ${aSum} =`, answer: x0 },
          { prompt: `In I einsetzen: ${d1} − ${a1} × ${x0} =`, answer: yRhs },
          { prompt: `y = ${yRhs} ÷ ${b1} =`, answer: y0 },
        ],
        resultText: `x = ${x0}, y = ${y0}`,
      };
    },
  },
};

/* ---------------- Erweiterte Themen im Speed-Modus ---------------- */

const ADVANCED_TOPICS = ['pct', 'pq', 'lgs', 'diffq', 'diffeq', 'terme', 'einheiten'];

const ADVANCED_TOPIC_LABEL = {
  pct: 'Prozentrechnung',
  pq: 'PQ-Formel',
  lgs: 'Gleichungssysteme',
  diffq: 'Differenzenquotient',
  diffeq: 'Differenzengleichung',
  terme: 'Terme',
  einheiten: 'Einheiten umrechnen',
};

const ADVANCED_TOPIC_POOLS = {
  pct: ['pct-value', 'pct-base', 'pct-rate', 'pct-change'],
  pq: ['pq-formula'],
  lgs: ['lgs-einsetzen', 'lgs-gleichsetzen', 'lgs-addition'],
  diffq: ['diff-quotient'],
  diffeq: ['diff-equation'],
  terme: ['term-vereinfachen', 'term-klammern', 'term-einsetzen'],
  einheiten: ['einheiten-laenge', 'einheiten-gewicht', 'einheiten-volumen'],
};

// Manche Tricks liefern mehrere Werte (z.B. x und y) - im Speed-Modus wird
// genau einer davon abgefragt, damit die Antwort ins Zahlenfeld passt.
const ADVANCED_ANSWER_INDEX = {
  'pq-formula': 4, // x1 (größere Lösung)
  'lgs-einsetzen': 4, // x
  'lgs-gleichsetzen': 2, // x
  'lgs-addition': 2, // x
};

const ADVANCED_QUESTION_SUFFIX = {
  'pq-formula': 'x₁ = ?',
  'lgs-einsetzen': 'x = ?',
  'lgs-gleichsetzen': 'x = ?',
  'lgs-addition': 'x = ?',
  'diff-quotient': 'm = ?',
  'diff-equation': 'a₃ = ?',
};

function generateAdvancedQuestion(selectedTopics, difficulty, einheitenDecimal) {
  const pool = selectedTopics.includes('mix') ? ADVANCED_TOPICS : selectedTopics;
  const topic = pick(pool);
  const trickId = pick(ADVANCED_TOPIC_POOLS[topic]);
  const ctx = TRICKS[trickId].build(difficulty, { allowDecimal: einheitenDecimal });

  // "Klammern auflösen" hat zwei Lücken (Koeffizient und Zahl) - im
  // Speed-Modus wird zufällig nur eine davon abgefragt, die andere Lücke
  // wird direkt in der Fragestellung mit aufgelöst.
  if (trickId === 'term-klammern') {
    const { a, b, c } = ctx.vars;
    const askConst = Math.random() < 0.5;
    return {
      text: askConst ? `${a}(${b}x + ${c}) = ${a * b}x + ?` : `${a}(${b}x + ${c}) = ?x + ${a * c}`,
      answer: askConst ? a * c : a * b,
    };
  }

  const answerIndex = ADVANCED_ANSWER_INDEX[trickId];
  const answer = answerIndex !== undefined ? ctx.steps[answerIndex].answer : ctx.steps[ctx.steps.length - 1].answer;
  const suffix = ADVANCED_QUESTION_SUFFIX[trickId];

  return {
    text: suffix ? `${ctx.headline}\n${suffix}` : ctx.headline,
    answer,
  };
}

let practice = null; // { trickId, ctx: { headline, steps }, stepIndex, input }

const PRACTICE_MAX_ATTEMPTS = 3;

function openPractice(trickId, mode = 'practice', ruleText = '') {
  const origin = Object.keys(screens).find((key) => key !== 'practice' && !screens[key].hidden) || 'setup';
  practice = { trickId, ctx: null, stepIndex: 0, input: '', attempts: 0, mode, ruleText, origin };
  showScreen('practice');
  loadPracticeProblem();
}

function loadPracticeProblem() {
  const trick = TRICKS[practice.trickId];
  practice.ctx = trick.build(undefined, { allowDecimal: state.setup.einheitenDecimal });
  practice.stepIndex = 0;
  practice.input = '';
  el('practice-done').hidden = true;
  el('practice-card').hidden = false;
  el('practice-numpad').hidden = false;
  renderPracticeStep();
}

function renderPracticeStep() {
  const ctx = practice.ctx;
  const step = ctx.steps[practice.stepIndex];
  practice.attempts = 0;

  el('practice-progress-label').textContent = `Schritt ${practice.stepIndex + 1} von ${ctx.steps.length}`;
  el('practice-progress-fill').style.width = `${(practice.stepIndex / ctx.steps.length) * 100}%`;
  el('practice-problem').textContent = ctx.headline;
  el('practice-prompt').textContent = step.prompt;
  el('practice-feedback').textContent = '';
  el('practice-feedback').className = 'feedback';
  el('practice-reveal-btn').hidden = true;

  const isExplain = practice.mode === 'explain';
  el('practice-why-row').hidden = !isExplain;
  el('practice-example-label').hidden = !isExplain;
  if (isExplain) {
    el('practice-why-text').textContent = practice.ruleText;
    el('practice-answer-display').textContent = fmtDe(step.answer);
    el('practice-numpad').hidden = true;
    el('practice-continue-btn').hidden = false;
    el('practice-continue-btn').textContent = 'Weiter →';
  } else {
    el('practice-answer-display').textContent = ' ';
    el('practice-numpad').hidden = false;
    el('practice-continue-btn').hidden = true;
  }
}

function handlePracticeInput(action, num) {
  if (!practice || el('practice-numpad').hidden) return;
  if (num !== undefined) {
    if (practice.input.length >= 8) return;
    practice.input += num;
  } else if (action === 'back') {
    practice.input = practice.input.slice(0, -1);
  } else if (action === 'minus') {
    practice.input = practice.input.startsWith('-') ? practice.input.slice(1) : '-' + practice.input;
  } else if (action === 'comma') {
    if (!practice.input.includes(',')) practice.input += ',';
  } else if (action === 'submit') {
    submitPracticeAnswer();
    return;
  }
  el('practice-answer-display').textContent = practice.input || ' ';
}

function submitPracticeAnswer() {
  if (!practice.input) return;
  const ctx = practice.ctx;
  const step = ctx.steps[practice.stepIndex];
  const given = parseDeInput(practice.input);
  const correct = answersMatch(given, step.answer);
  const card = el('practice-card');
  const feedback = el('practice-feedback');

  if (correct) {
    feedback.textContent = 'Richtig!';
    feedback.className = 'feedback correct';
    card.classList.remove('flash-wrong');
    void card.offsetWidth;
    card.classList.add('flash-correct');

    practice.stepIndex += 1;
    practice.input = '';

    setTimeout(() => {
      if (!practice) return;
      if (practice.stepIndex >= ctx.steps.length) {
        finishPracticeProblem();
      } else {
        renderPracticeStep();
      }
    }, 450);
  } else {
    practice.attempts += 1;
    card.classList.remove('flash-correct');
    void card.offsetWidth;
    card.classList.add('flash-wrong');
    practice.input = '';
    el('practice-answer-display').textContent = ' ';

    if (practice.attempts >= PRACTICE_MAX_ATTEMPTS) {
      feedback.textContent = `Leider falsch (Versuch ${practice.attempts}/${PRACTICE_MAX_ATTEMPTS}).`;
      feedback.className = 'feedback wrong';
      el('practice-reveal-btn').hidden = false;
    } else {
      feedback.textContent = `Leider falsch. Versuch ${practice.attempts}/${PRACTICE_MAX_ATTEMPTS} – probier's nochmal!`;
      feedback.className = 'feedback wrong';
    }
  }
}

function revealPracticeSolution() {
  const ctx = practice.ctx;
  const step = ctx.steps[practice.stepIndex];

  el('practice-feedback').textContent = `Lösung: ${fmtDe(step.answer)}`;
  el('practice-feedback').className = 'feedback wrong';
  el('practice-numpad').hidden = true;
  el('practice-reveal-btn').hidden = true;
  el('practice-continue-btn').hidden = false;
}

function advancePracticeStep() {
  const ctx = practice.ctx;
  practice.stepIndex += 1;
  practice.input = '';

  if (practice.stepIndex >= ctx.steps.length) {
    finishPracticeProblem();
  } else {
    renderPracticeStep();
  }
}

function finishPracticeProblem() {
  const ctx = practice.ctx;
  el('practice-progress-fill').style.width = '100%';
  el('practice-card').hidden = true;
  el('practice-numpad').hidden = true;
  el('practice-continue-btn').hidden = true;
  el('practice-done').hidden = false;
  const finalAnswer = ctx.steps[ctx.steps.length - 1].answer;
  el('practice-done-sub').textContent = ctx.resultText || ctx.headline.replace(/\?\s*$/, fmtDe(finalAnswer));

  if (practice.mode === 'explain') {
    el('practice-done-title').textContent = 'Alles klar? 🎓';
    el('practice-next-btn').textContent = '🧠 Jetzt selbst üben';
  } else {
    el('practice-done-title').textContent = 'Super gemacht! 🎉';
    el('practice-next-btn').textContent = 'Nächste Aufgabe';
    incrementTrickCounter();
  }
}

function getTrickCounter() {
  try {
    return Number(localStorage.getItem(STORAGE_KEYS.trickCount) || '0');
  } catch (e) {
    return 0;
  }
}

function incrementTrickCounter() {
  const count = getTrickCounter() + 1;
  try {
    localStorage.setItem(STORAGE_KEYS.trickCount, String(count));
  } catch (e) {
    /* ignore */
  }
  renderTrickCounter();
}

function renderTrickCounter() {
  el('trick-counter-value').textContent = getTrickCounter();
}

function initPracticeScreen() {
  document.querySelectorAll('[data-trick]').forEach((btn) => {
    btn.addEventListener('click', () => openPractice(btn.dataset.trick));
  });

  el('practice-numpad').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.num !== undefined) {
      handlePracticeInput(undefined, btn.dataset.num);
    } else if (btn.dataset.action) {
      handlePracticeInput(btn.dataset.action);
    }
  });

  el('practice-cancel-btn').addEventListener('click', () => showScreen(practice ? practice.origin : 'setup'));
  el('practice-exit-btn').addEventListener('click', () => showScreen(practice ? practice.origin : 'setup'));
  el('practice-next-btn').addEventListener('click', () => {
    if (practice && practice.mode === 'explain') {
      practice.mode = 'practice';
    }
    loadPracticeProblem();
  });
  el('practice-reveal-btn').addEventListener('click', revealPracticeSolution);
  el('practice-continue-btn').addEventListener('click', advancePracticeStep);

  renderTrickCounter();
}

/* ---------------- Erweiterte-Aufgaben-Screen ---------------- */

/* ---------------- Quiz-Screen ---------------- */

let timerHandle = null;
let questionStartedAt = 0;

function startSession() {
  const { category, operations, advancedTopics, difficulty, mode, count, time, einheitenDecimal } = state.setup;

  state.session = {
    category,
    operations,
    advancedTopics,
    difficulty,
    einheitenDecimal,
    mode,
    totalQuestions: mode === 'count' ? count : Infinity,
    timeLimit: mode === 'time' ? time : null,
    timeRemaining: mode === 'time' ? time : null,
    index: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    totalTimeMs: 0,
    mistakes: [], // { text, given, answer }
    currentQuestion: null,
    currentInput: '',
    finished: false,
  };

  el('quiz-timer').hidden = mode !== 'time';
  el('stat-streak-wrap').hidden = false;

  showScreen('quiz');
  nextQuestion();

  if (mode === 'time') {
    startTimer();
  }
}

function startTimer() {
  updateTimerDisplay();
  timerHandle = setInterval(() => {
    state.session.timeRemaining -= 1;
    updateTimerDisplay();
    if (state.session.timeRemaining <= 0) {
      clearInterval(timerHandle);
      finishSession();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const t = state.session.timeRemaining;
  el('timer-value').textContent = t;
  el('quiz-timer').classList.toggle('low', t <= 10);
}

function nextQuestion() {
  const s = state.session;
  if (s.mode === 'count' && s.index >= s.totalQuestions) {
    finishSession();
    return;
  }

  s.currentQuestion = s.category === 'advanced'
    ? generateAdvancedQuestion(s.advancedTopics, s.difficulty, s.einheitenDecimal)
    : generateQuestion(s.operations, s.difficulty);
  s.currentInput = '';
  questionStartedAt = performance.now();

  el('question-text').textContent = s.currentQuestion.text;
  el('question-text').classList.toggle('advanced-question', s.category === 'advanced');
  el('answer-display').textContent = ' ';
  el('feedback').textContent = '';
  el('feedback').className = 'feedback';

  updateQuizChrome();
}

function updateQuizChrome() {
  const s = state.session;
  el('stat-correct').textContent = s.correct;
  el('stat-wrong').textContent = s.wrong;
  el('stat-streak').textContent = s.streak;

  if (s.mode === 'count') {
    el('progress-label').textContent = `Aufgabe ${Math.min(s.index + 1, s.totalQuestions)} von ${s.totalQuestions}`;
    const pct = (s.index / s.totalQuestions) * 100;
    el('progress-fill').style.width = pct + '%';
  } else {
    el('progress-label').textContent = `Aufgabe ${s.index + 1}`;
    const pct = ((s.timeLimit - s.timeRemaining) / s.timeLimit) * 100;
    el('progress-fill').style.width = pct + '%';
  }
}

function handleNumpadInput(action, num) {
  const s = state.session;
  if (!s || s.finished) return;

  if (num !== undefined) {
    if (s.currentInput.length >= 8) return;
    s.currentInput += num;
  } else if (action === 'back') {
    s.currentInput = s.currentInput.slice(0, -1);
  } else if (action === 'minus') {
    if (s.currentInput.startsWith('-')) {
      s.currentInput = s.currentInput.slice(1);
    } else {
      s.currentInput = '-' + s.currentInput;
    }
  } else if (action === 'comma') {
    if (!s.currentInput.includes(',')) s.currentInput += ',';
  } else if (action === 'submit') {
    submitAnswer();
    return;
  }

  el('answer-display').textContent = s.currentInput || ' ';
}

function submitAnswer() {
  const s = state.session;
  if (!s.currentInput) return;

  const given = parseDeInput(s.currentInput);
  const correct = answersMatch(given, s.currentQuestion.answer);
  const elapsed = performance.now() - questionStartedAt;
  s.totalTimeMs += elapsed;
  s.index += 1;

  const card = el('question-card');
  const feedback = el('feedback');

  if (correct) {
    s.correct += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    feedback.textContent = 'Richtig!';
    feedback.className = 'feedback correct';
    card.classList.remove('flash-wrong');
    void card.offsetWidth;
    card.classList.add('flash-correct');
  } else {
    s.wrong += 1;
    s.streak = 0;
    s.mistakes.push({
      text: s.currentQuestion.text,
      given,
      answer: s.currentQuestion.answer,
    });
    feedback.textContent = `Leider falsch. Richtig: ${fmtDe(s.currentQuestion.answer)}`;
    feedback.className = 'feedback wrong';
    card.classList.remove('flash-correct');
    void card.offsetWidth;
    card.classList.add('flash-wrong');
  }

  updateQuizChrome();

  const delay = correct ? 450 : 1100;
  setTimeout(() => {
    if (!s.finished) nextQuestion();
  }, delay);
}

el('numpad').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.dataset.num !== undefined) {
    handleNumpadInput(undefined, btn.dataset.num);
  } else if (btn.dataset.action) {
    handleNumpadInput(btn.dataset.action);
  }
});

document.addEventListener('keydown', (ev) => {
  const handler = !screens.quiz.hidden ? handleNumpadInput : !screens.practice.hidden ? handlePracticeInput : null;
  if (!handler) return;
  if (ev.key >= '0' && ev.key <= '9') {
    handler(undefined, ev.key);
  } else if (ev.key === 'Backspace') {
    handler('back');
  } else if (ev.key === '-') {
    handler('minus');
  } else if (ev.key === 'Enter') {
    handler('submit');
  }
});

el('quiz-cancel-btn').addEventListener('click', () => {
  if (timerHandle) clearInterval(timerHandle);
  if (state.session) state.session.finished = true;
  showScreen('setup');
});

/* ---------------- Ergebnis-Screen ---------------- */

function finishSession() {
  const s = state.session;
  if (s.finished) return;
  s.finished = true;
  if (timerHandle) clearInterval(timerHandle);

  const totalAnswered = s.correct + s.wrong;
  const accuracy = totalAnswered ? Math.round((s.correct / totalAnswered) * 100) : 0;
  const avgTimeSec = totalAnswered ? (s.totalTimeMs / totalAnswered / 1000) : 0;

  el('results-title').textContent = accuracy >= 80 ? 'Stark gemacht! 🎉' : accuracy >= 50 ? 'Gut gemacht!' : 'Weiter üben!';
  el('result-accuracy').textContent = accuracy + '%';
  el('result-correct').textContent = s.correct;
  el('result-wrong').textContent = s.wrong;
  el('result-avgtime').textContent = avgTimeSec.toFixed(1) + 's';
  el('result-streak').textContent = s.bestStreak;

  if (s.mode === 'time') {
    const key = highscoreKey(s.category, s.timeLimit);
    const isNewHighscore = saveHighscoreIfBetter(key, s.correct);
    el('result-highscore-tile').hidden = false;
    el('result-highscore').textContent = getHighscore(key);
    if (isNewHighscore) {
      el('results-title').textContent = 'Neuer Highscore! 🏆';
    }
  } else {
    el('result-highscore-tile').hidden = true;
  }

  const mistakesCard = el('mistakes-card');
  const mistakesList = el('mistakes-list');
  mistakesList.innerHTML = '';
  if (s.mistakes.length) {
    mistakesCard.hidden = false;
    for (const m of s.mistakes) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${m.text}</span><span><span class="m-wrong">${fmtDe(m.given)}</span> → <span class="m-right">${fmtDe(m.answer)}</span></span>`;
      mistakesList.appendChild(li);
    }
  } else {
    mistakesCard.hidden = true;
  }

  pushHistory({
    date: Date.now(),
    category: s.category,
    operations: s.operations,
    advancedTopics: s.advancedTopics,
    difficulty: s.difficulty,
    mode: s.mode,
    correct: s.correct,
    wrong: s.wrong,
    accuracy,
  });

  showScreen('results');
}

el('retry-btn').addEventListener('click', startSession);
el('back-to-setup-btn').addEventListener('click', () => {
  renderHistory();
  renderSetup();
  showScreen('setup');
});

/* ---------------- Theme (Hell/Dunkel) ---------------- */

function getSystemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.theme);
  } catch (e) {
    return null;
  }
}

function getEffectiveTheme() {
  return getStoredTheme() || (getSystemPrefersDark() ? 'dark' : 'light');
}

function renderThemeSelection(theme) {
  document.querySelectorAll('#theme-pill-group .pill').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.themeChoice === theme);
  });
}

function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (e) {
    /* ignore */
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  renderThemeSelection(theme);
  applyAccent(getStoredAccent());
}

function initTheme() {
  applyTheme(getEffectiveTheme());
}

/* ---------------- Farbgestaltung (Akzentfarbe) ---------------- */

function getStoredAccent() {
  try {
    return localStorage.getItem(STORAGE_KEYS.accent) || 'indigo';
  } catch (e) {
    return 'indigo';
  }
}

function applyAccent(accentId) {
  const palette = ACCENT_PALETTES[accentId] || ACCENT_PALETTES.indigo;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = isDark ? palette.dark : palette.light;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--primary', colors.primary);
  rootStyle.setProperty('--primary-dark', colors.primaryDark);
  rootStyle.setProperty('--accent', colors.accent);

  document.querySelectorAll('#accent-group .swatch').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.accent === accentId);
  });
}

function setAccent(accentId) {
  try {
    localStorage.setItem(STORAGE_KEYS.accent, accentId);
  } catch (e) {
    /* ignore */
  }
  applyAccent(accentId);
}

function initSettingsScreen() {
  document.querySelectorAll('#theme-pill-group .pill').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeChoice));
  });
  document.querySelectorAll('#accent-group .swatch').forEach((btn) => {
    btn.addEventListener('click', () => setAccent(btn.dataset.accent));
  });
}

/* ---------------- Update erzwingen ---------------- */

async function loadLatestVersion() {
  const btn = el('reload-latest-btn');
  btn.textContent = '🔄 Wird geladen …';
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (e) {
    /* falls Registrierungen/Caches nicht zugreifbar sind, trotzdem neu laden */
  }
  location.reload();
}

function initUpdateButton() {
  el('reload-latest-btn').addEventListener('click', loadLatestVersion);
}

/* ---------------- Automatische Update-Erkennung ---------------- */

// Nur true, nachdem die Nutzerin/der Nutzer im Update-Dialog aktiv auf
// "Jetzt aktualisieren" getippt hat. Verhindert, dass ein ganz normales
// Erst-Laden (der Service Worker "claimt" frische Tabs beim allerersten
// Aktivieren) fälschlich als Update erkannt wird und die Seite neu lädt.
let updateAccepted = false;

/**
 * Baut eine einzelne Änderungszeile (Icon + Text) für einen Changelog-Eintrag.
 * Wird sowohl vom Update-Dialog als auch vom Versionsverlauf in den
 * Einstellungen verwendet.
 */
function createChangelogItemRow(item) {
  const row = document.createElement('div');
  row.className = 'update-changelog-item';
  const icon = document.createElement('div');
  icon.className = 'update-changelog-icon';
  icon.textContent = item.icon || '✨';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div');
  text.className = 'update-changelog-text';
  text.textContent = item.text || '';
  row.appendChild(icon);
  row.appendChild(text);
  return row;
}

/**
 * Zeigt den Änderungen-Eintrag (Version, Titel, Icons + Texte) im
 * Update-Dialog an. `entry` kommt aus changelog.json.
 */
function renderUpdateChangelog(entry) {
  el('update-modal-subtitle').textContent = entry.title || 'Was ist neu';
  const list = el('update-changelog');
  list.innerHTML = '';
  (entry.items || []).forEach((item) => list.appendChild(createChangelogItemRow(item)));
}

/**
 * Zeigt in den Einstellungen die aktuell laufende Version an sowie darunter
 * den kompletten Versionsverlauf aus changelog.json - die zur laufenden
 * Version passende Zeile wird mit "Aktuell" markiert.
 */
async function renderVersionHistory() {
  el('settings-current-version').textContent = APP_VERSION;

  try {
    const res = await fetch('changelog.json', { cache: 'no-store' });
    const changelog = await res.json();
    if (!Array.isArray(changelog) || !changelog.length) return;

    const list = el('version-history');
    list.innerHTML = '';
    changelog.forEach((entry) => {
      const wrap = document.createElement('div');
      wrap.className = 'version-entry';

      const header = document.createElement('div');
      header.className = 'version-entry-header';
      const badge = document.createElement('span');
      badge.className = 'version-badge';
      badge.textContent = `v${entry.version}`;
      const date = document.createElement('span');
      date.className = 'version-date';
      date.textContent = entry.date || '';
      header.appendChild(badge);
      header.appendChild(date);
      if (entry.version === APP_VERSION) {
        const currentBadge = document.createElement('span');
        currentBadge.className = 'version-current-badge';
        currentBadge.textContent = 'Aktuell';
        header.appendChild(currentBadge);
      }

      const title = document.createElement('div');
      title.className = 'version-entry-title';
      title.textContent = entry.title || '';

      const items = document.createElement('div');
      items.className = 'version-entry-items';
      (entry.items || []).forEach((item) => items.appendChild(createChangelogItemRow(item)));

      wrap.appendChild(header);
      wrap.appendChild(title);
      wrap.appendChild(items);
      list.appendChild(wrap);
    });

    el('version-history-title').hidden = false;
  } catch (e) {
    /* Versionsverlauf ist ein Bonus - ohne Netz bleibt er einfach leer */
  }
}

/**
 * Ein neuer Service Worker wartet auf Aktivierung (`registration.waiting`).
 * Lädt die Änderungsübersicht und zeigt den Update-Dialog, statt einfach
 * unbemerkt im Hintergrund zu aktualisieren - die Nutzerin/der Nutzer
 * entscheidet selbst, wann umgeschaltet wird.
 */
async function showUpdateBanner(registration) {
  const overlay = el('update-overlay');
  if (!overlay.hidden) return; // schon sichtbar

  try {
    const res = await fetch('changelog.json', { cache: 'no-store' });
    const changelog = await res.json();
    if (Array.isArray(changelog) && changelog.length) {
      renderUpdateChangelog(changelog[0]);
    }
  } catch (e) {
    /* Änderungsübersicht ist ein Bonus - ohne sie trotzdem Update anbieten */
  }

  overlay.hidden = false;

  const nowBtn = el('update-now-btn');
  const laterBtn = el('update-later-btn');

  const onNow = () => {
    nowBtn.disabled = true;
    nowBtn.textContent = '🔄 Wird aktualisiert …';
    updateAccepted = true;
    const waiting = registration.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };
  const onLater = () => {
    overlay.hidden = true;
    nowBtn.removeEventListener('click', onNow);
    laterBtn.removeEventListener('click', onLater);
  };

  nowBtn.addEventListener('click', onNow);
  laterBtn.addEventListener('click', onLater);
}

function initUpdateChecker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !updateAccepted) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });

      // Der Browser prüft von sich aus nur bei einer echten Navigation auf
      // eine neue sw.js - bleibt die als App installierte Seite einfach im
      // Hintergrund offen (typisch auf iPad/Handy, ohne die App zu
      // "schließen"), passiert das sonst tagelang nicht. Deshalb hier aktiv
      // nachfragen: sobald die App wieder sichtbar wird und danach
      // regelmäßig, solange sie offen bleibt.
      const checkForUpdate = () => registration.update().catch(() => { /* offline - kein Problem */ });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('pageshow', () => checkForUpdate());
      setInterval(checkForUpdate, 30 * 60 * 1000);
    }).catch(() => {
      /* Offline-Support ist optional – Fehler hier sind unkritisch */
    });
  });
}

/* ---------------- Erklär-Assistent (Maskottchen + Sprechblase) ---------------- */

/**
 * Verwandelt jede Trick-Karte in eine Lehrer-Erklärung: die Regel wandert in
 * eine Sprechblase neben einem kleinen Maskottchen, und das durchgerechnete
 * Beispiel wird erst per Klick eingeblendet ("Beispiel zeigen").
 * Läuft einmalig über alle vorhandenen .trick-card-Elemente - egal ob
 * Rechentricks oder Erweiterte Aufgaben.
 */
function enhanceTrickCards() {
  document.querySelectorAll('.trick-card').forEach((card) => {
    const rule = card.querySelector('.trick-rule');
    let ruleText = '';
    if (rule) {
      ruleText = rule.textContent.trim();
      const row = document.createElement('div');
      row.className = 'teacher-row';
      const avatar = document.createElement('div');
      avatar.className = 'teacher-avatar';
      avatar.textContent = '🤖';
      avatar.setAttribute('aria-hidden', 'true');
      const bubble = document.createElement('div');
      bubble.className = 'teacher-bubble';
      bubble.innerHTML = rule.innerHTML;
      row.appendChild(avatar);
      row.appendChild(bubble);
      rule.replaceWith(row);
    }

    // "Erklären" führt Schritt für Schritt durch denselben Bildschirm wie
    // "Üben" - nur dass dort direkt die Lösung gezeigt wird statt einer Eingabe,
    // und das Maskottchen oben erklärt weiterhin, warum der Trick funktioniert.
    const trickBtn = card.querySelector('.btn-practice');
    if (trickBtn) {
      const explainBtn = document.createElement('button');
      explainBtn.type = 'button';
      explainBtn.className = 'btn-explain';
      explainBtn.textContent = '🎓 Erklären';
      explainBtn.addEventListener('click', () => openPractice(trickBtn.dataset.trick, 'explain', ruleText));
      trickBtn.parentNode.insertBefore(explainBtn, trickBtn);
    }
  });
}

/* ---------------- Deutsch: Stilmittel ---------------- */

const STILMITTEL = [
  {
    id: 'alliteration', name: 'Alliteration', color: '#fca5a5',
    definition: 'Mehrere aufeinanderfolgende Wörter beginnen mit demselben Anfangslaut.',
    erkennung: 'Achte auf Wortgruppen, bei denen mehrere Wörter direkt hintereinander mit demselben Buchstaben bzw. Laut beginnen.',
    beispiel: 'Milch macht müde Männer munter.',
  },
  {
    id: 'anapher', name: 'Anapher', color: '#fdba74',
    definition: 'Ein Wort oder eine Wortgruppe wird am Anfang mehrerer aufeinanderfolgender Sätze oder Verse wiederholt.',
    erkennung: 'Schau auf die Satz- oder Versanfänge: Wiederholen sie sich wörtlich?',
    beispiel: 'Wir haben gekämpft, wir haben durchgehalten, wir haben nie aufgegeben.',
  },
  {
    id: 'metapher', name: 'Metapher', color: '#fde047',
    definition: 'Ein Wort wird durch ein bildhaftes Wort aus einem anderen Bereich ersetzt, ohne Vergleichswort wie „wie“ oder „als“.',
    erkennung: 'Die wörtliche Bedeutung ergibt keinen Sinn, es steckt aber ein Bild dahinter – und es fehlt ein Vergleichswort.',
    beispiel: 'Das Leben ist ein Fluss, der unaufhaltsam dem Meer entgegenströmt.',
  },
  {
    id: 'vergleich', name: 'Vergleich', color: '#bef264',
    definition: 'Zwei Dinge werden mithilfe eines Vergleichswortes miteinander in Beziehung gesetzt.',
    erkennung: 'Suche nach Signalwörtern wie „wie“, „als“ oder „gleich“.',
    beispiel: 'Er rannte wie der Wind.',
  },
  {
    id: 'personifikation', name: 'Personifikation', color: '#86efac',
    definition: 'Einem unbelebten Gegenstand oder einer Idee werden menschliche Eigenschaften oder Handlungen zugeschrieben.',
    erkennung: 'Ein Ding oder Naturphänomen „tut“ etwas, das eigentlich nur Menschen können, z. B. lachen, weinen oder flüstern.',
    beispiel: 'Die Sonne lächelte über den Hügeln.',
  },
  {
    id: 'hyperbel', name: 'Hyperbel', color: '#6ee7b7',
    definition: 'Eine starke, bewusst unrealistische Übertreibung.',
    erkennung: 'Die Aussage ist offensichtlich maßlos übertrieben und nicht wörtlich gemeint.',
    beispiel: 'Ich habe dir das schon tausendmal gesagt.',
  },
  {
    id: 'ellipse', name: 'Ellipse', color: '#5eead4',
    definition: 'Ein Satzteil (z. B. das Verb) wird ausgelassen, lässt sich aber aus dem Zusammenhang erschließen.',
    erkennung: 'Der Satz wirkt unvollständig oder abgehackt, ergibt aber trotzdem Sinn.',
    beispiel: 'Je mehr Hektik, desto mehr Fehler.',
  },
  {
    id: 'antithese', name: 'Antithese', color: '#67e8f9',
    definition: 'Zwei gegensätzliche Begriffe oder Gedanken werden bewusst gegenübergestellt.',
    erkennung: 'Zwei Wörter oder Aussagen mit entgegengesetzter Bedeutung stehen direkt nebeneinander.',
    beispiel: 'Müde, aber stolz.',
  },
  {
    id: 'rhetorische-frage', name: 'Rhetorische Frage', color: '#7dd3fc',
    definition: 'Eine Frage, auf die keine Antwort erwartet wird, weil sie bereits eindeutig ist.',
    erkennung: 'Die Frage wirkt wie eine verkleidete Behauptung oder Aufforderung.',
    beispiel: 'Wollen wir jetzt, kurz vor dem Ziel, einfach aufgeben?',
  },
  {
    id: 'symbol', name: 'Symbol', color: '#93c5fd',
    definition: 'Ein konkreter Gegenstand steht stellvertretend für eine abstrakte Idee.',
    erkennung: 'Der Gegenstand trägt eine tiefere, oft kulturell bekannte Bedeutung – zum Beispiel eine weiße Taube für Frieden.',
    beispiel: 'Ein weißer Schmetterling flog über sein Grab.',
  },
  {
    id: 'ironie', name: 'Ironie', color: '#a5b4fc',
    definition: 'Es wird das Gegenteil von dem gesagt, was eigentlich gemeint ist.',
    erkennung: 'Die Aussage passt nicht zur Situation – erkennbar meist nur durch Tonfall oder Kontext.',
    beispiel: 'Na, das hast du ja wieder toll hinbekommen.',
  },
  {
    id: 'wiederholung', name: 'Wiederholung', color: '#c4b5fd',
    definition: 'Ein Wort oder Ausdruck wird mehrfach wiederholt, um ihn zu betonen.',
    erkennung: 'Dasselbe Wort taucht auffällig oft oder direkt hintereinander auf.',
    beispiel: 'Wind, Wind, überall nur Wind.',
  },
  {
    id: 'klimax', name: 'Klimax', color: '#d8b4fe',
    definition: 'Mehrere Begriffe werden in aufsteigender, sich steigernder Reihenfolge aufgezählt.',
    erkennung: 'Die Wörter werden von Stufe zu Stufe intensiver oder bedeutender.',
    beispiel: 'Etwas Großem, etwas Neuem, etwas Unvergesslichem.',
  },
  {
    id: 'chiasmus', name: 'Chiasmus', color: '#f0abfc',
    definition: 'Satzglieder werden über Kreuz angeordnet, nach dem Muster A–B–B–A.',
    erkennung: 'Der zweite Teil des Satzes spiegelt den Aufbau des ersten in umgekehrter Reihenfolge.',
    beispiel: 'Wir müssen leben, um zu essen, nicht essen, um zu leben.',
  },
  {
    id: 'onomatopoesie', name: 'Onomatopoesie (Lautmalerei)', color: '#f9a8d4',
    definition: 'Ein Wort ahmt lautlich das Geräusch nach, das es beschreibt.',
    erkennung: 'Sprich das Wort laut aus – klingt es wie das beschriebene Geräusch?',
    beispiel: 'Die Bienen summten und brummten im Garten.',
  },
  {
    id: 'euphemismus', name: 'Euphemismus', color: '#fda4af',
    definition: 'Eine unangenehme Tatsache wird beschönigend oder mildernd umschrieben.',
    erkennung: 'Eine harte Tatsache (z. B. der Tod) wird sanft oder verschleiernd ausgedrückt.',
    beispiel: 'Er schlief für immer ein.',
  },
];

const STIL_TEXTS = [
  {
    id: 'heidenroeslein',
    title: 'Heidenröslein',
    author: 'Johann Wolfgang von Goethe',
    body: "Sah ein Knab' ein Röslein stehn, Röslein auf der Heiden, war so jung und morgenschön, lief er schnell, es nah zu sehn, sah's mit vielen Freuden. Röslein, Röslein, Röslein rot, Röslein auf der Heiden.",
  },
  {
    id: 'loreley',
    title: 'Die Loreley (1. Strophe)',
    author: 'Heinrich Heine',
    body: 'Ich weiß nicht, was soll es bedeuten, dass ich so traurig bin; ein Märchen aus alten Zeiten, das kommt mir nicht aus dem Sinn.',
  },
  {
    id: 'sturm',
    title: 'Der Sturm',
    author: 'Übungstext',
    body: 'Der Wind heult und wütet, wild und wütend fegt er über die Felder. Der Himmel weint dicke Tränen, und die Bäume tanzen wie Verrückte im Sturm. Tausend Blitze zerreißen die Nacht, und der Donner brüllt lauter als ein Löwe. Ist das nicht der reinste Weltuntergang? Die Blätter flüstern und rascheln, als wollten sie vor der Wut des Himmels fliehen. Wind, Wind, überall nur Wind, der an den Fenstern rüttelt, an den Türen rüttelt, an den Nerven rüttelt.',
    expected: [
      { words: [1, 2, 3, 4], id: 'personifikation' },
      { words: [5, 6, 7], id: 'alliteration' },
      { words: [14, 15, 16, 17], id: 'personifikation' },
      { words: [21, 22, 23], id: 'vergleich' },
      { words: [26, 27, 28, 29, 30], id: 'hyperbel' },
      { words: [34, 35, 36, 37, 38], id: 'vergleich' },
      { words: [39, 40, 41, 42, 43, 44], id: 'rhetorische-frage' },
      { words: [46, 47, 48, 49], id: 'personifikation' },
      { words: [59, 60, 61, 62, 63], id: 'wiederholung' },
      { words: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76], id: 'klimax' },
    ],
  },
  {
    id: 'rede',
    title: 'Die Rede',
    author: 'Übungstext',
    body: 'Wollen wir aufgeben? Wollen wir jetzt, kurz vor dem Ziel, einfach stehen bleiben? Ich sage: nein! Wir haben gekämpft, wir haben durchgehalten, wir haben nie aufgegeben. Der Weg war steinig und steil, aber wir sind ihn gemeinsam gegangen. Heute stehen wir hier: müde, aber stolz. Erschöpft, aber ungebrochen. Dies ist nicht das Ende, liebe Freunde, dies ist erst der Anfang von etwas Großem, etwas Neuem, etwas Unvergesslichem.',
    expected: [
      { words: [0, 1], id: 'anapher' },
      { words: [3, 4], id: 'anapher' },
      { words: [16, 17], id: 'anapher' },
      { words: [19, 20], id: 'anapher' },
      { words: [22, 23], id: 'anapher' },
      { words: [29, 30, 31], id: 'alliteration' },
      { words: [42, 43, 44], id: 'antithese' },
      { words: [45, 46, 47], id: 'antithese' },
      { words: [61, 62, 63, 64, 65, 66], id: 'klimax' },
    ],
  },
  {
    id: 'morgen',
    title: 'Der letzte Morgen',
    author: 'Übungstext',
    body: 'Die Sonne lächelte über den Hügeln, als der alte Mann für immer einschlief. Die Bienen summten und brummten im Garten, während die Blätter im Wind raschelten. Ein weißer Schmetterling flog über sein Grab, als wolle er sagen, dass die Seele nun frei sei. Das Leben ist ein Fluss, der unaufhaltsam dem Meer entgegenströmt. Manche nennen es das Ende, andere nennen es den Anfang einer neuen Reise.',
    expected: [
      { words: [1, 2], id: 'personifikation' },
      { words: [10, 11, 12], id: 'euphemismus' },
      { words: [15, 16, 17], id: 'onomatopoesie' },
      { words: [25], id: 'onomatopoesie' },
      { words: [26, 27, 28], id: 'symbol' },
      { words: [43, 44, 45, 46, 47, 48, 49, 50, 51, 52], id: 'metapher' },
      { words: [56, 57], id: 'antithese' },
      { words: [61, 62], id: 'antithese' },
    ],
  },
];

/**
 * Baut die aufklappbare Stilmittel-Übersicht: Klick auf eine Zeile zeigt
 * Definition, Erkennungsmerkmale und ein Beispiel darunter an.
 */
function renderStilmittelListe() {
  const list = el('stilmittel-list');
  list.innerHTML = '';
  STILMITTEL.forEach((sm) => {
    const item = document.createElement('div');
    item.className = 'stilmittel-item';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stilmittel-toggle';

    const swatch = document.createElement('span');
    swatch.className = 'stilmittel-swatch';
    swatch.style.background = sm.color;
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'stilmittel-name';
    name.textContent = sm.name;

    const chevron = document.createElement('span');
    chevron.className = 'stilmittel-chevron';
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');

    toggle.appendChild(swatch);
    toggle.appendChild(name);
    toggle.appendChild(chevron);

    const body = document.createElement('div');
    body.className = 'stilmittel-body';
    body.hidden = true;

    const pDef = document.createElement('p');
    pDef.innerHTML = `<strong>Was es ist:</strong> ${sm.definition}`;
    const pErk = document.createElement('p');
    pErk.innerHTML = `<strong>Woran du es erkennst:</strong> ${sm.erkennung}`;
    const pBsp = document.createElement('p');
    pBsp.className = 'stilmittel-example';
    pBsp.innerHTML = `<strong>Beispiel:</strong> <em>${sm.beispiel}</em>`;
    body.appendChild(pDef);
    body.appendChild(pErk);
    body.appendChild(pBsp);

    toggle.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      item.classList.toggle('open', willOpen);
    });

    item.appendChild(toggle);
    item.appendChild(body);
    list.appendChild(item);
  });
}

// Zustand der aktuellen Übungs-Session: welcher Text, welche Wörter sind
// bereits einem Stilmittel zugeordnet, welche sind gerade nur markiert
// (ausgewählt, aber noch nicht zugeordnet).
const stilUebung = {
  textId: null,
  words: [],
  selection: [],
  checked: false,
};

function pickRandomStilText(excludeId) {
  const pool = STIL_TEXTS.filter((t) => t.id !== excludeId);
  const source = pool.length ? pool : STIL_TEXTS;
  return source[Math.floor(Math.random() * source.length)];
}

function loadStilUebungText() {
  const text = pickRandomStilText(stilUebung.textId);
  stilUebung.textId = text.id;
  stilUebung.words = text.body.split(/\s+/).filter(Boolean).map((raw) => ({ raw, assignedId: null, checkState: null }));
  stilUebung.selection = [];
  stilUebung.checked = false;

  el('stilmittel-text-meta').textContent = `${text.title} – ${text.author}`;
  renderStilText();
  hideStilAssignPanel();
  hideStilCheckResult();
}

function clearStilCheck() {
  if (!stilUebung.checked) return;
  stilUebung.checked = false;
  stilUebung.words.forEach((w) => { w.checkState = null; });
  hideStilCheckResult();
}

function hideStilCheckResult() {
  const result = el('stilmittel-check-result');
  result.hidden = true;
  result.classList.remove('success');
}

function showStilCheckMessage(text, success) {
  const result = el('stilmittel-check-result');
  result.textContent = text;
  result.classList.toggle('success', success);
  result.hidden = false;
}

function checkStilUebung() {
  const text = STIL_TEXTS.find((t) => t.id === stilUebung.textId);
  if (!text || !text.expected || !text.expected.length) {
    stilUebung.checked = false;
    showStilCheckMessage('Für dieses Gedicht gibt es leider keine automatische Überprüfung – probier einen der anderen Übungstexte aus.', false);
    return;
  }

  stilUebung.words.forEach((w) => { w.checkState = null; });

  let correctCount = 0;
  const missedNames = [];

  text.expected.forEach((exp) => {
    const allCorrect = exp.words.every((i) => stilUebung.words[i] && stilUebung.words[i].assignedId === exp.id);
    if (allCorrect) {
      correctCount += 1;
      exp.words.forEach((i) => { stilUebung.words[i].checkState = 'correct'; });
    } else {
      exp.words.forEach((i) => {
        const word = stilUebung.words[i];
        if (!word) return;
        word.checkState = word.assignedId ? 'wrong' : 'missed';
      });
      const sm = STILMITTEL.find((s) => s.id === exp.id);
      missedNames.push(sm ? sm.name : exp.id);
    }
  });

  // Zusätzlich markierte Wörter, die zu keinem erwarteten Stilmittel gehören.
  const expectedIndices = new Set(text.expected.flatMap((e) => e.words));
  stilUebung.words.forEach((w, i) => {
    if (w.assignedId && !expectedIndices.has(i) && !w.checkState) {
      w.checkState = 'wrong';
    }
  });

  stilUebung.checked = true;
  renderStilText();

  const total = text.expected.length;
  if (correctCount === total) {
    showStilCheckMessage(`🎉 Super, alle ${total} Stilmittel richtig erkannt!`, true);
  } else {
    showStilCheckMessage(`✅ ${correctCount} von ${total} Stilmitteln richtig erkannt. Noch nicht gefunden: ${missedNames.join(', ')}.`, false);
  }
}

function renderStilText() {
  const card = el('stilmittel-text-card');
  card.innerHTML = '';
  stilUebung.words.forEach((w, idx) => {
    const span = document.createElement('span');
    span.className = 'stil-word';
    span.textContent = w.raw;
    span.dataset.wordIdx = String(idx);
    if (w.assignedId) {
      const sm = STILMITTEL.find((s) => s.id === w.assignedId);
      span.classList.add('assigned');
      span.style.background = sm.color;
      span.title = sm.name;
    } else if (stilUebung.selection.includes(idx)) {
      span.classList.add('pending');
    }
    if (stilUebung.checked && w.checkState) {
      span.classList.add(`check-${w.checkState}`);
    }
    card.appendChild(span);
    card.appendChild(document.createTextNode(' '));
  });
}

function hideStilAssignPanel() {
  el('stilmittel-assign-panel').hidden = true;
  el('stilmittel-search-input').value = '';
  el('stilmittel-search-results').innerHTML = '';
}

function renderStilSearchResults(query) {
  const results = el('stilmittel-search-results');
  results.innerHTML = '';
  const q = query.trim().toLowerCase();
  STILMITTEL.filter((sm) => sm.name.toLowerCase().includes(q)).forEach((sm) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stil-search-result';
    const swatch = document.createElement('span');
    swatch.className = 'stilmittel-swatch';
    swatch.style.background = sm.color;
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = sm.name;
    btn.appendChild(swatch);
    btn.appendChild(name);
    btn.addEventListener('click', () => assignSelectionTo(sm.id));
    results.appendChild(btn);
  });
}

function updateStilAssignPanel() {
  if (!stilUebung.selection.length) {
    hideStilAssignPanel();
    return;
  }
  el('stilmittel-assign-panel').hidden = false;
  const preview = stilUebung.selection
    .slice()
    .sort((a, b) => a - b)
    .map((i) => stilUebung.words[i].raw)
    .join(' ');
  el('stilmittel-selected-preview').textContent = `„${preview}“`;
  renderStilSearchResults(el('stilmittel-search-input').value);
}

function assignSelectionTo(stilmittelId) {
  stilUebung.selection.forEach((idx) => {
    stilUebung.words[idx].assignedId = stilmittelId;
  });
  stilUebung.selection = [];
  clearStilCheck();
  renderStilText();
  hideStilAssignPanel();
}

function onStilWordClick(idx) {
  const word = stilUebung.words[idx];
  if (word.assignedId) {
    // Erneuter Klick auf eine bereits zugeordnete Markierung hebt sie auf.
    word.assignedId = null;
    clearStilCheck();
    renderStilText();
    return;
  }
  const pos = stilUebung.selection.indexOf(idx);
  if (pos === -1) stilUebung.selection.push(idx);
  else stilUebung.selection.splice(pos, 1);
  renderStilText();
  updateStilAssignPanel();
}

function renderStilLegend(query = '') {
  const list = el('stilmittel-legend-list');
  list.innerHTML = '';
  const q = query.trim().toLowerCase();
  STILMITTEL.filter((sm) => sm.name.toLowerCase().includes(q)).forEach((sm) => {
    const row = document.createElement('div');
    row.className = 'stilmittel-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'stilmittel-swatch';
    swatch.style.background = sm.color;
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = sm.name;
    row.appendChild(swatch);
    row.appendChild(name);
    list.appendChild(row);
  });
}

function initStilmittelUebung() {
  el('stilmittel-text-card').addEventListener('click', (ev) => {
    const wordEl = ev.target.closest('.stil-word');
    if (!wordEl) return;
    onStilWordClick(Number(wordEl.dataset.wordIdx));
  });

  el('stilmittel-new-text-btn').addEventListener('click', loadStilUebungText);
  el('stilmittel-check-btn').addEventListener('click', checkStilUebung);

  el('stilmittel-cancel-selection-btn').addEventListener('click', () => {
    stilUebung.selection = [];
    renderStilText();
    hideStilAssignPanel();
  });

  el('stilmittel-search-input').addEventListener('input', (ev) => renderStilSearchResults(ev.target.value));
  el('stilmittel-legend-search').addEventListener('input', (ev) => renderStilLegend(ev.target.value));

  renderStilLegend();
  loadStilUebungText();
}

/* ---------------- Deutsch: Versmaß ---------------- */

// Betonungsmuster je Silbe wird mit einem "X" (Hebung/betont) bzw. "x"
// (Senkung/unbetont) beschrieben. Der Aufbau folgt bewusst dem gleichen
// Aufklapp-Prinzip wie die Stilmittel-Übersicht.
const VERSMASS_TYPES = [
  {
    id: 'jambus', name: 'Jambus', color: '#7dd3fc', muster: 'x  ˉ  |  x  ˉ  |  x  ˉ  |  x  ˉ',
    definition: 'Ein Versfuß aus einer unbetonten und einer darauffolgenden betonten Silbe (x ˉ). Wiederholt sich das über eine ganze Zeile, entsteht ein steigender Rhythmus.',
    erkennung: 'Sprich die Zeile laut und klopfe den Takt mit: un-be-TONT, un-be-TONT, … Der Jambus ist im Deutschen das natürlichste Versmaß, weil sehr viele Wörter selbst so betont werden.',
    beispiel: '„Ich seh den Mond im dunklen Wald“ – Ich SEH den MOND im DUNK len WALD (eigener Übungssatz).',
  },
  {
    id: 'trochaeus', name: 'Trochäus', color: '#fca5a5', muster: 'ˉ  x  |  ˉ  x  |  ˉ  x  |  ˉ  x',
    definition: 'Ein Versfuß aus einer betonten und einer darauffolgenden unbetonten Silbe (ˉ x) – also genau umgekehrt zum Jambus. Es entsteht ein fallender Rhythmus.',
    erkennung: 'Die Zeile beginnt betont und „fällt“ danach immer wieder ab: BE-tont-un, BE-tont-un, … Viele deutsche Wörter mit Betonung auf der ersten Silbe (z. B. „Sonne“, „Vögel“) passen von Natur aus in dieses Muster.',
    beispiel: '„Sonne scheint auf grüne Wiesen“ – SON ne SCHEINT auf GRÜ ne WIE sen (eigener Übungssatz).',
  },
  {
    id: 'daktylus', name: 'Daktylus', color: '#86efac', muster: 'ˉ  x  x  |  ˉ  x  x  |  ˉ  x  x',
    definition: 'Ein dreisilbiger Versfuß: eine betonte Silbe, gefolgt von zwei unbetonten (ˉ x x).',
    erkennung: 'Zähle in Dreiergruppen: BE-tont-un-be-TONT-un-be-tont, … Ganze Sätze im reinen Daktylus klingen im Deutschen oft feierlich oder ungewöhnlich, weil dieser Rhythmus nicht dem normalen Sprachfluss entspricht – er stammt ursprünglich aus der antiken Dichtung (z. B. dem Hexameter).',
    beispiel: '„Abendrot, Kinderlied, fröhlicher Klang“ – A bend rot KIN der lied FRÖH li cher KLANG (eigener Übungssatz).',
  },
  {
    id: 'anapaest', name: 'Anapäst', color: '#fde047', muster: 'x  x  ˉ  |  x  x  ˉ  |  x  x  ˉ',
    definition: 'Ein dreisilbiger Versfuß: zwei unbetonte Silben, gefolgt von einer betonten (x x ˉ) – also genau umgekehrt zum Daktylus.',
    erkennung: 'Zähle wieder in Dreiergruppen, diesmal mit der Betonung am Ende: un-be-TONT, un-be-TONT, … Auch der Anapäst ist im Deutschen eher selten und wirkt oft schwungvoll oder eilig.',
    beispiel: '„Elefant, General, Sekretär“ – e le FANT ge ne RAL se kre TÄR (eigener Übungssatz).',
  },
];

/**
 * Baut die aufklappbare Versmaß-Übersicht – identisches Prinzip wie
 * renderStilmittelListe(), nur mit den Versmaß-Daten befüllt.
 */
function renderVersmassListe() {
  const list = el('versmass-list');
  list.innerHTML = '';
  VERSMASS_TYPES.forEach((vm) => {
    const item = document.createElement('div');
    item.className = 'stilmittel-item';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stilmittel-toggle';

    const swatch = document.createElement('span');
    swatch.className = 'stilmittel-swatch';
    swatch.style.background = vm.color;
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'stilmittel-name';
    name.textContent = vm.name;

    const chevron = document.createElement('span');
    chevron.className = 'stilmittel-chevron';
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');

    toggle.appendChild(swatch);
    toggle.appendChild(name);
    toggle.appendChild(chevron);

    const body = document.createElement('div');
    body.className = 'stilmittel-body';
    body.hidden = true;

    const pMuster = document.createElement('p');
    pMuster.innerHTML = `<strong>Muster:</strong> <span class="vers-muster">${vm.muster}</span>`;
    const pDef = document.createElement('p');
    pDef.innerHTML = `<strong>Was es ist:</strong> ${vm.definition}`;
    const pErk = document.createElement('p');
    pErk.innerHTML = `<strong>Woran du es erkennst:</strong> ${vm.erkennung}`;
    const pBsp = document.createElement('p');
    pBsp.className = 'stilmittel-example';
    pBsp.innerHTML = `<strong>Beispiel:</strong> <em>${vm.beispiel}</em>`;
    body.appendChild(pMuster);
    body.appendChild(pDef);
    body.appendChild(pErk);
    body.appendChild(pBsp);

    toggle.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      item.classList.toggle('open', willOpen);
    });

    item.appendChild(toggle);
    item.appendChild(body);
    list.appendChild(item);
  });
}

// Übungstexte werden aus einem geprüften Wortschatz zufällig zusammengebaut,
// statt aus einer festen Liste zu stammen. Jedes Wort ist mit seinem
// bekannten Betonungsmuster hinterlegt (X = betont, x = unbetont), sodass
// jede erzeugte Zeile durch ihre Konstruktion garantiert zum gewählten
// Versmaß passt und sich automatisch überprüfen lässt – anders als bei
// echten Gedichten, wo die Betonung im Detail nicht immer eindeutig ist
// (deshalb gibt es hier, im Unterschied zu den Stilmittel-Übungstexten,
// keine Ausnahme-Texte ohne Lösung mehr). Aus diesem Wortschatz lassen sich
// je Versmaß tausende verschiedene Zeilenkombinationen erzeugen – weit mehr
// als die geforderten 100 Übungstexte.
function syl(text, stress) {
  return { text, stress };
}

// [betonte Silbe, unbetonte Silbe(n)] - jeweils als fertig getrennte,
// korrekt großgeschriebene Silben, damit sie direkt als Übungssilben
// gerendert werden können.
const VERS_WORDBANK = {
  // Bewusst nur Artikel/Präpositionen statt Pronomen - vor einem Nomen
  // ergeben sie auch bei zufälliger Kombination noch eine erkennbare
  // Wortgruppe (z.B. "im Tal", "und Herz") statt einer wirren Wortfolge.
  unbetont: ['der', 'die', 'das', 'ein', 'und', 'im', 'zu', 'so', 'in', 'an', 'auf', 'um', 'als', 'vom', 'beim', 'zum'],
  betont: ['Mond', 'Wald', 'Baum', 'Wind', 'Tag', 'Nacht', 'Stern', 'Feld', 'Berg', 'Meer', 'Fluss', 'Herz', 'Licht', 'Schnee', 'Eis', 'Glück', 'Haus', 'Tal', 'Gold', 'Salz', 'Brot', 'Rot', 'Blau', 'Grün'],
  // Zweisilbige Wörter mit Betonung auf der ersten Silbe (füllen einen ganzen Trochäus-Versfuß).
  trochaeusWort: [['Son', 'ne'], ['Vö', 'gel'], ['sin', 'gen'], ['fröh', 'lich'], ['Blu', 'men'], ['Wie', 'sen'], ['gol', 'den'], ['hel', 'le'], ['lei', 'se'], ['Wol', 'ke'], ['Re', 'gen'], ['flie', 'gen'], ['sprin', 'gen'], ['la', 'chen'], ['schau', 'en'], ['Was', 'ser'], ['Feu', 'er'], ['Him', 'mel'], ['Er', 'de'], ['Win', 'ter'], ['Som', 'mer'], ['A', 'bend'], ['Mor', 'gen'], ['Gar', 'ten']],
  // Zweisilbige Wörter mit Betonung auf der zweiten Silbe (füllen einen ganzen Jambus-Versfuß).
  jambusWort: [['ge', 'fällt'], ['ge', 'macht'], ['ent', 'steht'], ['be', 'reit'], ['so', 'fort'], ['vor', 'bei'], ['Ge', 'bet'], ['Ge', 'stalt'], ['Ver', 'stand'], ['ge', 'weckt'], ['ge', 'sagt'], ['ge', 'dacht'], ['er', 'wacht'], ['ver', 'schwand'], ['ge', 'schieht'], ['er', 'zählt']],
  // Dreisilbige Wörter mit Betonung auf der ersten Silbe (füllen einen ganzen Daktylus-Versfuß).
  daktylusWort: [['A', 'bend', 'rot'], ['Kin', 'der', 'lied'], ['fröh', 'li', 'cher'], ['Son', 'nen', 'schein'], ['Vo', 'gel', 'schwarm'], ['Mor', 'gen', 'tau']],
  // Dreisilbige Wörter mit Betonung auf der letzten Silbe (füllen einen ganzen Anapäst-Versfuß).
  anapaestWort: [['E', 'le', 'fant'], ['Ge', 'ne', 'ral'], ['Se', 'kre', 'tär'], ['Of', 'fi', 'zier'], ['Ka', 'va', 'lier'], ['Me', 'lo', 'die']],
};

function pickBank(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function capitalizeSyl(s) {
  return { text: s.text.charAt(0).toUpperCase() + s.text.slice(1), stress: s.stress };
}

// Zieht zwei unterschiedliche Einträge aus derselben Liste, damit z.B. bei
// Daktylus/Anapäst nicht zufällig zweimal hintereinander dasselbe Füllwort
// gezogen wird (das würde sich unnatürlich wiederholend lesen).
function pickTwoDistinct(list) {
  const a = pickBank(list);
  let b = pickBank(list);
  while (b === a && list.length > 1) b = pickBank(list);
  return [a, b];
}

// Ein ganzes, mehrsilbiges Wort aus dem Wortschatz liest sich natürlicher
// als zwei zufällig aneinandergereihte Einzelsilben-Wörter, deshalb wird es
// deutlich häufiger gewählt - die Einzelsilben-Variante sorgt trotzdem für
// zusätzliche Abwechslung.
const WHOLE_WORD_CHANCE = 0.7;

// Baut eine Jambus-Zeile (x ˉ | x ˉ | …) aus "feetCount" Versfüßen. Jeder
// Versfuß ist entweder ein unbetontes + ein betontes Einzelwort oder ein
// zweisilbiges Wort, das die Betonung schon selbst mitbringt.
function buildJambusLine(feetCount) {
  const line = [];
  for (let i = 0; i < feetCount; i++) {
    if (Math.random() < WHOLE_WORD_CHANCE) {
      const [a, b] = pickBank(VERS_WORDBANK.jambusWort);
      line.push(syl(a, false), syl(b, true));
    } else {
      line.push(syl(pickBank(VERS_WORDBANK.unbetont), false), syl(pickBank(VERS_WORDBANK.betont), true));
    }
  }
  line[0] = capitalizeSyl(line[0]);
  return line;
}

function buildTrochaeusLine(feetCount) {
  const line = [];
  for (let i = 0; i < feetCount; i++) {
    if (Math.random() < WHOLE_WORD_CHANCE) {
      const [a, b] = pickBank(VERS_WORDBANK.trochaeusWort);
      line.push(syl(a, true), syl(b, false));
    } else {
      line.push(syl(pickBank(VERS_WORDBANK.betont), true), syl(pickBank(VERS_WORDBANK.unbetont), false));
    }
  }
  line[0] = capitalizeSyl(line[0]);
  return line;
}

function buildDaktylusLine(feetCount) {
  const line = [];
  for (let i = 0; i < feetCount; i++) {
    if (Math.random() < WHOLE_WORD_CHANCE) {
      const [a, b, c] = pickBank(VERS_WORDBANK.daktylusWort);
      line.push(syl(a, true), syl(b, false), syl(c, false));
    } else {
      const [x1, x2] = pickTwoDistinct(VERS_WORDBANK.unbetont);
      line.push(syl(pickBank(VERS_WORDBANK.betont), true), syl(x1, false), syl(x2, false));
    }
  }
  // Häufig endet ein Daktylus-Vers "verkürzt" auf einer einzelnen betonten Silbe.
  if (Math.random() < 0.5) line.push(syl(pickBank(VERS_WORDBANK.betont), true));
  line[0] = capitalizeSyl(line[0]);
  return line;
}

function buildAnapaestLine(feetCount) {
  const line = [];
  for (let i = 0; i < feetCount; i++) {
    if (Math.random() < WHOLE_WORD_CHANCE) {
      const [a, b, c] = pickBank(VERS_WORDBANK.anapaestWort);
      line.push(syl(a, false), syl(b, false), syl(c, true));
    } else {
      const [x1, x2] = pickTwoDistinct(VERS_WORDBANK.unbetont);
      line.push(syl(x1, false), syl(x2, false), syl(pickBank(VERS_WORDBANK.betont), true));
    }
  }
  line[0] = capitalizeSyl(line[0]);
  return line;
}

const VERS_LINE_BUILDERS = {
  jambus: () => buildJambusLine(pick([3, 4])),
  trochaeus: () => buildTrochaeusLine(pick([3, 4])),
  daktylus: () => buildDaktylusLine(pick([2, 3])),
  anapaest: () => buildAnapaestLine(pick([2, 3])),
};

// Hängt an die letzte Silbe einer Zeile ein Satzzeichen an, rein optisch -
// die Betonungsmarkierung bezieht sich weiterhin nur auf die Silbe selbst.
function withPunctuation(line, mark) {
  const last = line[line.length - 1];
  line[line.length - 1] = { text: last.text + mark, stress: last.stress };
  return line;
}

function generateVersText(excludeMeterId) {
  const meterPool = VERSMASS_TYPES.map((m) => m.id).filter((id) => id !== excludeMeterId);
  const meterId = meterPool.length ? pick(meterPool) : pick(VERSMASS_TYPES.map((m) => m.id));
  const buildLine = VERS_LINE_BUILDERS[meterId];
  const lines = [
    withPunctuation(buildLine(), ','),
    withPunctuation(buildLine(), '.'),
  ];
  const meter = VERSMASS_TYPES.find((m) => m.id === meterId);
  return { title: 'Übungssatz', author: meter.name, meterId, lines };
}

// Zustand der aktuellen Versmaß-Übung: welcher (zufällig erzeugte) Text,
// aktueller Markier-Modus (betont/unbetont) und die vom Nutzer vergebenen
// Markierungen pro Silbe.
const versUebung = {
  currentText: null,
  mode: 'betont',
  marks: [], // marks[lineIdx][sylIdx] = 'betont' | 'unbetont' | null
  checked: false,
  checkStates: [], // gleiche Struktur wie marks, Werte: 'correct' | 'wrong' | null
};

function loadVersUebungText() {
  const text = generateVersText(versUebung.currentText ? versUebung.currentText.meterId : null);
  versUebung.currentText = text;
  versUebung.marks = text.lines.map((line) => line.map(() => null));
  versUebung.checked = false;
  versUebung.checkStates = text.lines.map((line) => line.map(() => null));

  el('versmass-text-meta').textContent = `${text.title} – ${text.author}`;
  renderVersText();
  hideVersCheckResult();
}

function hideVersCheckResult() {
  const result = el('versmass-check-result');
  result.hidden = true;
  result.classList.remove('success');
}

function showVersCheckMessage(text, success) {
  const result = el('versmass-check-result');
  result.textContent = text;
  result.classList.toggle('success', success);
  result.hidden = false;
}

function clearVersCheck() {
  if (!versUebung.checked) return;
  versUebung.checked = false;
  versUebung.checkStates = versUebung.checkStates.map((line) => line.map(() => null));
  hideVersCheckResult();
}

function renderVersText() {
  const text = versUebung.currentText;
  const card = el('versmass-text-card');
  card.innerHTML = '';
  text.lines.forEach((line, lineIdx) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'vers-line';
    line.forEach((s, sylIdx) => {
      const chip = document.createElement('span');
      chip.className = 'vers-syllable';
      chip.dataset.line = String(lineIdx);
      chip.dataset.syl = String(sylIdx);
      const mark = versUebung.marks[lineIdx][sylIdx];
      if (mark) chip.classList.add(mark);
      const checkState = versUebung.checked ? versUebung.checkStates[lineIdx][sylIdx] : null;
      if (checkState) chip.classList.add(`check-${checkState}`);

      const markSpan = document.createElement('span');
      markSpan.className = 'vers-mark';
      markSpan.textContent = mark === 'betont' ? 'ˉ' : mark === 'unbetont' ? '˘' : '';
      markSpan.setAttribute('aria-hidden', 'true');

      const textSpan = document.createElement('span');
      textSpan.className = 'vers-syllable-text';
      textSpan.textContent = s.text;

      chip.appendChild(markSpan);
      chip.appendChild(textSpan);
      lineEl.appendChild(chip);
    });
    card.appendChild(lineEl);
  });
}

function onVersSyllableClick(lineIdx, sylIdx) {
  const current = versUebung.marks[lineIdx][sylIdx];
  versUebung.marks[lineIdx][sylIdx] = current === versUebung.mode ? null : versUebung.mode;
  clearVersCheck();
  renderVersText();
}

function checkVersUebung() {
  const text = versUebung.currentText;
  const meter = VERSMASS_TYPES.find((m) => m.id === text.meterId);

  let correctCount = 0;
  let total = 0;
  versUebung.checkStates = text.lines.map((line, lineIdx) => line.map((s, sylIdx) => {
    total += 1;
    const expected = s.stress ? 'betont' : 'unbetont';
    const given = versUebung.marks[lineIdx][sylIdx];
    const isCorrect = given === expected;
    if (isCorrect) correctCount += 1;
    return isCorrect ? 'correct' : 'wrong';
  }));

  versUebung.checked = true;
  renderVersText();

  if (correctCount === total) {
    showVersCheckMessage(`🎉 Genau richtig! Das ist ein ${meter.name} (${meter.muster}).`, true);
  } else {
    showVersCheckMessage(`✅ ${correctCount} von ${total} Silben richtig markiert. Schau dir die rot markierten Silben nochmal an.`, false);
  }
}

function initVersmassUebung() {
  el('versmass-text-card').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.vers-syllable');
    if (!chip) return;
    onVersSyllableClick(Number(chip.dataset.line), Number(chip.dataset.syl));
  });

  el('versmass-mode-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pill');
    if (!btn) return;
    versUebung.mode = btn.dataset.mode;
    el('versmass-mode-group').querySelectorAll('.pill').forEach((p) => p.classList.toggle('selected', p === btn));
  });

  el('versmass-new-text-btn').addEventListener('click', loadVersUebungText);
  el('versmass-check-btn').addEventListener('click', checkVersUebung);
  el('versmass-reset-btn').addEventListener('click', () => {
    versUebung.marks = versUebung.marks.map((line) => line.map(() => null));
    clearVersCheck();
    renderVersText();
  });

  loadVersUebungText();
}

/* ---------------- Deutsch: Textarten ---------------- */

// Erste beide Einträge sind die Überblicks-Kategorien (nicht selbst wählbar
// in der Übung), danach folgen die drei literarischen Gattungen und
// zuletzt fünf Sachtext-Arten - jeweils mit "gattung": 'fiktional' oder
// 'sachtext', damit sich daraus automatisch die auswählbaren Textarten und
// die Fiktional/Sachtext-Zuordnung für die Übung ableiten lassen.
const TEXTARTEN = [
  {
    id: 'fiktional-uebersicht', name: 'Fiktionale Texte', color: '#93c5fd',
    definition: 'Erfundene, literarische Texte – die Handlung, Figuren oder Ereignisse sind (ganz oder teilweise) ausgedacht, auch wenn sie an echte Orte oder Ereignisse angelehnt sein können.',
    erkennung: 'Frage dich: Erhebt der Text den Anspruch, wortwörtlich wahr zu sein, oder erzählt er eine erfundene Geschichte? Fiktionale Texte gehören zu einer von drei literarischen Gattungen: Lyrik, Epik oder Dramatik.',
    beispiel: 'Ein Gedicht, ein Roman, eine Kurzgeschichte oder ein Theaterstück.',
  },
  {
    id: 'lyrik', name: 'Lyrik', color: '#7dd3fc', gattung: 'fiktional',
    definition: 'Eine der drei literarischen Gattungen: meist in Versen und Strophen geschrieben, oft mit Reim und Versmaß, drückt häufig Gefühle oder Stimmungen aus.',
    erkennung: 'Kurze Zeilen, die zu Strophen gruppiert sind; oft Reime, Wiederholungen und Sprachbilder (Metaphern, Vergleiche); meist keine durchgehende Handlung.',
    beispiel: 'Ein Gedicht wie Goethes „Heidenröslein“.',
  },
  {
    id: 'epik', name: 'Epik', color: '#86efac', gattung: 'fiktional',
    definition: 'Eine der drei literarischen Gattungen: erzählende Texte in Prosa (durchgehendem Fließtext), meist mit einem Erzähler, Figuren und einer Handlung.',
    erkennung: 'Fließtext (keine Verse), oft eine erzählende Stimme („Er ging…“), eine Handlung mit Anfang, Verlauf und Ende.',
    beispiel: 'Ein Roman, eine Kurzgeschichte, ein Märchen oder eine Fabel.',
  },
  {
    id: 'dramatik', name: 'Dramatik', color: '#fca5a5', gattung: 'fiktional',
    definition: 'Eine der drei literarischen Gattungen: für die Bühne geschrieben, besteht fast nur aus wörtlicher Rede der Figuren und Regieanweisungen.',
    erkennung: 'Figurennamen vor den Sätzen (oft in Großbuchstaben), Regieanweisungen in Klammern oder kursiv, kein erzählender Text dazwischen.',
    beispiel: 'Ein Theaterstück, eine Tragödie oder eine Komödie.',
  },
  {
    id: 'sachtext-uebersicht', name: 'Nicht-fiktionale Texte (Sachtexte)', color: '#fdba74',
    definition: 'Texte, die reale Sachverhalte, Ereignisse oder Meinungen wiedergeben, ohne eine erfundene Geschichte zu erzählen. Sie wollen informieren, erklären oder überzeugen.',
    erkennung: 'Sachtexte beziehen sich auf echte Personen, Fakten oder Ereignisse. Typische Beispiele: Bericht, Reportage, Kommentar, Anleitung, Interview.',
    beispiel: 'Eine Zeitungsmeldung, eine Bedienungsanleitung oder ein Interview.',
  },
  {
    id: 'bericht', name: 'Bericht', color: '#fde047', gattung: 'sachtext',
    definition: 'Ein Sachtext, der ein reales Ereignis sachlich, knapp und in der Vergangenheit wiedergibt – meist mit den W-Fragen (wer, was, wann, wo, wie, warum).',
    erkennung: 'Sachlicher, neutraler Ton, keine persönliche Meinung, klare zeitliche Reihenfolge der Ereignisse.',
    beispiel: 'Ein Zeitungsbericht über ein Fußballspiel oder ein Schulereignis.',
  },
  {
    id: 'reportage', name: 'Reportage', color: '#fdba74', gattung: 'sachtext',
    definition: 'Ein Sachtext über ein reales Ereignis, bei dem der Autor selbst dabei war und seine persönlichen Eindrücke lebendig miterzählt.',
    erkennung: 'Anschauliche, oft im Präsens erzählte Beobachtungen „vor Ort“, persönliche Eindrücke, aber auf realen Fakten basierend.',
    beispiel: 'Ein Live-Bericht von einem Konzert oder einer Reise.',
  },
  {
    id: 'kommentar', name: 'Kommentar', color: '#c4b5fd', gattung: 'sachtext',
    definition: 'Ein Sachtext, in dem der Autor zu einem aktuellen Thema klar Stellung bezieht und seine Meinung begründet.',
    erkennung: 'Deutliche Meinungsäußerungen („Ich finde“, „Meiner Meinung nach“), wertende Wörter, eine klare Position wird vertreten und begründet.',
    beispiel: 'Ein Meinungsbeitrag zu einem aktuellen Thema in der Zeitung.',
  },
  {
    id: 'anleitung', name: 'Anleitung', color: '#5eead4', gattung: 'sachtext',
    definition: 'Ein Sachtext, der in klaren Schritten erklärt, wie man etwas tut oder herstellt.',
    erkennung: 'Nummerierte oder klar abgegrenzte Schritte, Befehlsform (Imperativ: „Nimm…“, „Rühre…“), meist ohne Handlung oder Figuren.',
    beispiel: 'Eine Bedienungsanleitung oder ein Kochrezept.',
  },
  {
    id: 'interview', name: 'Interview', color: '#a5b4fc', gattung: 'sachtext',
    definition: 'Ein Sachtext in Frage-Antwort-Form zwischen einer interviewenden und einer befragten Person.',
    erkennung: 'Abwechselnd Frage und Antwort, oft mit Namen oder Kürzel gekennzeichnet (z. B. „Frage:“ / „Antwort:“).',
    beispiel: 'Ein Interview mit einer bekannten Persönlichkeit in einer Zeitschrift.',
  },
];

// Die konkreten, in der Übung auswählbaren Textarten - alles außer den
// beiden Überblicks-Einträgen ganz oben.
const TEXTART_TYPES = TEXTARTEN.filter((t) => t.gattung);

function renderTextartenListe() {
  const list = el('textarten-list');
  list.innerHTML = '';
  TEXTARTEN.forEach((ta) => {
    const item = document.createElement('div');
    item.className = 'stilmittel-item';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stilmittel-toggle';

    const swatch = document.createElement('span');
    swatch.className = 'stilmittel-swatch';
    swatch.style.background = ta.color;
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'stilmittel-name';
    name.textContent = ta.name;

    const chevron = document.createElement('span');
    chevron.className = 'stilmittel-chevron';
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');

    toggle.appendChild(swatch);
    toggle.appendChild(name);
    toggle.appendChild(chevron);

    const body = document.createElement('div');
    body.className = 'stilmittel-body';
    body.hidden = true;

    const pDef = document.createElement('p');
    pDef.innerHTML = `<strong>Was es ist:</strong> ${ta.definition}`;
    const pErk = document.createElement('p');
    pErk.innerHTML = `<strong>Woran du es erkennst:</strong> ${ta.erkennung}`;
    const pBsp = document.createElement('p');
    pBsp.className = 'stilmittel-example';
    pBsp.innerHTML = `<strong>Beispiel:</strong> <em>${ta.beispiel}</em>`;
    body.appendChild(pDef);
    body.appendChild(pErk);
    body.appendChild(pBsp);

    toggle.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      item.classList.toggle('open', willOpen);
    });

    item.appendChild(toggle);
    item.appendChild(body);
    list.appendChild(item);
  });
}

// Textsorten-Erkennung ist – anders als die Interpretation von Stilmitteln
// oder die Betonung in echten Gedichten – in der Regel eindeutig an
// formalen Merkmalen (Verse, Regieanweisungen, Frage/Antwort, …) erkennbar.
// Deshalb bekommt hier jeder Übungstext eine automatische Überprüfung,
// auch das echte Gedicht.
const TEXTART_TEXTS = [
  {
    id: 'heidenroeslein', title: 'Heidenröslein', author: 'Johann Wolfgang von Goethe', typeId: 'lyrik',
    body: "Sah ein Knab' ein Röslein stehn, Röslein auf der Heiden, war so jung und morgenschön, lief er schnell, es nah zu sehn, sah's mit vielen Freuden. Röslein, Röslein, Röslein rot, Röslein auf der Heiden.",
  },
  {
    id: 'heimweg', title: 'Der Heimweg', author: 'eigener Übungstext', typeId: 'epik',
    body: 'Als die Sonne hinter den Bergen verschwand, machte sich Lena auf den Weg nach Hause. Sie hatte den ganzen Tag im Wald verbracht und war müde, aber glücklich. Plötzlich hörte sie ein Rascheln im Gebüsch. Ihr Herz klopfte schneller, doch dann sah sie nur einen kleinen Fuchs, der neugierig zu ihr herüberblickte. Lena lächelte und ging weiter, während die ersten Sterne am Himmel erschienen.',
  },
  {
    id: 'gute-nachricht', title: 'Die gute Nachricht (Szenenausschnitt)', author: 'eigener Übungstext', typeId: 'dramatik',
    body: 'MARIE (aufgeregt, läuft im Zimmer hin und her): Ich kann das nicht glauben! Er hat wirklich gewonnen! TOM (skeptisch, die Arme verschränkt): Bist du dir sicher? Das klingt zu gut, um wahr zu sein. MARIE (hält ihm ein Blatt Papier hin): Hier, lies selbst! TOM (nimmt das Blatt, liest, lächelt langsam): Na so was.',
  },
  {
    id: 'schulfest', title: 'Schulfest in der Stadthalle', author: 'eigener Übungstext', typeId: 'bericht',
    body: 'Am vergangenen Samstag fand in der Stadthalle das jährliche Schulfest statt. Rund 300 Schülerinnen und Schüler sowie ihre Familien nahmen daran teil. Neben verschiedenen Verkaufsständen gab es ein Bühnenprogramm mit Musik- und Tanzvorführungen. Die Veranstaltung endete gegen 18 Uhr mit einer abschließenden Verlosung. Der Erlös des Fests in Höhe von 1200 Euro geht an die Schulbibliothek.',
  },
  {
    id: 'finale', title: 'Live vom 100-Meter-Finale', author: 'eigener Übungstext', typeId: 'reportage',
    body: 'Kurz vor dem Start ist die Anspannung im Stadion förmlich zu spüren. Zehntausende Zuschauer verstummen für einen Moment, dann ertönt der Startschuss. Die Läuferinnen schießen wie Pfeile aus dem Startblock, während die Menge in ohrenbetäubenden Jubel ausbricht. Ich stehe mitten in der ersten Reihe und spüre, wie der Boden unter den Anfeuerungsrufen regelrecht vibriert.',
  },
  {
    id: 'zeit-zu-handeln', title: 'Zeit zu handeln', author: 'eigener Übungstext', typeId: 'kommentar',
    body: 'Meiner Meinung nach sollte an unserer Schule endlich mehr für den Klimaschutz getan werden. Es kann nicht sein, dass im Sommer bei über 30 Grad die Fenster nicht richtig verdunkelt werden können und im Winter die Heizung tagelang ausfällt. Ich finde, die Schulleitung muss hier dringend handeln, statt das Problem weiter auszusitzen.',
  },
  {
    id: 'vogelhaus', title: 'Ein Vogelhaus bauen', author: 'eigener Übungstext', typeId: 'anleitung',
    body: 'So baust du ein einfaches Vogelhaus: 1. Schneide sechs Holzbretter in die passende Größe zu. 2. Verschraube die Seitenwände und den Boden zu einem Kasten. 3. Setze das Dach schräg auf, damit Regen ablaufen kann. 4. Bohre ein rundes Einflugloch in die Vorderseite. 5. Streiche das Vogelhaus mit wetterfester Farbe an und lass es trocknen.',
  },
  {
    id: 'kletterin', title: 'Interview mit einer Kletterin', author: 'eigener Übungstext', typeId: 'interview',
    body: 'Frage: Wie bist du zum Klettern gekommen? Antwort: Ein Freund hat mich vor drei Jahren mal mitgenommen, und seitdem lässt es mich nicht mehr los. Frage: Was fasziniert dich am meisten daran? Antwort: Die Mischung aus Konzentration und dem Gefühl, wenn man oben ankommt. Das ist jedes Mal wieder besonders.',
  },
];

const textartUebung = {
  textId: null,
  gattungChoice: null,
  typeChoice: null,
  checked: false,
};

function pickRandomTextartText(excludeId) {
  const pool = TEXTART_TEXTS.filter((t) => t.id !== excludeId);
  const source = pool.length ? pool : TEXTART_TEXTS;
  return source[Math.floor(Math.random() * source.length)];
}

function loadTextartUebungText() {
  const text = pickRandomTextartText(textartUebung.textId);
  textartUebung.textId = text.id;
  textartUebung.gattungChoice = null;
  textartUebung.typeChoice = null;
  textartUebung.checked = false;

  el('textart-text-meta').textContent = `${text.title} – ${text.author}`;
  el('textart-text-card').textContent = text.body;
  renderTextartChips();
  hideTextartCheckResult();
}

function hideTextartCheckResult() {
  const result = el('textart-check-result');
  result.hidden = true;
  result.classList.remove('success');
}

function showTextartCheckMessage(text, success) {
  const result = el('textart-check-result');
  result.textContent = text;
  result.classList.toggle('success', success);
  result.hidden = false;
}

function renderTextartChips() {
  const gattungGroup = el('textart-gattung-group');
  gattungGroup.innerHTML = '';
  [{ id: 'fiktional', label: '📖 Fiktional' }, { id: 'sachtext', label: '📰 Nicht-fiktional' }].forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = g.label;
    btn.dataset.gattung = g.id;
    btn.classList.toggle('selected', textartUebung.gattungChoice === g.id);
    if (textartUebung.checked) {
      const text = TEXTART_TEXTS.find((t) => t.id === textartUebung.textId);
      const correctGattung = TEXTART_TYPES.find((t) => t.id === text.typeId).gattung;
      if (g.id === textartUebung.gattungChoice) {
        btn.classList.add(g.id === correctGattung ? 'check-correct' : 'check-wrong');
      } else if (g.id === correctGattung) {
        btn.classList.add('check-correct');
      }
    }
    gattungGroup.appendChild(btn);
  });

  const typeGroup = el('textart-type-group');
  typeGroup.innerHTML = '';
  TEXTART_TYPES.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = t.name;
    btn.dataset.textartType = t.id;
    btn.classList.toggle('selected', textartUebung.typeChoice === t.id);
    if (textartUebung.checked) {
      const text = TEXTART_TEXTS.find((tx) => tx.id === textartUebung.textId);
      if (t.id === textartUebung.typeChoice) {
        btn.classList.add(t.id === text.typeId ? 'check-correct' : 'check-wrong');
      } else if (t.id === text.typeId) {
        btn.classList.add('check-correct');
      }
    }
    typeGroup.appendChild(btn);
  });
}

function clearTextartCheck() {
  if (!textartUebung.checked) return;
  textartUebung.checked = false;
  hideTextartCheckResult();
}

function checkTextartUebung() {
  if (!textartUebung.gattungChoice || !textartUebung.typeChoice) {
    showTextartCheckMessage('Wähle zuerst beide Antworten aus, bevor du überprüfst.', false);
    return;
  }
  const text = TEXTART_TEXTS.find((t) => t.id === textartUebung.textId);
  const type = TEXTART_TYPES.find((t) => t.id === text.typeId);
  const gattungCorrect = textartUebung.gattungChoice === type.gattung;
  const typeCorrect = textartUebung.typeChoice === type.id;

  textartUebung.checked = true;
  renderTextartChips();

  if (gattungCorrect && typeCorrect) {
    showTextartCheckMessage(`🎉 Genau richtig, das ist ${type.gattung === 'fiktional' ? 'fiktionale' : 'nicht-fiktionale'} ${type.name}!`, true);
  } else if (typeCorrect) {
    showTextartCheckMessage(`✅ Die Textart „${type.name}“ hast du richtig erkannt, aber fiktional/nicht-fiktional war falsch.`, false);
  } else if (gattungCorrect) {
    showTextartCheckMessage(`✅ Fiktional/nicht-fiktional war richtig, aber die genaue Textart war nicht „${TEXTART_TYPES.find((t) => t.id === textartUebung.typeChoice).name}“. Richtig wäre „${type.name}“ gewesen.`, false);
  } else {
    showTextartCheckMessage(`❌ Das war leider nicht richtig. Es handelt sich um ${type.gattung === 'fiktional' ? 'fiktionale' : 'nicht-fiktionale'} ${type.name}.`, false);
  }
}

function initTextartenUebung() {
  el('textart-gattung-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    textartUebung.gattungChoice = btn.dataset.gattung;
    clearTextartCheck();
    renderTextartChips();
    hideTextartCheckResult();
  });

  el('textart-type-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    textartUebung.typeChoice = btn.dataset.textartType;
    clearTextartCheck();
    renderTextartChips();
    hideTextartCheckResult();
  });

  el('textart-new-text-btn').addEventListener('click', loadTextartUebungText);
  el('textart-check-btn').addEventListener('click', checkTextartUebung);

  loadTextartUebungText();
}

/* ---------------- Papierkorb (global, für Notizen & Karteikarten) ---------------- */

// Gelöschte Notizen und Karteikarten landen hier statt sofort endgültig
// entfernt zu werden, und werden erst nach Ablauf der Aufbewahrungszeit
// beim nächsten Öffnen der App automatisch aussortiert (ein rein
// clientseitiges Setup ohne Server kann keinen Hintergrund-Timer haben,
// deshalb passiert das Aufräumen beim nächsten Laden bzw. beim Öffnen des
// Papierkorbs).
const TRASH_RETENTION_MS = 2 * 24 * 60 * 60 * 1000; // 2 Tage

function loadTrash() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.trash);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveTrash(items) {
  try {
    localStorage.setItem(STORAGE_KEYS.trash, JSON.stringify(items));
  } catch (e) {
    /* ignore */
  }
}

function makeTrashId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `trash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveToTrash(type, data) {
  const items = loadTrash();
  items.push({ id: makeTrashId(), type, deletedAt: new Date().toISOString(), data });
  saveTrash(items);
}

/** Entfernt Papierkorb-Einträge, deren Aufbewahrungszeit abgelaufen ist. */
function purgeExpiredTrash() {
  const items = loadTrash();
  const now = Date.now();
  const kept = items.filter((t) => now - new Date(t.deletedAt).getTime() < TRASH_RETENTION_MS);
  if (kept.length !== items.length) saveTrash(kept);
  return kept;
}

function formatTrashRemaining(deletedAt) {
  const msLeft = TRASH_RETENTION_MS - (Date.now() - new Date(deletedAt).getTime());
  if (msLeft <= 0) return 'wird gleich endgültig gelöscht';
  const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
  if (hoursLeft >= 24) {
    const daysLeft = Math.ceil(hoursLeft / 24);
    return `wird in ${daysLeft} Tag${daysLeft === 1 ? '' : 'en'} endgültig gelöscht`;
  }
  return `wird in ${hoursLeft} Stunde${hoursLeft === 1 ? '' : 'n'} endgültig gelöscht`;
}

function trashItemLabel(item) {
  if (item.type === 'notiz') {
    return { icon: '📝', title: item.data.title || 'Ohne Titel', subtitle: 'Notiz' };
  }
  return { icon: '📇', title: item.data.front || 'Ohne Vorderseite', subtitle: `Karteikarte (${item.data.subject || '–'})` };
}

function renderTrashList() {
  const items = purgeExpiredTrash().slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const list = el('trash-list');
  list.innerHTML = '';
  el('trash-empty-hint').hidden = items.length > 0;
  el('trash-empty-btn').hidden = items.length === 0;

  items.forEach((item) => {
    const { icon, title, subtitle } = trashItemLabel(item);
    const row = document.createElement('div');
    row.className = 'trash-item';

    const main = document.createElement('div');
    main.className = 'trash-item-main';
    const titleEl = document.createElement('p');
    titleEl.className = 'trash-item-title';
    titleEl.textContent = `${icon} ${title}`;
    const metaEl = document.createElement('p');
    metaEl.className = 'trash-item-meta';
    metaEl.textContent = `${subtitle} · ${formatTrashRemaining(item.deletedAt)}`;
    main.appendChild(titleEl);
    main.appendChild(metaEl);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-text';
    restoreBtn.textContent = '↩️ Wiederherstellen';
    restoreBtn.addEventListener('click', () => restoreTrashItem(item.id));

    row.appendChild(main);
    row.appendChild(restoreBtn);
    list.appendChild(row);
  });
}

function restoreTrashItem(trashId) {
  const items = loadTrash();
  const idx = items.findIndex((t) => t.id === trashId);
  if (idx === -1) return;
  const [item] = items.splice(idx, 1);
  saveTrash(items);

  if (item.type === 'notiz') {
    const notes = loadNotes();
    notes.push(item.data);
    saveNotes(notes);
    renderNotesList();
  } else if (item.type === 'karte') {
    const cards = loadAllFlashcards();
    cards.push(item.data);
    saveFlashcards(cards);
    renderKarteList();
  }
  renderTrashList();
}

function emptyTrash() {
  saveTrash([]);
  renderTrashList();
}

function initTrash() {
  el('trash-empty-btn').addEventListener('click', emptyTrash);
  // Neu rendern, sobald der Papierkorb geöffnet wird (Restzeit-Anzeige und
  // evtl. inzwischen abgelaufene Einträge sollen dann aktuell sein).
  document.querySelectorAll('[data-goto="trash"]').forEach((btn) => {
    btn.addEventListener('click', renderTrashList);
  });
  renderTrashList();
}

/* ---------------- Gerät wechseln (Übertragungscode) ---------------- */

// Es gibt bewusst kein Backend und kein Benutzerkonto - alle Daten bleiben
// nur auf diesem Gerät. Wer sie trotzdem auf ein anderes Gerät mitnehmen
// will, kann sich hier einen Code erzeugen (Karteikarten, Notizen,
// Erfolge) und ihn selbst dorthin übertragen (z. B. per Nachricht an sich
// selbst). Beim Importieren werden vorhandene Daten auf dem Zielgerät
// nicht ersetzt, sondern zusammengeführt.
const TRANSFER_TYPE = 'kopfrechnen-transfer';

function buildTransferPayload() {
  return {
    type: TRANSFER_TYPE,
    v: 1,
    createdAt: Date.now(),
    flashcards: loadAllFlashcards(),
    notes: loadNotes(),
    history: loadHistory(),
    highscores: loadHighscores(),
    trickCount: getTrickCounter(),
  };
}

function encodeTransferPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function decodeTransferPayload(code) {
  const binary = atob(code.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function mergeImportedFlashcards(imported) {
  if (!Array.isArray(imported)) return 0;
  const existing = loadAllFlashcards();
  const existingIds = new Set(existing.map((c) => c.id));
  let added = 0;
  imported.forEach((card) => {
    if (!card || !card.id || existingIds.has(card.id)) return;
    existing.push(card);
    existingIds.add(card.id);
    added++;
  });
  if (added > 0) saveFlashcards(existing);
  return added;
}

function mergeImportedNotes(imported) {
  if (!Array.isArray(imported)) return 0;
  const existing = loadNotes();
  const existingIds = new Set(existing.map((n) => n.id));
  let added = 0;
  imported.forEach((note) => {
    if (!note || !note.id || existingIds.has(note.id)) return;
    existing.push(note);
    existingIds.add(note.id);
    added++;
  });
  if (added > 0) saveNotes(existing);
  return added;
}

function mergeImportedHistory(imported) {
  if (!Array.isArray(imported) || imported.length === 0) return;
  const combined = loadHistory().concat(imported);
  combined.sort((a, b) => (b.date || 0) - (a.date || 0));
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(combined.slice(0, 10)));
  } catch (e) {
    /* ignore */
  }
}

function mergeImportedHighscores(imported) {
  if (!imported || typeof imported !== 'object') return;
  const existing = loadHighscores();
  Object.keys(imported).forEach((key) => {
    const val = Number(imported[key]);
    if (val > (existing[key] || 0)) existing[key] = val;
  });
  try {
    localStorage.setItem(STORAGE_KEYS.highscores, JSON.stringify(existing));
  } catch (e) {
    /* ignore */
  }
}

function mergeImportedTrickCount(imported) {
  const add = Number(imported) || 0;
  if (add <= 0) return;
  try {
    localStorage.setItem(STORAGE_KEYS.trickCount, String(getTrickCounter() + add));
  } catch (e) {
    /* ignore */
  }
}

function importTransferCode(code) {
  if (!code || !code.trim()) {
    return { ok: false, error: 'Bitte füge zuerst einen Code ein.' };
  }
  let payload;
  try {
    payload = decodeTransferPayload(code);
  } catch (e) {
    return { ok: false, error: 'Der Code konnte nicht gelesen werden. Bitte prüfe, ob er vollständig eingefügt wurde.' };
  }
  if (!payload || payload.type !== TRANSFER_TYPE) {
    return { ok: false, error: 'Das ist kein gültiger Übertragungscode dieser App.' };
  }
  const addedCards = mergeImportedFlashcards(payload.flashcards);
  const addedNotes = mergeImportedNotes(payload.notes);
  mergeImportedHistory(payload.history);
  mergeImportedHighscores(payload.highscores);
  mergeImportedTrickCount(payload.trickCount);
  renderNotesList();

  const parts = [];
  if (addedCards > 0) parts.push(`${addedCards} neue Karteikarte${addedCards === 1 ? '' : 'n'}`);
  if (addedNotes > 0) parts.push(`${addedNotes} neue Notiz${addedNotes === 1 ? '' : 'en'}`);
  const summary = parts.length > 0
    ? `Übertragen: ${parts.join(', ')}. Erfolge wurden zusammengeführt. Deine vorhandenen Daten auf diesem Gerät bleiben erhalten.`
    : 'Übertragen: Erfolge wurden zusammengeführt (keine neuen Karteikarten oder Notizen gefunden). Deine vorhandenen Daten auf diesem Gerät bleiben erhalten.';
  return { ok: true, message: summary };
}

function initTransfer() {
  const createBtn = el('transfer-create-btn');
  const output = el('transfer-code-output');
  const copyBtn = el('transfer-copy-btn');
  const createStatus = el('transfer-create-status');
  const input = el('transfer-code-input');
  const importBtn = el('transfer-import-btn');
  const importStatus = el('transfer-import-status');

  createBtn.addEventListener('click', () => {
    const code = encodeTransferPayload(buildTransferPayload());
    output.value = code;
    output.hidden = false;
    copyBtn.hidden = false;
    createStatus.hidden = true;
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      createStatus.textContent = '✅ Code in die Zwischenablage kopiert.';
    } catch (e) {
      output.select();
      createStatus.textContent = 'Kopieren hat nicht automatisch geklappt - der Code ist markiert, du kannst ihn jetzt manuell kopieren.';
    }
    createStatus.hidden = false;
  });

  importBtn.addEventListener('click', () => {
    const result = importTransferCode(input.value);
    importStatus.textContent = result.ok ? `✅ ${result.message}` : `⚠️ ${result.error}`;
    importStatus.classList.toggle('transfer-status-error', !result.ok);
    importStatus.hidden = false;
    if (result.ok) input.value = '';
  });
}

/* ---------------- Deutsch: Kadenz & Reimschema ---------------- */

// Kadenzen beschreiben, wie eine Verszeile endet (betont/unbetont) - das
// lässt sich direkt aus den bekannten Betonungsmustern des Versmaß-
// Wortschatzes ableiten. Reimschemata beschreiben dagegen, welche Zeilen
// sich innerhalb einer Strophe reimen - das ist unabhängig von der Betonung
// und braucht eigene, handgeschriebene (und überprüfte) Übungstexte.
const KADENZ_TYPES = [
  {
    id: 'maennlich', name: 'Männliche Kadenz (stumpfe Kadenz)', color: '#7dd3fc',
    definition: 'Der Vers endet auf eine betonte Silbe.',
    erkennung: 'Sprich die letzte Silbe der Zeile laut – klingt sie betont und „hart“ abgeschlossen, liegt eine männliche (auch: stumpfe) Kadenz vor.',
    beispiel: '„Der Mond scheint hell und klar“ – die Zeile endet auf die betonte Silbe „klar“.',
  },
  {
    id: 'weiblich', name: 'Weibliche Kadenz (klingende Kadenz)', color: '#fca5a5',
    definition: 'Der Vers endet auf eine unbetonte Silbe, die direkt auf die letzte betonte Silbe folgt.',
    erkennung: 'Die letzte Silbe „verklingt“ unbetont – oft, weil das letzte Wort selbst schon auf einer unbetonten Silbe endet (z. B. „Sonne“, „Wiesen“).',
    beispiel: '„Die Vögel singen in den Wiesen“ – die Zeile endet auf die unbetonte Silbe „-sen“ in „Wiesen“.',
  },
  {
    id: 'reich', name: 'Reiche Kadenz', color: '#86efac',
    definition: 'Der Vers endet auf mehr als eine unbetonte Silbe nach der letzten Hebung.',
    erkennung: 'Nach der letzten betonten Silbe folgen noch zwei (oder mehr) unbetonte Silben, z. B. bei Wörtern wie „Sonnenschein“ oder „fröhlicher“.',
    beispiel: '„Abendrot, Kinderlied, fröhlicher“ – nach der Hebung „fröh“ folgen noch zwei unbetonte Silben „li“ und „cher“.',
  },
];

const REIMSCHEMA_TYPES = [
  {
    id: 'paarreim', name: 'Paarreim (aabb)', color: '#fde047',
    definition: 'Zwei aufeinanderfolgende Verse reimen sich jeweils miteinander.',
    erkennung: 'Reimschema: aabb – Zeile 1 reimt sich mit Zeile 2, Zeile 3 mit Zeile 4.',
    beispiel: '„Ich steh allein im dunklen Wald (a), die Luft ist kühl, die Nacht wird kalt (a), die Sterne funkeln klar und hell (b), sie leuchten wie ein Zauberquell (b).“',
  },
  {
    id: 'kreuzreim', name: 'Kreuzreim (abab)', color: '#fdba74',
    definition: 'Der erste und dritte Vers reimen sich, ebenso der zweite und vierte.',
    erkennung: 'Reimschema: abab – die Reime „kreuzen“ sich über die Zeilen hinweg.',
    beispiel: '„Ich steh allein im dunklen Wald (a), die Sterne funkeln klar und hell (b), die Luft ist kühl, die Nacht wird kalt (a), sie leuchten wie ein Zauberquell (b).“',
  },
  {
    id: 'umarmend', name: 'Umarmender Reim (abba)', color: '#c4b5fd',
    definition: 'Der erste und der vierte Vers reimen sich und „umarmen“ damit den zweiten und dritten Vers, die sich ebenfalls reimen.',
    erkennung: 'Reimschema: abba.',
    beispiel: '„Ich steh allein im dunklen Wald (a), die Sterne funkeln klar und hell (b), sie leuchten wie ein Zauberquell (b), die Luft ist kühl, die Nacht wird kalt (a).“',
  },
  {
    id: 'schweifreim', name: 'Schweifreim (aabccb)', color: '#f0abfc',
    definition: 'Zwei Reimpaare (aa und cc) werden durch einen gemeinsamen „Schweif“-Reim (b) verbunden, der jeweils die dritte Zeile jeder Dreiergruppe abschließt.',
    erkennung: 'Reimschema: aabccb – meist bei sechszeiligen Strophen.',
    beispiel: '„Ich steh allein im dunklen Wald (a), die Luft ist kühl, die Nacht wird kalt (a), die Sterne funkeln klar und hell (b), der Mond scheint hoch und weit und breit (c), er tröstet mich zu dieser Zeit (c), sie leuchten wie ein Zauberquell (b).“',
  },
  {
    id: 'haufenreim', name: 'Haufenreim (aaaa)', color: '#fda4af',
    definition: 'Alle Verse einer Strophe reimen sich aufeinander.',
    erkennung: 'Reimschema: aaaa (oder länger) – jede Zeile endet auf denselben Reimklang.',
    beispiel: '„Ich steh allein im dunklen Wald (a), die Luft ist kühl, die Nacht wird kalt (a), mein Herz schlägt schnell, ich werde alt (a), ein Rufen aus dem Wald erschallt (a).“',
  },
];

function renderKadenzLernenListe() {
  const list = el('kadenz-lernen-list');
  list.innerHTML = '';

  const renderGroup = (title, items) => {
    const heading = document.createElement('h3');
    heading.className = 'settings-subtitle';
    heading.textContent = title;
    list.appendChild(heading);

    items.forEach((data) => {
      const item = document.createElement('div');
      item.className = 'stilmittel-item';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'stilmittel-toggle';

      const swatch = document.createElement('span');
      swatch.className = 'stilmittel-swatch';
      swatch.style.background = data.color;
      swatch.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'stilmittel-name';
      name.textContent = data.name;

      const chevron = document.createElement('span');
      chevron.className = 'stilmittel-chevron';
      chevron.textContent = '⌄';
      chevron.setAttribute('aria-hidden', 'true');

      toggle.appendChild(swatch);
      toggle.appendChild(name);
      toggle.appendChild(chevron);

      const body = document.createElement('div');
      body.className = 'stilmittel-body';
      body.hidden = true;

      const pDef = document.createElement('p');
      pDef.innerHTML = `<strong>Was es ist:</strong> ${data.definition}`;
      const pErk = document.createElement('p');
      pErk.innerHTML = `<strong>Woran du es erkennst:</strong> ${data.erkennung}`;
      const pBsp = document.createElement('p');
      pBsp.className = 'stilmittel-example';
      pBsp.innerHTML = `<strong>Beispiel:</strong> <em>${data.beispiel}</em>`;
      body.appendChild(pDef);
      body.appendChild(pErk);
      body.appendChild(pBsp);

      toggle.addEventListener('click', () => {
        const willOpen = body.hidden;
        body.hidden = !willOpen;
        item.classList.toggle('open', willOpen);
      });

      item.appendChild(toggle);
      item.appendChild(body);
      list.appendChild(item);
    });
  };

  renderGroup('Kadenzen', KADENZ_TYPES);
  renderGroup('Reimschemata', REIMSCHEMA_TYPES);
}

// Wörter mit bekanntem Betonungsmuster aus dem Versmaß-Wortschatz, sortiert
// danach, wie sie am Zeilenende klingen würden (männlich/weiblich/reich).
const KADENZ_UEBUNG_WORDS = {
  maennlich: VERS_WORDBANK.betont,
  weiblich: VERS_WORDBANK.trochaeusWort.map(([a, b]) => a + b),
  reich: VERS_WORDBANK.daktylusWort.map(([a, b, c]) => a + b + c),
};

// Handgeschriebene, überprüfte Übungstexte je Reimschema - alle nutzen
// dieselben, sicher reimenden Wortpaare (Wald/kalt/alt/erschallt über die
// deutsche Auslautverhärtung, hell/Quell, breit/Zeit), nur in anderer
// Reihenfolge angeordnet, damit jedes Reimschema eindeutig erkennbar ist.
const REIMSCHEMA_TEXTS = [
  {
    id: 'wald-paar', reimschemaId: 'paarreim', title: 'Im dunklen Wald (Paarreim)', author: 'eigener Übungstext',
    lines: ['Ich steh allein im dunklen Wald,', 'die Luft ist kühl, die Nacht wird kalt.', 'Die Sterne funkeln klar und hell,', 'sie leuchten wie ein Zauberquell.'],
  },
  {
    id: 'wald-kreuz', reimschemaId: 'kreuzreim', title: 'Im dunklen Wald (Kreuzreim)', author: 'eigener Übungstext',
    lines: ['Ich steh allein im dunklen Wald,', 'die Sterne funkeln klar und hell,', 'die Luft ist kühl, die Nacht wird kalt,', 'sie leuchten wie ein Zauberquell.'],
  },
  {
    id: 'wald-umarmend', reimschemaId: 'umarmend', title: 'Im dunklen Wald (umarmender Reim)', author: 'eigener Übungstext',
    lines: ['Ich steh allein im dunklen Wald,', 'die Sterne funkeln klar und hell,', 'sie leuchten wie ein Zauberquell,', 'die Luft ist kühl, die Nacht wird kalt.'],
  },
  {
    id: 'wald-haufen', reimschemaId: 'haufenreim', title: 'Im dunklen Wald (Haufenreim)', author: 'eigener Übungstext',
    lines: ['Ich steh allein im dunklen Wald,', 'die Luft ist kühl, die Nacht wird kalt,', 'mein Herz schlägt schnell, ich werde alt,', 'ein Rufen aus dem Wald erschallt.'],
  },
  {
    id: 'wald-schweif', reimschemaId: 'schweifreim', title: 'Im dunklen Wald (Schweifreim)', author: 'eigener Übungstext',
    lines: ['Ich steh allein im dunklen Wald,', 'die Luft ist kühl, die Nacht wird kalt,', 'die Sterne funkeln klar und hell.', 'Der Mond scheint hoch und weit und breit,', 'er tröstet mich zu dieser Zeit,', 'sie leuchten wie ein Zauberquell.'],
  },
];

const kadenzUebung = {
  kind: null, // 'kadenz' | 'reimschema'
  kadenzWord: '',
  reimschemaText: null,
  correctId: null,
  choice: null,
  checked: false,
};

function loadKadenzUebungItem() {
  kadenzUebung.kind = pick(['kadenz', 'reimschema']);
  kadenzUebung.choice = null;
  kadenzUebung.checked = false;

  if (kadenzUebung.kind === 'kadenz') {
    const kadenzId = pick(['maennlich', 'weiblich', 'reich']);
    kadenzUebung.kadenzWord = pick(KADENZ_UEBUNG_WORDS[kadenzId]);
    kadenzUebung.correctId = kadenzId;
    kadenzUebung.reimschemaText = null;
    el('kadenz-uebung-meta').textContent = 'Versende erkennen';
  } else {
    const text = pick(REIMSCHEMA_TEXTS);
    kadenzUebung.reimschemaText = text;
    kadenzUebung.correctId = text.reimschemaId;
    el('kadenz-uebung-meta').textContent = `${text.title} – ${text.author}`;
  }

  renderKadenzUebung();
  hideKadenzCheckResult();
}

function hideKadenzCheckResult() {
  const result = el('kadenz-uebung-check-result');
  result.hidden = true;
  result.classList.remove('success');
}

function showKadenzCheckMessage(text, success) {
  const result = el('kadenz-uebung-check-result');
  result.textContent = text;
  result.classList.toggle('success', success);
  result.hidden = false;
}

function renderKadenzUebung() {
  const isKadenz = kadenzUebung.kind === 'kadenz';
  el('kadenz-uebung-question-label').textContent = isKadenz
    ? 'Welche Kadenz hat diese Verszeile?'
    : 'Welches Reimschema hat dieses Gedicht?';

  const card = el('kadenz-uebung-card');
  card.innerHTML = '';
  if (isKadenz) {
    const p = document.createElement('p');
    p.className = 'kadenz-line';
    p.textContent = `⋯ ${kadenzUebung.kadenzWord}`;
    card.appendChild(p);
  } else {
    kadenzUebung.reimschemaText.lines.forEach((line) => {
      const p = document.createElement('p');
      p.className = 'kadenz-poem-line';
      p.textContent = line;
      card.appendChild(p);
    });
  }

  const options = isKadenz ? KADENZ_TYPES : REIMSCHEMA_TYPES;
  const group = el('kadenz-uebung-choice-group');
  group.innerHTML = '';
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = opt.name;
    btn.dataset.choiceId = opt.id;
    btn.classList.toggle('selected', kadenzUebung.choice === opt.id);
    if (kadenzUebung.checked) {
      if (opt.id === kadenzUebung.choice) {
        btn.classList.add(opt.id === kadenzUebung.correctId ? 'check-correct' : 'check-wrong');
      } else if (opt.id === kadenzUebung.correctId) {
        btn.classList.add('check-correct');
      }
    }
    group.appendChild(btn);
  });
}

function checkKadenzUebung() {
  if (!kadenzUebung.choice) {
    showKadenzCheckMessage('Wähle zuerst eine Antwort aus, bevor du überprüfst.', false);
    return;
  }
  kadenzUebung.checked = true;
  renderKadenzUebung();

  const correct = kadenzUebung.choice === kadenzUebung.correctId;
  const options = kadenzUebung.kind === 'kadenz' ? KADENZ_TYPES : REIMSCHEMA_TYPES;
  const correctOption = options.find((o) => o.id === kadenzUebung.correctId);

  if (correct) {
    showKadenzCheckMessage(`🎉 Genau richtig, das ist ${kadenzUebung.kind === 'kadenz' ? 'eine' : 'ein'} ${correctOption.name}!`, true);
  } else {
    showKadenzCheckMessage(`❌ Das war leider nicht richtig. Richtig wäre: ${correctOption.name}.`, false);
  }
}

function initKadenzUebung() {
  el('kadenz-uebung-choice-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    kadenzUebung.choice = btn.dataset.choiceId;
    kadenzUebung.checked = false;
    renderKadenzUebung();
    hideKadenzCheckResult();
  });

  el('kadenz-uebung-new-btn').addEventListener('click', loadKadenzUebungItem);
  el('kadenz-uebung-check-btn').addEventListener('click', checkKadenzUebung);

  loadKadenzUebungItem();
}

/* ---------------- Notizen ---------------- */

// Notizen leben ausschließlich in localStorage auf diesem Gerät - es gibt
// in dieser App kein Backend und keine Konten, also werden sie nirgendwo
// hochgeladen oder mit anderen geteilt.
const NOTIZ_COLORS = ['#14162b', '#dc2626', '#ea580c', '#16a34a', '#0ea5e9', '#4f46e5', '#a855f7', '#db2777'];

let currentNoteId = null;
let notizSavedRange = null;

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.notes);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  } catch (e) {
    /* ignore */
  }
}

function makeNoteId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatNoteDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function renderNotesList() {
  const notes = loadNotes().slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const list = el('notiz-list');
  list.innerHTML = '';
  el('notiz-empty-hint').hidden = notes.length > 0;

  notes.forEach((note) => {
    const card = document.createElement('div');
    card.className = 'notiz-card';

    const main = document.createElement('div');
    main.className = 'notiz-card-main';
    const title = document.createElement('p');
    title.className = 'notiz-card-title';
    title.textContent = note.title || 'Ohne Titel';
    const snippet = document.createElement('p');
    snippet.className = 'notiz-card-snippet';
    const tmp = document.createElement('div');
    tmp.innerHTML = note.html || '';
    snippet.textContent = tmp.textContent.trim() || 'Keine weiteren Inhalte';
    const date = document.createElement('span');
    date.className = 'notiz-card-date';
    date.textContent = formatNoteDate(note.updatedAt);
    main.appendChild(title);
    main.appendChild(snippet);
    main.appendChild(date);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'notiz-card-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.setAttribute('aria-label', 'Notiz löschen');
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteNote(note.id);
    });

    card.appendChild(main);
    card.appendChild(deleteBtn);
    card.addEventListener('click', () => openNoteEditor(note.id));
    list.appendChild(card);
  });
}

function deleteNote(id) {
  const notes = loadNotes();
  const note = notes.find((n) => n.id === id);
  if (note) moveToTrash('notiz', note);
  saveNotes(notes.filter((n) => n.id !== id));
  if (currentNoteId === id) {
    currentNoteId = null;
    showScreen('notizen');
  }
  renderNotesList();
}

function createNewNote() {
  const notes = loadNotes();
  const note = { id: makeNoteId(), title: '', html: '', updatedAt: new Date().toISOString() };
  notes.push(note);
  saveNotes(notes);
  openNoteEditor(note.id);
}

function openNoteEditor(id) {
  const note = loadNotes().find((n) => n.id === id);
  if (!note) return;
  currentNoteId = id;
  el('notiz-title-input').value = note.title || '';
  el('notiz-body').innerHTML = note.html || '';
  hideFloatingToolbar();
  showScreen('notiz-editor');
}

function saveCurrentNote() {
  if (!currentNoteId) return;
  const notes = loadNotes();
  const note = notes.find((n) => n.id === currentNoteId);
  if (!note) return;
  note.title = el('notiz-title-input').value;
  note.html = el('notiz-body').innerHTML;
  note.updatedAt = new Date().toISOString();
  saveNotes(notes);
}

/**
 * Zeigt die schwebende Mini-Werkzeugleiste direkt über der markierten
 * Textstelle an - wie bei Word/Docs, wenn man Text markiert.
 */
function positionFloatingToolbar(range) {
  const toolbar = el('notiz-float-toolbar');
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideFloatingToolbar();
    return;
  }
  toolbar.hidden = false;
  const toolbarRect = toolbar.getBoundingClientRect();
  let top = rect.top - toolbarRect.height - 10;
  if (top < 8) top = rect.bottom + 10; // zu wenig Platz oben -> unter die Markierung setzen
  let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - toolbarRect.width - 8));
  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function hideFloatingToolbar() {
  const toolbar = el('notiz-float-toolbar');
  if (toolbar) toolbar.hidden = true;
}

let notizLastRange = null;

function trackNotizSelection() {
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const body = el('notiz-body');
    if (body && body.contains(range.commonAncestorContainer)) {
      notizSavedRange = range.cloneRange();
      updateNotizToolbarActiveState();
      if (!range.collapsed) {
        notizLastRange = range.cloneRange();
        positionFloatingToolbar(range);
      } else {
        hideFloatingToolbar();
      }
    }
  });

  window.addEventListener('scroll', () => {
    if (!el('notiz-float-toolbar').hidden && notizLastRange) positionFloatingToolbar(notizLastRange);
  }, true);
  window.addEventListener('resize', () => {
    if (!el('notiz-float-toolbar').hidden && notizLastRange) positionFloatingToolbar(notizLastRange);
  });

  // Jeder Navigationsklick verlässt vermutlich den Editor - schwebende
  // Leiste vorsorglich ausblenden, damit sie nicht auf einem anderen
  // Screen hängen bleibt.
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-goto]')) hideFloatingToolbar();
  });
}

function restoreNotizSelection() {
  if (!notizSavedRange) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(notizSavedRange);
  return true;
}

function updateNotizToolbarActiveState() {
  document.querySelectorAll('.notiz-tool-btn').forEach((btn) => {
    try {
      btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd));
    } catch (e) {
      /* ignore - queryCommandState kann außerhalb eines editierbaren Bereichs werfen */
    }
  });
}

function applyNotizStyle(styleProp, value) {
  if (!restoreNotizSelection()) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  if (range.collapsed) {
    // Keine Auswahl -> Einstellung gilt als neuer Standard für die ganze Notiz.
    el('notiz-body').style[styleProp] = value;
  } else {
    const span = document.createElement('span');
    span.style[styleProp] = value;
    try {
      range.surroundContents(span);
    } catch (e) {
      const content = range.extractContents();
      span.appendChild(content);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
  saveCurrentNote();
  renderNotesList();
}

function renderNotizColorRow() {
  [el('notiz-color-row'), el('notiz-float-colors')].forEach((row) => {
    row.innerHTML = '';
    NOTIZ_COLORS.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'notiz-color-swatch';
      btn.style.background = color;
      btn.setAttribute('aria-label', `Textfarbe ${color}`);
      btn.addEventListener('click', () => applyNotizStyle('color', color));
      row.appendChild(btn);
    });
  });
}

function initNotizen() {
  el('notiz-new-btn').addEventListener('click', createNewNote);

  document.querySelectorAll('.notiz-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!restoreNotizSelection()) return;
      document.execCommand(btn.dataset.cmd, false, null);
      updateNotizToolbarActiveState();
      saveCurrentNote();
      renderNotesList();
    });
  });

  el('notiz-font-select').addEventListener('change', (ev) => {
    if (ev.target.value) applyNotizStyle('fontFamily', ev.target.value);
    ev.target.value = '';
  });
  el('notiz-size-select').addEventListener('change', (ev) => {
    if (ev.target.value) applyNotizStyle('fontSize', ev.target.value);
    ev.target.value = '';
  });

  renderNotizColorRow();

  el('notiz-title-input').addEventListener('input', saveCurrentNote);
  el('notiz-body').addEventListener('input', () => {
    saveCurrentNote();
    renderNotesList();
  });

  el('notiz-delete-btn').addEventListener('click', () => {
    if (currentNoteId) deleteNote(currentNoteId);
  });

  trackNotizSelection();
  renderNotesList();
}

/* ---------------- Karteikarten (Astronomie, Physik, Englisch, Deutsch) ---------------- */

// Wie die Notizen leben auch die Karteikarten (inkl. Foto) ausschließlich in
// localStorage auf diesem Gerät - keine Uploads, kein Server, kein Konto.
// Eine gemeinsame Liste/Editor/Lern-Ansicht wird von mehreren Fächern genutzt;
// karteContext merkt sich, aus welchem Fach man gerade kommt (für Titel,
// Zurück-Button und Filterung der angezeigten Karten).
const karteContext = { subject: null, screen: null, icon: '', label: '' };
let currentCardId = null;
let pendingFrontPhoto = undefined; // undefined = unverändert, null = entfernt, string = neues Foto
let pendingBackPhoto = undefined;

function loadAllFlashcards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.flashcards);
    if (!raw) return [];
    const cards = JSON.parse(raw);
    // Karten aus der Zeit, bevor Karteikarten für mehrere Fächer nutzbar
    // waren, haben noch kein "subject" - damals gab es sie nur bei
    // Astronomie, also ordnen wir sie einmalig dort ein statt sie
    // kommentarlos verschwinden zu lassen.
    let migrated = false;
    cards.forEach((c) => {
      if (!c.subject) {
        c.subject = 'astronomie';
        migrated = true;
      }
      // Karten aus der Zeit vor getrennten Vorder-/Rückseiten-Fotos hatten
      // ein einzelnes "photo" - das wird als Vorderseiten-Foto übernommen.
      if (c.photo !== undefined) {
        if (c.frontPhoto === undefined) c.frontPhoto = c.photo;
        delete c.photo;
        migrated = true;
      }
      if (c.frontPhoto === undefined) { c.frontPhoto = null; migrated = true; }
      if (c.backPhoto === undefined) { c.backPhoto = null; migrated = true; }
    });
    if (migrated) saveFlashcards(cards);
    return cards;
  } catch (e) {
    return [];
  }
}

function loadFlashcardsForSubject(subject) {
  return loadAllFlashcards().filter((c) => c.subject === subject);
}

function saveFlashcards(cards) {
  try {
    localStorage.setItem(STORAGE_KEYS.flashcards, JSON.stringify(cards));
  } catch (e) {
    /* z.B. Speicher voll (Fotos sind groß) - Karte bleibt dann unverändert */
  }
}

function makeCardId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `karte-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Verkleinert ein Foto auf eine vernünftige Kantenlänge und komprimiert es
 * als JPEG, bevor es in localStorage landet - sonst wäre der Speicher
 * (ca. 5-10 MB pro Gerät) mit ein paar Fotos schon voll.
 */
function resizeImageFile(file, maxDim = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderKarteList() {
  const cards = loadFlashcardsForSubject(karteContext.subject);
  const list = el('karte-list');
  list.innerHTML = '';
  el('karte-empty-hint').hidden = cards.length > 0;
  el('karte-lernen-btn').hidden = cards.length === 0;

  cards.forEach((card) => {
    const row = document.createElement('div');
    row.className = 'karte-card';

    const thumbPhoto = card.frontPhoto || card.backPhoto;
    if (thumbPhoto) {
      const thumb = document.createElement('img');
      thumb.className = 'karte-card-thumb';
      thumb.src = thumbPhoto;
      thumb.alt = '';
      row.appendChild(thumb);
    }

    const main = document.createElement('div');
    main.className = 'karte-card-main';
    const front = document.createElement('p');
    front.className = 'karte-card-front';
    front.textContent = card.front || 'Ohne Vorderseite';
    const back = document.createElement('p');
    back.className = 'karte-card-back';
    back.textContent = card.back || 'Ohne Rückseite';
    main.appendChild(front);
    main.appendChild(back);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'karte-card-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.setAttribute('aria-label', 'Karteikarte löschen');
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteCard(card.id);
    });

    if (card.known === true) row.classList.add('karte-card-known');
    else if (card.known === false) row.classList.add('karte-card-unknown');

    row.appendChild(main);
    row.appendChild(deleteBtn);
    row.addEventListener('click', () => openCardEditor(card.id));
    list.appendChild(row);
  });

  renderKarteStapelRow(cards);
}

/**
 * Zeigt die beiden "Stapel" (Kann ich schon / Noch üben) an - wie bei
 * einer klassischen Karteikarten-Box, bei der man Karten je nach dem, ob
 * man sie schon kann, in ein anderes Fach sortiert. Karten ohne
 * Einschätzung (noch nie geübt) zählen zu "Noch üben".
 */
function renderKarteStapelRow(cards) {
  const known = cards.filter((c) => c.known === true).length;
  const unknown = cards.length - known;
  const hasPiles = cards.some((c) => typeof c.known === 'boolean');

  el('karte-stapel-row').hidden = cards.length === 0;
  el('karte-stapel-known-count').textContent = String(known);
  el('karte-stapel-unknown-count').textContent = String(unknown);
  el('karte-stapel-known-btn').disabled = known === 0;
  el('karte-stapel-unknown-btn').disabled = unknown === 0;
  el('karte-stapel-merge-btn').hidden = !hasPiles;
}

function getCardPileCounts(subject) {
  const cards = loadFlashcardsForSubject(subject);
  const known = cards.filter((c) => c.known === true).length;
  return { total: cards.length, known, unknown: cards.length - known };
}

/**
 * Führt die beiden Stapel wieder zu einem zusammen: die Einschätzung
 * "kann ich" / "kann ich noch nicht" wird für alle Karten des aktuellen
 * Fachs zurückgesetzt, damit man wieder von vorne mit allen Karten üben
 * kann - wie beim Zusammenschütten einer Karteikarten-Box.
 */
function mergeKartePiles() {
  const cards = loadAllFlashcards();
  let changed = false;
  cards.forEach((c) => {
    if (c.subject === karteContext.subject && typeof c.known === 'boolean') {
      delete c.known;
      changed = true;
    }
  });
  if (changed) saveFlashcards(cards);
  renderKarteList();
}

function deleteCard(id) {
  const cards = loadAllFlashcards();
  const card = cards.find((c) => c.id === id);
  if (card) moveToTrash('karte', card);
  saveFlashcards(cards.filter((c) => c.id !== id));
  if (currentCardId === id) {
    currentCardId = null;
    showScreen('karteikarten');
  }
  renderKarteList();
}

function createNewCard() {
  const cards = loadAllFlashcards();
  const card = { id: makeCardId(), subject: karteContext.subject, front: '', back: '', frontPhoto: null, backPhoto: null, createdAt: new Date().toISOString() };
  cards.push(card);
  saveFlashcards(cards);
  openCardEditor(card.id);
}

function renderCardPhotoPreview(side, photo) {
  const preview = el(`karte-photo-${side}-preview`);
  if (photo) {
    el(`karte-photo-${side}-img`).src = photo;
    preview.hidden = false;
  } else {
    el(`karte-photo-${side}-img`).src = '';
    preview.hidden = true;
  }
}

function openCardEditor(id) {
  const card = loadAllFlashcards().find((c) => c.id === id);
  if (!card) return;
  currentCardId = id;
  pendingFrontPhoto = undefined;
  pendingBackPhoto = undefined;
  el('karte-front-input').value = card.front || '';
  el('karte-back-input').value = card.back || '';
  renderCardPhotoPreview('front', card.frontPhoto || null);
  renderCardPhotoPreview('back', card.backPhoto || null);
  showScreen('karte-editor');
}

function saveCurrentCard() {
  if (!currentCardId) return;
  const cards = loadAllFlashcards();
  const card = cards.find((c) => c.id === currentCardId);
  if (!card) return;
  card.front = el('karte-front-input').value;
  card.back = el('karte-back-input').value;
  if (pendingFrontPhoto !== undefined) card.frontPhoto = pendingFrontPhoto;
  if (pendingBackPhoto !== undefined) card.backPhoto = pendingBackPhoto;
  saveFlashcards(cards);
  renderKarteList();
}

/* ---------------- Karteikarten lernen (Umdrehen) ---------------- */

// filter: 'all' (alle Karten), 'known' (nur "Kann ich schon"-Stapel) oder
// 'unknown' (nur "Noch üben"-Stapel) - wie beim Ziehen aus einem
// bestimmten Fach einer Karteikarten-Box.
// reversed[i] legt pro Karte fest, ob sie umgedreht abgefragt wird (erst
// Rückseite zeigen, Vorderseite ist die Lösung) - abhängig von der
// gewählten Lernrichtung ('front' | 'back' | 'mixed').
const karteLernen = { order: [], reversed: [], index: 0, flipped: false, filter: 'all', sessionKnown: 0, sessionUnknown: 0 };

function decideKarteReversed(richtung) {
  if (richtung === 'back') return true;
  if (richtung === 'mixed') return Math.random() < 0.5;
  return false;
}

function renderKarteLernenCard() {
  const cards = loadAllFlashcards();
  const card = cards.find((c) => c.id === karteLernen.order[karteLernen.index]);
  if (!card) return;
  const reversed = karteLernen.reversed[karteLernen.index];
  const firstSide = reversed
    ? { text: card.back, empty: 'Ohne Rückseite', photo: card.backPhoto, label: 'Rückseite' }
    : { text: card.front, empty: 'Ohne Vorderseite', photo: card.frontPhoto, label: 'Vorderseite' };
  const secondSide = reversed
    ? { text: card.front, empty: 'Ohne Vorderseite', photo: card.frontPhoto, label: 'Vorderseite' }
    : { text: card.back, empty: 'Ohne Rückseite', photo: card.backPhoto, label: 'Rückseite' };

  el('karte-lernen-progress').textContent = `Karte ${karteLernen.index + 1} von ${karteLernen.order.length}`;
  el('karte-lernen-front-label').textContent = firstSide.label;
  el('karte-lernen-front-text').textContent = firstSide.text || firstSide.empty;
  el('karte-lernen-back-label').textContent = secondSide.label;
  el('karte-lernen-back-text').textContent = secondSide.text || secondSide.empty;

  const frontPhotoEl = el('karte-lernen-front-photo');
  if (firstSide.photo) {
    frontPhotoEl.src = firstSide.photo;
    frontPhotoEl.hidden = false;
  } else {
    frontPhotoEl.hidden = true;
  }

  const backPhotoEl = el('karte-lernen-back-photo');
  if (secondSide.photo) {
    backPhotoEl.src = secondSide.photo;
    backPhotoEl.hidden = false;
  } else {
    backPhotoEl.hidden = true;
  }

  karteLernen.flipped = false;
  el('karte-flip-card').classList.remove('flipped');
  el('karte-flip-hint').hidden = false;
  el('karte-lernen-assess-row').hidden = true;
}

function startKarteLernen(filter) {
  filter = filter || 'all';
  let cards = loadFlashcardsForSubject(karteContext.subject);
  if (filter === 'known') cards = cards.filter((c) => c.known === true);
  else if (filter === 'unknown') cards = cards.filter((c) => c.known !== true);
  if (!cards.length) return;

  karteLernen.order = shuffle(cards.map((c) => c.id));
  karteLernen.reversed = karteLernen.order.map(() => decideKarteReversed(state.setup.karteRichtung));
  karteLernen.index = 0;
  karteLernen.filter = filter;
  karteLernen.sessionKnown = 0;
  karteLernen.sessionUnknown = 0;

  const stackLabel = el('karte-lernen-stack-label');
  if (filter === 'known') {
    stackLabel.textContent = '✅ Stapel: Kann ich schon';
    stackLabel.hidden = false;
  } else if (filter === 'unknown') {
    stackLabel.textContent = '📚 Stapel: Noch üben';
    stackLabel.hidden = false;
  } else {
    stackLabel.hidden = true;
  }

  el('karte-lernen-done').hidden = true;
  el('karte-flip-outer').hidden = false;
  el('karte-lernen-assess-row').hidden = true;
  renderKarteLernenCard();
  showScreen('karte-lernen');
}

function flipKarteCard() {
  karteLernen.flipped = !karteLernen.flipped;
  el('karte-flip-card').classList.toggle('flipped', karteLernen.flipped);
  el('karte-flip-hint').hidden = karteLernen.flipped;
  el('karte-lernen-assess-row').hidden = !karteLernen.flipped;
}

function nextKarteCard() {
  if (karteLernen.index < karteLernen.order.length - 1) {
    karteLernen.index += 1;
    renderKarteLernenCard();
  } else {
    el('karte-flip-outer').hidden = true;
    el('karte-flip-hint').hidden = true;
    el('karte-lernen-assess-row').hidden = true;
    el('karte-lernen-done').hidden = false;

    const counts = getCardPileCounts(karteContext.subject);
    el('karte-lernen-summary').textContent =
      `In dieser Runde: ✅ ${karteLernen.sessionKnown} kannst du jetzt, ❌ ${karteLernen.sessionUnknown} musst du noch üben. `
      + `Insgesamt: ✅ ${counts.known} kannst du schon, 📚 ${counts.unknown} noch offen.`;
    el('karte-lernen-unknown-again-btn').hidden = counts.unknown === 0;
  }
}

/**
 * Wird beim Antippen von "Kann ich" / "Kann ich noch nicht" aufgerufen:
 * sortiert die aktuelle Karte in den entsprechenden Stapel ein (wie beim
 * Umsortieren einer Papier-Karteikarte in ein anderes Fach der Box) und
 * geht zur nächsten Karte weiter.
 */
function markKarteCard(known) {
  const cards = loadAllFlashcards();
  const card = cards.find((c) => c.id === karteLernen.order[karteLernen.index]);
  if (card) {
    card.known = known;
    saveFlashcards(cards);
  }
  if (known) karteLernen.sessionKnown += 1; else karteLernen.sessionUnknown += 1;
  nextKarteCard();
}

/**
 * Öffnet die (fachübergreifend geteilte) Karteikarten-Liste für ein
 * bestimmtes Fach: merkt sich den Kontext (für Titel, Zurück-Button und
 * Filterung) und aktualisiert die Liste entsprechend.
 */
function openKarteikartenForSubject(btn) {
  karteContext.subject = btn.dataset.karteSubject;
  karteContext.screen = btn.dataset.karteScreen;
  karteContext.icon = btn.dataset.karteIcon;
  karteContext.label = btn.dataset.karteLabel;

  el('karten-back-btn').dataset.goto = karteContext.screen;
  el('karten-header-title').textContent = `${karteContext.icon} Karteikarten`;
  renderKarteList();
}

function syncKarteRichtungUI() {
  document.querySelectorAll('#karte-richtung-group .pill').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.karteRichtung === state.setup.karteRichtung);
  });
}

function initKarteikarten() {
  document.querySelectorAll('[data-karte-subject]').forEach((btn) => {
    btn.addEventListener('click', () => openKarteikartenForSubject(btn));
  });

  el('karte-new-btn').addEventListener('click', createNewCard);
  el('karte-lernen-btn').addEventListener('click', () => startKarteLernen('all'));
  el('karte-stapel-known-btn').addEventListener('click', () => startKarteLernen('known'));
  el('karte-stapel-unknown-btn').addEventListener('click', () => startKarteLernen('unknown'));
  el('karte-stapel-merge-btn').addEventListener('click', mergeKartePiles);

  el('karte-richtung-group').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pill');
    if (!btn) return;
    state.setup.karteRichtung = btn.dataset.karteRichtung;
    syncKarteRichtungUI();
    saveSettings();
  });
  syncKarteRichtungUI();

  el('karte-front-input').addEventListener('input', saveCurrentCard);
  el('karte-back-input').addEventListener('input', saveCurrentCard);

  ['front', 'back'].forEach((side) => {
    el(`karte-photo-${side}-btn`).addEventListener('click', () => el(`karte-photo-${side}-input`).click());
    el(`karte-photo-${side}-input`).addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await resizeImageFile(file);
        if (side === 'front') pendingFrontPhoto = dataUrl; else pendingBackPhoto = dataUrl;
        renderCardPhotoPreview(side, dataUrl);
        saveCurrentCard();
      } catch (e) {
        /* Foto konnte nicht gelesen werden - Karte bleibt ohne Foto */
      }
    });
    el(`karte-photo-${side}-remove-btn`).addEventListener('click', () => {
      if (side === 'front') pendingFrontPhoto = null; else pendingBackPhoto = null;
      renderCardPhotoPreview(side, null);
      saveCurrentCard();
    });
  });

  el('karte-delete-btn').addEventListener('click', () => {
    if (currentCardId) deleteCard(currentCardId);
  });

  // Damit man beim Anlegen mehrerer Karten nicht ständig zur Liste und
  // wieder zurück muss: direkt speichern und verlassen bzw. speichern und
  // sofort mit einer neuen Karte weitermachen.
  el('karte-save-exit-btn').addEventListener('click', () => {
    saveCurrentCard();
    showScreen('karteikarten');
  });
  el('karte-save-new-btn').addEventListener('click', () => {
    saveCurrentCard();
    createNewCard();
  });

  el('karte-flip-card').addEventListener('click', flipKarteCard);
  el('karte-lernen-know-btn').addEventListener('click', () => markKarteCard(true));
  el('karte-lernen-dontknow-btn').addEventListener('click', () => markKarteCard(false));
  el('karte-lernen-again-btn').addEventListener('click', () => startKarteLernen(karteLernen.filter));
  el('karte-lernen-unknown-again-btn').addEventListener('click', () => startKarteLernen('unknown'));
  el('karte-lernen-exit-btn').addEventListener('click', () => {
    renderKarteList();
    showScreen('karteikarten');
  });
  // Auch über den ✕-Button im Lernen-Screen verlassen aktualisiert die
  // Stapel-Anzeige - sonst zeigt die Liste noch den Stand von vor dem
  // Üben (Karten wurden ja gerade erst in einen Stapel einsortiert).
  document.querySelectorAll('#screen-karte-lernen [data-goto="karteikarten"]').forEach((btn) => {
    btn.addEventListener('click', renderKarteList);
  });
}

/* ---------------- Init ---------------- */

loadSettings();
initSetupScreen();
initGlobalNav();
initPracticeScreen();
initSettingsScreen();
initTheme();
initUpdateButton();
enhanceTrickCards();
renderStilmittelListe();
initStilmittelUebung();
renderVersmassListe();
initVersmassUebung();
renderTextartenListe();
initTextartenUebung();
renderKadenzLernenListe();
initKadenzUebung();
initTrash();
initTransfer();
initEinheitenUebungToggle();
initNotizen();
initKarteikarten();
showScreen('home');
initUpdateChecker();
renderVersionHistory();
