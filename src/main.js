const bgCanvas = document.getElementById('parallaxLayer');
const bgCtx = bgCanvas.getContext('2d');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const infoBackdrop = document.getElementById('infoBackdrop');
const dock = document.getElementById('planetDock');
const telescopeBtn = document.getElementById('telescopeBtn');
const telescopeOverlay = document.getElementById('telescopeOverlay');
const telescopeFrame = document.getElementById('telescopeFrame');
const spinVideo = document.getElementById('spinVideo');
const spinCanvas = document.getElementById('spinCanvas');
const spinCtx = spinCanvas ? spinCanvas.getContext('2d') : null;

const TWO_PI = Math.PI * 2;
const PERF_DPR_LIMIT = window.innerWidth < 760 ? 1.0 : 1.5;
const MAIN_FRAME_INTERVAL_MS = window.innerWidth < 760 ? 1000 / 30 : 1000 / 60;
const BG_FRAME_INTERVAL_MS = window.innerWidth < 760 ? 66 : 34;
let lastBgDrawTime = -Infinity;
let lastMainDrawTime = -Infinity;
let mainRafId = null;
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
let asteroidSeed = [];
let kuiperSeed = [];
let simulationSeconds = 0;
let lastFrameTime = null;
let currentInfoBody = null;
let introReady = false;
let introStartTime = null;
const INTRO_DURATION = 4.2;

const imageCache = new Map();
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioCtx = null;
let lastTouchTime = 0;
let layerParallaxTargetX = 0;
let layerParallaxTargetY = 0;
let layerParallaxX = 0;
let layerParallaxY = 0;
let lastParallaxInputTime = 0;
const PLANET_TONES = { sun: 196, mercury: 262, venus: 294, earth: 330, mars: 349, jupiter: 392, saturn: 440, uranus: 494, neptune: 523, pluto: 587, moon: 659 };

// Keep the mobile page fixed: no browser pinch zoom or scroll gestures over the canvas.
document.addEventListener('gesturestart', event => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', event => event.preventDefault(), { passive: false });
document.addEventListener('gestureend', event => event.preventDefault(), { passive: false });

function isMobileViewport() {
  return W < 760 || window.matchMedia('(pointer: coarse)').matches;
}

function getPlanetVisualRadius(p, isActive = false) {
  // Mobile readability: make planets visible, but do NOT let the selected glow change hit logic.
  const mobile = isMobileViewport();
  const mobileBoost = mobile ? 1.34 : 1;
  const activeScale = mobile ? 1.03 : 1.18;
  let r = p.nodeRadius * mobileBoost * (isActive ? activeScale : 1);

  if (mobile) {
    const mobileMin = {
      mercury: 7.2,
      venus: 8.0,
      earth: 8.2,
      mars: 7.4,
      jupiter: 14.2,
      saturn: 11.8,
      uranus: 9.2,
      neptune: 8.8,
      pluto: 7.0
    };
    r = Math.max(r, mobileMin[p.key] || 7.4);
  }

  if (p.key === 'jupiter') r *= mobile ? 1.02 : 1.04;
  if (p.key === 'saturn' && mobile) r *= 0.96;
  if (p.key === 'pluto') r *= mobile ? 1.08 : 0.92;
  return r;
}

function getTapRadius(key, visualRadius, touchPadding = 0) {
  const mobile = isMobileViewport();
  if (mobile) {
    // Mobile targets must be helpful but not huge. Huge targets caused one tap to
    // select several nearby objects. The picker below chooses the nearest valid
    // object, so these are only the maximum acceptable touch distances.
    if (key === 'sun') return Math.max(14, Math.min(20, visualRadius * 0.82));
    if (key === 'moon') return Math.max(16, Math.min(22, visualRadius + 10));
    if (key === 'saturn') return Math.max(26, Math.min(40, visualRadius * 1.95));
    if (key === 'jupiter') return Math.max(24, Math.min(34, visualRadius + 9));
    return Math.max(22, Math.min(31, visualRadius + 8));
  }
  if (key === 'sun') return Math.max(20, visualRadius * 1.05);
  if (key === 'moon') return Math.max(13, visualRadius + 3);
  if (key === 'saturn') return Math.max(22, visualRadius * 1.75);
  return Math.max(18, visualRadius + touchPadding);
}


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
  badge: 'Our closest star',
  kidFact: 'The Sun is a star at the center of our solar system. It gives Earth light and heat, and its gravity keeps the planets moving around it.',
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
  mission: 'Look at the glow. The Sun’s energy helps plants, animals, and people live on Earth.'
};

const MOON_DATA = {
  key: 'moon',
  name: 'Moon',
  type: 'Natural Satellite',
  color: '#bfc3c7',
  badge: 'Earth’s moon',
  kidFact: 'The Moon is Earth’s natural satellite. It moves around Earth, and people have walked on it.',
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
  mission: 'Watch the Moon stay near Earth. It circles Earth while Earth circles the Sun.'
};


