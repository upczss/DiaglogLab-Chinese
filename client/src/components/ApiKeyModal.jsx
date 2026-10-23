import React, { useState, useEffect } from 'react';
import API_CONFIG from '../config';
import './ApiKeyModal.css';

const ApiKeyModal = ({ missing, provider = 'gemini', onSelectProvider, onClose, onSaved }) => {
  const [openaiKey, setOpenaiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [ttsKey, setTtsKey] = useState('');
  const [saving, setSaving] = useState(false);

  const saveLocal = (provider, key) => {
    const cleaned = (key || '').trim();
    if (!cleaned) return;
    if (provider === 'openai') localStorage.setItem('OPENAI_API_KEY', cleaned);
    if (provider === 'gemini') localStorage.setItem('GEMINI_API_KEY', cleaned);
    if (provider === 'deepseek') localStorage.setItem('DEEPSEEK_API_KEY', cleaned);
    if (provider === 'tts') localStorage.setItem('TTS_API_KEY', cleaned);
  };

  const saveToServer = async (provider, key) => {
    const response = await fetch(`${API_CONFIG.BASE_URL}/api/llm-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider, apiKey: key.trim() }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '无法将密钥保存到后端');
    }
    
    return response.json();
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const tasks = [];
      
      // Save to server first, then to localStorage
      if (provider === 'openai' && openaiKey) {
        tasks.push(saveToServer('openai', openaiKey));
      }
      if (provider === 'gemini' && geminiKey) {
        tasks.push(saveToServer('gemini', geminiKey));
      }
      if (provider === 'deepseek' && deepseekKey) {
        tasks.push(saveToServer('deepseek', deepseekKey));
      }
      if (ttsKey) {
        tasks.push(saveToServer('tts', ttsKey));
      }
      
      await Promise.all(tasks);
      const selectedKey = { openai: openaiKey, gemini: geminiKey, deepseek: deepseekKey }[provider];
      if (selectedKey) saveLocal(provider, selectedKey);
      if (ttsKey) saveLocal('tts', ttsKey);
      
      // Set the provider on the server
      if (provider && selectedKey) {
        try {
          await fetch(`${API_CONFIG.BASE_URL}/api/llm-provider`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ provider }),
          });
          // Notify the app that provider changed so dropdown can refresh immediately
          try {
            window.dispatchEvent(new CustomEvent('llm-provider-changed', { detail: { provider } }));
          } catch {}
        } catch (error) {
          console.error('Failed to set provider:', error);
        }
      }
      
      onSaved?.();
      onClose?.();
    } catch (e) {
      alert(e.message === 'Failed to fetch' ? '无法连接后端，请确认后端服务已启动后再保存。' : e.message || "保存密钥失败");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const storedOpenAI = localStorage.getItem('OPENAI_API_KEY') || '';
    const storedGemini = localStorage.getItem('GEMINI_API_KEY') || '';
    const storedTts = localStorage.getItem('TTS_API_KEY') || '';
    setDeepseekKey(localStorage.getItem('DEEPSEEK_API_KEY') || '');
    setOpenaiKey(storedOpenAI);
    setGeminiKey(storedGemini);
    setTtsKey(storedTts);
  }, [provider]);

  return (
    <div className="api-key-overlay">
      <div className="api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <div className="api-key-eyebrow">DialogLab—Chinese · 模型连接</div>
        <h2 id="api-key-title" className="text-lg font-semibold mb-1">选择模型服务并填写密钥</h2>
        <p className="text-sm text-gray-600 mb-4">选择默认对话模型服务，再填写对应的 API 密钥。</p>

        <div className="mb-4">
          <label className="block text-xs text-gray-600 mb-1">默认模型服务</label>
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 rounded-md border ${provider === 'gemini' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
              onClick={() => onSelectProvider?.('gemini')}
            >Gemini</button>
            <button
              className={`px-3 py-1.5 rounded-md border ${provider === 'openai' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
              onClick={() => onSelectProvider?.('openai')}
            >OpenAI</button>
            <button
              className={`px-3 py-1.5 rounded-md border ${provider === 'deepseek' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
              onClick={() => onSelectProvider?.('deepseek')}
            >DeepSeek</button>
          </div>
        </div>

        <div className="space-y-3">
          {provider === 'openai' && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">OpenAI API 密钥</label>
              <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="sk-..." value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} />
            </div>
          )}
          {provider === 'deepseek' && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">DeepSeek API 密钥</label>
              <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="sk-..." value={deepseekKey} onChange={e => setDeepseekKey(e.target.value)} />
            </div>
          )}
          {provider === 'gemini' && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Gemini API 密钥</label>
              <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="AIza..." value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Google 语音合成密钥（选填）</label>
            <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Google TTS key" value={ttsKey} onChange={e => setTtsKey(e.target.value)} />
            <p className="api-key-hint">用于生成语音；仅使用文字对话时可以留空。</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className="px-4 py-2 border border-gray-300 rounded-md" onClick={onClose} disabled={saving}>取消</button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50" onClick={handleSaveAll} disabled={saving}> {saving ? "正在保存…" : "保存"} </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;


