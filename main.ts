// news-image-20261123-entry-c — variant C (magazine style)
// "The World in One Day — Monday 23 November 2026"
// A dense drawn newspaper front page: masthead, one huge central drawn
// illustration panel for the Gulf / Strait of Hormuz lead story, three named
// headline stories with small drawn panels, and a numbered story-index
// sidebar listing the rest of the day's stories across 7 regions.
// Drawn entirely in code with a 5x7 bitmap font; no network, no assets.
// Node 22+ stdlib only. Writes /output/entry.png (MAKEFUN_OUTPUT_DIR).

import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

export const WIDTH = 1024;
export const HEIGHT = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [247, 242, 231];
const INK: RGB = [24, 24, 24];
const RED: RGB = [176, 30, 36];
const BLUE: RGB = [29, 78, 137];
const NAVY: RGB = [18, 42, 74];
const TEAL: RGB = [46, 111, 142];
const SAND: RGB = [226, 208, 170];
const SAND_DARK: RGB = [203, 178, 132];
const CREAM_LINE: RGB = [200, 188, 160];
const WHITE: RGB = [255, 255, 255];
const SKY_TOP: RGB = [168, 208, 230];
const SKY_BOT: RGB = [214, 232, 242];
const SEA_TOP: RGB = [64, 128, 158];
const SEA_BOT: RGB = [28, 84, 112];
const ORANGE: RGB = [232, 120, 40];
const YELLOW: RGB = [244, 200, 80];
const GREY: RGB = [120, 120, 118];
const SMOKE: RGB = [150, 150, 148];

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(WIDTH * HEIGHT * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(WIDTH, x + w);
  const y1 = Math.min(HEIGHT, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * WIDTH + xx) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
}

function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(x, y, c);
    }
  }
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    setPixel(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}

// Filled triangle (scanline via barycentric sign test, small shapes only).
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minX = Math.max(0, Math.min(ax, bx, cx));
  const maxX = Math.min(WIDTH - 1, Math.max(ax, bx, cx));
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxY = Math.min(HEIGHT - 1, Math.max(ay, by, cy));
  const d = (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const s = ((x - cx) * (by - cy) - (bx - cx) * (y - cy)) / d;
      const t = ((ax - cx) * (y - cy) - (x - cx) * (ay - cy)) / d;
      if (s >= 0 && t >= 0 && s + t <= 1) setPixel(x, y, c);
    }
  }
}

// Starburst: radiating spikes from a centre, used for explosions.
function burst(cx: number, cy: number, r: number, c: RGB, spikes = 12): void {
  fillCircle(cx, cy, Math.max(2, Math.floor(r * 0.45)), c);
  for (let k = 0; k < spikes; k++) {
    const a = (k * 2 * Math.PI) / spikes;
    const len = r * (0.7 + ((k * 37) % 10) / 25);
    line(cx, cy, Math.round(cx + len * Math.cos(a)), Math.round(cy + len * Math.sin(a)), c);
  }
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (1 + WIDTH * 3)] = 0; // filter: none
    raw.set(px.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), y * (1 + WIDTH * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 bits, "1" = ink. Uppercase only; all story text
// is written in capitals, newspaper style.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "\u2022": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
};

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of text) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") fillRect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentred(cx: number, y: number, text: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, text, scale, c);
}

// Greedy word wrap; returns lines that fit maxW pixels at the given scale.
function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawLines(x: number, y: number, lines: string[], scale: number, c: RGB, lh: number): number {
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += lh;
  }
  return yy;
}

// ---------------------------------------------------------------- the news
// Monday 23 November 2026, as first reported that day. Wording stays close
// to the reports; nothing is invented beyond the refpack's sourced list.
const LEAD_HEADLINE = "WAR WIDENS IN THE GULF";
const LEAD_SUB = "IRAN-US WAR ENGULFS SAUDI ARABIA AND BAHRAIN";
const LEAD_CAPTION =
  "US BASE IN BAHRAIN HIT - HOUTHI MISSILE INTERCEPTED - TANKER INCIDENT IN THE GULF OF OMAN";

interface Panel {
  kicker: string;
  headline: string;
  sub: string;
  art: "cop" | "house" | "kyiv";
}

