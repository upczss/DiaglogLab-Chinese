import assert from 'node:assert/strict';
import { test } from 'node:test';
import Agent from '../agent.js';
import { createLineDecoder } from '../../client/src/libs/lineDecoder.js';
import { chineseSystemMessage, interventionLabels } from '../../client/src/libs/chatChinese.js';
import axios from 'axios';
import * as llm from '../providers/llmProvider.js';

test('Chinese replies keep Chinese punctuation and unfinished sentences', () => {
  const agent = new Agent('David', 'friendly', 'neutral');
  assert.equal(agent.postProcessResponse('大家好。今天介绍论文！有什么问题？第四句话。'), '大家好。今天介绍论文！有什么问题？');
  assert.equal(agent.postProcessResponse('这段中文没有结尾标点'), '这段中文没有结尾标点');
  assert.equal(agent.postProcessResponse('第一句。还有一个补充'), '第一句。还有一个补充');
  assert.equal(agent.postProcessResponse('David：大家好。'), '大家好。');
  assert.equal(agent.postProcessResponse('我的结论是: 需要人工审核。'), '我的结论是: 需要人工审核。');
  assert.equal(agent.postProcessResponse('Hello. How are you? I am fine! Fourth.'), 'Hello. How are you? I am fine!');
  const named = new Agent('Dr. A (主持)', 'friendly', 'neutral');
  assert.equal(named.postProcessResponse('Dr. A (主持): 你好。'), '你好。');
});

test('JSON event decoding preserves Chinese at every possible network split', () => {
  const events = [{ type: 'message', message: '你好，正在介绍论文。' }, { type: 'completion' }];
  const wire = events.map(event => JSON.stringify(event)).join('\n') + '\n';
  const bytes = new TextEncoder().encode(wire);
  for (let split = 0; split <= bytes.length; split++) {
    const decoder = createLineDecoder();
    const lines = [decoder.decode(bytes.slice(0, split)), decoder.decode(bytes.slice(split)), decoder.decode(undefined, true)]
      .flatMap(chunk => chunk.split('\n').filter(Boolean));
    assert.deepEqual(lines.map(line => JSON.parse(line)), events);
  }
  const decoder = createLineDecoder();
  let decoded = '';
  for (const byte of bytes) decoded += decoder.decode(Uint8Array.of(byte));
  assert.equal(decoded, wire);
});

test('chat status text is Chinese while names and event metadata remain intact', () => {
  const event = { isImpromptuPhaseStart: true, derailMode: 'drift' };
  assert.equal(chineseSystemMessage('Bob has started an impromptu discussion phase for 4 turns on a different topic.', event), 'Bob 发起即兴讨论（话题转移），共 4 轮。');
  assert.equal(event.derailMode, 'drift');
  assert.equal(chineseSystemMessage('The impromptu discussion phase has ended. Returning to the regular conversation.'), '即兴讨论已结束，回到原定对话。');
  assert.equal(chineseSystemMessage('From party "Audience": Alice, Grace have raised their hands.'), '“Audience”组的 Alice, Grace 已举手。');
  assert.equal(chineseSystemMessage('The moderator approves Grace from party "Audience" to speak next.'), '主持人同意“Audience”组的 Grace 接下来发言。');
  assert.equal(chineseSystemMessage('已经是中文的提示。'), '已经是中文的提示。');
  assert.equal(interventionLabels.emotional, '情绪回应');
});

test('ordinary, proactive and intervention replies request Chinese even with English history', async () => {
  const originalPost = axios.post;
  const originalProvider = llm.getProvider();
  const prompts = [];
  axios.post = async (url, body) => {
    prompts.push(body.messages[0].content);
    return { data: { choices: [{ message: { content: '这是中文回复。' } }] } };
  };
  try {
    llm.setProvider('deepseek');
    const agent = new Agent('Bob', 'friendly', 'neutral');
    agent.llmOptions = { provider: 'deepseek', apiKey: 'test-key' };
    agent.setAsDerailer(true, { mode: 'drift' });
    await agent.reply('English history.', 'An English conversation.', 'Alice');
    await agent.generateProactiveResponse('English history.', 'English context.', 'Alice');
    await agent.generateDerailResponse('English history.');
    assert.equal(prompts.length, 3);
    for (const prompt of prompts) {
      assert.ok(prompt.startsWith('输出语言要求：'));
      assert.ok(prompt.includes('必须使用自然的简体中文'));
    }
  } finally {
    axios.post = originalPost;
    llm.setProvider(originalProvider);
  }
});
