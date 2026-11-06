// Full model validation: node tests/run-validation.js [seeds] [years]
import { runValidation } from '../src/engine/bots.js';

const seeds = Number(process.argv[2] ?? 200);
const years = Number(process.argv[3] ?? 5);
const t0 = Date.now();
const r = runValidation({ seeds, years });
const pct = (x) => `${(x * 100).toFixed(2)}%`.padStart(8);
console.log(`CFO Arena model validation: ${seeds} scenarios x ${years} years (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
console.log('Strategy           Mean alpha  Median   Std dev   Mean TSR  Bankrupt');
for (const x of r.rows) {
  console.log(`${x.name.padEnd(18)} ${pct(x.mean)}  ${pct(x.median)}  ${pct(x.sd)}  ${pct(x.meanTsr)}  ${pct(x.bankruptRate)}`);
}
console.log(`\nShare of score variance explained by the scenario (luck): ${pct(r.luckShare)}`);
console.log(`Share explained by strategy (skill):                        ${pct(r.skillShare)}`);
console.log(`Within the same scenario, share explained by strategy:      ${pct(r.skillShareWithinScenario)}`);
console.log('\nTextbook CFO beats, on the same scenario:');
for (const [k, v] of Object.entries(r.winRate)) console.log(`  ${k.padEnd(10)} ${pct(v)} of scenarios`);
const ok = r.rows[0].key === 'textbook';
console.log(ok ? '\nPASS: the Textbook CFO ranks first.' : '\nFAIL: the Textbook CFO does not rank first.');
process.exit(ok ? 0 : 1);
