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
  if (screens.quiz.hidden) return;
  if (ev.key >= '0' && ev.key <= '9') {
    handleNumpadInput(undefined, ev.key);
  } else if (ev.key === 'Backspace') {
    handleNumpadInput('back');
  } else if (ev.key === '-') {
    handleNumpadInput('minus');
  } else if (ev.key === 'Enter') {
    handleNumpadInput('submit');
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
showScreen('setup');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* Offline-Support ist optional – Fehler hier sind unkritisch */
    });
  });
}