const ROTATION_PREVIEW = {
  sun: { noPreview: true },
  mercury: { tiltLabel: '0°', timeLabel: '58d 15.5h', spinDirection: 1, cycleSeconds: 6.4, arrow: 'top-left', scale: 1.0, useVideo: 'assets/rotation/mercury.mp4' },
  venus: { tiltLabel: '177.3°', timeLabel: '243d 26m', spinDirection: -1, cycleSeconds: 7.0, arrow: 'top-left', scale: 1.0, useVideo: 'assets/rotation/venus.mp4' },
  earth: { tiltLabel: '23.4°', timeLabel: '23h 56m', spinDirection: 1, cycleSeconds: 2.8, arrow: 'top-right', scale: 1.0, useVideo: 'assets/rotation/earth.mp4' },
  moon: { noPreview: true },
  mars: { tiltLabel: '25.2°', timeLabel: '1d 36m', spinDirection: 1, cycleSeconds: 3.0, arrow: 'top-right', scale: 1.0, useVideo: 'assets/rotation/mars.mp4' },
  jupiter: { tiltLabel: '3.1°', timeLabel: '9h 55m', spinDirection: 1, cycleSeconds: 1.8, arrow: 'left-low', scale: 1.0, useVideo: 'assets/rotation/jupiter.mp4' },
  saturn: { tiltLabel: '26.7°', timeLabel: '10h 40m', spinDirection: 1, cycleSeconds: 1.9, arrow: 'top-left', scale: 1.08, useVideo: 'assets/rotation/saturn.mp4' },
  uranus: { tiltLabel: '97.8°', timeLabel: '17h 14m', spinDirection: -1, cycleSeconds: 2.2, arrow: 'right-vertical', scale: 1.08, useVideo: 'assets/rotation/uranus.mp4' },
  neptune: { tiltLabel: '28.3°', timeLabel: '16h', spinDirection: 1, cycleSeconds: 2.1, arrow: 'top-right', scale: 1.0, useVideo: 'assets/rotation/neptune.mp4' },
  pluto: { noPreview: true }
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
    p.orbitDirection = 1;
    if (p.key === 'venus') p.motion = 'Prograde orbit; retrograde spin';
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

  startMainLoop();
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
  const dpr = Math.min(PERF_DPR_LIMIT, Math.max(1, window.devicePixelRatio || 1));
  W = window.innerWidth;
  H = window.innerHeight;
  bgCanvas.width = Math.floor(W * dpr);
  bgCanvas.height = Math.floor(H * dpr);
  bgCanvas.style.width = `${W}px`;
  bgCanvas.style.height = `${H}px`;
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cx = W / 2;
  cy = W < 760 ? H * 0.47 : H / 2;

  const minDim = Math.min(W, H);
  const mobileScale = H < 700 ? 0.36 : 0.39;
  maxOrbitRadius = minDim * (W < 760 ? mobileScale : 0.44);

  const starCount = W < 760 ? 110 : 210;
  starSeed = Array.from({ length: starCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 0.82 + 0.20,
    a: Math.random() * 0.26 + 0.14,
    tw: Math.random() * TWO_PI,
    twSpeed: Math.random() * 1.25 + 0.45,
    glow: Math.random() > 0.94
  }));

  const asteroidCount = W < 760 ? 135 : 270;
  asteroidSeed = Array.from({ length: asteroidCount }, () => ({
    angle: Math.random() * TWO_PI,
    radial: Math.random() - 0.5,
    size: Math.random() * 1.15 + 0.32,
    alpha: Math.random() * 0.26 + 0.16,
    drift: Math.random() * 0.012 + 0.002,
    phase: Math.random() * TWO_PI
  }));

  const kuiperCount = W < 760 ? 155 : 310;
  lastBgDrawTime = -Infinity;

  kuiperSeed = Array.from({ length: kuiperCount }, () => ({
    angle: Math.random() * TWO_PI,
    radial: Math.random() - 0.5,
    size: Math.random() * 0.94 + 0.25,
    alpha: Math.random() * 0.18 + 0.10,
    drift: Math.random() * 0.006 + 0.001,
    phase: Math.random() * TWO_PI
  }));
}

