# Solar System Guide — Kids Edition

A minimal, mobile-friendly interactive solar-system guide for children around age 10, rebuilt from the uploaded canvas model.

## Physics rule applied

The animation now uses one locked model scale:

```text
Earth orbit = 36.5 seconds
planet model orbit = planet real orbital period in Earth years × 36.5 seconds
```

That means the planets keep their real orbital-period ratios relative to Earth:

| Body | Real orbital period | Model orbit time | Direction |
|---|---:|---:|---|
| Mercury | 0.240846 Earth years | 8.791 s | Prograde |
| Venus | 0.615198 Earth years | 22.455 s | Prograde orbit; retrograde spin |
| Earth | 1 Earth year | 36.500 s | Prograde |
| Mars | 1.8808 Earth years | 68.649 s | Prograde |
| Jupiter | 11.862 Earth years | 432.963 s | Prograde |
| Saturn | 29.457 Earth years | 1,075.180 s | Prograde |
| Uranus | 84.016846 Earth years | 3,066.615 s | Prograde |
| Neptune | 164.79132 Earth years | 6,014.883 s | Prograde |
| Pluto | 247.94 Earth years | 9,049.810 s | Prograde |

Venus now keeps a prograde orbit around the Sun, while its rotation/spin is described as retrograde. Data was reviewed against NASA/IAU/MPC-style public references in June 2026; small moon counts can change as new faint moons are confirmed.

## What changed

- Removed the speed modifier/slider.
- Replaced frame-based speed with elapsed-time physics.
- Earth completes one full revolution every 36.5 seconds.
- Every other body follows its real orbital-period ratio to Earth.
- Kept a pause/resume button only.
- Simplified the interface for a cleaner minimal look.
- Kept the press/tap planet behavior that opens an image and fact card.
- Kept local planet assets in `assets/planets`.

## Repository structure

```text
kids-solar-system-guide-physics/
├── index.html
├── src/
│   ├── main.js
│   └── styles.css
├── data/
│   ├── planets.json
│   └── planets.js
├── assets/
│   └── planets/
│       ├── sun.png
│       ├── mercury.png
│       ├── venus.png
│       ├── earth.png
│       ├── mars.png
│       ├── jupiter.png
│       ├── saturn.png
│       ├── uranus.png
│       ├── neptune.png
│       └── pluto.png
└── docs/
    └── original-solar-system-model.html
```

## How to run

Open `index.html` directly in a browser, or run a tiny local server:

```bash
python -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

## Notes

The visual orbit spacing is compressed so children can see all planets on one screen. The orbital *timing ratios* are the physics logic applied in the animation.


## v6 updates
- Added a 3-second loading screen at launch.
- Added subtle generated planet tones when clicking/tapping planets or the Moon.


## v7 changes
- Starts at 1x speed.
- Speed control cycles: ⏸ 1× → ⏸ 2× → ⏸ 4× → ⏸ 8× → ▶ paused.
- Premium 3-second kid-friendly loading screen.
- Planet positions are initialized from approximate J2000 mean longitudes and advance using real orbital period ratios.
- Info panel includes each body’s real revolution period.


## Data update notes

- Venus: prograde orbit; retrograde spin.
- Saturn moons: 285 confirmed, based on the 2026 IAU Minor Planet Center update available at build time. NASA pages may lag behind the latest MPC announcements.
- Uranus moons: 28 known on NASA's public fact page.
- Neptune: diameter updated to 49,528 km and moons to 16 known.


## v50 stability pass
- All visible interactive controls now trigger audio feedback where browser autoplay rules allow it.
- Solar system view has subtle pointer/touch parallax.
- Milky Way iframe overlay remains compatible with desktop and mobile.
- Sagittarius A*, Solar System return marker, telescope toggle, speed toggle, planet buttons, dock toggle, and close buttons were checked.
