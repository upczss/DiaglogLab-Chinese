// Test preload: all model HTTP calls are intercepted before the server starts.
import axios from 'axios';
axios.post = async (url, body) => {
  if (!String(url).startsWith('https://api.deepseek.com/')) throw new Error('Unexpected external request in test');
  const prompt = body.messages?.map(message => message.content).join('\n') || '';
  const content = /JSON|json/.test(prompt)
    ? JSON.stringify({ points: [], analogies: [], themes: [], coherenceScore: 0.8, overallSentiment: 0, sentiment: {} })
    : '这是模拟的中文发言。我们继续讨论这个问题。';
  return { data: { choices: [{ message: { content } }] } };
};