const PANELS: Panel[] = [
  {
    kicker: "CLIMATE - COP31, TURKIYE",
    headline: "COP31 TALKS BREAK DOWN",
    sub: "FINAL DRAFT OMITS THE WORDS 'FOSSIL FUELS'",
    art: "cop",
  },
  {
    kicker: "AMERICAS - WASHINGTON",
    headline: "DEMOCRATS CLINCH HISTORIC HOUSE MAJORITY",
    sub: "AT LEAST 258 SEATS - LARGEST SINCE 1992",
    art: "house",
  },
  {
    kicker: "EUROPE - UKRAINE",
    headline: "DRONE HITS BUILDING IN KYIV REGION",
    sub: "AT LEAST 14 PEOPLE MISSING, ZELENSKIY SAYS",
    art: "kyiv",
  },
];

interface Region {
  name: string;
  items: string[];
}

const REGIONS: Region[] = [
  {
    name: "MIDDLE EAST / GULF",
    items: [
      "IRAN-US WAR ENGULFS SAUDI ARABIA AND BAHRAIN",
      "IRGC MISSILES AND DRONES HIT A US BASE IN BAHRAIN",
      "HOUTHI MISSILE FIRED AT WESTERN SAUDI ARABIA",
      "SAUDI-LED COALITION INTERCEPTS THE MISSILE",
      "UKMTO: TANKER INCIDENT WITH MILITARY FORCES IN GULF OF OMAN",
      "IRANIAN ARMY: WHOLE STRAIT OF HORMUZ UNDER SURVEILLANCE",
    ],
  },
  {
    name: "EUROPE",
    items: [
      "RUSSIAN CARGO SHIP STILL ON FIRE OFF FINLAND",
      "UKRAINIAN DRONE ATTACK IN THE BALTIC SEA SET SHIP ABLAZE",
      "RUSSIAN DRONE HITS BUILDING IN KYIV REGION",
      "AT LEAST 14 PEOPLE MISSING, ZELENSKIY SAYS",
      "POLAND: RUSSIA ALLEGEDLY TRIED TWICE TO KILL A UKRAINIAN AMERICAN RAPPER",
      "THOUSANDS MARCH IN LISBON AS LIVING COSTS FUEL ANGER",
    ],
  },
  {
    name: "CLIMATE",
    items: [
      "COP31 FINAL DRAFT OMITS THE WORDS 'FOSSIL FUELS'",
      "UN CLIMATE TALKS BREAK DOWN WITH NO OVERARCHING AGREEMENT",
    ],
  },
  {
    name: "ASIA",
    items: [
      "INDONESIA: FIRE AT A CANDY FACTORY, 3 DEAD",
      "DOZENS OF WORKERS MISSING AFTER FACTORY FIRE",
      "NEPAL PM BALENDRA SHAH ON STATE VISIT TO INDIA",
      "SHAH HOLDS BILATERAL TALKS WITH PM MODI",
      "SOUTH KOREA EDUCATION MINISTER RESIGNS OVER AI CHEATING SCANDAL",
      "NVIDIA AI CHIPS TO CHINA: FRESH DETAILS ON ALICE HUANG NETWORK",
      "US TREASURY'S BESSENT SEEKS ANSWERS ON CHIP DIVERSION",
    ],
  },
  {
    name: "AMERICAS",
    items: [
      "DEMOCRATS CLINCH HISTORIC US HOUSE MAJORITY",
      "AT LEAST 258 SEATS - LARGEST SINCE 1992",
    ],
  },
  {
    name: "AFRICA",
    items: [
      "SOUTH SUDAN: SPLA-IO ATTACK LEAVES 24 CIVILIANS DEAD",
      "WHO: FIGHTING NEAR CONGO EBOLA AREA DISRUPTS RESPONSE",
      "MYANMAR ARMY-BACKED GOVERNMENT CALLS ASEAN DECISION 'UNFAIR AND IMBALANCED'",
    ],
  },
  {
    name: "SPORT & CULTURE",
    items: [
      "INDIA POST RECORD 720/9D IN WELLINGTON TEST VS NEW ZEALAND",
      "LIVERPOOL THRASH 10-MAN MAN UTD",
      "POCHETTINO'S FIRST MATCH ENDS IN DEFEAT",
      "HAMILTON-LECLERC COLLISION IN LAS VEGAS 'COMPLETELY UNACCEPTABLE'",
      "ITALIAN JEWELLER PAOLO BULGARI DIES AGED 89",
    ],
  },
];

const INDEX_TOTAL = REGIONS.reduce((n, r) => n + r.items.length, 0);
const STORY_TOTAL = 1 + PANELS.length + INDEX_TOTAL; // lead + panels + index

