const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const dock = document.getElementById('planetDock');

const TWO_PI = Math.PI * 2;
const EARTH_ORBIT_SECONDS = 36.5;

let W = 0;
let H = 0;
let cx = 0;
let cy = 0;
let maxOrbitRadius = 1;
let paused = false;
const SPEED_STATES = [1, 2, 4, 8, 16, 0];
let speedStateIndex = 0;
let speedMultiplier = 1;
const MOON_ORBIT_SECONDS = EARTH_ORBIT_SECONDS * (27.321661 / 365.256);
let hovered = null;
let selected = null;
let planets = [];
let positions = [];
let starSeed = [];
let simulationSeconds = 0;
let lastFrameTime = null;
let introReady = false;
let introStartTime = null;
const INTRO_DURATION = 4.2;

const imageCache = new Map();
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioCtx = null;
const PLANET_TONES = { sun: 196, mercury: 262, venus: 294, earth: 330, mars: 349, jupiter: 392, saturn: 440, uranus: 494, neptune: 523, pluto: 587, moon: 659 };

const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const EARTH_PERIOD_DAYS = 365.256;
const MEAN_LONGITUDE_J2000 = {
  mercury: 252.25084,
  venus: 181.97973,
  earth: 100.46435,
  mars: 355.45332,
  jupiter: 34.40438,
  saturn: 49.94432,
  uranus: 313.23218,
  neptune: 304.88003,
  pluto: 238.92904
};

const REAL_ORBIT_AU = {
  mercury: 0.387,
  venus: 0.723,
  earth: 1.000,
  mars: 1.524,
  jupiter: 5.203,
  saturn: 9.537,
  uranus: 19.191,
  neptune: 30.069,
  pluto: 39.482
};
const AU_IN_KM = 149597870.7;

const SUN_DATA = {
  key: 'sun',
  name: 'Sun',
  type: 'Star',
  color: '#ffb347',
  badge: 'The star at the center',
  kidFact: 'The Sun is the star at the center of our solar system. Its gravity keeps all the planets in orbit.',
  distance: 'Center of the solar system',
  distanceLabel: 'Position',
  diameter: '1.39 million km',
  mass: '1.989 × 10³⁰ kg',
  year: 'About 225–250 million Earth years around the Milky Way',
  revolution: 'About 225–250 million Earth years around the Milky Way',
  orbitSeconds: 0,
  motion: 'The planets orbit around it',
  day: 'About 27 Earth days to rotate',
  moons: '0',
  discovery: 'Known since prehistory; no single discoverer/date.',
  mission: 'Notice the glow around the Sun. It gives light and heat to every planet here.'
};

const MOON_DATA = {
  key: 'moon',
  name: 'Moon',
  type: 'Natural Satellite',
  color: '#bfc3c7',
  badge: 'Earth’s companion',
  kidFact: 'The Moon orbits Earth and is the only place beyond Earth where humans have walked.',
  distance: '384,400 km',
  distanceLabel: 'Avg. distance from Earth',
  diameter: '3,475 km',
  mass: '7.35 × 10²² kg',
  year: '27.3 Earth days around Earth',
  revolution: '27.3 Earth days around Earth',
  orbitSeconds: MOON_ORBIT_SECONDS,
  motion: 'Prograde around Earth',
  day: '27.3 Earth days',
  moons: '0',
  discovery: 'Known since prehistory; no single discoverer/date.',
  mission: 'Watch the Moon circle Earth. How many Moon orbits happen during one Earth year in this model?'
};

