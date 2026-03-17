import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_CARD_FILE_NAME,
  writeCharacterCard,
} from "./generate-character-card.mjs";
import { writeSillyTavernHost } from "./generate-sillytavern-host.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const artifactsDir = path.join(projectRoot, "dist", "sillytavern");
const legacyFrontendCardPath = path.join(artifactsDir, "wenwan-sillytavern-frontend-card.json");
const legacyRootCardPath = path.join(projectRoot, CHARACTER_CARD_FILE_NAME);

fs.mkdirSync(artifactsDir, { recursive: true });
fs.rmSync(path.join(artifactsDir, "sillycard-frontend-launcher"), { recursive: true, force: true });
fs.rmSync(legacyFrontendCardPath, { force: true });
fs.rmSync(legacyRootCardPath, { force: true });

writeCharacterCard(path.join(artifactsDir, CHARACTER_CARD_FILE_NAME));
writeSillyTavernHost(artifactsDir);

console.log("[collect-sillytavern-artifacts] SillyTavern artifacts are ready.");
