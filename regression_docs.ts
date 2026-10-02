/**
 * Documentation consistency checks.
 *
 * Every version the app shows for a document (src/docVersions.ts) must
 * match the "| **Version** |" row in that document, and every document
 * listed must exist. Catches the drift where the Documentation page said
 * v1.15 / v2.9 / v1.9 while the files said 2.0 / 3.0 / 2.0.
 *
 * Usage: npx tsx regression_docs.ts   (non-zero exit on failure)
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DOCUMENTS } from './src/docVersions';

let failures = 0;
for (const doc of DOCUMENTS) {
  const path = join(process.cwd(), 'public', 'docs', `${doc.slug}.md`);
  if (!existsSync(path)) {
    failures++;
    console.log(`  FAIL  ${doc.id}: ${path} does not exist`);
    continue;
  }
  const match = readFileSync(path, 'utf-8').match(/\|\s*\*\*Version\*\*\s*\|\s*([^|]+?)\s*\|/);
  const fileVersion = match?.[1];
  if (fileVersion !== doc.version) {
    failures++;
    console.log(`  FAIL  ${doc.id}: app shows v${doc.version}, document says ${fileVersion ?? '(no Version row)'}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} documentation check failure(s).`);
  process.exit(1);
}
console.log('Documentation versions match.');
