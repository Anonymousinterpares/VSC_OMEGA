import React, { useState, useEffect, useRef } from 'react';
import { Settings, FolderOpen, Search, X, Database } from 'lucide-react';
import { useSettingsStore } from './store/useSettingsStore';
import { useFileStore } from './store/useFileStore';
import { useContextStore } from './store/useContextStore';
import { SettingsModal } from './components/Modals/SettingsModal';
import { FileTree } from './components/Sidebar/FileTree';
import { ChatWindow } from './components/Chat/ChatWindow';
import { ReviewWindow } from './components/Modals/ReviewWindow';
import Editor, { OnMount } from '@monaco-editor/react';
import { CHANNELS } from '@/shared/constants';

function App() {
  const { toggleModal } = useSettingsStore();
  const { openFolder, selectedFile } = useFileStore();
  const { addContextItem, activeContext, removeContextItem } = useContextStore();
  const [fileContent, setFileContent] = useState("// Welcome to The Hive");
  const editorRef = useRef<any>(null);

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

  // Live File Update Listener
  useEffect(() => {
      if (window.electron) {
          const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FILE_UPDATED, (data: { path: string, content: string }) => {
              if (selectedFile && data.path === selectedFile) {
                  setFileContent(data.content);
              }
          });
          return () => removeListener();
      }
  }, [selectedFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Add "Add to Context" Action
    editor.addAction({
        id: 'add-to-context',
        label: 'Add Selection to Context',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: (ed) => {
            const selection = ed.getSelection();
            const model = ed.getModel();
            if (selection && model && !selection.isEmpty()) {
                const content = model.getValueInRange(selection);
                addContextItem({
                    id: Date.now().toString(),
                    type: 'fragment',
                    path: selectedFile || 'Untitled',
                    content: content,
                    startLine: selection.startLineNumber,
                    endLine: selection.endLineNumber
                });
            }
        }
    });
  };

  const handleFileChange = (value: string | undefined) => {
      // In a real app, we'd debounce save to disk here
      // For now, we just update local state, but the 'Coder' writes to disk via tool usage.
      // If we want the USER to write to disk, we need a save handler.
      // For this prototype, we'll assume User edits are for 'Context' or scratchpad, 
      // unless we implement explicit Ctrl+S saving.
      setFileContent(value || '');
  };

  // Simple Save on Ctrl+S
  useEffect(() => {
      const handleSave = async (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (selectedFile && window.electron) {
                 // Write current content to disk
                 // We need to invoke a write tool or a dedicated save channel
                 // But wait, the IPC only exposes tools? No, we can invoke arbitrary channels if defined.
                 // We don't have a direct 'SAVE_FILE' channel in constants/main yet publicly visible here 
                 // but we can use the ToolHandler logic or just add a simple IPC handler in main if needed.
                 // For now, let's just log it. 
                 console.log("Save requested (Not fully implemented for User manual save yet)");
              }
          }
      };
      window.addEventListener('keydown', handleSave);
      return () => window.removeEventListener('keydown', handleSave);
  }, [selectedFile, fileContent]);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-300 overflow-hidden font-sans relative">
      <SettingsModal />
      <ReviewWindow />

      {/* LEFT SIDEBAR: Activity Bar + Explorer */}
      <div className="w-72 flex flex-col border-r border-gray-800 bg-gray-900">
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
        <div className="flex-1 overflow-hidden border-b border-gray-800">
            <FileTree />
        </div>

        {/* Context List (Bottom Half) */}
        <div className="h-1/3 flex flex-col bg-gray-900">
            <div className="h-8 flex items-center px-3 bg-[#252526] border-b border-gray-800 border-t">
                <Database size={12} className="mr-2 text-blue-400" />
                <span className="text-xs font-bold text-gray-400 uppercase">Active Context</span>
                <span className="ml-auto text-xs text-gray-600">{activeContext.length} items</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {activeContext.length === 0 && (
                    <div className="text-xs text-gray-600 text-center mt-4 italic">
                        Select code → Right Click → "Add to Context"
                    </div>
                )}
                {activeContext.map(item => (
                    <div key={item.id} className="bg-gray-800 rounded border border-gray-700 p-2 text-xs relative group">
                        <div className="font-bold text-blue-300 mb-1 truncate" title={item.path}>
                            {item.path.split('\\').pop()}
                        </div>
                        <div className="text-gray-500 font-mono">
                            Lines {item.startLine}-{item.endLine}
                        </div>
                        <button 
                            onClick={() => removeContextItem(item.id)}
                            className="absolute top-1 right-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
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
                onChange={handleFileChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                    readOnly: false // User can now edit
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
