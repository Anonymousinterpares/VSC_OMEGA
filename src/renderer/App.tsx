import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from './store/useSettingsStore';
import { useFileStore } from './store/useFileStore';
import { useContextStore } from './store/useContextStore';
import { useSearchStore } from './store/useSearchStore';
import { useViewStore } from './store/useViewStore';
import { useExecutionStore } from './store/useExecutionStore';
import { SettingsModal } from './components/Modals/SettingsModal';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { ReviewWindow } from './components/Modals/ReviewWindow';
import { TabBar } from './components/Editor/TabBar';
import { WorkflowEditor } from './components/WorkflowEditor/WorkflowEditor';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import Editor, { OnMount } from '@monaco-editor/react';
import { CHANNELS } from '@/shared/constants';

function App() {
  const { toggleModal } = useSettingsStore();
  const { selectedFile, unsavedFiles, setUnsavedFile, activeTabId, closeTab, tabs } = useFileStore(); // Updated Store
  const { addContextItem } = useContextStore();
  const { highlightTarget, setHighlightTarget } = useSearchStore();
  const { activeView } = useViewStore();
  const { setAgentPhase } = useExecutionStore();
  
  const [fileContent, setFileContent] = useState("// Welcome to The Hive");
  // const [isDirty, setIsDirty] = useState(false); // Removed local dirty state, use store
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsCollection = useRef<any>(null);
  
  // Debounce backup
  const backupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load File (Disk OR Unsaved Memory)
  useEffect(() => {
    const loadFile = async () => {
      // Logic relies on 'selectedFile' which is now driven by 'activeTabId' in the store
      if (selectedFile && window.electron) {
        // Check if we have an unsaved version in memory
        if (unsavedFiles.has(selectedFile)) {
            setFileContent(unsavedFiles.get(selectedFile)!);
            return;
        }

        try {
            const content = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.READ_FILE, selectedFile);
            setFileContent(content);
        } catch (error) {
            console.error("Failed to read file:", error);
            setFileContent("// Error reading file");
        }
      } else if (!selectedFile) {
          setFileContent("// Welcome to The Hive");
      }
    };
    loadFile();
  }, [selectedFile]); // React to selectedFile changes (which happen when activeTab changes)

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
  }, [highlightTarget, fileContent, selectedFile]); 

  // Agent Phase Listener
  useEffect(() => {
    if (window.electron) {
      const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_PHASE_UPDATE, (data: { phase: any, details: string }) => {
          setAgentPhase(data.phase, data.details);
      });
      return () => removeListener();
    }
  }, []);

  // Live File Update Listener
  useEffect(() => {
      if (window.electron) {
          const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FILE_UPDATED, (data: { path: string, content: string }) => {
              if (selectedFile && data.path === selectedFile) {
                  setFileContent(data.content);
                  setUnsavedFile(data.path, null); // Clear dirty state
                  // Also clear backup
                   window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.BACKUP_FILE, { filePath: data.path, content: null });
              }
          });
          return () => removeListener();
      }
  }, [selectedFile]);

  // Agent Read File Listener (Auto-Add to Context)
  useEffect(() => {
      if (window.electron) {
          const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.FILE_READ, (data: { path: string, content: string }) => {
              const currentContext = useContextStore.getState().activeContext;
              // Check if already in context to avoid duplicates
              if (!currentContext.some(item => item.path === data.path)) {
                  addContextItem({
                      id: data.path, // Use path as ID
                      type: 'file',
                      path: data.path,
                      content: data.content
                  });
              }
          });
          return () => removeListener();
      }
  }, []);

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
                const currentFile = useFileStore.getState().selectedFile;
                addContextItem({
                    id: Date.now().toString(),
                    type: 'fragment',
                    path: currentFile || 'Untitled',
                    content: content,
                    startLine: selection.startLineNumber,
                    endLine: selection.endLineNumber
                });
            }
        }
    });
  };

  const handleFileChange = (value: string | undefined) => {
      const newContent = value || '';
      setFileContent(newContent);
      
      if (selectedFile) {
          setUnsavedFile(selectedFile, newContent);
          
          // Debounce Backup
          if (backupTimeoutRef.current) clearTimeout(backupTimeoutRef.current);
          backupTimeoutRef.current = setTimeout(() => {
              if (window.electron) {
                  window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.BACKUP_FILE, { 
                      filePath: selectedFile, 
                      content: newContent 
                  });
              }
          }, 1000); // 1s debounce
      }
  };

  // Simple Save on Ctrl+S
  useEffect(() => {
      const handleSave = async (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              if (selectedFile && window.electron && unsavedFiles.has(selectedFile)) {
                 try {
                     await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.WRITE_FILE, {
                         filePath: selectedFile,
                         content: fileContent
                     });
                     setUnsavedFile(selectedFile, null); // Mark clean
                     // Clear Backup
                     window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.BACKUP_FILE, { filePath: selectedFile, content: null });
                 } catch (err) {
                     console.error("Failed to save:", err);
                 }
              }
          }
      };
      window.addEventListener('keydown', handleSave);
      return () => window.removeEventListener('keydown', handleSave);
  }, [selectedFile, fileContent, unsavedFiles]);

  const isDirty = selectedFile ? unsavedFiles.has(selectedFile) : false;

  // Handle App Close Request (Dirty Check)
  useEffect(() => {
      if (window.electron) {
          const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.DIRTY_CHECK_REQUEST, () => {
              const unsavedCount = unsavedFiles.size;
              window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.CHECK_DIRTY, { 
                  isDirty: unsavedCount > 0, 
                  unsavedCount 
              });
          });
          return () => removeListener();
      }
  }, [unsavedFiles]);

  // Check for Backups on Startup
  useEffect(() => {
      if (window.electron) {
          window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.GET_BACKUPS).then((backups: string[]) => {
              if (backups.length > 0) {
                  const message = `Recovered ${backups.length} unsaved files from a previous session:\n\n${backups.map(p => p.split(/[/\\]/).pop()).join('\n')}\n\nDo you want to restore them to your workspace? (Cancel will delete backups)`;
                  if (confirm(message)) {
                       // Restore logic: Load backups into unsavedFiles store
                       backups.forEach(async (path) => {
                           try {
                               const content = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.RESTORE_BACKUP, path);
                               if (content !== null) {
                                   setUnsavedFile(path, content);
                                   // Also open the file if it's the first one
                                   useFileStore.getState().openFile(path, false);
                               }
                           } catch (e) {
                               console.error(`Failed to restore backup for ${path}`, e);
                           }
                       });
                  } else {
                      // Clear backups
                      backups.forEach(path => {
                           window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.BACKUP_FILE, { filePath: path, content: null });
                      });
                  }
              }
          });
      }
  }, []);

  // Determine language from file extension
  const getLanguageFromFilename = (filename: string): string => {
      const ext = filename.split('.').pop()?.toLowerCase();
      switch (ext) {
          case 'ts':
          case 'tsx': return 'typescript';
          case 'js':
          case 'jsx': return 'javascript';
          case 'py': return 'python';
          case 'css': return 'css';
          case 'html': return 'html';
          case 'json': return 'json';
          case 'md': return 'markdown';
          default: return 'text'; // Fallback
      }
  };

  const language = selectedFile ? getLanguageFromFilename(selectedFile) : 'typescript';
  const syntaxTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Syntax Checking Effect
  useEffect(() => {
      if (language === 'python' && editorRef.current && monacoRef.current && window.electron) {
          const model = editorRef.current.getModel();
          
          if (syntaxTimeoutRef.current) clearTimeout(syntaxTimeoutRef.current);
          
          syntaxTimeoutRef.current = setTimeout(async () => {
              try {
                  const markers = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.CHECK_SYNTAX, {
                      language,
                      content: fileContent
                  });
                  
                  if (model) {
                      monacoRef.current.editor.setModelMarkers(model, 'owner', markers);
                  }
              } catch (e) {
                  console.error("Syntax Check Failed", e);
              }
          }, 800); // Debounce 800ms
      }
      
      return () => {
          if (syntaxTimeoutRef.current) clearTimeout(syntaxTimeoutRef.current);
      };
  }, [fileContent, language]);

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-gray-300 overflow-hidden font-sans relative">
      <SettingsModal />
      <ReviewWindow />

      {/* LEFT SIDEBAR */}
      <div className="w-80 border-r border-gray-800 bg-gray-900 flex-shrink-0">
         <Sidebar />
      </div>

      {/* CENTER: Editor or Workflow */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
         {activeView === 'workflow' ? (
             <WorkflowEditor />
         ) : (
             <>
                 {/* Tabs Bar */}
                 <TabBar />
                 
                 {/* Editor Area */}
                 <div className="flex-1 relative">
                    {selectedFile ? (
                        <Editor 
                            height="100%" 
                            language={language}
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
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 select-none">
                            <div className="text-center">
                                <p className="text-xl font-semibold mb-2">The Hive</p>
                                <p className="text-sm">Select a file to start editing</p>
                            </div>
                        </div>
                    )}
                 </div>
             </>
         )}
      </div>

      {/* RIGHT: Agent Chat */}
      <div className="w-96 h-full border-l border-gray-800 flex-shrink-0">
        <ChatWindow />
      </div>

      <TerminalPanel />
    </div>
  );
}

export default App;
