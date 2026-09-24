/**
 * Environment Variable Loader
 * Executed as the very first module import so that process.env is populated
 * before any service constructors or singletons are evaluated.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function loadEnv() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(PROJECT_ROOT, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (val) {
              process.env[key] = val;
            }
          }
        });
        console.log(`[Server] Environment loaded from ${path.basename(envPath)}`);
        return true;
      } catch (e) {
        console.warn('[Server] Could not read env file:', e.message);
      }
    }
  }
  return false;
}

loadEnv();