function drawStars() {
  bgCtx.fillStyle = '#02030a';
  bgCtx.fillRect(0, 0, W, H);

  const starOffsetX = layerParallaxX * -0.55;
  const starOffsetY = layerParallaxY * -0.55;
  for (const s of starSeed) {
    const x = ((s.x * W + starOffsetX) % W + W) % W;
    const y = ((s.y * H + starOffsetY) % H + H) % H;
    const pulse = 0.48 + 0.52 * Math.sin(simulationSeconds * s.twSpeed + s.tw);
    const alpha = Math.min(0.48, s.a * (0.55 + pulse * 0.45));
    const radius = s.r * (0.78 + pulse * 0.28);

    if (s.glow) {
      bgCtx.beginPath();
      bgCtx.arc(x, y, radius * 1.85, 0, TWO_PI);
      bgCtx.fillStyle = `rgba(145,180,255,${alpha * 0.05})`;
      bgCtx.fill();
    }

    bgCtx.beginPath();
    bgCtx.arc(x, y, radius, 0, TWO_PI);
    bgCtx.fillStyle = `rgba(235,243,255,${alpha})`;
    bgCtx.fill();
  }
}


function drawSelectedObjectGlow(x, y, r, color = '#ffd36f', intensity = 1) {
  ctx.save();
  const mobile = isMobileViewport();
  const outerScale = mobile ? 1.55 : 4.2;
  const softScale = mobile ? 1.18 : 2.15;
  const ringScale = mobile ? 1.12 : 1.55;
  const glowIntensity = mobile ? intensity * 0.46 : intensity;

  const outer = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * outerScale);
  outer.addColorStop(0, `${color}${mobile ? '16' : '42'}`);
  outer.addColorStop(0.5, `${color}${mobile ? '06' : '20'}`);
  outer.addColorStop(1, `${color}00`);
  ctx.beginPath();
  ctx.arc(x, y, r * outerScale, 0, TWO_PI);
  ctx.fillStyle = outer;
  ctx.fill();

  const softWhite = ctx.createRadialGradient(x, y, r * 0.75, x, y, r * softScale);
  softWhite.addColorStop(0, `rgba(255,255,255,${0.15 * glowIntensity})`);
  softWhite.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(x, y, r * softScale, 0, TWO_PI);
  ctx.fillStyle = softWhite;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r * ringScale, 0, TWO_PI);
  ctx.strokeStyle = `rgba(255,255,255,${0.28 * glowIntensity})`;
  ctx.lineWidth = Math.max(1, r * 0.055);
  ctx.stroke();

  ctx.restore();
}

function drawSun(isActive = false) {
  const mobile = isMobileViewport();
  const r = mobile ? Math.max(18, Math.min(28, maxOrbitRadius * 0.075)) : Math.max(22, maxOrbitRadius * 0.105);
  const sunGlowScale = mobile ? 1.45 : 2.8;

  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * sunGlowScale);
  outerGlow.addColorStop(0, mobile ? 'rgba(255,214,112,.16)' : 'rgba(255,214,112,.24)');
  outerGlow.addColorStop(0.45, mobile ? 'rgba(255,160,40,.055)' : 'rgba(255,160,40,.10)');
  outerGlow.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * sunGlowScale, 0, TWO_PI);
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

  if (isActive) {
    drawSelectedObjectGlow(cx, cy, r, '#ffcf6f', mobile ? 0.42 : 1.05);
    ctx.beginPath();
    ctx.arc(cx, cy, r * (mobile ? 1.05 : 1.62), 0, TWO_PI);
    ctx.strokeStyle = mobile ? 'rgba(255,230,160,.24)' : 'rgba(255,230,160,.62)';
    ctx.lineWidth = Math.max(1.4, r * 0.06);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.strokeStyle = isActive ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.16)';
  ctx.lineWidth = isActive ? 1.7 : 1;
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

function drawBeltDots(seedList, innerR, outerR, isKuiper = false, offsetX = 0, offsetY = 0) {
  const beltWidth = outerR - innerR;
  const beltCx = cx + offsetX;
  const beltCy = cy + offsetY;
  bgCtx.save();

  for (const rock of seedList) {
    const angle = rock.angle + simulationSeconds * rock.drift + rock.phase * 0.02;
    const radial = innerR + (beltWidth * 0.5) + rock.radial * beltWidth * 0.48;
    const x = beltCx + Math.cos(angle) * radial;
    const y = beltCy + Math.sin(angle) * radial;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;

    const twinkle = 0.72 + 0.28 * Math.sin(simulationSeconds * (isKuiper ? 0.45 : 0.9) + rock.phase);
    const alpha = Math.min(0.98, rock.alpha * twinkle);
    const dotSize = rock.size * (isKuiper ? 0.9 : 1.0);
    bgCtx.fillStyle = isKuiper ? `rgba(178,212,255,${alpha * 0.96})` : `rgba(235,210,160,${alpha})`;
    bgCtx.beginPath();
    bgCtx.arc(x, y, dotSize, 0, TWO_PI);
    bgCtx.fill();
  }
  bgCtx.restore();
}

function drawAsteroidBelt() {
  const innerR = maxOrbitRadius * 0.62;
  const outerR = maxOrbitRadius * 0.675;
  const offsetX = layerParallaxX * -0.38;
  const offsetY = layerParallaxY * -0.38;

  drawBeltDots(asteroidSeed, innerR, outerR, false, offsetX, offsetY);
}