// ---------------------------------------------------------------- artwork
// Central panel: the Strait of Hormuz at dusk. Land on both sides (Iran on
// the left, Saudi Arabia on the right), a tanker in the strait, missile
// trails arcing over the water, explosions over Bahrain.
function drawLeadScene(x: number, y: number, w: number, h: number): void {
  // Sky in horizontal bands, light at the horizon.
  const skyH = Math.floor(h * 0.52);
  const bands = 6;
  for (let b = 0; b < bands; b++) {
    const t = b / (bands - 1);
    const c: RGB = [
      Math.round(SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * t),
      Math.round(SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * t),
      Math.round(SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * t),
    ];
    fillRect(x, y + Math.floor((skyH * b) / bands), w, Math.ceil(skyH / bands) + 1, c);
  }
  // Sea in horizontal bands, darker with depth.
  const seaY = y + skyH;
  const seaH = h - skyH;
  const sbands = 5;
  for (let b = 0; b < sbands; b++) {
    const t = b / (sbands - 1);
    const c: RGB = [
      Math.round(SEA_TOP[0] + (SEA_BOT[0] - SEA_TOP[0]) * t),
      Math.round(SEA_TOP[1] + (SEA_BOT[1] - SEA_TOP[1]) * t),
      Math.round(SEA_TOP[2] + (SEA_BOT[2] - SEA_TOP[2]) * t),
    ];
    fillRect(x, seaY + Math.floor((seaH * b) / sbands), w, Math.ceil(seaH / bands) + 1, c);
  }
  // Low sun, half-hidden by smoke.
  fillCircle(x + Math.floor(w * 0.78), y + 52, 30, YELLOW);
  circle(x + Math.floor(w * 0.78), y + 52, 30, ORANGE);
  fillCircle(x + Math.floor(w * 0.78), y + 52, 20, [250, 220, 130]);
  // Smoke clouds drifting from the left coast.
  fillCircle(x + 120, y + 46, 22, SMOKE);
  fillCircle(x + 150, y + 36, 26, SMOKE);
  fillCircle(x + 182, y + 48, 20, SMOKE);
  fillCircle(x + 148, y + 58, 18, [170, 170, 168]);

  // Iran — left headland.
  fillTriangle(x, y + skyH, x + 150, y + skyH, x, y + 96, SAND_DARK);
  fillRect(x, y + 96, 150, skyH - 96, SAND_DARK);
  fillRect(x, y + 96, 150, 4, [170, 145, 100]);
  // Saudi Arabia — right headland.
  fillTriangle(x + w, y + skyH, x + w - 170, y + skyH, x + w, y + 118, SAND);
  fillRect(x + w - 170, y + 118, 170, skyH - 118, SAND);
  fillRect(x + w - 170, y + 118, 170, 4, [190, 168, 120]);
  // Bahrain — small island in the strait, marked.
  fillCircle(x + Math.floor(w * 0.60), seaY + 26, 12, SAND);
  fillCircle(x + Math.floor(w * 0.60), seaY + 26, 12, SAND_DARK);
  fillRect(x + Math.floor(w * 0.60) - 12, seaY + 22, 24, 3, SAND_DARK);

  // Missile trails arcing from the Iranian coast across the strait.
  const trails: Array<[number, number, number, number]> = [
    [x + 60, y + 92, x + 520, y + 186],
    [x + 96, y + 108, x + 420, y + 190],
    [x + 40, y + 120, x + 120, y + 232],
  ];
  for (const [x0, y0, x1, y1] of trails) {
    line(x0, y0, x1, y1, WHITE);
    line(x0, y0 + 1, x1, y1 + 1, [220, 220, 210]);
    // dotted second line, a second missile in the same arc
    for (let t = 0; t <= 10; t++) {
      const px2 = Math.round(x0 + ((x1 - x0) * t) / 10);
      const py2 = Math.round(y0 + ((y1 - y0) * t) / 10) - 8;
      if (t % 2 === 0) fillRect(px2, py2, 3, 3, WHITE);
    }
  }
  // Warheads / impact bursts.
  burst(x + 520, y + 186, 26, ORANGE, 12);
  burst(x + 520, y + 186, 14, RED, 10);
  fillCircle(x + 520, y + 186, 6, YELLOW);
  burst(x + 420, y + 190, 13, ORANGE, 9);
  fillCircle(x + 420, y + 190, 4, YELLOW);
  burst(x + Math.floor(w * 0.60), seaY + 26, 22, ORANGE, 10);
  burst(x + Math.floor(w * 0.60), seaY + 26, 11, RED, 8);
  burst(x + 120, y + 232, 16, ORANGE, 9);
  fillCircle(x + 120, y + 232, 5, YELLOW);

  // Tanker crossing the strait, dark silhouette with a white wake.
  const tx = x + Math.floor(w * 0.42);
  const ty = seaY + 96;
  fillRect(tx - 8, ty + 26, 150, 4, WHITE); // wake
  fillRect(tx, ty + 30, 146, 4, [200, 225, 235]);
  fillRect(tx, ty, 140, 26, [30, 30, 32]); // hull
  fillRect(tx + 96, ty - 18, 30, 18, [30, 30, 32]); // bridge
  fillRect(tx + 20, ty - 10, 12, 10, [30, 30, 32]); // funnel
  fillRect(tx + 20, ty - 14, 12, 4, RED);
  fillRect(tx + 40, ty - 8, 44, 8, [52, 52, 54]); // deck tanks
  // Small escort boat.
  fillTriangle(tx + 168, ty + 18, tx + 196, ty + 18, tx + 182, ty + 30, [40, 40, 42]);

  // Labels, with a dark underlay so they read over sky and sea.
  const label = (lx: number, ly: number, s: string, scale: number, c: RGB): void => {
    fillRect(lx - 3, ly - 2, textWidth(s, scale) + 6, 7 * scale + 4, [20, 20, 20]);
    drawText(lx, ly, s, scale, c);
  };
  label(x + 14, y + 106, "IRAN", 2, WHITE);
  label(x + w - 158, y + 128, "SAUDI ARABIA", 2, WHITE);
  label(x + Math.floor(w * 0.60) - 30, seaY + 52, "BAHRAIN", 1, WHITE);
  const cxm = x + Math.floor(w * 0.5);
  fillRect(cxm - 98, seaY + 6, 196, 18, [20, 20, 20]);
  drawTextCentred(cxm, seaY + 8, "STRAIT OF HORMUZ", 2, WHITE);
  fillRect(cxm - 38, seaY + 26, 76, 11, [20, 20, 20]);
  drawTextCentred(cxm, seaY + 28, "GULF OF OMAN", 1, [220, 235, 240]);
}

