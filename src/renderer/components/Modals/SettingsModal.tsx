import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { X } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const { settings, isOpen, toggleModal, saveSettings, loadSettings } = useSettingsStore();
  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [model, setModel] = useState(settings.selectedModel);
  const [mode, setMode] = useState(settings.agenticMode || 'agentic');

  useEffect(() => {
    if (isOpen) {
        loadSettings().then(() => {
            // Re-sync local state with store after load
            const current = useSettingsStore.getState().settings;
            setApiKey(current.geminiApiKey);
            setModel(current.selectedModel);
            setMode(current.agenticMode || 'agentic');
        });
    }
  }, [isOpen]);

  const handleSave = async () => {
    await saveSettings({ geminiApiKey: apiKey, selectedModel: model, agenticMode: mode });
    toggleModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white p-6 rounded-lg w-96 shadow-xl border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={toggleModal} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Gemini API Key</label>
            <input
              type="password"
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 focus:outline-none focus:border-blue-500"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 focus:outline-none focus:border-blue-500"
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Agent Mode</label>
            <div className="flex gap-2">
                <button
                    onClick={() => setMode('agentic')}
                    className={`flex-1 py-2 px-3 rounded border ${mode === 'agentic' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                >
                    <div className="font-bold text-sm">Swarm</div>
                    <div className="text-xs opacity-75">Multi-Agent</div>
                </button>
                <button
                    onClick={() => setMode('solo')}
                    className={`flex-1 py-2 px-3 rounded border ${mode === 'solo' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                >
                    <div className="font-bold text-sm">Solo</div>
                    <div className="text-xs opacity-75">Full-Stack Dev</div>
                </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-medium"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
