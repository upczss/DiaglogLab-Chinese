import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoringLabel, authoringAttributeLabel, authoringPartyLabel, authoringPartyDescription } from '../../client/src/libs/authoringChinese.js';

test('Authoring renders built-in options in Chinese while preserving custom values', () => {
  assert.equal(authoringLabel('round-robin'), '轮流发言');
  assert.equal(authoringLabel('analytical'), '善于分析');
  assert.equal(authoringLabel('自定义风格'), '自定义风格');
  assert.equal(authoringLabel('en-GB-Standard-A'), 'en-GB-Standard-A');
  assert.equal(authoringLabel(null), '');
  assert.equal(authoringAttributeLabel('researchFocus'), '研究方向');
  assert.equal(authoringAttributeLabel('自定义属性'), '自定义属性');
});

test('Authoring translates built-in groups without rewriting custom names or descriptions', () => {
  assert.equal(authoringPartyLabel('Students'), '学生组');
  assert.equal(authoringPartyLabel('我的研究小组'), '我的研究小组');
  assert.equal(authoringPartyDescription('Your role is to teach, guide discussions, provide explanations, and help students understand difficult concepts.'), '负责教学、引导讨论和提供解释，帮助学生理解难点。');
  assert.equal(authoringPartyDescription('自定义英文课：English discussion'), '自定义英文课：English discussion');
});