async function init() {
  planets = Array.isArray(window.PLANET_DATA)
    ? window.PLANET_DATA
    : await fetch('data/planets.json').then(res => res.json());

  const orbitVisualMap = {
    mercury: 0.20,
    venus: 0.31,
    earth: 0.46,
    mars: 0.58,
    jupiter: 0.70,
    saturn: 0.79,
    uranus: 0.87,
    neptune: 0.94,
    pluto: 1.00
  };

  const daysSinceJ2000 = (Date.now() - J2000_EPOCH_MS) / 86400000;

  planets.forEach((p, idx) => {
    p.orbitSeconds = Number(p.orbitSeconds || (p.periodYears * EARTH_ORBIT_SECONDS));
    p.orbitDirection = p.key === 'venus' ? -1 : 1;
    if (p.key === 'venus') p.motion = 'Retrograde visual orbit; retrograde spin';
    p.visualOrbitRatio = orbitVisualMap[p.key] || 0.5;
    const baseDegrees = MEAN_LONGITUDE_J2000[p.key] ?? (idx * 40);
    const periodDays = Number(p.periodYears || 1) * EARTH_PERIOD_DAYS;
    const currentDegrees = baseDegrees + (daysSinceJ2000 / periodDays) * 360;
    p.baseAngle = (currentDegrees * Math.PI) / 180;
    preload(`assets/planets/${p.key}.png`);
  });

  preload('assets/planets/sun.png');
  preload('assets/planets/moon.png');
  buildDock();
  resize();
  showPlanet(planets.find(p => p.key === 'earth') || planets[0], false);

  updateSpeedButton();

  requestAnimationFrame(loop);
  setTimeout(() => {
    document.getElementById('loader')?.classList.add('hidden');
    introReady = true;
    introStartTime = null;
  }, 3000);
}

function preload(src) {
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img;
}

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cx = W / 2;
  cy = W < 760 ? H * 0.42 : H / 2;

  const minDim = Math.min(W, H);
  maxOrbitRadius = minDim * (W < 760 ? 0.42 : 0.44);

  const starCount = W < 760 ? 85 : 150;
  starSeed = Array.from({ length: starCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1 + 0.2,
    a: Math.random() * 0.5 + 0.18
  }));
}

function drawStars() {
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, H);

  for (const s of starSeed) {
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, TWO_PI);
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.fill();
  }
}

function drawSun() {
  const r = Math.max(22, maxOrbitRadius * 0.105);

  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8);
  outerGlow.addColorStop(0, 'rgba(255,214,112,.24)');
  outerGlow.addColorStop(0.45, 'rgba(255,160,40,.10)');
  outerGlow.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.8, 0, TWO_PI);
  ctx.fillStyle = outerGlow;
  ctx.fill();

  const glowRing = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.2);
  glowRing.addColorStop(0, 'rgba(255,246,200,.96)');
  glowRing.addColorStop(0.55, 'rgba(255,197,92,.98)');
  glowRing.addColorStop(1, 'rgba(237,147,40,.98)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fillStyle = glowRing;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#b9651f';
  [[-0.24, -0.18, 0.18], [0.22, 0.1, 0.16], [-0.04, 0.26, 0.12]].forEach(([ox, oy, rr]) => {
    ctx.beginPath();
    ctx.arc(cx + ox * r, cy + oy * r, rr * r, 0, TWO_PI);
    ctx.fill();
  });
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return r;
}

function drawOrbit(orbitR) {
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(255,255,255,.075)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function getMoonPosition(earthX, earthY, earthRadius) {
  const orbitR = Math.max(18, earthRadius * 3.4);
  const angle = 0.9 + (simulationSeconds / MOON_ORBIT_SECONDS) * TWO_PI;
  return {
    x: earthX + Math.cos(angle) * orbitR,
    y: earthY + Math.sin(angle) * orbitR,
    orbitR,
    r: Math.max(3, earthRadius * 0.34)
  };
}

function drawMoon(earthX, earthY, earthRadius, isActive) {
  const moon = getMoonPosition(earthX, earthY, earthRadius);
  ctx.beginPath();
  ctx.arc(earthX, earthY, moon.orbitR, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(255,255,255,.13)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (isActive) {
    const halo = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 4);
    halo.addColorStop(0, 'rgba(230,230,230,.45)');
    halo.addColorStop(1, 'rgba(230,230,230,0)');
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r * 4, 0, TWO_PI);
    ctx.fillStyle = halo;
    ctx.fill();
  }
  const shade = ctx.createRadialGradient(moon.x - moon.r * .35, moon.y - moon.r * .35, 0, moon.x, moon.y, moon.r * 1.2);
  shade.addColorStop(0, '#eeeeee');
  shade.addColorStop(.62, '#aaa');
  shade.addColorStop(1, '#555');
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, moon.r, 0, TWO_PI);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  return moon;
}

