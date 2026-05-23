const problemEl = document.querySelector("#problem");
const answerInput = document.querySelector("#answerInput");
const checkButton = document.querySelector("#checkButton");
const newGameButton = document.querySelector("#newGameButton");
const playAgainButton = document.querySelector("#playAgainButton");
const megaPlayAgainButton = document.querySelector("#megaPlayAgainButton");
const streakCount = document.querySelector("#streakCount");
const mistakesCount = document.querySelector("#mistakesCount");
const missionsCount = document.querySelector("#missionsCount");
const progressFill = document.querySelector("#progressFill");
const progressText = document.querySelector("#progressText");
const feedbackOverlay = document.querySelector("#feedbackOverlay");
const feedbackCard = document.querySelector("#feedbackCard");
const feedbackIcon = document.querySelector("#feedbackIcon");
const feedbackTitle = document.querySelector("#feedbackTitle");
const feedbackText = document.querySelector("#feedbackText");
const victoryOverlay = document.querySelector("#victoryOverlay");
const megaOverlay = document.querySelector("#megaOverlay");
const rocketEl = document.querySelector(".rocket");

const targetStreak = 20;
const maxMistakes = 3;
const targetMissions = 5;
const recentProblemLimit = 8;
let currentProblem = null;
let streak = 0;
let mistakes = 0;
let completedMissions = Number(localStorage.getItem("mathChallengeMissions") || 0);
let audioContext = null;
let feedbackTimer = null;
let recentProblemKeys = [];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(items) {
  return items[randomInt(0, items.length - 1)];
}

function weightedPick(groups) {
  const totalWeight = groups.reduce((total, group) => total + group.weight, 0);
  let ticket = Math.random() * totalWeight;

  for (const group of groups) {
    ticket -= group.weight;
    if (ticket <= 0) {
      return group;
    }
  }

  return groups[groups.length - 1];
}

function buildProblem(first, operator, second, result, missingPart) {
  const expression = {
    first: missingPart === "first" ? "?" : first,
    operator,
    second: missingPart === "second" ? "?" : second,
    result: missingPart === "result" ? "?" : result,
  };

  const answerByPart = {
    first,
    second,
    result,
  };

  return {
    expression,
    answer: answerByPart[missingPart],
  };
}

function makeFact(first, operator, second, result) {
  return { first, operator, second, result };
}

function createLessonGroups() {
  const makeTenFacts = [];
  const doublesFacts = [];
  const corePartWholeFacts = [];
  const tenSubtractionFacts = [];
  const zeroFacts = [];

  for (let first = 1; first <= 9; first += 1) {
    const second = 10 - first;
    makeTenFacts.push(makeFact(first, "+", second, 10));
    makeTenFacts.push(makeFact(second, "+", first, 10));
    tenSubtractionFacts.push(makeFact(10, "-", first, second));
  }

  for (let number = 1; number <= 5; number += 1) {
    doublesFacts.push(makeFact(number, "+", number, number * 2));
    doublesFacts.push(makeFact(number * 2, "-", number, number));

    if (number + number + 1 <= 10) {
      doublesFacts.push(makeFact(number, "+", number + 1, number + number + 1));
      doublesFacts.push(makeFact(number + number + 1, "-", number, number + 1));
    }
  }

  for (let result = 3; result <= 9; result += 1) {
    for (let first = 1; first < result; first += 1) {
      const second = result - first;
      corePartWholeFacts.push(makeFact(first, "+", second, result));
      corePartWholeFacts.push(makeFact(result, "-", first, second));
    }
  }

  for (let number = 1; number <= 10; number += 1) {
    zeroFacts.push(makeFact(number, "+", 0, number));
    zeroFacts.push(makeFact(0, "+", number, number));
    zeroFacts.push(makeFact(number, "-", 0, number));
    zeroFacts.push(makeFact(number, "-", number, 0));
  }

  return [
    { name: "make-ten", weight: 24, facts: makeTenFacts },
    { name: "ten-subtraction", weight: 14, facts: tenSubtractionFacts },
    { name: "doubles-near-doubles", weight: 22, facts: doublesFacts },
    { name: "part-whole", weight: 32, facts: corePartWholeFacts },
    { name: "zero", weight: 8, facts: zeroFacts },
  ];
}