// Small drawn panels for the three named headlines (96 x 104 each).
function drawMiniArt(kind: Panel["art"], x: number, y: number, w: number, h: number): void {
  if (kind === "cop") {
    // Globe over a warming sky, with a factory smoking below.
    fillRect(x, y, w, h, [214, 232, 242]);
    fillCircle(x + 48, y + 40, 26, TEAL);
    circle(x + 48, y + 40, 26, NAVY);
    line(x + 48, y + 14, x + 48, y + 66, [200, 225, 235]);
    line(x + 22, y + 40, x + 74, y + 40, [200, 225, 235]);
    fillCircle(x + 34, y + 30, 7, [90, 170, 120]);
    fillCircle(x + 62, y + 52, 8, [90, 170, 120]);
    fillRect(x + 8, y + 78, 34, 26, GREY);
    fillRect(x + 12, y + 62, 6, 16, GREY);
    fillCircle(x + 15, y + 56, 9, SMOKE);
    fillCircle(x + 22, y + 48, 11, SMOKE);
    fillRect(x + 52, y + 84, 36, 20, [90, 90, 92]);
    line(x + 52, y + 84, x + 88, y + 104, RED);
    line(x + 88, y + 84, x + 52, y + 104, RED);
  } else if (kind === "house") {
    // Capitol dome on navy, with the number 258 picked out in gold below it.
    fillRect(x, y, w, h, NAVY);
    fillCircle(x + 48, y + 44, 22, WHITE);
    fillRect(x + 26, y + 44, 44, 6, WHITE);
    fillRect(x + 20, y + 50, 56, 18, WHITE);
    for (let cx = 28; cx <= 68; cx += 10) fillRect(x + cx, y + 54, 4, 12, NAVY);
    fillRect(x + 46, y + 16, 4, 8, WHITE);
    fillRect(x + 50, y + 16, 18, 10, RED);
    drawText(x + 28, y + 72, "258", 2, YELLOW);
  } else {
    // Kyiv: a shelled apartment block, smoke rising, a drone overhead.
    fillRect(x, y, w, h, [196, 208, 220]);
    fillRect(x + 16, y + 44, 52, 60, [70, 70, 74]);
    for (let wy = 52; wy <= 88; wy += 12) {
      for (let wx = 24; wx <= 56; wx += 12) fillRect(x + wx, y + wy, 6, 7, YELLOW);
    }
    fillTriangle(x + 16, y + 44, x + 68, y + 44, x + 42, y + 26, [50, 50, 54]);
    fillCircle(x + 42, y + 20, 12, SMOKE);
    fillCircle(x + 52, y + 10, 14, SMOKE);
    fillCircle(x + 30, y + 12, 10, [170, 170, 168]);
    burst(x + 74, y + 34, 12, ORANGE, 8);
    fillRect(x + 76, y + 78, 14, 6, [30, 30, 32]); // drone body
    line(x + 70, y + 76, x + 96, y + 76, [30, 30, 32]);
    fillRect(x + 70, y + 90, 4, 10, GREY);
  }
}