function drawSaturnRing(x, y, r, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.28);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 2.2, r * 0.92, 0, 0, TWO_PI);
  ctx.strokeStyle = active ? 'rgba(233,216,167,.82)' : 'rgba(228,208,155,.62)';
  ctx.lineWidth = Math.max(1.6, r * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawEarthAccent(x, y, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(74, 177, 99, .9)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.05, r * 0.28, r * 0.18, -0.2, 0, TWO_PI);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.18, y + r * 0.12, r * 0.18, r * 0.12, 0.5, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.44)';
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.arc(x + r * 0.08, y - r * 0.06, r * 0.56, -2.4, -0.9);
  ctx.stroke();
  ctx.restore();
}

function drawJupiterBands(x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.clip();
  const bands = [
    ['rgba(150,95,45,.30)', -0.52, 0.22],
    ['rgba(245,225,180,.18)', -0.16, 0.16],
    ['rgba(157,103,58,.26)', 0.10, 0.18],
    ['rgba(114,78,48,.25)', 0.42, 0.20]
  ];
  bands.forEach(([color, yOffset, h]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y + yOffset * r, r * 2, h * r);
  });
  ctx.fillStyle = 'rgba(195,95,60,.65)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.26, y + r * 0.16, r * 0.22, r * 0.14, -0.1, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function drawPlanetBody(p, x, y, r) {
  const shade = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.1, x, y, r * 1.08);
  shade.addColorStop(0, 'rgba(255,255,255,.42)');
  shade.addColorStop(0.24, p.color);
  shade.addColorStop(1, 'rgba(0,0,0,.28)');

  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fillStyle = shade;
  ctx.fill();

  if (p.key === 'earth') {
    drawEarthAccent(x, y, r);
  } else if (p.key === 'jupiter') {
    drawJupiterBands(x, y, r);
  } else if (p.key === 'saturn') {
    ctx.save();
    ctx.strokeStyle = 'rgba(168,136,72,.28)';
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.04, r * 0.62, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  } else if (p.key === 'neptune' || p.key === 'uranus') {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.08, y - r * 0.18, r * 0.52, r * 0.14, -0.2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  } else if (p.key === 'venus') {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#fff4d8';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.78, r * 0.22, 0.25, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlanet(p, x, y, isActive) {
  let r = p.nodeRadius * (isActive ? 1.34 : 1);
  if (p.key === 'jupiter') r *= 1.06;
  if (p.key === 'pluto') r *= 0.92;

  if (isActive) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    halo.addColorStop(0, `${p.color}66`);
    halo.addColorStop(1, `${p.color}00`);
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, TWO_PI);
    ctx.fillStyle = halo;
    ctx.fill();
  }

  if (p.key === 'saturn') {
    drawSaturnRing(x, y, r, isActive);
  }

  drawPlanetBody(p, x, y, r);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.strokeStyle = isActive ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = isActive ? 1.6 : 1;
  ctx.stroke();

  if (isActive) {
    const labelY = y > cy ? y - r - 10 : y + r + 15;
    ctx.font = '650 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, x, labelY);
  }
}


function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function getPlanetAngle(p) {
  const orbitSeconds = Math.max(0.001, p.orbitSeconds);
  const direction = p.orbitDirection === -1 ? -1 : 1;
  const baseAngle = Number.isFinite(p.baseAngle) ? p.baseAngle : 0;
  return baseAngle + direction * (simulationSeconds / orbitSeconds) * TWO_PI;
}

