// Display labels only. Persisted values and API enum identifiers stay unchanged.
const labels = {
  friendly: '友善', professional: '专业', casual: '随和', formal: '正式',
  enthusiastic: '热情', reserved: '内敛', empathetic: '善解人意', analytical: '善于分析',
  neutral: '中立', supportive: '支持', critical: '批判', skeptical: '质疑',
  receptive: '愿意倾听', agreeable: '赞同', positive: '积极', negative: '反对', questioning: '追问',
  none: '无', low: '低', medium: '中', high: '高',
  amused: '愉快', excited: '兴奋', curious: '好奇', concerned: '担忧', bored: '无聊',
  surprised: '惊讶', confused: '困惑', impressed: '赞赏', happy: '开心', sad: '难过', angry: '生气', love: '喜爱', fear: '害怕',
  'round-robin': '轮流发言', 'round robin': '轮流发言', 'free-form': '自由发言',
  directed: '指定发言', direct: '指定发言', random: '随机选择', free: '自由讨论',
  moderated: '主持模式', 'moderated:nohandraising': '主持模式（无需举手）',
  all: '全体成员', representative: '仅代表发言', subset: '部分成员', sequential: '依次发言',
  normal: '正常', whisper: '轻声', loud: '大声', male: '男', female: '女',
  raisehand: '举手', agree: '赞同', disagree: '反对', thinking: '思考',
  upper: '上半身', head: '仅面部', full: '全身',
};

export function authoringLabel(value) {
  if (value === null || value === undefined) return '';
  return labels[String(value).toLowerCase()] || String(value);
}

const attributeLabels = {
  role: '身份', experience: '经验', expertise: '专业领域', education: '教育背景',
  researchFocus: '研究方向', interests: '兴趣', currentFocus: '当前重点', programmingSkills: '编程技能', industryProjects: '行业项目', specialization: '专长', researchMethods: '研究方法', industryFocus: '行业方向', publications: '发表成果', age: '年龄', profession: '职业',
};

export function authoringAttributeLabel(key) {
  return attributeLabels[key] || key;
}

const partyLabels = {
  'Teaching Staff': '教师组', Students: '学生组', Moderators: '主持组',
  Presenters: '报告者', Audience: '听众',
};

export function authoringPartyLabel(name) {
  return partyLabels[name] || name;
}

const partyDescriptions = {
  'Your role is to teach, guide discussions, provide explanations, and help students understand difficult concepts.': '负责教学、引导讨论和提供解释，帮助学生理解难点。',
  "Your role is to learn, ask questions when you don't understand, and seek clarification on complex topics.": '负责学习，在不理解时提出问题，并请求澄清复杂概念。',
  'Your role is to facilitate discussions, ensure balanced participation, maintain order, and guide the conversation flow towards productive outcomes.': '负责主持讨论、平衡参与机会、维持秩序，并引导对话取得有效成果。',
  'Your role is to share knowledge, deliver prepared content, engage with the audience, and respond to questions about your presentation material.': '负责分享知识、介绍准备好的内容，与听众互动并回答报告相关问题。',
  'Your role is to actively listen, provide feedback during Q&A when appropriate, and engage with the presented content through questions and comments.': '负责认真倾听，在问答环节适时反馈，并通过提问和评论参与讨论。',
};

export function authoringPartyDescription(text) {
  return partyDescriptions[text] || text;
}
