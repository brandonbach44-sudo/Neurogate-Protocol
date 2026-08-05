/**
 * Minimal terminal prompt helpers for the CLI, built on Node's built-in
 * readline/promises -- deliberately zero external dependencies (no
 * inquirer/prompts/clack). This keeps packages/cli's dependency surface
 * small, which matters once it's packaged as a single-executable binary
 * via Node's SEA feature (see Documents/NeuroGate_Phase_Roadmap.md,
 * "Phase 4/6 Revision," Step 2) -- fewer bundled dependencies means a
 * smaller, more auditable binary.
 *
 * NODE-ONLY.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = createInterface({ input: stdin, output: stdout });

/** Ask a free-text question. Returns the trimmed answer. */
export async function askText(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || '';
}

/** Ask a yes/no question. Returns a boolean. */
export async function askYesNo(question: string, defaultValue = false): Promise<boolean> {
  const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
  const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === 'y' || answer === 'yes';
}

/**
 * Ask a free-text question that cannot be skipped with a blank Enter --
 * silently re-asks the same question (no error text) until a non-empty
 * answer is given. Use this instead of askText() for fields where blank
 * input would otherwise only get caught later by export-blocking
 * validation (e.g. author name) -- catching it at the prompt itself is
 * harder to blow past than a downstream error.
 */
export async function askRequiredText(question: string): Promise<string> {
  while (true) {
    const answer = (await rl.question(`${question}: `)).trim();
    if (answer) return answer;
  }
}

/**
 * Ask a yes/no question with no default -- silently re-asks the same
 * question (no error text) on a blank Enter or anything other than an
 * explicit y/n, instead of falling back to a default answer. Use this
 * for compliance-sensitive confirmations (e.g. defacing) where accepting
 * a blank as "No" makes it too easy to blow past the question without
 * reading it.
 */
export async function askYesNoRequired(question: string): Promise<boolean> {
  while (true) {
    const answer = (await rl.question(`${question} [y/n]: `)).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
  }
}

/** Ask for a positive integer, re-prompting on invalid input. */
export async function askNumber(question: string, defaultValue?: number): Promise<number> {
  while (true) {
    const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    if (!answer && defaultValue !== undefined) return defaultValue;
    const n = Number(answer);
    if (Number.isFinite(n)) return n;
    stdout.write('  Please enter a number.\n');
  }
}

/** Present a numbered list of choices, re-prompting until a valid index is chosen. Returns the chosen option's value. */
export async function askChoice<T extends string>(
  question: string,
  choices: { value: T; label: string; description?: string }[],
  defaultIndex = 0,
): Promise<T> {
  stdout.write(`${question}\n`);
  choices.forEach((c, i) => {
    const marker = i === defaultIndex ? '*' : ' ';
    stdout.write(`  ${marker} ${i + 1}) ${c.label}${c.description ? ` -- ${c.description}` : ''}\n`);
  });
  while (true) {
    const answer = (await rl.question(`Choose 1-${choices.length} [${defaultIndex + 1}]: `)).trim();
    if (!answer) return choices[defaultIndex].value;
    const idx = Number(answer) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) {
      return choices[idx].value;
    }
    stdout.write(`  Please enter a number between 1 and ${choices.length}.\n`);
  }
}

/** Ask for a comma-separated list of non-empty strings. */
export async function askList(question: string, defaultValue?: string[]): Promise<string[]> {
  const defaultStr = defaultValue?.join(', ');
  const answer = await askText(`${question} (comma-separated)`, defaultStr);
  return answer.split(',').map(s => s.trim()).filter(Boolean);
}

export function closePrompts(): void {
  rl.close();
}