const lessonGroups = createLessonGroups();

function createProblemKey(fact, missingPart) {
  return `${fact.first}${fact.operator}${fact.second}=${fact.result}:${missingPart}`;
}

function rememberProblem(key) {
  recentProblemKeys.push(key);
  if (recentProblemKeys.length > recentProblemLimit) {
    recentProblemKeys.shift();
  }
}

function pickMissingPart(fact) {
  const missingParts = ["first", "second", "result"];

  if (fact.operator === "+") {
    return pickRandom(missingParts);
  }

  return pickRandom(missingParts);
}

function createProblem() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const group = weightedPick(lessonGroups);
    const fact = pickRandom(group.facts);
    const missingPart = pickMissingPart(fact);
    const key = createProblemKey(fact, missingPart);

    if (!recentProblemKeys.includes(key)) {
      rememberProblem(key);
      return buildProblem(fact.first, fact.operator, fact.second, fact.result, missingPart);
    }
  }

  const fallbackGroup = weightedPick(lessonGroups);
  const fallbackFact = pickRandom(fallbackGroup.facts);
  const fallbackMissingPart = pickMissingPart(fallbackFact);
  rememberProblem(createProblemKey(fallbackFact, fallbackMissingPart));
  return buildProblem(
    fallbackFact.first,
    fallbackFact.operator,
    fallbackFact.second,
    fallbackFact.result,
    fallbackMissingPart
  );
}

function renderProblem() {
  currentProblem = createProblem();
  const expression = currentProblem.expression;
  problemEl.textContent = `${expression.first} ${expression.operator} ${expression.second} = ${expression.result}`;
  answerInput.value = "";
  answerInput.focus();
}

function updateStats() {
  streakCount.textContent = streak;
  mistakesCount.textContent = mistakes;
  missionsCount.textContent = completedMissions;
  progressFill.style.width = `${Math.min(streak / targetStreak, 1) * 100}%`;
  rocketEl.dataset.stage = String(streak % 6);

  const remaining = targetStreak - streak;
  const mistakesLeft = Math.max(maxMistakes - mistakes, 0);
  progressText.textContent = remaining > 0
    ? `Encore ${remaining} bonnes réponses - ${mistakesLeft} erreurs possibles - mission ${completedMissions + 1}/5`
    : "Mission terminée !";
}

function launchRocketBoost() {
  rocketEl.classList.remove("rocket-boost");
  void rocketEl.offsetWidth;
  rocketEl.classList.add("rocket-boost");
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function playTone(frequency, startTime, duration, type = "sine", volume = 0.12) {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.04);
}

function playSuccessSound() {
  const context = getAudioContext();
  const now = context.currentTime;
  playTone(523.25, now, 0.16, "triangle");
  playTone(659.25, now + 0.12, 0.16, "triangle");
  playTone(783.99, now + 0.24, 0.22, "triangle");
}

function playErrorSound() {
  const context = getAudioContext();
  const now = context.currentTime;
  playTone(220, now, 0.18, "sawtooth", 0.09);
  playTone(164.81, now + 0.16, 0.22, "sawtooth", 0.08);
}

function playVictorySound() {
  const context = getAudioContext();
  const now = context.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1174.66].forEach((note, index) => {
    playTone(note, now + index * 0.11, 0.2, "triangle", 0.13);
  });
}

