import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const cacheDir = resolve(root, '.cache');
const ghosttyDir = resolve(cacheDir, 'ghostty');
const wasmOut = resolve(ghosttyDir, 'zig-out/bin/ghostty-vt.wasm');
const publicWasm = resolve(root, 'public/ghostty-vt.wasm');
const zigCandidates = [
  process.env.ZIG_015,
  '/opt/homebrew/opt/zig@0.15/bin/zig',
  '/usr/local/opt/zig@0.15/bin/zig',
  'zig',
].filter(Boolean);

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function findZig() {
  for (const candidate of zigCandidates) {
    try {
      const version = execFileSync(candidate, ['version'], { encoding: 'utf8' }).trim();
      if (version.startsWith('0.15.')) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    'Ghostty currently requires Zig 0.15.x. Install it with `brew install zig@0.15` or set ZIG_015 to a Zig 0.15 binary.',
  );
}

mkdirSync(cacheDir, { recursive: true });

if (!existsSync(ghosttyDir)) {
  run('git', ['clone', '--depth', '1', 'https://github.com/ghostty-org/ghostty.git', ghosttyDir]);
}

const zig = findZig();
run(zig, ['build', '-Demit-lib-vt', '-Dtarget=wasm32-freestanding', '-Doptimize=ReleaseSmall'], {
  cwd: ghosttyDir,
});

mkdirSync(dirname(publicWasm), { recursive: true });
copyFileSync(wasmOut, publicWasm);
console.log(`Copied ${wasmOut} to ${publicWasm}`);
