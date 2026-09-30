const state = {
  questions: [], current: 0, correct: 0, incorrect: 0, elapsed: 0, remaining: 0,
  interval: null, feedbackTimeout: null, locked: false, finished: false, config: {}, audio: null
};

const $ = (id) => document.getElementById(id);
const palette = ['#e95b8b', '#39bfc2', '#f1c744', '#8bc98a', '#f0925d', '#71a8d0'];

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function getRanking() {
  try {
    const scores = JSON.parse(localStorage.getItem('fraccionaRanking') || '[]');
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
}

function saveRanking() {
  const scores = getRanking();
  scores.push({ name: state.config.name, correct: state.correct, total: state.questions.length, time: state.elapsed });
  scores.sort((first, second) => second.correct - first.correct || first.time - second.time);
  try {
    localStorage.setItem('fraccionaRanking', JSON.stringify(scores.slice(0, 10)));
  } catch {
    return;
  }
}

function renderRanking() {
  const rankingList = $('ranking-list');
  const scores = getRanking().slice(0, 5);
  rankingList.replaceChildren();
  if (!scores.length) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'Todavía no hay partidas registradas.';
    rankingList.append(emptyItem);
    return;
  }
  scores.forEach((score) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = score.name;
    item.append(name, ` · ${score.correct}/${score.total} correctas · ${formatTime(score.time)}`);
    rankingList.append(item);
  });
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.hidden = !isActive;
    screen.classList.toggle('is-active', isActive);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function makeQuestions(count, difficulty) {
  const maximum = { easy: 4, medium: 8, hard: 12 }[difficulty] || 8;
  const fractions = [];
  for (let denominator = 2; denominator <= maximum; denominator += 1) {
    for (let numerator = 1; numerator <= denominator; numerator += 1) {
      fractions.push({ numerator, denominator });
    }
  }
  const questions = [];
  while (questions.length < count) questions.push(...shuffle(fractions));
  return questions.slice(0, count);
}

function createPieSvg(numerator, denominator) {
  const center = 160;
  const radius = 142;
  const startOffset = -Math.PI / 2;
  const slices = Array.from({ length: denominator }, (_, index) => {
    const startAngle = startOffset + (index * Math.PI * 2) / denominator;
    const endAngle = startOffset + ((index + 1) * Math.PI * 2) / denominator;
    const startX = center + radius * Math.cos(startAngle);
    const startY = center + radius * Math.sin(startAngle);
    const endX = center + radius * Math.cos(endAngle);
    const endY = center + radius * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const color = index < numerator ? palette[index % palette.length] : '#e4eeea';
    return `<path d="M ${center} ${center} L ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} Z" fill="${color}" stroke="#fffefa" stroke-width="4" />`;
  }).join('');
  return `<svg viewBox="0 0 320 320" role="img" aria-label="Círculo dividido en ${denominator} partes iguales, ${numerator} coloreadas"><circle cx="160" cy="160" r="150" fill="#fffefa" />${slices}<circle cx="160" cy="160" r="142" fill="none" stroke="#fffefa" stroke-width="2" /></svg>`;
}

function updateMistakes() {
  const dots = $('mistake-dots');
  dots.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.className = `mistake-dot${index < state.incorrect ? ' filled' : ''}`;
    dots.append(dot);
  }
  dots.setAttribute('aria-label', `${state.incorrect} de 3 errores`);
}

function renderQuestion() {
  const question = state.questions[state.current];
  state.locked = false;
  $('question-number').textContent = state.current + 1;
  $('question-total').textContent = state.questions.length;
  $('progress-bar').style.width = `${((state.current + 1) / state.questions.length) * 100}%`;
  const progressTrack = document.querySelector('.progress-track');
  progressTrack.setAttribute('aria-valuemax', String(state.questions.length));
  progressTrack.setAttribute('aria-valuenow', String(state.current + 1));
  $('correct-count').textContent = state.correct;
  $('pie-visual').setAttribute('aria-label', `Círculo dividido en ${question.denominator} partes iguales, con algunas partes coloreadas.`);
  $('pie-visual').innerHTML = createPieSvg(question.numerator, question.denominator);
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('answer-numerator').value = '';
  $('answer-denominator').value = '';
  $('answer-numerator').max = question.denominator;
  $('answer-denominator').max = question.denominator;
  $('answer-numerator').focus({ preventScroll: true });
  $('hint-button').setAttribute('aria-expanded', 'false');
  $('hint-text').hidden = true;
  $('answer-form').querySelector('button[type="submit"]').disabled = false;
}

