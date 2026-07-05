// All game-balance knobs live here. Tune the game by editing this file.
export const WORLD = 12000;           // square world size, px. Fits a max-length serpent.
export const GRID = 100;              // background grid spacing, px
export const VIEW_W = 1600, VIEW_H = 900; // max world units ever visible (crops, never expands)
export const POINT_SPACING = 4;       // px between stored head-path points

export const BASE_SPEED = 150, BOOST_SPEED = 265;
export const START_MASS = 10, MIN_BOOST_MASS = 14;
export const BOOST_DRAIN = 9;         // mass/sec burned while boosting
export const MAX_SEGS = 520;          // max body segments (length cap)

export const BOT_COUNT = 20;
export const TARGET_FOOD = 1450, MAX_FOOD = 3000;

export const CELL = 120;              // spatial-hash cell size, px
export const CELLS = Math.ceil(WORLD / CELL);
export const STEP = 1 / 60;           // fixed simulation timestep, seconds

export const NEON = ['#00f0ff','#ff2df7','#7dff00','#ffe600','#ff7a00','#b46bff','#00ff9d','#ff3355'];
export const LS_KEY = 'neon-serpent-best';
