import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from './store/useSettingsStore';
import { useFileStore } from './store/useFileStore';
import { useContextStore } from './store/useContextStore';
import { useSearchStore } from './store/useSearchStore';
import { SettingsModal } from './components/Modals/SettingsModal';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { ReviewWindow } from './components/Modals/ReviewWindow';
import Editor, { OnMount } from '@monaco-editor/react';
import { CHANNELS } from '@/shared/constants';

function App() {
  const { toggleModal } = useSettingsStore();
  const { selectedFile } = useFileStore();
  const { addContextItem } = useContextStore();
  const { highlightTarget, setHighlightTarget } = useSearchStore();
  
  const [fileContent, setFileContent] = useState("// Welcome to The Hive");
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsCollection = useRef<any>(null);

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

  // Handle Search Highlight
  useEffect(() => {
      if (highlightTarget && editorRef.current && monacoRef.current) {
          // Check if the current file matches the target file
          if (selectedFile !== highlightTarget.filePath) {
             return;
          }

          const editor = editorRef.current;
          const monaco = monacoRef.current;
          
          // Wrap in timeout to yield to Editor's internal model update from 'fileContent' change
          // This ensures the model is ready and we don't race with the content update
          setTimeout(() => {
              editor.revealLineInCenter(highlightTarget.line);
              editor.setSelection(new monaco.Range(
                  highlightTarget.line, 
                  highlightTarget.range.startColumn, 
                  highlightTarget.line, 
                  highlightTarget.range.endColumn
              ));
              editor.focus();
              
              // Clear previous decorations
              if (decorationsCollection.current) {
                  decorationsCollection.current.clear();
              }
              
              // Add highlight decoration
              decorationsCollection.current = editor.createDecorationsCollection([
                  {
                      range: new monaco.Range(
                          highlightTarget.line, 
                          highlightTarget.range.startColumn, 
                          highlightTarget.line, 
                          highlightTarget.range.endColumn
                      ),
                      options: {
                          isWholeLine: false,
                          className: 'myContentClass',
                          inlineClassName: 'bg-yellow-900/50 text-yellow-100 border border-yellow-600'
                      }
                  }
              ]);
          }, 50);
      }
  }, [highlightTarget, fileContent, selectedFile]); // Added selectedFile dependency

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
    monacoRef.current = monaco;
    
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
      setFileContent(value || '');
  };

  // Simple Save on Ctrl+S
  useEffect(() => {
      const handleSave = async (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (selectedFile && window.electron) {
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

      {/* LEFT SIDEBAR */}
      <div className="w-80 border-r border-gray-800 bg-gray-900 flex-shrink-0">
         <Sidebar />
      </div>

      {/* CENTER: Editor */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
         {/* Tabs (Placeholder) */}
         <div className="h-9 bg-[#2d2d2d] flex items-center px-4 border-b border-black/20 text-sm text-gray-300">
            <span>{selectedFile ? selectedFile.replace(/\\/g, '/').split('/').pop() : 'Welcome'}</span>
         </div>
         <div className="flex-1 relative">
            <Editor 
                height="100%" 
                defaultLanguage="typescript" 
                theme="vs-dark"
                value={fileContent}
                onChange={handleFileChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                    readOnly: false
                }}
            />
         </div>
      </div>

      {/* RIGHT: Agent Chat */}
      <div className="w-96 h-full border-l border-gray-800 flex-shrink-0">
        <ChatWindow />
      </div>
    </div>
  );
}

export default App;