// ---------------------------------------------------------------- layout
function drawMasthead(): void {
  drawTextCentred(512, 20, "THE WORLD IN ONE DAY", 7, INK);
  hline(24, 78, 976, INK, 2);
  hline(24, 82, 976, INK, 1);
  drawTextCentred(512, 90, "MONDAY 23 NOVEMBER 2026", 3, RED);
  drawTextCentred(
    512,
    118,
    `${STORY_TOTAL} STORIES - 7 REGIONS - ONE FRONT PAGE`,
    2,
    INK,
  );
  drawTextCentred(512, 142, LEAD_HEADLINE, 5, INK);
  drawTextCentred(512, 182, LEAD_SUB, 2, RED);
  hline(24, 202, 976, INK, 2);
  hline(24, 206, 976, INK, 1);
}

function drawLeadPanel(): void {
  const x = 24;
  const y = 212;
  const w = 640;
  const h = 322;
  rect(x, y, w, h, INK, 2);
  drawLeadScene(x + 2, y + 2, w - 4, h - 4 - 34);
  // Red "LEAD STORY" tag, top-left over the sky.
  fillRect(x + 10, y + 10, textWidth("LEAD STORY", 1) + 12, 13, RED);
  drawText(x + 16, y + 13, "LEAD STORY", 1, WHITE);
  // Caption strip at the foot of the panel.
  fillRect(x + 2, y + h - 36, w - 4, 34, NAVY);
  const cap = wrap(LEAD_CAPTION, w - 24, 1);
  drawLines(x + 12, y + h - 30, cap, 1, WHITE, 11);
}

function drawSidePanels(): void {
  const x = 680;
  const w = 320;
  let y = 212;
  for (const p of PANELS) {
    const h = 102;
    rect(x, y, w, h, INK, 2);
    drawMiniArt(p.art, x + 6, y + 6, 96, 90);
    rect(x + 6, y + 6, 96, 90, INK, 1);
    const tx = x + 112;
    const tw = w - 122;
    drawText(tx, y + 8, p.kicker, 1, RED);
    const head = wrap(p.headline, tw, 2);
    let yy = drawLines(tx, y + 22, head, 2, INK, 16);
    const sub = wrap(p.sub, tw, 1);
    drawLines(tx, yy + 4, sub, 1, INK, 10);
    y += h + 8;
  }
}

function drawIndex(): void {
  drawText(24, 548, `THE DAY IN BRIEF - ${INDEX_TOTAL} MORE STORIES, REGION BY REGION`, 2, RED);
  hline(24, 570, 976, INK, 2);
  const cols: Array<{ x: number; w: number; regions: number[] }> = [
    { x: 24, w: 312, regions: [0, 1] },
    { x: 352, w: 312, regions: [2, 3] },
    { x: 680, w: 320, regions: [4, 5, 6] },
  ];
  let n = 0;
  for (const col of cols) {
    let y = 584;
    for (const ri of col.regions) {
      const region = REGIONS[ri];
      drawText(col.x, y, region.name, 2, RED);
      hline(col.x, y + 16, col.w, CREAM_LINE, 1);
      y += 22;
      for (const item of region.items) {
        n++;
        const num = String(n).padStart(2, "0") + ".";
        const lines = wrap(item, col.w - 20, 1);
        drawText(col.x, y, num, 1, RED);
        drawLines(col.x + 20, y, lines, 1, INK, 12);
        y += lines.length * 12 + 7;
      }
      y += 6;
    }
  }
}

function drawFooter(): void {
  hline(24, 972, 976, INK, 1);
  drawTextCentred(
    512,
    984,
    "ALL STORIES AS FIRST REPORTED ON MONDAY 23 NOVEMBER 2026 - THE WORLD IN ONE DAY",
    1,
    INK,
  );
}

function main(): void {
  fillRect(0, 0, WIDTH, HEIGHT, PAPER);
  rect(4, 4, WIDTH - 8, HEIGHT - 8, INK, 3);
  drawMasthead();
  drawLeadPanel();
  drawSidePanels();
  drawIndex();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, encodePNG());
}

main();
