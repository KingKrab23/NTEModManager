import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "docs/PRODUCT_SENSE.md",
  "docs/FRONTEND.md",
  "docs/TESTING.md",
  "docs/RELIABILITY.md",
  "docs/SECURITY.md",
  "docs/QUALITY_SCORE.md",
  "docs/PLANS.md",
  "docs/design-docs/index.md",
  "docs/design-docs/core-beliefs.md",
  "docs/design-docs/visual-direction.md",
  "docs/product-specs/index.md",
  "docs/product-specs/nte-mod-manager-mvp.md",
  "docs/exec-plans/active/bootstrap-harness.md",
  "docs/references/README.md"
];

const requiredAgentLinks = [
  "docs/PRODUCT_SENSE.md",
  "docs/product-specs/nte-mod-manager-mvp.md",
  "ARCHITECTURE.md"
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
  const content = await readFile(path, "utf8");
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  return missing.map((snippet) => `Missing expected reference in ${path}: ${snippet}`);
}

const errors = [];

for (const path of requiredFiles) {
  const error = await ensureFile(path);
  if (error) {
    errors.push(error);
  }
}

if (errors.length === 0) {
  errors.push(...await ensureContains("AGENTS.md", requiredAgentLinks));
}

if (errors.length > 0) {
  console.error("Harness validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Harness validation passed.");
