// 默认预设 - "小猫之神"预设中 enabled=true 的 prompts
// 从用户提供的"小猫之神"预设JSON中提取 enabled=true 的内容

// 从预设JSON中提取的默认预设内容
// 这个内容会在 SettingsContext 初始化时加载
export async function getDefaultPresetContent(): Promise<string> {
  // 如果用户已经导入了预设，返回空字符串（使用用户预设）
  // 否则返回默认预设内容
  // 目前暂时返回空，等用户确认后再实现自动加载
  return '';
}

// 临时占位：等用户提供预设文件后替换
export const DEFAULT_PRESET_CONTENT = `
// TODO: 从"小猫之神"预设JSON中提取 enabled=true 的 prompts
// 用户需要提供预设文件，然后使用 presetService.parsePresetFile() 解析
// 只保留 enabled: true 的 prompts，过滤掉美化内容和思考过程
`;
