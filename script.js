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
const dinoCanvas = document.querySelector("#dinoCanvas");
const trexMascot = document.querySelector("#trexMascot");

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
let dinoStage = 0;
let dinoCheerUntil = 0;

function createDinoRenderer(canvas) {
  if (!canvas) {
    return {
      setStage() {},
      cheer() {},
    };
  }

  const context = canvas.getContext("2d");
  const palette = [
    { skin: "#39c57d", dark: "#08794a", belly: "#b8ef9a", crest: "#ffd764", eye: "#ffefb0" },
    { skin: "#27b4d8", dark: "#12698f", belly: "#bcf3ff", crest: "#ff956d", eye: "#fff1a8" },
    { skin: "#8e76ff", dark: "#5140a9", belly: "#efe8ff", crest: "#ffd764", eye: "#fff1a8" },
    { skin: "#ff914d", dark: "#b94b1f", belly: "#ffe1a6", crest: "#40d486", eye: "#fff1a8" },
    { skin: "#e95f9c", dark: "#963263", belly: "#ffd7ea", crest: "#54c8f0", eye: "#fff1a8" },
    { skin: "#43d091", dark: "#0b7a56", belly: "#d0f7a0", crest: "#f5d75d", eye: "#fff1a8" },
  ];
  const state = {
    stage: 0,
    width: 0,
    height: 0,
    dpr: 1,
    start: performance.now(),
  };

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    state.width = width;
    state.height = height;
    state.dpr = dpr;
  }

  function shade(hex, amount) {
    const value = hex.replace("#", "");
    const number = parseInt(value, 16);
    const r = Math.max(0, Math.min(255, (number >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (number & 255) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function project(point, cameraYaw, cameraPitch) {
    const yawCos = Math.cos(cameraYaw);
    const yawSin = Math.sin(cameraYaw);
    const pitchCos = Math.cos(cameraPitch);
    const pitchSin = Math.sin(cameraPitch);
    const x1 = point.x * yawCos - point.z * yawSin;
    const z1 = point.x * yawSin + point.z * yawCos;
    const y1 = point.y * pitchCos - z1 * pitchSin;
    const z2 = point.y * pitchSin + z1 * pitchCos;
    const depth = z2 + 8.5;
    const scale = Math.min(state.width, state.height) * 0.13 / depth;

    return {
      x: state.width * 0.5 + x1 * scale,
      y: state.height * 0.62 - y1 * scale,
      z: depth,
      scale,
    };
  }

  function drawEllipse(part, cameraYaw, cameraPitch, colors) {
    const projected = project(part.center, cameraYaw, cameraPitch);
    const width = part.size.x * projected.scale;
    const height = part.size.y * projected.scale;
    const rotation = part.rotation || 0;
    const color = part.color || colors.skin;
    const light = shade(color, 34);
    const dark = shade(color, -38);

    context.save();
    context.translate(projected.x, projected.y);
    context.rotate(rotation);
    const gradient = context.createRadialGradient(
      -width * 0.25,
      -height * 0.32,
      Math.max(1, width * 0.08),
      0,
      0,
      Math.max(width, height) * 0.74
    );
    gradient.addColorStop(0, light);
    gradient.addColorStop(0.54, color);
    gradient.addColorStop(1, dark);
    context.fillStyle = gradient;
    context.strokeStyle = "rgba(5, 17, 24, 0.78)";
    context.lineWidth = Math.max(2, projected.scale * 0.13);
    context.beginPath();
    context.ellipse(0, 0, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (part.highlight) {
      context.globalAlpha = 0.42;
      context.fillStyle = "white";
      context.beginPath();
      context.ellipse(-width * 0.16, -height * 0.16, width * 0.18, height * 0.12, -0.2, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  function drawBackground(time) {
    const sky = context.createLinearGradient(0, 0, 0, state.height);
    sky.addColorStop(0, "#0c2d37");
    sky.addColorStop(0.48, "#176052");
    sky.addColorStop(1, "#102b21");
    context.fillStyle = sky;
    context.fillRect(0, 0, state.width, state.height);

    context.save();
    context.globalAlpha = 0.16;
    for (let i = 0; i < 12; i += 1) {
      const x = ((i * 191 + time * 16) % (state.width + 220)) - 110;
      const y = state.height * (0.16 + (i % 5) * 0.09);
      context.fillStyle = i % 2 ? "#8ef5c8" : "#ffe48a";
      context.beginPath();
      context.arc(x, y, 2.8 * state.dpr, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    const groundY = state.height * 0.76;
    const ground = context.createLinearGradient(0, groundY, 0, state.height);
    ground.addColorStop(0, "#2a8c5b");
    ground.addColorStop(1, "#0c241d");
    context.fillStyle = ground;
    context.fillRect(0, groundY, state.width, state.height - groundY);

    context.save();
    context.globalAlpha = 0.18;
    context.strokeStyle = "#b7ffd2";
    context.lineWidth = 1 * state.dpr;
    for (let x = -80 * state.dpr; x < state.width + 80 * state.dpr; x += 44 * state.dpr) {
      context.beginPath();
      context.moveTo(x + Math.sin(time + x) * 12 * state.dpr, groundY);
      context.lineTo(x - 26 * state.dpr, state.height);
      context.stroke();
    }
    context.restore();
  }

  function buildParts(time, colors) {
    const walk = time * 5.4;
    const gait = Math.sin(walk);
    const counter = Math.sin(walk + Math.PI);
    const cheer = Math.max(0, Math.min(1, (dinoCheerUntil - performance.now()) / 560));
    const lift = Math.sin(cheer * Math.PI) * 1.2;
    const breathe = Math.sin(time * 2.4) * 0.08;
    const headNod = Math.sin(time * 3.1) * 0.08 - cheer * 0.16;
    const tailSwing = Math.sin(time * 3.6) * 0.26 + cheer * 0.18;

    return [
      { center: { x: -1.85, y: 0.48 + lift, z: -0.06 }, size: { x: 2.1, y: 0.48 }, color: colors.dark, rotation: -0.12 + tailSwing, highlight: true },
      { center: { x: -0.42, y: 0.68 + breathe + lift, z: 0 }, size: { x: 2.32, y: 1.28 }, color: colors.skin, highlight: true },
      { center: { x: -0.24, y: 0.46 + lift, z: -0.02 }, size: { x: 1.06, y: 0.74 }, color: colors.belly },
      { center: { x: 1.04, y: 1.18 + lift, z: 0.03 }, size: { x: 0.62, y: 0.86 }, color: colors.skin, rotation: -0.18 + headNod },
      { center: { x: 1.72, y: 1.52 + lift, z: 0.04 }, size: { x: 1.08, y: 0.82 }, color: colors.skin, rotation: headNod, highlight: true },
      { center: { x: 2.38, y: 1.5 + lift, z: 0.04 }, size: { x: 0.84, y: 0.38 }, color: colors.skin, rotation: -0.03 + headNod },
      { center: { x: 0.42, y: 1.42 + lift, z: 0.02 }, size: { x: 0.25, y: 0.5 }, color: colors.crest, rotation: 0.08 },
      { center: { x: -0.12, y: 1.5 + lift, z: 0.01 }, size: { x: 0.25, y: 0.54 }, color: colors.crest, rotation: -0.02 },
      { center: { x: -0.66, y: 1.38 + lift, z: 0 }, size: { x: 0.24, y: 0.48 }, color: colors.crest, rotation: -0.12 },
      { center: { x: 0.84, y: 0.58 + lift, z: -0.16 }, size: { x: 0.66, y: 0.22 }, color: colors.dark, rotation: -0.12 + Math.sin(walk) * 0.18 },
      { center: { x: -0.86, y: -0.08 + lift + Math.max(0, gait) * 0.08, z: 0.2 }, size: { x: 0.42, y: 1.06 }, color: colors.dark, rotation: gait * 0.2 },
      { center: { x: -0.66 + gait * 0.18, y: -0.72 + lift, z: 0.22 }, size: { x: 0.78, y: 0.32 }, color: colors.dark, rotation: gait * 0.12 },
      { center: { x: 0.48, y: -0.08 + lift + Math.max(0, counter) * 0.08, z: -0.08 }, size: { x: 0.42, y: 1.02 }, color: colors.dark, rotation: counter * 0.2 },
      { center: { x: 0.68 + counter * 0.18, y: -0.72 + lift, z: -0.08 }, size: { x: 0.78, y: 0.32 }, color: colors.dark, rotation: counter * 0.12 },
    ];
  }

  function drawDetails(time, cameraYaw, cameraPitch, colors) {
    const cheer = Math.max(0, Math.min(1, (dinoCheerUntil - performance.now()) / 560));
    const lift = Math.sin(cheer * Math.PI) * 1.2;
    const eye = project({ x: 1.9, y: 1.66 + lift, z: -0.34 }, cameraYaw, cameraPitch);
    const nostril = project({ x: 2.58, y: 1.56 + lift, z: -0.2 }, cameraYaw, cameraPitch);

    context.save();
    context.fillStyle = colors.eye;
    context.strokeStyle = "rgba(5, 17, 24, 0.82)";
    context.lineWidth = Math.max(2, eye.scale * 0.1);
    context.beginPath();
    context.arc(eye.x, eye.y, eye.scale * 0.18, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#071116";
    context.beginPath();
    context.arc(eye.x + eye.scale * 0.04, eye.y + eye.scale * 0.02, eye.scale * 0.07, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#061318";
    context.beginPath();
    context.arc(nostril.x, nostril.y, nostril.scale * 0.05, 0, Math.PI * 2);
    context.fill();

    const smile = project({ x: 2.3, y: 1.36 + lift, z: -0.16 }, cameraYaw, cameraPitch);
    context.strokeStyle = "rgba(5, 17, 24, 0.72)";
    context.lineWidth = Math.max(2, smile.scale * 0.07);
    context.beginPath();
    context.arc(smile.x, smile.y - smile.scale * 0.04, smile.scale * 0.24, 0.18, Math.PI - 0.1);
    context.stroke();
    context.restore();
  }

  function render(now) {
    const time = (now - state.start) / 1000;
    const colors = palette[state.stage % palette.length];
    const cameraYaw = Math.sin(time * 0.42) * 0.28;
    const cameraPitch = -0.08 + Math.sin(time * 0.3) * 0.025;

    drawBackground(time);

    const shadowX = state.width * 0.49;
    const shadowY = state.height * 0.76;
    context.save();
    const shadow = context.createRadialGradient(shadowX, shadowY, 1, shadowX, shadowY, state.width * 0.2);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0.28)");
    shadow.addColorStop(0.62, "rgba(0, 0, 0, 0.14)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(shadowX, shadowY, state.width * 0.18, state.height * 0.045, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const parts = buildParts(time, colors)
      .map((part) => ({ ...part, depth: project(part.center, cameraYaw, cameraPitch).z }))
      .sort((a, b) => b.depth - a.depth);

    parts.forEach((part) => drawEllipse(part, cameraYaw, cameraPitch, colors));
    drawDetails(time, cameraYaw, cameraPitch, colors);

    requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(render);

  return {
    setStage(nextStage) {
      state.stage = Number(nextStage) || 0;
    },
    cheer() {
      dinoCheerUntil = performance.now() + 680;
    },
  };
}

const dinoRenderer = createDinoRenderer(dinoCanvas);

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
}

function updateStats() {
  streakCount.textContent = streak;
  mistakesCount.textContent = mistakes;
  missionsCount.textContent = completedMissions;
  progressFill.style.width = `${Math.min(streak / targetStreak, 1) * 100}%`;
  dinoStage = Math.min(5, Math.floor((streak / targetStreak) * 6));
  dinoRenderer.setStage(dinoStage);
  if (trexMascot) {
    trexMascot.dataset.stage = String(dinoStage);
  }

  const remaining = targetStreak - streak;
  const mistakesLeft = Math.max(maxMistakes - mistakes, 0);
  progressText.textContent = remaining > 0
    ? `Encore ${remaining} bonnes réponses - ${mistakesLeft} erreurs possibles - mission ${completedMissions + 1}/5`
    : "Mission terminée !";
}

function launchRocketBoost() {
  dinoRenderer.cheer();
  if (trexMascot) {
    trexMascot.classList.remove("trex-mascot-boost");
    void trexMascot.offsetWidth;
    trexMascot.classList.add("trex-mascot-boost");
  }
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

  if (mistakes > maxMistakes) {
    completedMissions = 0;
    localStorage.setItem("mathChallengeMissions", "0");
    window.setTimeout(startNewGame, 1250);
  }
}

function checkAnswer() {
  if (!currentProblem || answerInput.value.trim() === "") {
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
}

function clearAnswer() {
  answerInput.value = "";
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

function runDemoMode() {
  const demoMode = new URLSearchParams(window.location.search).get("demo");

  if (!demoMode) {
    return;
  }

  streak = targetStreak;
  completedMissions = demoMode === "victory" ? 1 : targetMissions;
  mistakes = 0;
  updateStats();

  if (demoMode === "victory") {
    window.setTimeout(showVictory, 350);
    return;
  }

  if (demoMode === "mega") {
    window.setTimeout(showMegaVictory, 350);
    return;
  }

  if (demoMode === "all") {
    window.setTimeout(showVictory, 350);
    window.setTimeout(() => {
      hideVictory();
      showMegaVictory();
    }, 6500);
  }
}

window.pressNumber = pressNumber;
window.eraseAnswer = eraseAnswer;

["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
  answerInput.addEventListener(eventName, (event) => {
    event.preventDefault();
  }, { passive: false });
});

answerInput.addEventListener("input", () => {
  sanitizeAnswer();
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    checkAnswer();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key >= "0" && event.key <= "9") {
    addDigit(event.key);
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    clearAnswer();
    return;
  }

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
runDemoMode();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=8");
  });
}
