// Resolve Human labels from both current scene data and older saved snippets.
export function createInterventionConfig(node, conversationMode, savedPanels = []) {
  const humans = new Set();
  for (const panel of savedPanels) {
    for (const name of panel?.humanParticipants || []) humans.add(name);
  }
  for (const speaker of node.speakers || []) {
    if (speaker.isHuman) humans.add(speaker.name);
  }
  for (const box of node.attachedScene?.boxes || []) {
    if (box.avatarData?.isHuman) humans.add(box.avatarData.name);
    for (const element of [...(box.elements || []), ...(box.slots || [])]) {
      if (element.avatarData?.isHuman) humans.add(element.avatarData.name);
    }
  }
  const humanNames = [...new Set((node.speakers || []).filter(speaker => humans.has(speaker.name)).map(speaker => speaker.name))];
  const enabled = node.derailerMode !== false;
  let issue = '';
  if (conversationMode === 'human-control') {
    if (!enabled) issue = '当前片段关闭了临时介入。请在片段设置中开启介入，再使用人工控制。';
    else if (!humanNames.length) issue = '当前片段没有识别到人类参与者。请在角色库中将一位参与者标记为 Human（人类），并将其选入这个片段。';
    else if ((node.speakers || []).length < 2) issue = '人工介入需要至少两位参与者，请在片段中加入另一位参与者。';
    else if ((node.turns || 3) < 2) issue = '当前片段只有一轮发言，没有后续介入机会。请增加轮数，建议先设置为 6 轮。';
  }
  return {
    conversationMode,
    humanNames,
    issue,
    derailerCommands: enabled ? humanNames.map(agentName => ({
      command: 'setAsDerailer', agentName,
      config: { enable: true, mode: 'random', threshold: 0.5, minTurns: 3, maxTurns: 5 },
    })) : [],
  };
}
