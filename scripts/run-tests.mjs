import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const TEST_OUT_DIR = 'test-dist';
const TEST_ENTRY = path.join(TEST_OUT_DIR, 'tests', 'titleGenerator.test.js');

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

rmSync(TEST_OUT_DIR, { recursive: true, force: true });
run('npx tsc --project tsconfig.test.json');
run(`node ${JSON.stringify(TEST_ENTRY)}`);
rmSync(TEST_OUT_DIR, { recursive: true, force: true });
