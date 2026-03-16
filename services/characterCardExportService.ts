import { WORLD_BOOK_CONTENT } from "../data/worldbook";
import { assembleRules } from "../data/rules/ruleAssembler";
import { assembleCodeRules } from "../data/rules/codeRules/codeRuleAssembler";

const AUTO_DOWNLOAD_SESSION_KEY = "wenwan_character_card_auto_downloaded";
const CHARACTER_CARD_FILE_NAME = "wenwan-sillytavern-character-card.json";
const CHARACTER_NAME = "温婉";
const WORLD_BOOK_NAME = "温婉-游戏世界设定";

export const WENWAN_INITIAL_MESSAGE = `（周六的午后，温婉慵懒地躺在客厅的沙发上，手里拿着手机，眼神却时不时瞟向你的方向...）

"哥哥...周末好无聊啊..."

（她故意把腿搭在沙发扶手上，宽松的睡裙滑落，露出白皙的大腿。注意到你的视线，她脸颊微微泛红，却没有把腿收回去，反而轻轻晃了晃脚尖...）

"哥哥...要不要...陪我聊聊天？"`;

interface CharacterBookEntry {
  id: number;
  keys: string[];
  secondary_keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  enabled: boolean;
  insertion_order: number;
  extensions: Record<string, unknown>;
}

interface CharacterBook {
  name: string;
  entries: CharacterBookEntry[];
}

interface TavernCardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: {
    talkativeness: string;
    fav: boolean;
    world: string;
    depth_prompt: {
      prompt: string;
      depth: number;
      role: string;
    };
  };
  group_only_greetings: string[];
  character_book: CharacterBook;
}

interface TavernCardExport {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creatorcomment: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  avatar: string;
  talkativeness: string;
  fav: boolean;
  tags: string[];
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: TavernCardData;
  character_book: CharacterBook;
  json_data: string;
}

function buildCharacterBook(): CharacterBook {
  return {
    name: WORLD_BOOK_NAME,
    entries: [
      {
        id: 0,
        keys: ["温婉", "哥哥", "同居", "学校", "周末", "家"],
        secondary_keys: [],
        comment: "游戏世界设定",
        content: WORLD_BOOK_CONTENT.trim(),
        constant: true,
        selective: false,
        enabled: true,
        insertion_order: 0,
        extensions: {},
      },
    ],
  };
}

function buildSystemPrompt(): string {
  return [assembleCodeRules(), assembleRules({ degradation: 0 })]
    .filter(Boolean)
    .join("\n\n");
}

export function buildWenwanCharacterCard(): TavernCardExport {
  const description = [
    "温婉，18 岁，高三学生，和哥哥相依为命地生活在父母留下的家里。",
    "她外表是高冷优雅的校花和优等生，也是活跃的 Cos 社成员；私下里却会在哥哥面前露出撒娇、试探、害羞又带一点小恶魔的样子。",
    "这张卡尽量保留了项目里的世界观、时间表、地点设定、身体状态系统和互动规则，方便在 SillyTavern 中复现原作玩法。 ",
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

  const systemPrompt = buildSystemPrompt();
  const creatorNotes = [
    "这个 JSON 由 SillyCard 运行时自动生成，目标是让酒馆能直接导入一个可用的温婉角色卡。",
    "核心人设、世界观和规则尽量来自项目源码；完整世界设定还被放进了 character_book 里。",
    "",
    "=== 项目世界书 ===",
    WORLD_BOOK_CONTENT.trim(),
  ].join("\n");

  const characterBook = buildCharacterBook();

  const data: TavernCardData = {
    name: CHARACTER_NAME,
    description,
    personality,
    scenario,
    first_mes: WENWAN_INITIAL_MESSAGE,
    mes_example: mesExample,
    creator_notes: creatorNotes,
    system_prompt: systemPrompt,
    post_history_instructions: "",
    alternate_greetings: [],
    tags: ["兄妹", "校园", "同居", "Cosplay", "剧情模拟", "SillyCard"],
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
    name: CHARACTER_NAME,
    description,
    personality,
    scenario,
    first_mes: WENWAN_INITIAL_MESSAGE,
    mes_example: mesExample,
    creatorcomment: creatorNotes,
    creator_notes: creatorNotes,
    system_prompt: systemPrompt,
    post_history_instructions: "",
    avatar: "",
    talkativeness: "0.5",
    fav: false,
    tags: data.tags,
    spec: "chara_card_v3",
    spec_version: "3.0",
    data,
    character_book: characterBook,
    json_data: JSON.stringify(data),
  };
}

function hasAutoDownloadedCharacterCard(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(AUTO_DOWNLOAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markCharacterCardDownloaded(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(AUTO_DOWNLOAD_SESSION_KEY, "1");
  } catch {
    // Ignore storage failures and still allow download.
  }
}

export function autoDownloadWenwanCharacterCard(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (hasAutoDownloadedCharacterCard()) {
    return false;
  }

  const characterCard = buildWenwanCharacterCard();
  const json = JSON.stringify(characterCard, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = CHARACTER_CARD_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);

  markCharacterCardDownloaded();
  return true;
}