function playTone(isCorrect) {
  if (!$('sound-enabled').checked) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    state.audio = state.audio || new AudioContextClass();
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.frequency.value = isCorrect ? 660 : 190;
    oscillator.type = 'sine';
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + 0.13);
  } catch {
    return;
  }
}

function answerQuestion(event) {
  event.preventDefault();
  if (state.locked || state.finished) return;
  const question = state.questions[state.current];
  const numerator = Number($('answer-numerator').value);
  const denominator = Number($('answer-denominator').value);
  const isCorrect = numerator === question.numerator && denominator === question.denominator;
  state.locked = true;
  $('answer-form').querySelector('button[type="submit"]').disabled = true;

  if (isCorrect) {
    state.correct += 1;
    $('feedback').textContent = `¡Correcto! ${question.numerator} de ${question.denominator} partes iguales están coloreadas.`;
    $('feedback').className = 'feedback correct';
  } else {
    state.incorrect += 1;
    $('feedback').textContent = `Casi. El denominador ${question.denominator} cuenta todas las partes; el numerador ${question.numerator}, las coloreadas.`;
    $('feedback').className = 'feedback incorrect';
    updateMistakes();
  }
  $('correct-count').textContent = state.correct;
  playTone(isCorrect);

  state.feedbackTimeout = window.setTimeout(() => {
    if (state.finished) return;
    if (state.incorrect >= 3 || state.current >= state.questions.length - 1) {
      finishGame();
      return;
    }
    state.current += 1;
    renderQuestion();
  }, 1150);
}

function tick() {
  state.elapsed += 1;
  state.remaining -= 1;
  $('timer').querySelector('strong').textContent = formatTime(state.remaining);
  $('timer').classList.toggle('warning', state.remaining <= 30);
  if (state.remaining <= 0) finishGame('time');
}

function finishGame(reason = 'complete') {
  if (state.finished) return;
  state.finished = true;
  if (state.interval) window.clearInterval(state.interval);
  if (state.feedbackTimeout) window.clearTimeout(state.feedbackTimeout);
  state.interval = null;
  const answered = state.correct + state.incorrect;
  const accuracy = answered ? Math.round((state.correct / answered) * 100) : 0;
  saveRanking();
  $('result-name').textContent = state.config.name;
  $('stat-time').textContent = formatTime(state.elapsed);
  $('stat-correct').textContent = state.correct;
  $('stat-incorrect').textContent = state.incorrect;
  $('stat-rate').textContent = `${accuracy}%`;
  $('result-message').textContent = reason === 'time'
    ? 'Se acabó el tiempo. ¡Cada vuelta suma un nuevo aprendizaje!'
    : state.incorrect >= 3
      ? 'Llegaste al límite de errores. ¡Ya sabés un poco más sobre fracciones!'
      : 'Completaste todas las preguntas. ¡Excelente trabajo!';
  renderRanking();
  showScreen('results');
}

function startGame(event) {
  if (event) event.preventDefault();
  const minutes = Math.max(0, Math.min(59, Number($('minutes').value) || 0));
  const seconds = Math.max(0, Math.min(59, Number($('seconds').value) || 0));
  if (minutes * 60 + seconds < 10) {
    $('seconds').setCustomValidity('Elegí al menos 10 segundos.');
    $('seconds').reportValidity();
    return;
  }
  $('seconds').setCustomValidity('');
  state.config = { name: $('player-name').value.trim(), count: Number($('question-count').value), totalTime: minutes * 60 + seconds, difficulty: $('difficulty').value };
  state.questions = makeQuestions(state.config.count, state.config.difficulty);
  state.current = 0;
  state.correct = 0;
  state.incorrect = 0;
  state.elapsed = 0;
  state.remaining = state.config.totalTime;
  state.finished = false;
  state.locked = false;
  $('player-label').textContent = state.config.name.toUpperCase();
  $('timer').querySelector('strong').textContent = formatTime(state.remaining);
  $('timer').classList.remove('warning');
  updateMistakes();
  renderQuestion();
  showScreen('game');
  state.interval = window.setInterval(tick, 1000);
}

$('setup-form').addEventListener('submit', startGame);
$('answer-form').addEventListener('submit', answerQuestion);
$('hint-button').addEventListener('click', () => {
  const isExpanded = $('hint-button').getAttribute('aria-expanded') === 'true';
  $('hint-button').setAttribute('aria-expanded', String(!isExpanded));
  $('hint-text').hidden = isExpanded;
});
$('play-again').addEventListener('click', () => startGame());
$('back-to-setup').addEventListener('click', () => {
  showScreen('inicio');
  $('player-name').focus();
});