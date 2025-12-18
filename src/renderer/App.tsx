import React, { useState, useEffect } from 'react';
import { Settings, FolderOpen, Search } from 'lucide-react';
import { useSettingsStore } from './store/useSettingsStore';
import { useFileStore } from './store/useFileStore';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FileTree } from './components/Sidebar/FileTree';
import { ChatWindow } from './components/Chat/ChatWindow';
import Editor from '@monaco-editor/react';
import { CHANNELS } from '@/shared/constants';

function App() {
  const { toggleModal } = useSettingsStore();
  const { openFolder, selectedFile } = useFileStore();
  const [fileContent, setFileContent] = useState("// Welcome to The Hive");

  useEffect(() => {
    const loadFile = async () => {
      if (selectedFile && window.electron) {
        try {
            const content = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.READ_FILE, selectedFile);
            setFileContent(content);
        } catch (error) {
            console.error("Failed to read file:", error);
            setFileContent("// Error reading file");
        }
      }
    };
    loadFile();
  }, [selectedFile]);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-300 overflow-hidden font-sans">
      <SettingsModal />

      {/* LEFT SIDEBAR: Activity Bar + Explorer */}
      <div className="w-64 flex flex-col border-r border-gray-800 bg-gray-900">
        {/* Title / Controls */}
        <div className="h-10 flex items-center justify-between px-3 border-b border-gray-800 bg-gray-900">
          <span className="font-bold text-sm tracking-wide text-gray-100">EXPLORER</span>
          <div className="flex space-x-2">
            <button onClick={openFolder} className="hover:text-white" title="Open Folder"><FolderOpen size={16} /></button>
            <button className="hover:text-white"><Search size={16} /></button>
            <button onClick={toggleModal} className="hover:text-white"><Settings size={16} /></button>
          </div>
        </div>
        
        {/* File Tree */}
        <div className="flex-1 overflow-hidden">
            <FileTree />
        </div>
      </div>

      {/* CENTER: Editor */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
         {/* Tabs (Placeholder) */}
         <div className="h-9 bg-[#2d2d2d] flex items-center px-4 border-b border-black/20 text-sm text-gray-300">
            <span>{selectedFile ? selectedFile.split('\\').pop() : 'Welcome'}</span>
         </div>
         <div className="flex-1">
            <Editor 
                height="100%" 
                defaultLanguage="typescript" // Dynamic language detection would be better
                theme="vs-dark"
                value={fileContent}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                    readOnly: true // Read-only for now, agents do the writing
                }}
            />
         </div>
      </div>

      {/* RIGHT: Agent Chat */}
      <div className="w-96 h-full border-l border-gray-800">
        <ChatWindow />
      </div>
    </div>
  );
}

export default App;