function loop(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (introReady && introStartTime === null) introStartTime = now;
  const introProgressRaw = introStartTime === null ? 0 : Math.min(1, (now - introStartTime) / (INTRO_DURATION * 1000));
  const introProgress = prefersReduced ? 1 : easeOutCubic(introProgressRaw);
  const introActive = introStartTime !== null && introProgressRaw < 1;

  // Freeze the simulation clock while the loader and intro twirl are running.
  // This prevents the planets from drifting under the entrance animation and avoids the end-of-twirl snap.
  if (!paused && !prefersReduced && introReady && !introActive) {
    simulationSeconds += dt * speedMultiplier;
  }

  drawStars();
  const sunRadius = drawSun();

  positions = [{ key: 'sun', x: cx, y: cy, r: sunRadius + 18 }];
  for (const p of planets) {
    const orbitR = p.visualOrbitRatio * maxOrbitRadius;
    drawOrbit(orbitR);

    const targetAngle = getPlanetAngle(p);
    let angle = targetAngle;
    let renderedOrbitR = orbitR;

    if (introActive) {
      const twirlTurns = p.key === 'venus' ? -2.35 : 2.35;
      const spinOffset = (1 - introProgress) * TWO_PI * twirlTurns;
      angle = targetAngle + spinOffset;
      renderedOrbitR = Math.max(0, orbitR * introProgress);
    }

    const px = cx + Math.cos(angle) * renderedOrbitR;
    const py = cy + Math.sin(angle) * renderedOrbitR;
    const hot = hovered === p.key || selected === p.key;

    drawPlanet(p, px, py, hot);
    positions.push({ key: p.key, x: px, y: py, r: Math.max(25, p.nodeRadius + 16) });

    if (p.key === 'earth') {
      const earthR = p.nodeRadius * (hot ? 1.34 : 1);
      const moon = drawMoon(px, py, earthR, hovered === 'moon' || selected === 'moon');
      positions.push({ key: 'moon', x: moon.x, y: moon.y, r: Math.max(18, moon.r + 12) });
    }
  }

  requestAnimationFrame(loop);
}


function playPlanetTone(p) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const freq = PLANET_TONES[p.key] || 330;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (error) {
    // Audio can fail silently on unsupported browsers.
  }
}


function playUiTone(multiplier, isPaused) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const tones = { 0: 220, 1: 330, 2: 392, 4: 494, 8: 587, 16: 698 };
    const base = tones[multiplier] || 330;
    osc.type = isPaused ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(isPaused ? base * 0.75 : base * 1.18, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch (error) {
    // Ignore audio errors.
  }
}

function buildDock() {
  dock.innerHTML = '';
  [SUN_DATA, ...planets].forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.key = p.key;
    btn.innerHTML = `<img class="planet-thumb" src="assets/planets/${p.key}.png" alt="${p.name}" /><span>${p.name}</span>`;
    btn.addEventListener('click', () => showPlanet(p, true));
    dock.appendChild(btn);
  });
}

