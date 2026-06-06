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
let scale = 1;
let paused = false;
let hovered = null;
let selected = null;
let planets = [];
let positions = [];
let starSeed = [];
let simulationSeconds = 0;
let lastFrameTime = null;

const imageCache = new Map();
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function init() {
  planets = Array.isArray(window.PLANET_DATA)
    ? window.PLANET_DATA
    : await fetch('data/planets.json').then(res => res.json());

  planets.forEach((p, idx) => {
    p.startAngle = idx * 0.72 + 0.3;
    p.orbitSeconds = Number(p.orbitSeconds || (p.periodYears * EARTH_ORBIT_SECONDS));
    p.orbitDirection = Number(p.orbitDirection || 1);
    preload(`assets/planets/${p.key}.png`);
  });

  preload('assets/planets/sun.png');
  buildDock();
  resize();
  showPlanet(planets.find(p => p.key === 'earth') || planets[0], false);

  if (prefersReduced) {
    paused = true;
    document.getElementById('pauseBtn').textContent = 'Resume';
  }

  requestAnimationFrame(loop);
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
  cy = H / 2;

  const minDim = Math.min(W, H);
  scale = (minDim * (W < 760 ? 0.39 : 0.43)) / 5.15;

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
  const r = Math.max(24, scale * 0.18);
  const img = imageCache.get('assets/planets/sun.png');

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
  glow.addColorStop(0, 'rgba(255,220,120,.45)');
  glow.addColorStop(0.55, 'rgba(255,150,40,.14)');
  glow.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6, 0, TWO_PI);
  ctx.fillStyle = glow;
  ctx.fill();

  if (img?.complete) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.fillStyle = '#ffe08b';
    ctx.fill();
  }

  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.56)';
  ctx.textAlign = 'center';
  ctx.fillText('Sun', cx, cy + r + 14);
}

function drawOrbit(orbitR) {
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR, 0, TWO_PI);
  ctx.strokeStyle = 'rgba(255,255,255,.075)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlanet(p, x, y, isActive) {
  let r = p.nodeRadius * (isActive ? 1.34 : 1);
  if (p.key === 'jupiter') r *= 1.06;
  if (p.key === 'pluto') r *= 0.92;

  const img = imageCache.get(`assets/planets/${p.key}.png`);

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
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.16);
    ctx.scale(1, 0.42);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.25, 0, TWO_PI);
    ctx.strokeStyle = 'rgba(230,210,150,.58)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.clip();
  if (img?.complete) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.strokeStyle = isActive ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = isActive ? 1.6 : 1;
  ctx.stroke();

  if (isActive) {
    ctx.font = '650 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, x, y + r + 15);
  }
}

function getPlanetAngle(p) {
  const orbitSeconds = Math.max(0.001, p.orbitSeconds);
  const direction = p.orbitDirection === -1 ? -1 : 1;
  return p.startAngle + direction * (simulationSeconds / orbitSeconds) * TWO_PI;
}

function loop(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (!paused && !prefersReduced) {
    simulationSeconds += dt;
  }

  drawStars();
  drawSun();

  positions = [];
  for (const p of planets) {
    const orbitR = p.orbitAU * scale;
    drawOrbit(orbitR);

    const angle = getPlanetAngle(p);
    const px = cx + Math.cos(angle) * orbitR;
    const py = cy + Math.sin(angle) * orbitR;
    const hot = hovered === p.key || selected === p.key;

    drawPlanet(p, px, py, hot);
    positions.push({ key: p.key, x: px, y: py, r: Math.max(25, p.nodeRadius + 16) });
  }

  requestAnimationFrame(loop);
}

function buildDock() {
  dock.innerHTML = '';
  planets.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.key = p.key;
    btn.innerHTML = `<i style="background:${p.color}"></i><span>${p.name}</span>`;
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

function showPlanet(p, open = true) {
  selected = p.key;

  document.querySelectorAll('#planetDock button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === p.key);
  });

  document.getElementById('infoImage').src = `assets/planets/${p.key}.png`;
  document.getElementById('infoImage').alt = `${p.name} image`;
  document.getElementById('infoDot').style.background = p.color;
  document.getElementById('infoDot').style.color = p.color;
  document.getElementById('infoName').textContent = p.name;
  document.getElementById('infoType').textContent = p.type;
  document.getElementById('infoBadge').textContent = p.badge;
  document.getElementById('infoFact').textContent = p.kidFact;
  document.getElementById('infoDist').textContent = p.distance;
  document.getElementById('infoDiam').textContent = p.diameter;
  document.getElementById('infoPeriod').textContent = p.year || (p.periodYears < 1 ? `${Math.round(p.periodYears * 365)} Earth days` : `${p.periodYears} Earth years`);
  document.getElementById('infoOrbitSeconds').textContent = formatSeconds(p.orbitSeconds);
  document.getElementById('infoMotion').textContent = p.motion || (p.orbitDirection === -1 ? 'Retrograde visual orbit' : 'Prograde visual orbit');
  document.getElementById('infoDay').textContent = p.day;
  document.getElementById('infoMoons').textContent = p.moons;
  document.getElementById('infoMission').textContent = p.mission;

  if (open) info.classList.add('visible');
}

function pickPlanet(clientX, clientY, touchPadding = 0) {
  for (const pos of positions) {
    if (Math.hypot(clientX - pos.x, clientY - pos.y) < pos.r + touchPadding) {
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
document.getElementById('closeIntro').addEventListener('click', () => {
  document.getElementById('introCard').style.display = 'none';
});

document.getElementById('pauseBtn').addEventListener('click', function () {
  paused = !paused;
  this.textContent = paused ? 'Resume' : 'Pause';
});

window.addEventListener('resize', resize);

init();