function drawKuiperBelt() {
  const innerR = maxOrbitRadius * 1.03;
  const outerR = maxOrbitRadius * 1.13;
  const offsetX = layerParallaxX * -0.52;
  const offsetY = layerParallaxY * -0.52;

  drawBeltDots(kuiperSeed, innerR, outerR, true, offsetX, offsetY);
}

function getMoonPosition(earthX, earthY, earthRadius) {
  // Keep the Moon close to Earth visually so it never overlaps Mars' orbit path.
  const orbitR = Math.max(10, earthRadius * 1.9);
  const angle = 0.9 + (simulationSeconds / MOON_ORBIT_SECONDS) * TWO_PI;
  return {
    x: earthX + Math.cos(angle) * orbitR,
    y: earthY + Math.sin(angle) * orbitR,
    orbitR,
    r: Math.max(isMobileViewport() ? 4.2 : 3, earthRadius * (isMobileViewport() ? 0.38 : 0.34))
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
    drawSelectedObjectGlow(moon.x, moon.y, moon.r, '#d9dee8', selected === 'moon' ? 0.95 : 0.72);
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
  const r = getPlanetVisualRadius(p, isActive);

  if (isActive) {
    drawSelectedObjectGlow(x, y, r, p.color, selected === p.key ? 1.08 : 0.86);
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

function startMainLoop() {
  if (mainRafId !== null || document.hidden || document.body.classList.contains('telescope-open')) return;
  lastFrameTime = null;
  lastMainDrawTime = -Infinity;
  mainRafId = requestAnimationFrame(loop);
}

function stopMainLoop() {
  if (mainRafId !== null) {
    cancelAnimationFrame(mainRafId);
    mainRafId = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopMainLoop();
  } else if (!document.body.classList.contains('telescope-open')) {
    startMainLoop();
  }
});

function loop(now) {
  mainRafId = null;
  if (document.hidden || document.body.classList.contains('telescope-open')) return;
  if (now - lastMainDrawTime < MAIN_FRAME_INTERVAL_MS) {
    mainRafId = requestAnimationFrame(loop);
    return;
  }
  lastMainDrawTime = now;
  if (lastFrameTime === null) lastFrameTime = now;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (introReady && introStartTime === null) introStartTime = now;
  const introProgressRaw = introStartTime === null ? 0 : Math.min(1, (now - introStartTime) / (INTRO_DURATION * 1000));
  const introProgress = prefersReduced ? 1 : easeOutCubic(introProgressRaw);
  const introActive = introStartTime !== null && introProgressRaw < 1;

  if (Math.abs(layerParallaxTargetX - layerParallaxX) > 0.03 || Math.abs(layerParallaxTargetY - layerParallaxY) > 0.03) {
    layerParallaxX += (layerParallaxTargetX - layerParallaxX) * 0.055;
    layerParallaxY += (layerParallaxTargetY - layerParallaxY) * 0.055;
  } else {
    layerParallaxX = layerParallaxTargetX;
    layerParallaxY = layerParallaxTargetY;
  }

  // Freeze the simulation clock while the loader and intro twirl are running.
  // This prevents the planets from drifting under the entrance animation and avoids the end-of-twirl snap.
  if (!paused && !prefersReduced && introReady && !introActive) {
    simulationSeconds += dt * speedMultiplier;
  }

  const bgNeedsFrame = (now - lastBgDrawTime) >= BG_FRAME_INTERVAL_MS || Math.abs(layerParallaxTargetX - layerParallaxX) > 0.08 || Math.abs(layerParallaxTargetY - layerParallaxY) > 0.08;
  if (bgNeedsFrame) {
    drawStars();
    drawAsteroidBelt();
    drawKuiperBelt();
    lastBgDrawTime = now;
  }

  // The solar-system canvas is cleared and redrawn at the exact fixed center every frame.
  // Parallax is never applied to this canvas, so the Sun, planets, labels, and orbit lines cannot drift.
  ctx.clearRect(0, 0, W, H);
  const sunRadius = drawSun(hovered === 'sun' || selected === 'sun');

  positions = [{ key: 'sun', x: cx, y: cy, r: getTapRadius('sun', sunRadius, 0), visualR: sunRadius }];
  for (const p of planets) {
    const orbitR = p.visualOrbitRatio * maxOrbitRadius;
    drawOrbit(orbitR);

    const targetAngle = getPlanetAngle(p);
    let angle = targetAngle;
    let renderedOrbitR = orbitR;

    if (introActive) {
      const twirlTurns = 2.35;
      const spinOffset = (1 - introProgress) * TWO_PI * twirlTurns;
      angle = targetAngle + spinOffset;
      renderedOrbitR = Math.max(0, orbitR * introProgress);
    }

    const px = cx + Math.cos(angle) * renderedOrbitR;
    const py = cy + Math.sin(angle) * renderedOrbitR;
    const hot = hovered === p.key || selected === p.key;

    const planetVisualR = getPlanetVisualRadius(p, hot);
    const planetHitVisualR = getPlanetVisualRadius(p, false);
    drawPlanet(p, px, py, hot);
    positions.push({ key: p.key, x: px, y: py, r: getTapRadius(p.key, planetHitVisualR, isMobileViewport() ? 4 : 0), visualR: planetHitVisualR });

    if (p.key === 'earth') {
      const earthR = planetVisualR;
      const moon = drawMoon(px, py, earthR, hovered === 'moon' || selected === 'moon');
      positions.push({ key: 'moon', x: moon.x, y: moon.y, r: getTapRadius('moon', moon.r, isMobileViewport() ? 8 : 0), visualR: moon.r });
    }
  }

  drawSpinPreview(now);
  mainRafId = requestAnimationFrame(loop);
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

function playClickTone(kind = 'soft') {
  const presets = {
    soft: [420, 560, 0.16, 0.034],
    close: [260, 190, 0.18, 0.036],
    open: [360, 620, 0.2, 0.042]
  };
  const [startFreq, endFreq, duration, volume] = presets[kind] || presets.soft;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (error) {
    // Ignore audio errors.
  }
}

function updateLayerParallax(clientX, clientY) {
  // Only background stars and tiny belt particles respond to this. Sun, planets, labels, and orbit rings never use this offset.
  if (prefersReduced || document.body.classList.contains('telescope-open')) return;
  const now = performance.now();
  if (now - lastParallaxInputTime < 24) return;
  lastParallaxInputTime = now;
  const strength = W < 760 ? 8 : 14;
  layerParallaxTargetX = ((clientX - W / 2) / Math.max(1, W / 2)) * strength;
  layerParallaxTargetY = ((clientY - H / 2) / Math.max(1, H / 2)) * strength;
}

function resetLayerParallax() {
  layerParallaxTargetX = 0;
  layerParallaxTargetY = 0;
}

function playSwoosh(opening = true) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const duration = 0.55;
    const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8) * 0.42;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opening ? 380 : 900, now);
    filter.frequency.exponentialRampToValueAtTime(opening ? 1600 : 260, now + duration);
    filter.Q.value = 0.9;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter).connect(gain).connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + duration);

    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 180 : 480, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 620 : 160, now + duration * 0.88);
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.026, now + 0.03);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.9);
    osc.connect(oscGain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (error) {
    // Ignore audio errors.
  }
}

