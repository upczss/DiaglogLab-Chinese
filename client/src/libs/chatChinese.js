export const interventionLabels = {
  drift: '话题转移', extend: '新视角', question: '深入提问', emotional: '情绪回应',
};

// Localize system events for display, leaving stored event text and flags intact.
export function chineseSystemMessage(text, message = {}) {
  if (message.isEndingPhase || text.includes('The impromptu discussion phase has ended')) {
    return '即兴讨论已结束，回到原定对话。';
  }
  if (message.isImpromptuPhaseStart || text.includes('started an impromptu discussion phase')) {
    const name = text.match(/^(.*?) has started an impromptu discussion phase/)?.[1] || '参与者';
    const turns = text.match(/for (\d+) turns/)?.[1];
    const mode = message.derailMode || (text.includes('different topic') ? 'drift' : 'extend');
    return `${name} 发起即兴讨论（${interventionLabels[mode] || '临时介入'}）${turns ? `，共 ${turns} 轮` : ''}。`;
  }
  let match = text.match(/^From party "(.*?)": (.*?) have raised their hands\.$/);
  if (match) return `“${match[1]}”组的 ${match[2]} 已举手。`;
  match = text.match(/^Members who raised their hands: (.*?)\.$/);
  if (match) return `已举手的参与者：${match[1]}。`;
  match = text.match(/^The moderator (?:approves|has approved) (.*?) from party "(.*?)" to speak(?: next)?\.$/);
  if (match) return `主持人同意“${match[2]}”组的 ${match[1]} 接下来发言。`;
  return text;
}
