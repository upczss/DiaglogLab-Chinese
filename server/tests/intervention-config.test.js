import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInterventionConfig } from '../../client/src/libs/interventionConfig.js';

const node = {
  turns: 6, speakers: [{ name: 'Alice' }, { name: 'Bob', isHuman: false }],
  attachedScene: { boxes: [{ elements: [{ avatarData: { name: 'Bob', isHuman: true } }] }] },
};

test('stale snippet flags do not block Human labels from scene or current participant settings', () => {
  const sceneConfig = createInterventionConfig(node, 'human-control');
  assert.equal(sceneConfig.issue, '');
  assert.deepEqual(sceneConfig.humanNames, ['Bob']);
  assert.equal(sceneConfig.derailerCommands[0].agentName, 'Bob');
  const savedConfig = createInterventionConfig({ ...node, attachedScene: null }, 'human-control', [{ humanParticipants: ['Bob', 'NotInScene'] }]);
  assert.deepEqual(savedConfig.humanNames, ['Bob']);
});

test('all playback modes carry their selection and invalid Human Control setups explain the problem', () => {
  for (const mode of ['human-control', 'autonomous', 'reactive']) {
    assert.equal(createInterventionConfig(node, mode).conversationMode, mode);
  }
  assert.match(createInterventionConfig({ ...node, derailerMode: false }, 'human-control').issue, /关闭了临时介入/);
  assert.match(createInterventionConfig({ ...node, attachedScene: null }, 'human-control').issue, /没有识别到人类参与者/);
  assert.match(createInterventionConfig({ ...node, turns: 1 }, 'human-control').issue, /只有一轮/);
  assert.equal(createInterventionConfig({ ...node, attachedScene: null }, 'reactive').issue, '');
});
