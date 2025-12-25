import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { X, Settings, BookOpen } from 'lucide-react';
import { CHANNELS } from '../../../shared/constants';

export const SettingsModal: React.FC = () => {
  const { settings, isOpen, toggleModal, saveSettings, loadSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'instructions'>('general');
  
  // General State
  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [model, setModel] = useState(settings.selectedModel);
  const [mode, setMode] = useState(settings.agenticMode || 'agentic');
  const [opMode, setOpMode] = useState(settings.operationMode || 'standard');

  // Instructions State
  const [globalInst, setGlobalInst] = useState("");
  const [projectInst, setProjectInst] = useState("");

  useEffect(() => {
    if (isOpen) {
        loadSettings().then(() => {
            const current = useSettingsStore.getState().settings;
            setApiKey(current.geminiApiKey);
            setModel(current.selectedModel);
            setMode(current.agenticMode || 'agentic');
            setOpMode(current.operationMode || 'standard');
        });

        if (window.electron) {
            window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.GET_INSTRUCTIONS).then((res: any) => {
                setGlobalInst(res.global || "");
                setProjectInst(res.project || "");
            });
        }
    }
  }, [isOpen]);

  const handleSave = async () => {
    await saveSettings({ 
        geminiApiKey: apiKey, 
        selectedModel: model, 
        agenticMode: mode,
        operationMode: opMode
    });

    if (window.electron) {
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_INSTRUCTIONS, { type: 'global', content: globalInst });
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_INSTRUCTIONS, { type: 'project', content: projectInst });
    }

    toggleModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white rounded-lg w-[600px] h-[500px] shadow-xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings size={20} /> Settings
          </h2>
          <button onClick={toggleModal} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
            <button 
                onClick={() => setActiveTab('general')}
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'general' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
                General
            </button>
            <button 
                onClick={() => setActiveTab('instructions')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'instructions' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
                <BookOpen size={14} /> Master Instructions
            </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'general' ? (
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

                <div>
                    <label className="block text-sm font-medium mb-1">Operation Mode</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOpMode('standard')}
                            className={`flex-1 py-2 px-3 rounded border ${opMode === 'standard' ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                        >
                            <div className="font-bold text-sm">Standard</div>
                            <div className="text-xs opacity-75">Full Access</div>
                        </button>
                        <button
                            onClick={() => setOpMode('documentation')}
                            className={`flex-1 py-2 px-3 rounded border ${opMode === 'documentation' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                        >
                            <div className="font-bold text-sm">Documentation</div>
                            <div className="text-xs opacity-75">Read-Only + Markdown</div>
                        </button>
                    </div>
                </div>
              </div>
          ) : (
              <div className="space-y-4 h-full flex flex-col">
                  <div className="flex-1 flex flex-col">
                      <label className="block text-sm font-medium mb-1">Global Instructions (App Data)</label>
                      <textarea
                          className="w-full flex-1 bg-gray-900 border border-gray-700 rounded p-2 focus:outline-none focus:border-blue-500 text-xs font-mono"
                          value={globalInst}
                          onChange={(e) => setGlobalInst(e.target.value)}
                          placeholder="Instructions that apply to ALL projects..."
                      />
                  </div>
                  <div className="flex-1 flex flex-col">
                      <label className="block text-sm font-medium mb-1">Project Instructions (.gemini/instructions.md)</label>
                      <textarea
                          className="w-full flex-1 bg-gray-900 border border-gray-700 rounded p-2 focus:outline-none focus:border-blue-500 text-xs font-mono"
                          value={projectInst}
                          onChange={(e) => setProjectInst(e.target.value)}
                          placeholder="Instructions specific to this project..."
                      />
                  </div>
              </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-medium"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
