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

const STORAGE_KEYS = {
  settings: 'kopfrechnen.settings.v1',
  history: 'kopfrechnen.history.v1',
  trickCount: 'kopfrechnen.trickCount.v1',
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
    operations: ['add'],
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

/* ---------------- DOM-Referenzen ---------------- */

const el = (id) => document.getElementById(id);

const screens = {
  setup: el('screen-setup'),
  quiz: el('screen-quiz'),
  results: el('screen-results'),
  learn: el('screen-learn'),
  practice: el('screen-practice'),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].hidden = key !== name;
  }
  window.scrollTo(0, 0);
}

/* ---------------- Setup-Screen ---------------- */

function initSetupScreen() {
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

function renderSetup() {
  document.querySelectorAll('#op-group .chip').forEach((btn) => {
    btn.classList.toggle('selected', state.setup.operations.includes(btn.dataset.op));
  });
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

  el('diff-hint').textContent = DIFFICULTY[state.setup.difficulty].hint;

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
    const opsLabel = entry.operations.includes('mix')
      ? 'Gemischt'
      : entry.operations.map((o) => OP_LABEL[o]).join(', ');

    li.innerHTML = `
      <span class="h-meta">${dateStr} · ${opsLabel} · ${DIFFICULTY[entry.difficulty].label}</span>
      <span class="h-score">${entry.accuracy}%</span>
    `;
    list.appendChild(li);
  }
}

/* ---------------- Learn-Screen ---------------- */

function initLearnScreen() {
  el('learn-open-btn').addEventListener('click', () => showScreen('learn'));
  el('learn-back-btn').addEventListener('click', () => showScreen('setup'));
  el('learn-to-training-btn').addEventListener('click', () => showScreen('setup'));

  el('learn-nav').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const target = el(btn.dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ---------------- Trick-Übungen (Schritt für Schritt) ---------------- */

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
        headline: `${a} + ${b}`,
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
        headline: `${a} + ${b}`,
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
        headline: `${round} − ${sub}`,
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
        headline: `${a} − ${sub}`,
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
        headline: `${a} × ${b}`,
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
          headline: `${n} × 5`,
          steps: [
            { prompt: `${n} × 10 =`, answer: n * 10 },
            { prompt: `${n * 10} ÷ 2 =`, answer: n * 5 },
          ],
        };
      }
      if (variant === '25') {
        return {
          headline: `${n} × 25`,
          steps: [
            { prompt: `${n} × 100 =`, answer: n * 100 },
            { prompt: `${n * 100} ÷ 4 =`, answer: n * 25 },
          ],
        };
      }
      return {
        headline: `${n} × 9`,
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
          headline: `${a} × 11`,
          steps: [
            { prompt: `Ziffernsumme: ${d1} + ${d2} =`, answer: sum },
            { prompt: `Einsetzen: ${d1}_${sum}_${d2} → Ergebnis =`, answer: a * 11 },
          ],
        };
      }
      return {
        headline: `${a} × 11`,
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
        headline: `${n}²`,
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
        headline: `${a} × ${b}`,
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
          headline: `${n} ÷ 5`,
          steps: [
            { prompt: `${n} × 2 =`, answer: n * 2 },
            { prompt: `${n * 2} ÷ 10 =`, answer: n / 5 },
          ],
        };
      }
      const n = randInt(4, 40) * 25;
      return {
        headline: `${n} ÷ 25`,
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
        headline: `${dividend} ÷ ${divisor}`,
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
        headline: `${dividend} ÷ ${d}`,
        steps: [
          { prompt: `Grob geschätzt ≈ ${estimate}. Probe: ${d} × ${estimate} =`, answer: product },
          { prompt: `Rest: ${dividend} − ${product} =`, answer: remainder },
          { prompt: `${remainder} ÷ ${d} =`, answer: remainderQuotient },
          { prompt: `Ergebnis: ${estimate} + ${remainderQuotient} =`, answer: q },
        ],
      };
    },
  },
};

