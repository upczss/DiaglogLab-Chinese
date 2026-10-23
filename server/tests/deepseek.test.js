import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import express from 'express';
import * as llm from '../providers/llmProvider.js';
import { setupModelRoutes } from '../modelAPI.js';

test('DeepSeek requests use their own endpoint, credentials and models', async () => {
  const calls = [];
  const originalPost = axios.post;
  axios.post = async (...args) => {
    calls.push(args);
    return { data: { choices: [{ message: { content: ' hello ' } }] } };
  };
  try {
    llm.setOpenAIApiKey('test-openai');
    llm.setDeepSeekApiKey(' test-deepseek ');
    llm.setProvider('deepseek');
    assert.equal(llm.isDeepSeekConfigured(), true);
    assert.equal(llm.getCurrentModel(), 'deepseek-flash');
    assert.deepEqual(Object.values(llm.getAvailableModels()), ['deepseek-flash', 'deepseek-v4-pro']);
    assert.equal(await llm.generateText('hello', { temperature: 0 }), 'hello');
    assert.equal(calls[0][0], 'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0][2].headers.Authorization, 'Bearer test-deepseek');
    assert.equal(calls[0][1].model, 'deepseek-flash');
    assert.equal(calls[0][1].temperature, 0);
    assert.equal(calls[0][1].thinking.type, 'disabled');

    llm.setDefaultModel('deepseek', 'deepseek-v4-pro');
    await llm.chatCompletion([{ role: 'user', content: 'hi' }], { apiKey: 'request-key' });
    assert.equal(calls[1][1].model, 'deepseek-v4-pro');
    assert.equal(calls[1][2].headers.Authorization, 'Bearer request-key');
    assert.throws(() => llm.setDefaultModel('deepseek', 'gpt-4'), /Invalid DeepSeek model/);

    await llm.generateText('hi', { provider: 'openai' });
    assert.equal(calls[2][0], 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[2][2].headers.Authorization, 'Bearer test-openai');
    assert.equal(calls[2][1].thinking, undefined);
    llm.setDeepSeekApiKey('');
    await assert.rejects(llm.generateText('hi'), /API key is not configured/);
    assert.equal(calls.length, 3);
  } finally {
    axios.post = originalPost;
    llm.setDefaultModel('deepseek', 'deepseek-flash');
    llm.setProvider('gemini');
    llm.setDeepSeekApiKey('');
    llm.setOpenAIApiKey('');
  }
});

test('model routes accept DeepSeek keys, provider selection and model changes', async () => {
  const app = express();
  app.use(express.json());
  setupModelRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(`${base}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post('/api/llm-keys', { provider: 'deepseek', apiKey: 'test-key' })).status, 200);
    assert.equal((await post('/api/llm-provider', { provider: 'deepseek' })).status, 200);
    const status = await (await fetch(`${base}/api/llm-status`)).json();
    assert.equal(status.deepseekConfigured, true);
    assert.equal(status.currentProvider, 'deepseek');
    assert.equal((await post('/api/update-model', { provider: 'deepseek', model: 'deepseek-v4-pro' })).status, 200);
    const models = await (await fetch(`${base}/api/llm-models`)).json();
    assert.equal(models.currentModel, 'deepseek-v4-pro');
    assert.equal((await post('/api/llm-provider', { provider: 'invalid' })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    llm.setDeepSeekApiKey('');
    llm.setDefaultModel('deepseek', 'deepseek-flash');
    llm.setProvider('gemini');
  }
});
