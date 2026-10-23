export const CHINESE_DIALOGUE_INSTRUCTION = '输出语言要求：本次对话面向中文用户。无论上下文、角色描述或历史发言使用什么语言，你的发言都必须使用自然的简体中文。不要添加英文译文；参与者姓名、必要的专有名称和代码标识可以保留原文。';

export function chineseDialoguePrompt(prompt) {
  return `${CHINESE_DIALOGUE_INSTRUCTION}\n\n${prompt}\n\n${CHINESE_DIALOGUE_INSTRUCTION}`;
}
