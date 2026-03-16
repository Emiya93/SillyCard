import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const OUTPUT_FILE_NAME = "wenwan-sillytavern-character-card.json";
const OUTPUT_PATH = path.join(projectRoot, OUTPUT_FILE_NAME);
const WORLD_BOOK_NAME = "温婉-游戏世界设定";

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

function assembleCodeRules() {
  const sections = [
    extractTemplateExport("data/rules/codeRules/characterProfileRules.ts", "CHARACTER_PROFILE_RULES"),
    extractTemplateExport("data/rules/codeRules/behaviorRules.ts", "BEHAVIOR_RULES"),
    extractTemplateExport("data/rules/codeRules/timeScheduleRules.ts", "TIME_SCHEDULE_RULES"),
    extractTemplateExport("data/rules/codeRules/locationInteractionRules.ts", "LOCATION_INTERACTION_RULES"),
    extractTemplateExport("data/rules/codeRules/socialMediaRules.ts", "SOCIAL_MEDIA_RULES"),
    extractTemplateExport("data/rules/codeRules/gameplayLogicRules.ts", "GAMEPLAY_LOGIC_RULES"),
    extractTemplateExport("data/rules/codeRules/emotionClothingRules.ts", "EMOTION_CLOTHING_RULES"),
    extractTemplateExport("data/rules/codeRules/responseFormatRules.ts", "RESPONSE_FORMAT_RULES"),
  ];

  return sections.join("\n\n");
}

function assembleGameRules() {
  const sections = [
    {
      name: "身体部位开发",
      content: extractTemplateExport("data/rules/bodyDevelopmentRules.ts", "BODY_DEVELOPMENT_RULES"),
    },
    {
      name: "时间系统",
      content: extractTemplateExport("data/rules/timeRules.ts", "TIME_RULES"),
    },
    {
      name: "互动规则",
      content: extractTemplateExport("data/rules/interactionRules.ts", "INTERACTION_RULES"),
    },
  ];

  return sections
    .map((section) => `## ${section.name}\n\n${section.content}`)
    .join("\n\n---\n\n");
}

function buildCharacterBook(worldBookContent) {
  return {
    name: WORLD_BOOK_NAME,
    entries: [
      {
        id: 0,
        keys: ["温婉", "哥哥", "同居", "学校", "周末", "家"],
        secondary_keys: [],
        comment: "游戏世界设定",
        content: worldBookContent,
        constant: true,
        selective: false,
        enabled: true,
        insertion_order: 0,
        extensions: {},
      },
    ],
  };
}

function buildCharacterCard() {
  const worldBookContent = extractTemplateExport("data/worldbook.ts", "WORLD_BOOK_CONTENT");
  const initialMessage = extractTemplateExport(
    "services/characterCardExportService.ts",
    "WENWAN_INITIAL_MESSAGE",
  );
  const systemPrompt = [assembleCodeRules(), assembleGameRules()].join("\n\n");

  const description = [
    "温婉，18 岁，高三学生，和哥哥相依为命地生活在父母留下的家里。",
    "她外表是高冷优雅的校花和优等生，也是活跃的 Cos 社成员；私下里却会在哥哥面前露出撒娇、试探、害羞又带一点小恶魔的样子。",
    "这张卡尽量保留了项目里的世界观、时间表、地点设定、身体状态系统和互动规则，方便在 SillyTavern 中复现原作玩法。",
  ].join("\n");

  const personality = [
    "聪明、敏感、骄矜，擅长用若有若无的挑逗试探哥哥。",
    "对外冷淡克制，对哥哥依赖、在意、占有欲强。",
    "会害羞，会嘴硬，会装作若无其事，但内心活动很多。",
  ].join("\n");

  const scenario = [
    "故事开始于一个普通周六下午。你是温婉的哥哥，正在与她共同生活。",
    "温婉会按照时间表在家、学校或城市各处活动；当你们不在同一地点时，只能通过微信等方式联系。",
    "互动会影响好感度、堕落度、身体状态和后续剧情发展。",
  ].join("\n");

  const mesExample = [
    "<START>",
    "哥哥：周末想做什么？",
    "温婉：哼，这种事还要我提醒你吗？",
    "温婉：（她把脸别开，脚尖却轻轻碰了碰你的腿）",
    "温婉：要是你愿意陪我出去逛逛...我也不是不能考虑一下。",
  ].join("\n");

  const creatorNotes = [
    "这个 JSON 由 SillyCard 的 predev 脚本自动生成，目标是让酒馆能直接导入一个可用的温婉角色卡。",
    "核心人设、世界观和规则尽量来自项目源码；完整世界设定也被放进了 character_book 里。",
    "",
    "=== 项目世界书 ===",
    worldBookContent,
  ].join("\n");

  const characterBook = buildCharacterBook(worldBookContent);
  const tags = ["兄妹", "校园", "同居", "Cosplay", "剧情模拟", "SillyCard"];

  const data = {
    name: "温婉",
    description,
    personality,
    scenario,
    first_mes: initialMessage,
    mes_example: mesExample,
    creator_notes: creatorNotes,
    system_prompt: systemPrompt,
    post_history_instructions: "",
    alternate_greetings: [],
    tags,
    creator: "SillyCard",
    character_version: "auto-export-1",
    extensions: {
      talkativeness: "0.5",
      fav: false,
      world: WORLD_BOOK_NAME,
      depth_prompt: {
        prompt: "",
        depth: 4,
        role: "system",
      },
    },
    group_only_greetings: [],
    character_book: characterBook,
  };

  return {
    name: "温婉",
    description,
    personality,
    scenario,
    first_mes: initialMessage,
    mes_example: mesExample,
    creatorcomment: creatorNotes,
    creator_notes: creatorNotes,
    system_prompt: systemPrompt,
    post_history_instructions: "",
    avatar: "",
    talkativeness: "0.5",
    fav: false,
    tags,
    spec: "chara_card_v3",
    spec_version: "3.0",
    data,
    character_book: characterBook,
    json_data: JSON.stringify(data),
  };
}

function writeCharacterCard() {
  const card = buildCharacterCard();
  const json = `${JSON.stringify(card, null, 2)}\n`;
  fs.writeFileSync(OUTPUT_PATH, json, "utf8");
  console.log(`[generate-character-card] wrote ${OUTPUT_FILE_NAME}`);
}

writeCharacterCard();

