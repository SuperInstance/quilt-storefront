// src/store.js — assemble the storefront: sheet + vendored engine + budgeted AI adapter.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuiltEngine } from '../vendor/quilt-engine/index.js';
import { StorefrontAI } from './ai-adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadSheet(sheetPath = path.join(HERE, '..', 'sheets', 'storefront.json')) {
  return JSON.parse(readFileSync(sheetPath, 'utf8'));
}

/**
 * Build a live storefront session.
 * @param {{sheet?: object, ai?: object, budgets?: Record<string, number>, failAll?: boolean}} opts
 *   ai: inject a mock adapter (tests); budgets: per-provider call caps for the real adapter.
 * @returns {{engine: QuiltEngine, ai: object, sheet: object}}
 */
export function makeStorefront({ sheet = loadSheet(), ai = undefined, budgets = undefined, failAll = false } = {}) {
  const adapter = ai ?? new StorefrontAI({ budgets, failAll });
  const engine = new QuiltEngine('quilt-storefront', { ai: adapter, eager: true });
  engine.loadSheet(sheet);
  return { engine, ai: adapter, sheet };
}

/** The scripted customer session (single source of truth for run + eval). */
export function loadBattery(batteryPath = path.join(HERE, '..', 'eval', 'battery.json')) {
  return JSON.parse(readFileSync(batteryPath, 'utf8'));
}
