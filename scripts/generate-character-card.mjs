import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSillyTavernHostHtml } from "./generate-sillytavern-host.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const CHARACTER_CARD_FILE_NAME = "wenwan-sillytavern-character-card.json";
const OUTPUT_PATH = path.join(projectRoot, "dist", "sillytavern", CHARACTER_CARD_FILE_NAME);
const CHARACTER_NAME = "\u6e29\u5a49";
const WORLD_BOOK_NAME = `${CHARACTER_NAME}-\u6e38\u620f\u4e16\u754c\u8bbe\u5b9a`;
const FRONTEND_TRIGGER = "1";
const FRONTEND_REGEX_ID = "58f10392-937a-4fcf-8c79-69f9d744e0f8";

function readSource(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

function extractTemplateExport(relativePath, exportName) {
  const source = readSource(relativePath);
  const startToken = `export const ${exportName} = \``;
  const startIndex = source.indexOf(startToken);

  if (startIndex === -1) {
    throw new Error(`Unable to find export ${exportName} in ${relativePath}`);
  }

  const contentStart = startIndex + startToken.length;
  const tail = source.slice(contentStart);
  const closingMatch = tail.match(/`\s*(?:\.trim\(\))?\s*;/);

  if (!closingMatch || closingMatch.index === undefined) {
    throw new Error(`Unable to find closing template for ${exportName} in ${relativePath}`);
  }

  const contentEnd = contentStart + closingMatch.index;
  return source.slice(contentStart, contentEnd).trim();
}

function assembleRuleSections(sectionSpecs) {
  return sectionSpecs
    .map((section) => `## ${section.name}\n\n${section.content}`)
    .join("\n\n---\n\n");
}

function assembleGameplaySections() {
  const sections = [
    {
      name: "Body Development",
      content: extractTemplateExport("data/rules/bodyDevelopmentRules.ts", "BODY_DEVELOPMENT_RULES"),
    },
    {
      name: "Time System",
      content: extractTemplateExport("data/rules/timeRules.ts", "TIME_RULES"),
    },
    {
      name: "Interaction Rules",
      content: extractTemplateExport("data/rules/interactionRules.ts", "INTERACTION_RULES"),
    },
  ];

  return assembleRuleSections(sections);
}

function assembleBehaviorSections() {
  const sections = [
    {
      name: "Behavior Rules",
      content: extractTemplateExport("data/rules/codeRules/behaviorRules.ts", "BEHAVIOR_RULES"),
    },
    {
      name: "Time Schedule Rules",
      content: extractTemplateExport("data/rules/codeRules/timeScheduleRules.ts", "TIME_SCHEDULE_RULES"),
    },
    {
      name: "Location Interaction Rules",
      content: extractTemplateExport("data/rules/codeRules/locationInteractionRules.ts", "LOCATION_INTERACTION_RULES"),
    },
    {
      name: "Social Media Rules",
      content: extractTemplateExport("data/rules/codeRules/socialMediaRules.ts", "SOCIAL_MEDIA_RULES"),
    },
    {
      name: "Gameplay Logic Rules",
      content: extractTemplateExport("data/rules/codeRules/gameplayLogicRules.ts", "GAMEPLAY_LOGIC_RULES"),
    },
    {
      name: "Emotion Clothing Rules",
      content: extractTemplateExport("data/rules/codeRules/emotionClothingRules.ts", "EMOTION_CLOTHING_RULES"),
    },
    {
      name: "Response Format Rules",
      content: extractTemplateExport("data/rules/codeRules/responseFormatRules.ts", "RESPONSE_FORMAT_RULES"),
    },
  ];

  return assembleRuleSections(sections);
}

function buildCharacterBookExtensions(displayIndex, position) {
  return {
    position,
    exclude_recursion: false,
    display_index: displayIndex,
    probability: 100,
    useProbability: false,
    depth: 4,
    selectiveLogic: 0,
    outlet_name: "",
    group: "",
    group_override: false,
    group_weight: 100,
    prevent_recursion: false,
    delay_until_recursion: false,
    scan_depth: null,
    match_whole_words: null,
    use_group_scoring: false,
    case_sensitive: null,
    automation_id: "",
    role: 0,
    vectorized: false,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    match_persona_description: false,
    match_character_description: false,
    match_character_personality: false,
    match_character_depth_prompt: false,
    match_scenario: false,
    match_creator_notes: false,
    triggers: [],
    ignore_budget: false,
  };
}

function buildCharacterBook(worldBookContent, behaviorContent, profileContent) {
  return {
    name: WORLD_BOOK_NAME,
    entries: [
      {
        id: 0,
        keys: [CHARACTER_NAME, "\u54e5\u54e5", "\u540c\u5c45", "\u5b66\u6821", "\u5468\u672b", "\u5bb6"],
        secondary_keys: [],
        comment: "\u6e38\u620f\u4e16\u754c\u8bbe\u5b9a",
        content: worldBookContent,
        constant: true,
        selective: false,
        enabled: true,
        insertion_order: 98,
        position: "after_char",
        use_regex: false,
        extensions: buildCharacterBookExtensions(0, 1),
      },
      {
        id: 1,
        keys: ["\u89c4\u5219", "\u7cfb\u7edf", "\u73a9\u6cd5"],
        secondary_keys: [],
        comment: "\u73a9\u6cd5\u89c4\u5219",
        content: behaviorContent,
        constant: true,
        selective: false,
        enabled: true,
        insertion_order: 99,
        position: "after_char",
        use_regex: false,
        extensions: buildCharacterBookExtensions(1, 1),
      },
      {
        id: 2,
        keys: ["\u4eba\u8bbe"],
        secondary_keys: [],
        comment: CHARACTER_NAME,
        content: profileContent,
        constant: true,
        selective: false,
        enabled: true,
        insertion_order: 100,
        position: "before_char",
        use_regex: false,
        extensions: buildCharacterBookExtensions(2, 0),
      },
    ],
  };
}

function buildFrontendRegexScripts() {
  const hostHtml = buildSillyTavernHostHtml();

  return [
    {
      id: FRONTEND_REGEX_ID,
      scriptName: "`111`",
      findRegex: FRONTEND_TRIGGER,
      replaceString: `\`\`\`\n${hostHtml}\n\`\`\``,
      trimStrings: [],
      placement: [1, 2],
      disabled: false,
      markdownOnly: true,
      promptOnly: true,
      runOnEdit: true,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    },
  ];
}

function buildCharacterCardCore() {
  const worldBookContent = extractTemplateExport("data/worldbook.ts", "WORLD_BOOK_CONTENT");
  const behaviorContent = [assembleGameplaySections(), assembleBehaviorSections()].join("\n\n---\n\n");
  const profileContent = extractTemplateExport(
    "data/rules/codeRules/characterProfileRules.ts",
    "CHARACTER_PROFILE_RULES",
  );
  const characterBook = buildCharacterBook(worldBookContent, behaviorContent, profileContent);
  const tags = [];

  const data = {
    name: CHARACTER_NAME,
    description: "",
    personality: "",
    scenario: "",
    first_mes: FRONTEND_TRIGGER,
    mes_example: "",
    system_prompt: "",
    post_history_instructions: "",
    tags,
    creator: "",
    character_version: "",
    alternate_greetings: [],
    extensions: {
      talkativeness: "0.5",
      fav: false,
      world: WORLD_BOOK_NAME,
      depth_prompt: {
        prompt: "",
        depth: 4,
        role: "system",
      },
      regex_scripts: buildFrontendRegexScripts(),
    },
    group_only_greetings: [],
    character_book: characterBook,
  };

  return {
    name: CHARACTER_NAME,
    description: "",
    personality: "",
    scenario: "",
    first_mes: FRONTEND_TRIGGER,
    mes_example: "",
    avatar: "none",
    talkativeness: "0.5",
    fav: false,
    tags,
    spec: "chara_card_v3",
    spec_version: "3.0",
    data,
    create_date: new Date().toISOString(),
  };
}

export function buildCharacterCard() {
  return buildCharacterCardCore();
}

function writeCharacterCardVariant(outputPath, card) {
  const json = `${JSON.stringify(card, null, 4)}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json, "utf8");
  const relativePath = path.relative(projectRoot, outputPath) || CHARACTER_CARD_FILE_NAME;
  console.log(`[generate-character-card] wrote ${relativePath}`);
  return outputPath;
}

export function writeCharacterCard(outputPath = OUTPUT_PATH) {
  return writeCharacterCardVariant(outputPath, buildCharacterCard());
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  writeCharacterCard();
}
