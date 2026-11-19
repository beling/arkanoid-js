# AGENTS.md — Arkanoid

## Projekt

Przeglądarkowa gra Arkanoid: plansza rysowana na Canvas 2D, pięć poziomów, power-upy,
dźwięk generowany przez Web Audio i rekord zapisywany w `localStorage`. Cały kod to
waniliowy JavaScript bez modułów, transpilacji i bibliotek — gra działa po otwarciu
`index.html` bez żadnego kroku budowania.

## Twarde ograniczenia

- Bez builda, bez `package.json`, bez zależności i bez assetów pobieranych z sieci.
- Skrypty to klasyczne `<script src>` (nie `type="module"`), a kolejność w `index.html`
  ma znaczenie: `js/levels.js` musi załadować się przed `js/game.js`.
- Komentarze i wszystkie teksty interfejsu po polsku.
- Gra działa offline — żadnych zapytań sieciowych w czasie działania.

## Uruchomienie

- Bezpośrednio: otwórz `index.html` w przeglądarce.
- Przez serwer: `python3 -m http.server 8000`, potem `http://localhost:8000`.

## Mapa plików

- `index.html` — HUD, `canvas#game`, warstwa `.overlay` (menu/pauza/koniec), kolejność skryptów.
- `js/levels.js` — plansze w `window.ARKANOID_LEVELS`; format opisany w nagłówku pliku.
- `js/game.js` — cała gra w IIFE: stałe fizyki (początek pliku), `SoundEngine`, `Effects`, `Game`, pętla `requestAnimationFrame`.
- `css/style.css` — motyw neonowy, HUD, karty overlay, style mobilne i `prefers-reduced-motion`.

Gdzie szukać: geometria/fizyka/stany → `js/game.js`, plansze i trudność → `js/levels.js`,
wygląd → `css/style.css`, struktura UI → `index.html`.

## Konwencje

- 2 spacje wcięcia, średniki, pojedyncze cudzysłowy, `const`/`let`, funkcje strzałkowe
  dla helperów, klasy dla obiektów ze stanem.
- Logika gry żyje w IIFE `(() => { 'use strict'; ... })()`; poza nią wystawione są tylko
  `window.ARKANOID_LEVELS` i diagnostyczny uchwyt `window.arkanoid`.
- Komentarze po polsku i tylko tam, gdzie kod nie mówi sam za siebie; sekcje oddzielaj
  nagłówkami `/* ---------- Nazwa ---------- */`.
- Nowe teksty w UI dodawaj po polsku, w tonie zgodnym z istniejącymi.

## Weryfikacja

Nie ma testów ani lintera. Przed oddaniem zmiany:

```bash
node --check js/game.js js/levels.js
```

Potem otwórz grę i przejdź ręcznie: start z menu → rozbicie klocka → złapanie power-upa →
utrata życia → pauza (`P`/`Esc`) → przejście poziomu. Konsola ma być czysta. Stan gry
podejrzysz przez `window.arkanoid` (np. `arkanoid.state`, `arkanoid.bricks.length`).

## Granice zakresu

Nie dodawaj frameworka, bundlera, TypeScriptu, zależności npm, backendu, hostingu ani
analityki bez wyraźnej prośby. Gra ma pozostać statyczna i offline.
