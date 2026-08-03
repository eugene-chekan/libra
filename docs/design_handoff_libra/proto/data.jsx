/* ── Libra Book Data ── */

const LIBRA_BOOKS = [
  { id: 1, title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', pct: 1, rating: 5, tags: ['Sci-Fi', 'Classic'], pages: 304, year: 1969, shelf: 'Completed', blurb: 'A groundbreaking novel of a world where people are neither male nor female, exploring themes of gender, politics, and what it means to be human.' },
  { id: 2, title: 'Piranesi', author: 'Susanna Clarke', pct: 0.72, rating: 4, tags: ['Fantasy', 'Mystery'], pages: 272, year: 2020, blurb: 'A man lives in a labyrinthine house of infinite halls, filled with statues and an ocean that floods the lower floors. But who is he, and how did he get there?', shelf: 'Currently Reading' },
  { id: 3, title: 'Exhalation', author: 'Ted Chiang', pct: 0.45, rating: 5, tags: ['Sci-Fi', 'Short Stories'], pages: 352, year: 2019, blurb: 'Nine deeply compelling stories that explore the nature of the universe—and what it means to be human.', shelf: 'Currently Reading' },
  { id: 4, title: 'Klara and the Sun', author: 'Kazuo Ishiguro', pct: 0.2, rating: 4, tags: ['Literary', 'Sci-Fi'], pages: 307, year: 2021, blurb: 'An Artificial Friend with outstanding observational qualities watches the world from a store shelf, waiting to be chosen by a customer.', shelf: 'Currently Reading' },
  { id: 5, title: 'The Overstory', author: 'Richard Powers', pct: 0, rating: 0, tags: ['Literary', 'Nature'], pages: 502, year: 2018, blurb: '', shelf: 'To Read' },
  { id: 6, title: 'Babel', author: 'R.F. Kuang', pct: 0.88, rating: 4, tags: ['Fantasy', 'Historical'], pages: 560, year: 2022, blurb: 'A thematic response to the legacy of empire and the violence of translation, set in a fantastical 1830s Oxford.', shelf: 'Currently Reading' },
  { id: 7, title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', pct: 1, rating: 5, tags: ['Literary', 'Gaming'], pages: 416, year: 2022, blurb: 'Two friends find their way back to each other and create a video game that makes them famous.', shelf: 'Completed' },
  { id: 8, title: 'Station Eleven', author: 'Emily St. John Mandel', pct: 0.6, rating: 4, tags: ['Sci-Fi', 'Literary'], pages: 333, year: 2014, blurb: '', shelf: 'Currently Reading' },
  { id: 9, title: 'Project Hail Mary', author: 'Andy Weir', pct: 1, rating: 5, tags: ['Sci-Fi', 'Adventure'], pages: 476, year: 2021, blurb: 'A lone astronaut must save the earth from disaster—but he cannot even remember his own name.', shelf: 'Completed' },
  { id: 10, title: 'The Midnight Library', author: 'Matt Haig', pct: 0, rating: 0, tags: ['Literary', 'Fantasy'], pages: 288, year: 2020, blurb: '', shelf: 'To Read' },
  { id: 11, title: 'Sea of Tranquility', author: 'Emily St. John Mandel', pct: 1, rating: 4, tags: ['Sci-Fi', 'Literary'], pages: 255, year: 2022, blurb: '', shelf: 'Completed' },
  { id: 12, title: 'The Ministry of Time', author: 'Kaliane Bradley', pct: 0, rating: 0, tags: ['Sci-Fi', 'Romance'], pages: 352, year: 2024, blurb: '', shelf: 'To Read' },
];

/* Cover color palette — deterministic per book id */
const COVER_PALETTES = [
  ['#8b5e3c', '#c4956a'], ['#5c6b5e', '#9aab8e'], ['#6b5a7b', '#a492b4'],
  ['#7a5c5c', '#b89090'], ['#5a6878', '#8ea0b4'], ['#8a7a5a', '#c4b88e'],
  ['#6a5a4a', '#a8957a'], ['#5a7a6a', '#8eb4a0'], ['#7a6a5a', '#b4a08e'],
  ['#5e6a7a', '#90a0b4'], ['#7a5a6a', '#b490a0'], ['#6a7a5a', '#a0b490'],
];

Object.assign(window, { LIBRA_BOOKS, COVER_PALETTES });
