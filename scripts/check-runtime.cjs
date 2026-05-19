const [major, minor, patch] = process.versions.node.split('.').map(Number);

const isSupported =
  major === 24 && (minor > 15 || (minor === 15 && patch >= 0));

if (!isSupported) {
  console.error(
    `Node 24.15.0 or newer within 24.x is required for this repo. Current runtime: ${process.versions.node}`,
  );
  process.exit(1);
}