function resizeSpinCanvas() {
  if (!spinCanvas || !spinCtx) return;
  const dpr = Math.min(PERF_DPR_LIMIT, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(180, Math.round(spinCanvas.clientWidth || 280));
  const height = Math.max(120, Math.round(spinCanvas.clientHeight || 160));
  if (spinCanvas.width !== Math.floor(width * dpr) || spinCanvas.height !== Math.floor(height * dpr)) {
    spinCanvas.width = Math.floor(width * dpr);
    spinCanvas.height = Math.floor(height * dpr);
  }
  spinCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawArrowHead(ctx2d, x, y, angle, size) {
  ctx2d.save();
  ctx2d.translate(x, y);
  ctx2d.rotate(angle);
  ctx2d.beginPath();
  ctx2d.moveTo(0, 0);
  ctx2d.lineTo(-size, size * 0.62);
  ctx2d.lineTo(-size * 0.2, size * 1.08);
  ctx2d.lineTo(size * 0.16, size * 0.12);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function drawCurvedArrow(ctx2d, cx2, cy2, rx, ry, start, end, ccw) {
  ctx2d.beginPath();
  ctx2d.ellipse(cx2, cy2, rx, ry, 0, start, end, ccw);
  ctx2d.stroke();
  const ex = cx2 + Math.cos(end) * rx;
  const ey = cy2 + Math.sin(end) * ry;
  const tangent = ccw ? end - Math.PI / 2 : end + Math.PI / 2;
  drawArrowHead(ctx2d, ex, ey, tangent, 7);
}

function getRotationPreview(body) {
  return ROTATION_PREVIEW[body?.key] || ROTATION_PREVIEW.earth;
}

function drawPreviewStars(ctx2d, width, height) {
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 73) % 311) / 311 * width;
    const y = ((i * 47) % 191) / 191 * height;
    const r = (i % 3 === 0 ? 1.1 : 0.7);
    ctx2d.beginPath();
    ctx2d.arc(x, y, r, 0, TWO_PI);
    ctx2d.fillStyle = 'rgba(255,255,255,.55)';
    ctx2d.fill();
  }
}

