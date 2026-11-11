// Headless screenshots for checking the look.
// Usage: node scripts/shot.mjs [outDir] [query ...]   e.g.  node scripts/shot.mjs shots "time=12:00" "time=22:00&weather=rain"
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browsers = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = browsers.find((b) => existsSync(b));
if (!browser) { console.error('No Chrome/Edge found (set CHROME=...)'); process.exit(1); }

const [outDir = 'shots', ...queries] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const page = pathToFileURL(resolve('index.html')).href;
for (const q of queries.length ? queries : ['time=12:00', 'time=19:30', 'time=23:00']) {
  const name = q.replace(/[^a-z0-9]+/gi, '_') + '.png';
  const file = resolve(join(outDir, name));
  execFileSync(browser, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--allow-file-access-from-files',
    '--window-size=1280,800', '--virtual-time-budget=' + (process.env.BUDGET || 1500), `--screenshot=${file}`,
    `${page}?nointro=1&${q}`,
  ], { stdio: 'ignore', timeout: 120000 });
  console.log(file);
}
