import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLineDecoder } from '../../client/src/libs/lineDecoder.js';

test('human review holds the original stream and completes only after decisions', { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, ['--import', './tests/mock-model.js', 'server.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: '0', LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-key' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stderr.on('data', data => { output += data; });
  const abort = new AbortController();
  try {
    const port = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/listening at port:(\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('exit', code => reject(new Error(`Server exited ${code}: ${output}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const post = (path, body) => fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal,
    });
    assert.equal((await post('/api/conversation/mode', { mode: 'human-control' })).status, 200);
    const config = {
      maxTurns: 8, completeConversation: true, conversationMode: 'human-control',
      agents: ['Alice', 'Bob', 'Grace'].map(name => ({ name, personality: 'friendly', interactionPattern: 'neutral' })),
      participants: ['Alice', 'Bob', 'Grace'], initiator: 'Alice', startingMessage: '大家好。',
      topic: '论文讨论', turnTakingMode: 'round-robin', removeBackchannel: false,
      derailerCommands: [{ command: 'setAsDerailer', agentName: 'Bob', config: { enable: true, mode: 'question', threshold: 1, minTurns: 3, maxTurns: 3 } }],
    };
    const response = await post('/api/start-conversation', config);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = createLineDecoder();
    const buffered = [];
    const nextEvent = async () => {
      while (!buffered.length) {
        const { value, done } = await reader.read();
        const lines = decoder.decode(value, done).split('\n').filter(Boolean);
        buffered.push(...lines.map(line => JSON.parse(line)));
        if (done && !buffered.length) return null;
      }
      return buffered.shift();
    };
    let candidate;
    const beforeReview = [];
    while ((candidate = await nextEvent()) && !candidate.message?.needsApproval) {
      beforeReview.push(candidate);
      assert.notEqual(candidate.type, 'completion');
    }
    assert.equal(candidate?.message.sender, 'Bob', JSON.stringify(beforeReview) + '\n' + output);
    assert.equal((await post('/api/start-conversation', config)).status, 409, 'paused snippet must not be replaced');
    // A single complete JSON response works even without a trailing newline.
    // Same-mode retries must work even when the model returns identical text.
    for (const mode of ['question', 'question', 'drift']) {
      const regenerated = await post('/api/impromptu/regenerate-with-mode', { mode });
      assert.equal(regenerated.status, 200);
      const replacement = await regenerated.json();
      assert.equal(replacement.type, 'regenerated_message');
      assert.equal(replacement.message.derailMode, mode);
      assert.equal(replacement.message.needsApproval, true);
      assert.equal(replacement.message.isApproved, false);
      assert.ok(replacement.message.message.length > 0);
    }
    assert.equal((await post('/api/impromptu/regenerate-with-mode', { mode: 'invalid' })).status, 400);
    const pendingRead = nextEvent();
    assert.equal(await Promise.race([pendingRead.then(() => 'advanced'), new Promise(resolve => setTimeout(() => resolve('paused'), 120))]), 'paused');
    assert.equal((await post('/api/impromptu/approve', { editedContent: '请解释一下这个研究方法。' })).status, 200);
    const events = [];
    let event = await pendingRead;
    while (event) {
      events.push(event);
      if (event.message?.needsApproval) {
        assert.equal((await post('/api/impromptu/reject', {})).status, 200);
      }
      event = await nextEvent();
    }
    const approved = events.filter(item => item.message?.isApproved);
    assert.equal(approved.length, 1, 'accepted candidate must not request approval again');
    assert.equal(approved[0].message.message, '请解释一下这个研究方法。');
    assert.equal(approved[0].message.needsApproval, false);
    assert.ok(events.some(item => item.type === 'completion'), 'final completion must reach the original stream');
    assert.ok(events.some(item => item.message?.needsApproval), 'later turns must still check for interventions');
    assert.equal((await post('/api/impromptu/approve', {})).status, 409, 'finished review cannot be submitted twice');
    // Switching to Reactive then back must preserve the scene's review eligibility.
    assert.equal((await post('/api/conversation/mode', { mode: 'reactive' })).status, 200);
    assert.equal((await post('/api/conversation/mode', { mode: 'human-control' })).status, 200);
    for (const mode of ['reactive', 'autonomous']) {
      const run = await post('/api/start-conversation', { ...config, conversationMode: mode });
      assert.equal(run.status, 200);
      const runEvents = (await run.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.ok(runEvents.some(item => item.type === 'completion'), `${mode} must finish`);
      assert.ok(!runEvents.some(item => item.message?.needsApproval), `${mode} must not wait for review`);
      assert.ok(!runEvents.some(item => item.type === 'error'), `${mode} must not return an error`);
    }
  } finally {
    abort.abort();
    child.kill();
  }
});