function drawRotationArrowForBody(ctx2d, body, preview, width, height, radius) {
  ctx2d.save();
  ctx2d.strokeStyle = '#A8C7D2';
  ctx2d.fillStyle = '#A8C7D2';
  ctx2d.lineWidth = 3;
  const pos = preview.arrow || 'top-left';
  if (pos === 'right-vertical') {
    drawCurvedArrow(ctx2d, width * 0.86, height * 0.58, 14, 36, -Math.PI / 2, Math.PI / 2, false);
  } else if (pos === 'top-right') {
    drawCurvedArrow(ctx2d, width * 0.74, height * 0.18, 26, 14, Math.PI * 0.15, Math.PI * 0.95, true);
  } else if (pos === 'left-low') {
    drawCurvedArrow(ctx2d, width * 0.17, height * 0.56, 24, 12, Math.PI * 1.18, Math.PI * 0.18, false);
  } else {
    drawCurvedArrow(ctx2d, width * 0.18, height * 0.18, 26, 14, Math.PI * 1.15, Math.PI * 0.2, false);
  }
  ctx2d.restore();
}

function drawSpinPreview(now = performance.now()) {
  if (!currentInfoBody) return;
  const preview = getRotationPreview(currentInfoBody);
  const spinPreviewEl = document.getElementById('spinPreview');

  if (preview.noPreview) {
    if (spinVideo) {
      spinVideo.pause();
      spinVideo.removeAttribute('src');
      spinVideo.load();
      spinVideo.hidden = true;
    }
    if (spinCanvas) spinCanvas.hidden = true;
    if (spinPreviewEl) spinPreviewEl.hidden = true;
    return;
  }

  if (spinPreviewEl) spinPreviewEl.hidden = false;
  document.getElementById('spinTilt').textContent = `θ = ${preview.tiltLabel}`;
  document.getElementById('spinTime').textContent = preview.timeLabel;

  if (preview.useVideo && spinVideo) {
    spinCanvas.hidden = true;
    spinVideo.hidden = false;
    if (!spinVideo.src || !spinVideo.src.endsWith(preview.useVideo.replace('assets/', ''))) {
      spinVideo.src = preview.useVideo;
      spinVideo.currentTime = 0;
    }
    const playPromise = spinVideo.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
    return;
  }

  if (spinVideo) {
    spinVideo.pause();
    spinVideo.removeAttribute('src');
    spinVideo.load();
    spinVideo.hidden = true;
  }
  if (!spinCanvas || !spinCtx) return;
  spinCanvas.hidden = false;
  resizeSpinCanvas();
  const width = spinCanvas.clientWidth || 280;
  const height = spinCanvas.clientHeight || 160;
  const img = imageCache.get(`assets/planets/${currentInfoBody.key}.png`);
  const t = prefersReduced ? 0 : now / 1000;
  const spinAngle = (t / Math.max(1.4, preview.cycleSeconds || 3)) * TWO_PI * (preview.spinDirection || 1);
  const centerX = width * 0.5;
  const centerY = height * 0.56;
  const radius = Math.min(width * 0.24, height * 0.3) * (preview.scale || 1);

  spinCtx.clearRect(0, 0, width, height);
  spinCtx.fillStyle = '#000';
  spinCtx.fillRect(0, 0, width, height);
  drawPreviewStars(spinCtx, width, height);
  drawRotationArrowForBody(spinCtx, currentInfoBody, preview, width, height, radius);

  if (currentInfoBody.key === 'saturn') {
    spinCtx.save();
    spinCtx.translate(centerX, centerY);
    spinCtx.rotate(-0.34);
    spinCtx.strokeStyle = 'rgba(220,204,164,.95)';
    spinCtx.lineWidth = Math.max(2.2, radius * 0.16);
    spinCtx.beginPath();
    spinCtx.ellipse(0, 0, radius * 1.7, radius * 0.52, 0, 0, TWO_PI);
    spinCtx.stroke();
    spinCtx.restore();
  }

  const tiltValue = parseFloat(String(preview.tiltLabel).replace('°', '')) || 0;
  const axisAngle = -Math.PI / 2 + (tiltValue * Math.PI / 180);
  if (currentInfoBody.key === 'uranus') {
    spinCtx.save();
    spinCtx.strokeStyle = 'rgba(168,199,210,.6)';
    spinCtx.lineWidth = 2.2;
    spinCtx.beginPath();
    spinCtx.moveTo(centerX + radius * 1.4, centerY - radius * 0.95);
    spinCtx.lineTo(centerX + radius * 1.4, centerY + radius * 0.95);
    spinCtx.stroke();
    spinCtx.restore();
  } else {
    spinCtx.save();
    spinCtx.strokeStyle = 'rgba(168,199,210,.55)';
    spinCtx.lineWidth = 1.5;
    spinCtx.beginPath();
    spinCtx.moveTo(centerX - Math.cos(axisAngle) * radius * 0.92, centerY - Math.sin(axisAngle) * radius * 0.92);
    spinCtx.lineTo(centerX + Math.cos(axisAngle) * radius * 0.92, centerY + Math.sin(axisAngle) * radius * 0.92);
    spinCtx.stroke();
    spinCtx.restore();
  }

  spinCtx.save();
  spinCtx.beginPath();
  spinCtx.arc(centerX, centerY, radius, 0, TWO_PI);
  spinCtx.clip();
  if (img && img.complete) {
    spinCtx.translate(centerX, centerY);
    if (currentInfoBody.key !== 'saturn') spinCtx.rotate(spinAngle * 0.28);
    const drawSize = radius * 2.2;
    spinCtx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    spinCtx.translate(-centerX, -centerY);
  } else {
    spinCtx.fillStyle = currentInfoBody.color || '#7fb7ff';
    spinCtx.beginPath();
    spinCtx.arc(centerX, centerY, radius, 0, TWO_PI);
    spinCtx.fill();
  }
  const shift = Math.sin(spinAngle) * radius * 0.36;
  const grad = spinCtx.createLinearGradient(centerX - radius + shift, centerY, centerX + radius + shift, centerY);
  grad.addColorStop(0, 'rgba(0,0,0,.92)');
  grad.addColorStop(0.32, 'rgba(0,0,0,.40)');
  grad.addColorStop(0.56, 'rgba(255,255,255,.08)');
  grad.addColorStop(1, 'rgba(0,0,0,.08)');
  spinCtx.fillStyle = grad;
  spinCtx.fillRect(centerX - radius * 1.2, centerY - radius * 1.2, radius * 2.4, radius * 2.4);
  spinCtx.restore();

  if (currentInfoBody.key === 'saturn') {
    spinCtx.save();
    spinCtx.translate(centerX, centerY);
    spinCtx.rotate(-0.34);
    spinCtx.strokeStyle = 'rgba(102,82,49,.55)';
    spinCtx.lineWidth = Math.max(1.2, radius * 0.08);
    spinCtx.beginPath();
    spinCtx.ellipse(0, 0, radius * 1.28, radius * 0.38, 0, Math.PI * 0.08, Math.PI * 0.92);
    spinCtx.stroke();
    spinCtx.restore();
  }

  spinCtx.beginPath();
  spinCtx.arc(centerX, centerY, radius, 0, TWO_PI);
  spinCtx.strokeStyle = 'rgba(255,255,255,.18)';
  spinCtx.lineWidth = 1;
  spinCtx.stroke();
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
  currentInfoBody = p;
  const spinPreviewEl = document.getElementById('spinPreview');
  const preview = getRotationPreview(p);
  if (spinPreviewEl) spinPreviewEl.hidden = !!preview.noPreview;
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
  drawSpinPreview(performance.now());

  if (open) {
    info.classList.add('visible');
    document.body.classList.add('info-open');
  }
}


