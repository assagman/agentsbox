import { $ } from "bun";

// Exit on error
$.throws(true);

console.log("Building project...");
// Externalize native modules to prevent bundling issues
// - @mariozechner/clipboard-*: platform specific clipboard binaries
// - @silvia-odwyer/photon-node: native image processing addon
await $`bun build src/index.ts src/opencode.ts src/pi.ts src/phi.ts src/cli.ts --outdir dist --target node --external '@mariozechner/clipboard-*' --external '@silvia-odwyer/photon-node'`;

console.log("Preparing pi extension...");
await $`bun scripts/prepare-pi-extension.ts`;

console.log("Preparing phi extension...");
await $`bun scripts/prepare-phi-extension.ts`;

console.log("Build complete.");