function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = seconds / 60;
  if (minutes < 120) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return 'Not available';
  if (km >= 1000000000) return `${(km / 1000000000).toFixed(2)} billion km`;
  if (km >= 1000000) return `${(km / 1000000).toFixed(1)} million km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function getApproxEarthDistance(p) {
  if (p.key === 'sun') return '149.6 million km average';
  if (p.key === 'moon') return '384,400 km average';
  if (p.key === 'earth') return 'You are here';

  const earth = planets.find(item => item.key === 'earth');
  if (!earth || !REAL_ORBIT_AU[p.key]) return 'Not available';

  const earthAngle = getPlanetAngle(earth);
  const planetAngle = getPlanetAngle(p);
  const a = REAL_ORBIT_AU[p.key];
  const delta = planetAngle - earthAngle;
  const distanceAU = Math.sqrt(1 + a * a - 2 * a * Math.cos(delta));
  return `${formatDistanceKm(distanceAU * AU_IN_KM)} approx.`;
}

function showPlanet(p, open = true) {
  selected = p.key;
  if (open) playPlanetTone(p);

  document.querySelectorAll('#planetDock button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === p.key);
  });

  const infoImage = document.getElementById('infoImage');
  infoImage.src = `assets/planets/${p.key}.png`;
  infoImage.alt = `${p.name} image`;
  infoImage.classList.toggle('focus-uranus', p.key === 'uranus');
  document.getElementById('infoName').textContent = p.name;
  document.getElementById('infoType').textContent = p.type;
  document.getElementById('infoBadge').textContent = p.badge;
  document.getElementById('infoFact').textContent = p.kidFact;
  document.getElementById('infoDistLabel').textContent = p.distanceLabel || 'Avg. distance from Sun';
  document.getElementById('infoDist').textContent = p.distance;
  const earthDistanceRow = document.getElementById('earthDistanceRow');
  document.getElementById('earthDistanceLabel').textContent = p.key === 'sun' ? 'Avg. distance from Earth' : 'Approx. distance from Earth';
  document.getElementById('infoEarthDist').textContent = getApproxEarthDistance(p);
  earthDistanceRow.hidden = false;
  document.getElementById('infoDiam').textContent = p.diameter;
  document.getElementById('infoMass').textContent = p.mass || 'Not available';
  document.getElementById('infoPeriod').textContent = p.revolution || p.year || (p.periodYears < 1 ? `${Math.round(p.periodYears * 365)} Earth days` : `${p.periodYears} Earth years`);
  document.getElementById('infoMotion').textContent = p.motion || (p.orbitDirection === -1 ? 'Retrograde visual orbit' : 'Prograde visual orbit');
  document.getElementById('infoDay').textContent = p.day;
  document.getElementById('infoMoons').textContent = p.moons;
  document.getElementById('infoDiscovery').textContent = p.discovery || 'No single discoverer/date.';

  if (open) info.classList.add('visible');
}

function pickPlanet(clientX, clientY, touchPadding = 0) {
  for (const pos of positions) {
    if (Math.hypot(clientX - pos.x, clientY - pos.y) < pos.r + touchPadding) {
      if (pos.key === 'sun') return SUN_DATA;
      if (pos.key === 'moon') return MOON_DATA;
      return planets.find(p => p.key === pos.key);
    }
  }
  return null;
}

canvas.addEventListener('mousemove', event => {
  const planet = pickPlanet(event.clientX, event.clientY);
  hovered = planet?.key || null;
  canvas.style.cursor = hovered ? 'pointer' : 'default';
});

canvas.addEventListener('mouseleave', () => {
  hovered = null;
  canvas.style.cursor = 'default';
});

canvas.addEventListener('click', event => {
  const planet = pickPlanet(event.clientX, event.clientY);
  if (planet) showPlanet(planet, true);
});

canvas.addEventListener('touchstart', event => {
  const touch = event.touches[0];
  const planet = pickPlanet(touch.clientX, touch.clientY, 12);
  if (planet) showPlanet(planet, true);
}, { passive: true });

document.getElementById('closeInfo').addEventListener('click', () => info.classList.remove('visible'));
function updateSpeedButton() {
  speedMultiplier = SPEED_STATES[speedStateIndex];
  paused = speedMultiplier === 0;
  const btn = document.getElementById('pauseBtn');
  btn.textContent = paused ? '▶' : `⏸ ${speedMultiplier}×`;
  btn.setAttribute('aria-label', paused ? 'Paused. Tap to play at 1x speed.' : `Playing at ${speedMultiplier}x speed. Tap to change speed.`);
}

document.getElementById('pauseBtn').addEventListener('click', function () {
  speedStateIndex = (speedStateIndex + 1) % SPEED_STATES.length;
  updateSpeedButton();
  playUiTone(speedMultiplier, paused);
});

const planetDockToggle = document.getElementById('planetDockToggle');
planetDockToggle?.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('dock-collapsed');
  planetDockToggle.textContent = collapsed ? '☰' : '‹';
  planetDockToggle.setAttribute('aria-expanded', String(!collapsed));
  planetDockToggle.setAttribute('aria-label', collapsed ? 'Show planet list' : 'Hide planet list');
  playUiTone(collapsed ? 0 : 2, collapsed);
});

window.addEventListener('resize', resize);

init();