function getPlanetByKey(key) {
  if (key === 'sun') return SUN_DATA;
  if (key === 'moon') return MOON_DATA;
  return planets.find(p => p.key === key) || null;
}

function pickPlanetFromList(clientX, clientY, list = positions, touchPadding = 0) {
  const coarse = isMobileViewport();
  const candidates = [];

  for (const pos of list) {
    const visualR = pos.visualR || pos.r || 1;
    const hitRadius = pos.r || getTapRadius(pos.key, visualR, touchPadding);
    const distance = Math.hypot(clientX - pos.x, clientY - pos.y);
    if (distance > hitRadius) continue;

    // Mobile selection is based on the visible object center, not the largest
    // invisible hit zone. This prevents a tap near Jupiter or Mercury from being
    // stolen by the Sun or another large nearby planet.
    let score = distance / Math.max(visualR, 7);

    if (coarse) {
      if (pos.key === 'sun') score += 2.25;
      if (pos.key === 'saturn') score += distance > visualR * 1.1 ? 0.22 : 0;
      if (pos.key === 'moon') score -= 0.15;
      if (pos.key === 'earth') score -= 0.05;
    } else {
      if (pos.key === 'moon') score -= 0.08;
    }

    candidates.push({ key: pos.key, score, distance, visualR, hitRadius });
  }

  if (!candidates.length) return null;

  // If any real planet/moon is under the finger, do not let the Sun win unless
  // the tap was directly on the Sun with no other valid target.
  if (coarse && candidates.some(c => c.key !== 'sun')) {
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (candidates[i].key === 'sun') candidates.splice(i, 1);
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.distance - b.distance);
  return getPlanetByKey(candidates[0].key);
}


function pickPlanet(clientX, clientY, touchPadding = 0) {
  return pickPlanetFromList(clientX, clientY, positions, touchPadding);
}

