/*
 * Poziomy gry Arkanoid.
 *
 * Legenda:
 *   '.' — puste pole
 *   '#' — zwykły klocek (10 pkt)
 *   '=' — wzmocniony klocek (20 pkt, dwa trafienia)
 *   '@' — stalowy klocek (niezniszczalny, blokuje piłkę)
 *
 * Każdy wiersz ma dokładnie 12 znaków, każdy poziom to siatka 12 kolumn.
 * 'speed' to bazowa prędkość piłki w pikselach na sekundę.
 */
window.ARKANOID_LEVELS = [
  {
    name: 'Rozgrzewka',
    speed: 400,
    palette: ['#38bdf8', '#22d3ee', '#2dd4bf', '#a3e635'],
    rows: [
      '............',
      '..########..',
      '..########..',
      '..########..',
    ],
  },
  {
    name: 'Piramida',
    speed: 425,
    palette: ['#f472b6', '#c084fc', '#818cf8', '#38bdf8', '#22d3ee'],
    rows: [
      '.....##.....',
      '....####....',
      '...######...',
      '..########..',
      '.##########.',
      '############',
    ],
  },
  {
    name: 'Twierdza',
    speed: 455,
    palette: ['#fbbf24', '#fb923c', '#f87171', '#c084fc', '#60a5fa'],
    rows: [
      '@..........@',
      '.==######==.',
      '..==####==..',
      '...######...',
      '....####....',
      '.....==.....',
    ],
  },
  {
    name: 'Kratownica',
    speed: 485,
    palette: ['#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'],
    rows: [
      '##..####..##',
      '##..####..##',
      '.##..@@..##.',
      '..##....##..',
      '...######...',
      '....####....',
    ],
  },
  {
    name: 'Ostatnia linia',
    speed: 520,
    palette: ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'],
    rows: [
      '##=##==##=##',
      '#==#@@@@#==#',
      '#=##=##=##=#',
      '##==####==##',
      '.##=######=.',
      '..########..',
      '....####....',
    ],
  },
];
