// Spawn local claude CLI subprocess. Uses whatever auth the CLI has (Max plan
// OAuth via `claude /login`). Costs $0 marginal. Default provider for the bot.

import { spawn } from 'node:child_process';
import { llmError, type LLMRequest } from './types';

const TIMEOUT_MS = 60_000;

export async function callClaudeMax(req: LLMRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--model', req.model,
      '--print',
      '--append-system-prompt', req.system,
      // v2.13 - was 'auto'. With no interactive operator, 'auto' surfaces
      // permission prompts that time out, then the model narrates about them
      // ("approve in the system dialog..."). 'dontAsk' auto-denies any tool
      // not pre-approved, so there's no prompt event to narrate about.
      '--permission-mode', 'dontAsk',
      // v2.13 - bot is a chat-only concierge. It has zero use for Read/Edit/
      // Write/Bash/etc. Removing them from the subprocess removes the surface
      // the model was hallucinating about ("I need write permission to
      // create data/actions.json"). Doc 671 fix 1c.
      '--disallowedTools',
      'Bash,Read,Write,Edit,WebFetch,WebSearch,Glob,Grep,Task,NotebookEdit',
    ];
    const proc = spawn('claude', args, { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    // v2.14 P1.4 - was no timeout. If claude CLI hangs (auth lapse / net),
    // the grammy handler awaits forever. Kill after 60s with a clean error.
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      reject(llmError('claude-max', req.model, `timeout after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    // v2.14 P1.5 - spawn() can fail (claude not installed, PATH issue). Need to
    // catch the 'error' event explicitly or the promise stays pending forever.
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(llmError('claude-max', req.model, `spawn failed: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (code !== 0) {
        return reject(llmError('claude-max', req.model, `exit ${code}: ${stderr.slice(0, 300)}`));
      }
      resolve(stdout.trim());
    });

    // v2.14 P1.5 - guard stdin write against the subprocess not being ready or
    // dying before we finish writing. Without this the EPIPE bubbles out as
    // an uncaught error event.
    proc.stdin.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      reject(llmError('claude-max', req.model, `stdin write failed: ${err.message}`));
    });
    try {
      proc.stdin.write(`${req.user}\n`);
      proc.stdin.end();
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      reject(llmError('claude-max', req.model, `stdin sync error: ${(err as Error).message}`));
    }
  });
}