function openFromPlanet(planet) {
  if (!planet) return false;
  showPlanet(planet, true);
  return true;
}

function openOrCloseFromPoint(clientX, clientY, touchPadding = 0) {
  if (info.classList.contains('visible')) return false;
  return openFromPlanet(pickPlanet(clientX, clientY, touchPadding));
}

canvas.addEventListener('mousemove', event => {
  updateLayerParallax(event.clientX, event.clientY);
  const planet = pickPlanet(event.clientX, event.clientY);
  hovered = planet?.key || null;
  canvas.style.cursor = hovered ? 'pointer' : 'default';
});

canvas.addEventListener('mouseleave', () => {
  hovered = null;
  resetLayerParallax();
  canvas.style.cursor = 'default';
});

let lastCanvasTapTime = 0;
let lastTouchEndTime = 0;

function handleCanvasTap(clientX, clientY, isTouch = false) {
  if (document.body.classList.contains('telescope-open')) return;
  const now = performance.now();
  if (now - lastCanvasTapTime < 180) return;

  const planet = pickPlanet(clientX, clientY, isTouch ? 0 : 0);

  if (info.classList.contains('visible')) {
    // New behavior: while the info card is open, tapping another visible planet
    // switches the card directly to that planet. Tapping empty space still closes.
    if (planet) {
      showPlanet(planet, true);
    } else {
      closeInfoPanel();
    }
    lastCanvasTapTime = now;
    return;
  }

  if (openFromPlanet(planet)) {
    lastCanvasTapTime = now;
  }
}

canvas.addEventListener('touchend', event => {
  if (!event.changedTouches || !event.changedTouches.length) return;
  event.preventDefault();
  const touch = event.changedTouches[0];
  lastTouchEndTime = performance.now();
  handleCanvasTap(touch.clientX, touch.clientY, true);
}, { passive: false });

canvas.addEventListener('click', event => {
  // iOS/Android often fires a synthetic click after touchend. Ignore it.
  if (performance.now() - lastTouchEndTime < 650) return;
  handleCanvasTap(event.clientX, event.clientY, false);
});

canvas.addEventListener('touchmove', event => {
  // Keep the page fixed and stop accidental browser panning/zooming over the app.
  event.preventDefault();
}, { passive: false });

canvas.addEventListener('touchstart', event => {
  if (event.touches && event.touches[0]) {
    updateLayerParallax(event.touches[0].clientX, event.touches[0].clientY);
  }
}, { passive: true });


const closeInfoButton = document.getElementById('closeInfo');
function closeInfoPanel(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (info.classList.contains('visible')) playClickTone('close');
  info.classList.remove('visible');
  document.body.classList.remove('info-open');
}

closeInfoButton.addEventListener('click', closeInfoPanel);

// Keep the information card open only when the user is interacting inside it.
// Canvas taps are handled by handleCanvasTap(): planet taps switch the panel,
// and empty-space taps close it. This listener covers every other outside area.
info.addEventListener('click', event => event.stopPropagation());
info.addEventListener('touchend', event => event.stopPropagation(), { passive: true });

document.addEventListener('click', event => {
  if (!info.classList.contains('visible')) return;
  if (document.body.classList.contains('telescope-open')) return;
  if (info.contains(event.target)) return;

  // Let the canvas decide whether the user tapped another planet or empty space.
  if (event.target === canvas || event.target === parallaxCanvas) return;

  closeInfoPanel(event);
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeInfoPanel(event);
});
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

function toggleTelescopeView(forceOpen) {
  const opening = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('telescope-open');
  document.body.classList.toggle('telescope-open', opening);
  telescopeOverlay?.setAttribute('aria-hidden', String(!opening));
  telescopeBtn?.setAttribute('aria-pressed', String(opening));
  telescopeBtn?.setAttribute('aria-label', opening ? 'Close telescope Milky Way view' : 'Open telescope Milky Way view');
  telescopeBtn.textContent = opening ? '✕' : '🔭';
  if (telescopeOverlay) telescopeOverlay.style.display = opening ? 'block' : '';
  if (opening) {
    info.classList.remove('visible');
    resetLayerParallax();
    stopMainLoop();
    if (telescopeFrame && !telescopeFrame.getAttribute('src')) telescopeFrame.setAttribute('src', 'milky_way_parallax.html');
  } else {
    resetLayerParallax();
    if (telescopeFrame) telescopeFrame.removeAttribute('src');
    startMainLoop();
  }
  playSwoosh(opening);
}

telescopeBtn?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  toggleTelescopeView();
});

window.addEventListener('message', event => {
  if (event.data?.type === 'solar-system-guide-close-telescope') {
    toggleTelescopeView(false);
  }
});

window.addEventListener('resize', () => { resize(); resizeSpinCanvas(); drawSpinPreview(performance.now()); });
window.visualViewport?.addEventListener('resize', resize);

init();