let practice = null; // { trickId, ctx: { headline, steps }, stepIndex, input }

function openPractice(trickId) {
  practice = { trickId, ctx: null, stepIndex: 0, input: '' };
  showScreen('practice');
  loadPracticeProblem();
}

function loadPracticeProblem() {
  const trick = TRICKS[practice.trickId];
  practice.ctx = trick.build();
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

  el('practice-progress-label').textContent = `Schritt ${practice.stepIndex + 1} von ${ctx.steps.length}`;
  el('practice-progress-fill').style.width = `${(practice.stepIndex / ctx.steps.length) * 100}%`;
  el('practice-problem').textContent = `${ctx.headline} = ?`;
  el('practice-prompt').textContent = step.prompt;
  el('practice-answer-display').textContent = ' ';
  el('practice-feedback').textContent = '';
  el('practice-feedback').className = 'feedback';
}

function handlePracticeInput(action, num) {
  if (!practice) return;
  if (num !== undefined) {
    if (practice.input.length >= 8) return;
    practice.input += num;
  } else if (action === 'back') {
    practice.input = practice.input.slice(0, -1);
  } else if (action === 'minus') {
    practice.input = practice.input.startsWith('-') ? practice.input.slice(1) : '-' + practice.input;
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
  const given = Number(practice.input);
  const correct = given === step.answer;
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
    feedback.textContent = `Leider falsch. Richtig: ${step.answer}`;
    feedback.className = 'feedback wrong';
    card.classList.remove('flash-correct');
    void card.offsetWidth;
    card.classList.add('flash-wrong');
    practice.input = '';
    el('practice-answer-display').textContent = ' ';
  }
}

function finishPracticeProblem() {
  const ctx = practice.ctx;
  el('practice-progress-fill').style.width = '100%';
  el('practice-card').hidden = true;
  el('practice-numpad').hidden = true;
  el('practice-done').hidden = false;
  el('practice-done-sub').textContent = `${ctx.headline} = ${ctx.steps[ctx.steps.length - 1].answer}`;

  incrementTrickCounter();
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

  el('practice-cancel-btn').addEventListener('click', () => showScreen('learn'));
  el('practice-exit-btn').addEventListener('click', () => showScreen('learn'));
  el('practice-next-btn').addEventListener('click', loadPracticeProblem);

  renderTrickCounter();
}

/* ---------------- Quiz-Screen ---------------- */

let timerHandle = null;
let questionStartedAt = 0;

function startSession() {
  const { operations, difficulty, mode, count, time } = state.setup;

  state.session = {
    operations,
    difficulty,
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

  s.currentQuestion = generateQuestion(s.operations, s.difficulty);
  s.currentInput = '';
  questionStartedAt = performance.now();

  el('question-text').textContent = s.currentQuestion.text;
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
  } else if (action === 'submit') {
    submitAnswer();
    return;
  }

  el('answer-display').textContent = s.currentInput || ' ';
}

function submitAnswer() {
  const s = state.session;
  if (!s.currentInput) return;

  const given = Number(s.currentInput);
  const correct = given === s.currentQuestion.answer;
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
    feedback.textContent = `Leider falsch. Richtig: ${s.currentQuestion.answer}`;
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

  const mistakesCard = el('mistakes-card');
  const mistakesList = el('mistakes-list');
  mistakesList.innerHTML = '';
  if (s.mistakes.length) {
    mistakesCard.hidden = false;
    for (const m of s.mistakes) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${m.text}</span><span><span class="m-wrong">${m.given}</span> → <span class="m-right">${m.answer}</span></span>`;
      mistakesList.appendChild(li);
    }
  } else {
    mistakesCard.hidden = true;
  }

  pushHistory({
    date: Date.now(),
    operations: s.operations,
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
  showScreen('setup');
});

/* ---------------- Init ---------------- */

loadSettings();
initSetupScreen();
initLearnScreen();
initPracticeScreen();
showScreen('setup');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* Offline-Support ist optional – Fehler hier sind unkritisch */
    });
  });
}