function playMegaVictorySound() {
  const context = getAudioContext();
  const now = context.currentTime;
  [392, 523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((note, index) => {
    playTone(note, now + index * 0.09, 0.22, "triangle", 0.14);
  });
  [130.81, 164.81, 196].forEach((note, index) => {
    playTone(note, now + 0.22 + index * 0.16, 0.28, "sawtooth", 0.055);
  });
}

function showFeedback(type, title, text) {
  clearTimeout(feedbackTimer);
  feedbackCard.className = `feedback-card ${type}`;
  feedbackIcon.textContent = type === "good" ? "★" : "!";
  feedbackTitle.textContent = title;
  feedbackText.textContent = text;
  feedbackOverlay.classList.add("show");
  feedbackOverlay.setAttribute("aria-hidden", "false");

  feedbackTimer = window.setTimeout(() => {
    feedbackOverlay.classList.remove("show");
    feedbackOverlay.setAttribute("aria-hidden", "true");
  }, type === "good" ? 900 : 1200);
}

function showVictory() {
  victoryOverlay.classList.add("show");
  victoryOverlay.setAttribute("aria-hidden", "false");
  playVictorySound();
}

function showMegaVictory() {
  megaOverlay.classList.add("show");
  megaOverlay.setAttribute("aria-hidden", "false");
  playMegaVictorySound();
}

function hideVictory() {
  victoryOverlay.classList.remove("show");
  victoryOverlay.setAttribute("aria-hidden", "true");
}

function hideMegaVictory() {
  megaOverlay.classList.remove("show");
  megaOverlay.setAttribute("aria-hidden", "true");
}

function handleCorrectAnswer() {
  streak += 1;
  updateStats();
  launchRocketBoost();
  playSuccessSound();

  if (streak >= targetStreak) {
    completedMissions += 1;
    localStorage.setItem("mathChallengeMissions", String(completedMissions));
    updateStats();

    if (completedMissions >= targetMissions) {
      completedMissions = 0;
      localStorage.setItem("mathChallengeMissions", "0");
      updateStats();
      showMegaVictory();
    } else {
      showVictory();
    }
    return;
  }

  showFeedback("good", "Bravo Sean !", "Continue comme ça.");
  window.setTimeout(renderProblem, 520);
}

function handleWrongAnswer() {
  mistakes += 1;
  updateStats();
  playErrorSound();
  showFeedback("bad", "Dommage Sean", "Concentre-toi et on recommence.");
  answerInput.classList.remove("shake");
  void answerInput.offsetWidth;
  answerInput.classList.add("shake");
  answerInput.value = "";
  answerInput.focus();

  if (mistakes > maxMistakes) {
    completedMissions = 0;
    localStorage.setItem("mathChallengeMissions", "0");
    window.setTimeout(startNewGame, 1250);
  }
}

function checkAnswer() {
  if (!currentProblem || answerInput.value.trim() === "") {
    answerInput.focus();
    return;
  }

  const answer = Number(answerInput.value);
  if (answer === currentProblem.answer) {
    handleCorrectAnswer();
  } else {
    handleWrongAnswer();
  }
}

function startNewGame() {
  streak = 0;
  mistakes = 0;
  hideVictory();
  hideMegaVictory();
  updateStats();
  renderProblem();
}

function sanitizeAnswer() {
  answerInput.value = answerInput.value.replace(/\D/g, "").slice(0, 2);
}

function addDigit(digit) {
  if (answerInput.value.length < 2) {
    answerInput.value += digit;
    sanitizeAnswer();
  }
  answerInput.focus();
}

function clearAnswer() {
  answerInput.value = "";
  answerInput.focus();
}

function pressNumber(event, digit) {
  event.preventDefault();
  addDigit(digit);
  return false;
}

function eraseAnswer(event) {
  event.preventDefault();
  clearAnswer();
  return false;
}

window.pressNumber = pressNumber;
window.eraseAnswer = eraseAnswer;

answerInput.addEventListener("input", () => {
  sanitizeAnswer();
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    checkAnswer();
  }
});

checkButton.addEventListener("click", checkAnswer);
newGameButton.addEventListener("click", startNewGame);
playAgainButton.addEventListener("click", startNewGame);
megaPlayAgainButton.addEventListener("click", startNewGame);

updateStats();
renderProblem();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}
