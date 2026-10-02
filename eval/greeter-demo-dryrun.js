// eval/greeter-demo-dryrun.js — BUILD + DRY-RUN for the greeter-joint demo
// (wave-71, lane 71-c). ZERO NETWORK, ZERO model calls.
//
//   1. builds eval/greeter-demo-sheet.json = live sheet @ 7178b4a + additive
//      patch (greeter-lexicon cell + one appended router rule), asserted
//      additivity-clean;
//   2. asserts every battery item routes/serves/keys as pre-declared (the
//      assertions the seal binds);
//   3. prints the battery sha256 that binds eval/greeter-battery.json into the
//      fleet-seeds claims (seeds/preregister-71c.json).
import fs from 'node:fs';
import { buildDemoSheet, assertAdditivity, assertBattery, sha256File } from './greeter-demo-common.js';

const liveSheet = JSON.parse(fs.readFileSync(new URL('../sheets/storefront.json', import.meta.url), 'utf8'));
const batteryPath = new URL('./greeter-battery.json', import.meta.url).pathname;
const battery = JSON.parse(fs.readFileSync(batteryPath, 'utf8'));

const { sheet: demoSheet, patch } = buildDemoSheet(liveSheet, battery);
assertAdditivity(liveSheet, demoSheet, battery);
const outPath = new URL('./greeter-demo-sheet.json', import.meta.url).pathname;
const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
const serialized = JSON.stringify(demoSheet, null, 2) + '\n';
if (existing !== serialized) {
  fs.writeFileSync(outPath, serialized);
  console.log(`demo sheet: ${existing ? 'REGENERATED (drift!)' : 'written'} → ${outPath}`);
} else {
  console.log('demo sheet: byte-stable, no rewrite');
}

const findings = await assertBattery(demoSheet, battery);
console.log(`\ngreeter moments (${findings.greeter.length}):`);
for (const r of findings.greeter) console.log(`  ${r.id} ${r.key.padEnd(12)} ${Object.values(r.checks).every(v => v === 'ok') ? 'OK' : 'BAD ' + JSON.stringify(r.checks)}`);
console.log(`fact controls (${findings.controls.length}):`);
for (const r of findings.controls) console.log(`  ${r.id} frozen=${r.frozen ? 1 : 0}(expect ${r.expectFrozen ? 1 : 0}) expected=${r.expected} ${Object.values(r.checks).every(v => v === 'ok') ? 'OK' : 'BAD ' + JSON.stringify(r.checks)}`);
console.log('frozen table:', findings.frozenTable);
console.log('\nDRY-RUN VERDICT:', findings.ok ? 'ALL ASSERTIONS PASS — battery is sealed-shape' : 'ASSERTIONS FAILED — fix before sealing');

console.log('\nsha256(greeter-battery.json) =', sha256File(batteryPath));
console.log('greeter rule keywords:', JSON.stringify(battery.greeterRuleKeywords));
console.log('additive patch: rule route=greeter-lexicon appended LAST; cell greeter-lexicon (lookup, default=null)');
if (!findings.ok) process.exit(1);
