import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/PRODUCT_SENSE.md',
  'docs/FRONTEND.md',
  'docs/TESTING.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/QUALITY_SCORE.md',
  'docs/PLANS.md',
  'docs/design-docs/index.md',
  'docs/design-docs/core-beliefs.md',
  'docs/design-docs/visual-direction.md',
  'docs/product-specs/index.md',
  'docs/product-specs/nte-mod-manager-mvp.md',
  'docs/exec-plans/active/bootstrap-harness.md',
  'docs/exec-plans/completed/electron-bootstrap.md',
  'docs/references/README.md',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
  '.husky/pre-commit',
  '.husky/pre-push',
  'eslint.config.mjs',
  'index.html',
  'package.json',
  'scripts/check-runtime.cjs',
  'tsconfig.base.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.renderer.json',
  'tsconfig.test.json',
  'vite.config.ts',
  'vitest.config.ts',
  'src/main/index.ts',
  'src/main/platform/createMainWindow.ts',
  'src/main/platform/registerAppIpc.ts',
  'src/main/settings/jsonSettingsRepository.ts',
  'src/main/settings/settingsService.ts',
  'src/preload/index.ts',
  'src/renderer/app.ts',
  'src/renderer/main.ts',
  'src/renderer/styles.css',
  'src/renderer/vite-env.d.ts',
  'src/shared/ipc.ts',
  'src/shared/settings.ts',
  'tests/main/settingsRepository.test.ts',
  'tests/renderer/app.test.ts',
  'tests/shared/ipc.test.ts',
];

const requiredAgentLinks = [
  'docs/PRODUCT_SENSE.md',
  'docs/product-specs/nte-mod-manager-mvp.md',
  'ARCHITECTURE.md',
];

const requiredPackageScripts = [
  'build',
  'check:runtime',
  'format',
  'format:check',
  'harness:validate',
  'lint',
  'lint:fix',
  'test',
  'test:ci',
  'test:watch',
  'typecheck',
];

async function ensureFile(path) {
  try {
    await access(path);
    return null;
  } catch {
    return `Missing required file: ${path}`;
  }
}

async function ensureContains(path, snippets) {
  const content = await readFile(path, 'utf8');
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  return missing.map(
    (snippet) => `Missing expected reference in ${path}: ${snippet}`,
  );
}

async function ensurePackageScripts(path, scripts) {
  const raw = await readFile(path, 'utf8');
  const packageJson = JSON.parse(raw);
  const definedScripts = packageJson.scripts ?? {};
  const missing = scripts.filter((script) => !(script in definedScripts));

  return missing.map(
    (script) => `Missing expected package script in ${path}: ${script}`,
  );
}

async function ensureNodeEngine(path) {
  const raw = await readFile(path, 'utf8');
  const packageJson = JSON.parse(raw);
  const engine = packageJson.engines?.node;

  if (!engine) {
    return ['Missing expected Node engine declaration in package.json'];
  }

  if (engine !== '^24.15.0') {
    return [`Unexpected Node engine declaration in package.json: ${engine}`];
  }

  return [];
}

const errors = [];

for (const path of requiredFiles) {
  const error = await ensureFile(path);
  if (error) {
    errors.push(error);
  }
}

if (errors.length === 0) {
  errors.push(...(await ensureContains('AGENTS.md', requiredAgentLinks)));
  errors.push(
    ...(await ensurePackageScripts('package.json', requiredPackageScripts)),
  );
  errors.push(...(await ensureNodeEngine('package.json')));
}

if (errors.length > 0) {
  console.error('Harness validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Harness validation passed.');
