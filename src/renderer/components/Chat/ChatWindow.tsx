import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown, ChevronRight, Activity, Layers, RefreshCw, Square, Pause, Play, PlusCircle, Image as ImageIcon, X } from 'lucide-react';
import { CHANNELS } from '@/shared/constants';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';
import { useContextStore } from '../../store/useContextStore';
import { IAgentMessage } from '@/shared/types';
import { TaskVerification } from './TaskVerification';
import { MissionStatus } from './MissionStatus';
import { useTaskStore } from '../../store/useTaskStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useHistoryStore, SavedTask } from '../../store/useHistoryStore';

interface ITokenStats {
    totalInput: number;
    totalOutput: number;
    currentContextSize: number;
    agentStats: Record<string, { input: number; output: number; contextSize: number }>;
}

const TokenStatsHeader: React.FC<{ stats: ITokenStats, onCompress: () => void, isCompressing: boolean }> = ({ stats, onCompress, isCompressing }) => {
    const [expanded, setExpanded] = useState(false);

    const formatNum = (n: number) => {
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    };

    return (
        <div className="bg-gray-900 border-b border-gray-800 p-2 text-xs font-mono select-none">
            <div className="flex justify-between items-center text-gray-400">
                <div className="flex space-x-4 cursor-pointer" onClick={() => setExpanded(!expanded)} title="Click to view details">
                    <span>In: <span className="text-blue-400">{formatNum(stats.totalInput)}</span></span>
                    <span>Out: <span className="text-green-400">{formatNum(stats.totalOutput)}</span></span>
                    <span>Ctx: <span className="text-yellow-400">{formatNum(stats.currentContextSize)}</span></span>
                </div>
                <button onClick={() => setExpanded(!expanded)} className="hover:text-white p-1">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>
            
            {expanded && (
                <div className="mt-2 pt-2 border-t border-gray-700 animate-in slide-in-from-top-2 duration-200">
                    <table className="w-full text-left mb-3 text-[10px] text-gray-500">
                        <thead>
                            <tr className="border-b border-gray-700 text-gray-400">
                                <th className="pb-1 font-normal">Agent</th>
                                <th className="pb-1 font-normal">In</th>
                                <th className="pb-1 font-normal">Out</th>
                                <th className="pb-1 font-normal">Ctx</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(stats.agentStats).length === 0 ? (
                                <tr><td colSpan={4} className="py-2 text-center italic opacity-50">No data yet</td></tr>
                            ) : (
                                Object.entries(stats.agentStats).map(([agent, s]) => (
                                    <tr key={agent} className="border-b border-gray-800/50 last:border-0">
                                        <td className="py-1 text-gray-300">{agent}</td>
                                        <td className="py-1">{formatNum(s.input)}</td>
                                        <td className="py-1">{formatNum(s.output)}</td>
                                        <td className="py-1">{formatNum(s.contextSize)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    
                    <button 
                        onClick={onCompress} 
                        disabled={isCompressing}
                        className="w-full py-1.5 bg-blue-900/20 hover:bg-blue-900/40 text-blue-300 border border-blue-900/50 rounded flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                       {isCompressing ? (
                           <>
                             <RefreshCw size={12} className="animate-spin" />
                             <span>Compressing Context...</span>
                           </>
                       ) : (
                           <>
                             <Layers size={12} className="group-hover:text-white transition-colors" />
                             <span className="group-hover:text-white transition-colors">Compress Context</span>
                           </>
                       )}
                    </button>
                    <div className="mt-1.5 text-[9px] text-gray-600 text-center">
                        Summarizes older history to save tokens while preserving key details.
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper component for collapsible sections with Retry
const CollapsibleLog: React.FC<{ 
    title: string; 
    content: string; 
    onRetry?: () => void; 
    isRetrying?: boolean 
}> = ({ title, content, onRetry, isRetrying }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mt-2 mb-2 border border-gray-700 rounded bg-gray-900 overflow-hidden text-xs">
      <div 
        className="flex items-center justify-between p-2 hover:bg-gray-800 bg-black/20"
      >
        <div className="flex items-center cursor-pointer flex-1" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <ChevronDown size={14} className="mr-1 text-gray-500" /> : <ChevronRight size={14} className="mr-1 text-gray-500" />}
            <Activity size={12} className="mr-2 text-blue-500" />
            <span className="font-mono font-semibold text-gray-400 select-none">{title}</span>
        </div>
        
        {onRetry && (
            <button 
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className={`p-1 hover:bg-gray-700 rounded ${isRetrying ? 'animate-spin text-blue-400' : 'text-gray-500 hover:text-white'}`}
                title="Retry this step"
            >
                <RefreshCw size={12} />
            </button>
        )}
      </div>
      {isOpen && (
        <div className="p-2 border-t border-gray-800 bg-black/40 font-mono whitespace-pre-wrap text-gray-500">
          {content}
        </div>
      )}
    </div>
  );
};

// Parsed Message Renderer
const FormattedMessage: React.FC<{ content: string }> = ({ content }) => {
  // Regex to split by tags.
  const tagRegex = /<(thought|write_file|replace|read_file)(?: path="([^"]+)")?>([\s\S]*?)(?:<\/\1>|$)|--- Next Step: (.*?) ---|\[System Tool Output\]:([\s\S]*?)(?=\n\n|---|$)|\x5BSystem: Agent marked (.*?) as completed\]|✅ \*\*Auto-completed:\*\* (.*?)(?=\n|$)/g;

  let lastIndex = 0;
  let match;
  const parsedElements: React.ReactNode[] = [];

  while ((match = tagRegex.exec(content)) !== null) {
      // Push preceding text
      if (match.index > lastIndex) {
          parsedElements.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap">{content.substring(lastIndex, match.index)}</span>);
      }

      const [fullMatch, tagName, path, innerContent, nextAgent, toolOutput, markedTask, autoCompletedTask] = match;

      if (tagName) {
          const isComplete = fullMatch.endsWith(`</${tagName}>`);
          
          if (tagName === 'thought') {
              parsedElements.push(
                  <details key={`thought-${match.index}`} open={!isComplete} className="mb-2 bg-gray-900/30 rounded border border-gray-800">
                      <summary className="cursor-pointer px-3 py-1 text-[10px] font-mono text-gray-500 hover:text-gray-400 select-none flex items-center">
                          <ChevronRight size={12} className="mr-1 transform transition-transform details-open:rotate-90" />
                          Thinking Process {isComplete ? '(Complete)' : '(Thinking...)'}
                      </summary>
                      <div className="p-3 text-gray-500 font-mono text-xs whitespace-pre-wrap border-t border-gray-800/50">
                          {innerContent.trim()}
                      </div>
                  </details>
              );
          } else if (tagName === 'write_file' || tagName === 'replace') {
              parsedElements.push(
                  <div key={`file-${match.index}`} className="mb-2 border border-blue-900/30 rounded overflow-hidden">
                      <div className="bg-blue-900/10 px-3 py-1 text-xs font-mono flex items-center justify-between text-blue-400/70">
                          <span className="font-semibold flex items-center">
                              {tagName === 'write_file' ? '📝' : '🔧'} {path || 'File'}
                          </span>
                          {!isComplete && <span className="animate-pulse text-[10px] bg-blue-900/40 px-2 py-0.5 rounded text-blue-300">LIVE</span>}
                      </div>
                      <details open={!isComplete}>
                          <summary className="px-3 py-1 bg-black/10 text-[10px] text-gray-600 cursor-pointer hover:text-gray-400 select-none">
                              {isComplete ? 'Show Content' : 'Writing Content...'}
                          </summary>
                          <div className="p-3 bg-black/20 text-gray-400 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[300px]">
                              {innerContent}
                          </div>
                      </details>
                  </div>
              );
          } else if (tagName === 'read_file') {
               parsedElements.push(
                   <div key={`read-${match.index}`} className="inline-block mr-1 mb-1">
                       <span className="px-2 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-[10px] font-mono text-gray-500">
                           📖 Read: {innerContent.trim()}
                       </span>
                   </div>
               );
          }
      } else if (nextAgent) {
          parsedElements.push(
              <div key={`next-${match.index}`} className="my-4 flex items-center space-x-2 opacity-50">
                  <div className="flex-1 h-[1px] bg-gray-700"></div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Transition to {nextAgent}</span>
                  <div className="flex-1 h-[1px] bg-gray-700"></div>
              </div>
          );
      } else if (toolOutput) {
          parsedElements.push(
              <details key={`tool-${match.index}`} className="mb-2 bg-green-900/5 rounded border border-green-900/20">
                  <summary className="cursor-pointer px-3 py-1 text-[10px] font-mono text-green-700/60 hover:text-green-600 select-none">
                      System Tool Logs
                  </summary>
                  <div className="p-2 text-[10px] text-green-800/50 font-mono whitespace-pre-wrap border-t border-green-900/10">
                      {toolOutput.trim()}
                  </div>
              </details>
          );
      } else if (markedTask) {
          parsedElements.push(
              <div key={`mark-${match.index}`} className="text-[10px] text-gray-500 font-mono italic mb-1 flex items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mr-2"></div>
                  System: {markedTask} marked as completed.
              </div>
          );
      } else if (autoCompletedTask) {
          parsedElements.push(
              <div key={`auto-${match.index}`} className="my-2 p-2 bg-green-900/10 border border-green-900/20 rounded flex items-center text-xs text-green-400/80">
                  <span className="mr-2">✅</span>
                  <span>{autoCompletedTask.trim()}</span>
              </div>
          );
      }

      lastIndex = tagRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < content.length) {
      parsedElements.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap">{content.substring(lastIndex)}</span>);
  }

  return <>{parsedElements}</>;
};

// Message Renderer
const MessageContent: React.FC<{ content: string, steps?: any[], onStepRetry: (step: any) => void }> = ({ content, steps, onStepRetry }) => {
  const [showSteps, setShowSteps] = useState(false);
  const [retryingStepIndex, setRetryingStepIndex] = useState<number | null>(null);

  const handleRetryClick = (step: any, index: number) => {
      setRetryingStepIndex(index);
      onStepRetry(step);
      setTimeout(() => setRetryingStepIndex(null), 2000); 
  };

  return (
    <div className="flex flex-col">
      {steps && steps.length > 0 && (
        <div className="mb-2">
            <button 
                onClick={() => setShowSteps(!showSteps)}
                className="flex items-center text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 px-2 py-1 rounded"
            >
                <Layers size={12} className="mr-1" />
                {showSteps ? 'Hide Agent Process' : `Show Agent Process (${steps.length} steps)`}
            </button>
            
            {showSteps && (
                <div className="mt-2 pl-2 border-l-2 border-gray-700 space-y-2">
                    {steps.map((step, idx) => (
                        <CollapsibleLog 
                            key={idx} 
                            title={`${step.agent}${step.reasoning ? `: ${step.reasoning}` : ''}`} 
                            content={step.output} 
                            onRetry={() => handleRetryClick(step, idx)}
                            isRetrying={retryingStepIndex === idx}
                        />
                    ))}
                </div>
            )}
        </div>
      )}

      <div className="text-sm">
          <FormattedMessage content={content} />
      </div>
    </div>
  );
};

export const ChatWindow: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<IAgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const [attachments, setAttachments] = useState<Array<{ name: string; preview: string; data: string }>>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { strictMode, setStrictMode, setTasks, initiateMission, stopTimer, tasks, resetTasks } = useTaskStore();
  const autoMarkTasks = !strictMode;
  const setAutoMarkTasks = (val: boolean) => setStrictMode(!val);
  
  const { archiveTask, restoreRequest, clearRestoreRequest } = useHistoryStore();

  // Stats State
  const [tokenStats, setTokenStats] = useState<ITokenStats>({
      totalInput: 0,
      totalOutput: 0,
      currentContextSize: 0,
      agentStats: {}
  });
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettingsStore();
  const { fileTree } = useFileStore();
  const { activeContext, clearContext, setContext } = useContextStore();
  const executionStatus = useExecutionStore(state => state.status);

  useEffect(() => {
    // Listen for custom prompts (e.g. from ChecklistPanel)
    const handleInsertPrompt = (e: any) => {
        if (e.detail) {
            setInput(e.detail);
        }
    };
    window.addEventListener('gemini:insert-prompt', handleInsertPrompt);
    return () => window.removeEventListener('gemini:insert-prompt', handleInsertPrompt);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  // Handle History Restoration
  useEffect(() => {
      if (restoreRequest) {
          setMessages(restoreRequest.messages);
          setTasks(restoreRequest.tasks);
          setContext(restoreRequest.context);
          if (restoreRequest.tokenStats) {
              setTokenStats(restoreRequest.tokenStats);
          }
          clearRestoreRequest();
      }
  }, [restoreRequest, setContext, setTasks, clearRestoreRequest]);

  // --- Attachment Handlers ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          processFiles(Array.from(e.target.files));
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
      if (e.clipboardData.items) {
          const items = Array.from(e.clipboardData.items);
          const files: File[] = [];
          
          for (const item of items) {
              if (item.type.indexOf('image') !== -1) {
                  const file = item.getAsFile();
                  if (file) files.push(file);
              }
          }
          
          if (files.length > 0) {
              processFiles(files);
          }
      }
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (files.length > 0) {
              processFiles(files);
          }
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const processFiles = (files: File[]) => {
      files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (e) => {
              if (e.target?.result) {
                  setAttachments(prev => [...prev, {
                      name: file.name,
                      preview: e.target!.result as string,
                      data: e.target!.result as string
                  }]);
              }
          };
          reader.readAsDataURL(file);
      });
  };

  const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- End Attachment Handlers ---

  const handleResetChat = async () => {
      if (!window.electron) return;
      
      const confirm = window.confirm("Are you sure you want to start a new task? This will save the current session to history and clear everything.");
      if (!confirm) return;

      // 1. Archive current session
      if (messages.length > 0) {
          const firstUserMsg = messages.find(m => m.role === 'user');
          const name = firstUserMsg ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '') : `Task ${new Date().toLocaleString()}`;
          
          archiveTask({
              id: Date.now().toString(),
              name,
              timestamp: Date.now(),
              messages: [...messages],
              tasks: [...tasks],
              context: [...activeContext],
              tokenStats: { ...tokenStats }
          });
      }

      // 2. Clear Local State
      setMessages([]);
      setTokenStats({
          totalInput: 0,
          totalOutput: 0,
          currentContextSize: 0,
          agentStats: {}
      });
      setAttachments([]);

      // 3. Clear Stores
      resetTasks();
      clearContext();

      // 4. Reset Backend
      await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.RESET_SESSION);
  };

  // Streaming & Stats Listener
  useEffect(() => {
      if (window.electron) {
          const removeStepListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_STEP_UPDATE, (data: { steps: any[] }) => {
              setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                      return [
                          ...prev.slice(0, -1),
                          { ...lastMsg, steps: data.steps }
                      ];
                  }
                  return prev;
              });
          });

          const removeContentListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, (data: { content?: string, delta?: string }) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                    let newContent = lastMsg.content;
                    if (data.content) {
                        newContent = data.content;
                    } else if (data.delta) {
                        newContent += data.delta;
                    }

                    return [
                        ...prev.slice(0, -1),
                        { ...lastMsg, content: newContent }
                    ];
                }
                return prev;
            });
        });

        const removeStatusListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_STATUS_UPDATE, (data: { agent: string }) => {
            setCurrentAgent(data.agent);
        });

        const removeTokenListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_TOKEN_UPDATE, (stats: ITokenStats) => {
            setTokenStats(stats);
        });

        const removePlanListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_PLAN_UPDATE, (tasks: any[]) => {
            setTasks(tasks);
        });

        const removePausedListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_PAUSED, (contextData: any) => {
             useExecutionStore.getState().setStatus('PAUSED');
             useExecutionStore.getState().setPausedContext(contextData);
        });

        const removeResumedListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_RESUMED, () => {
             useExecutionStore.getState().setStatus('RUNNING');
             useExecutionStore.getState().setPausedContext(null);
        });

          return () => {
              removeStepListener();
              removeContentListener();
              removeStatusListener();
              removeTokenListener();
              removePlanListener();
              removePausedListener();
              removeResumedListener();
          };
      }
  }, []);

  const handleStepRetry = async (step: any) => {
      if (isThinking || !window.electron) return;
      
      setIsThinking(true);
      setCurrentAgent(step.agent);
      initiateMission(); // Start timer on retry
      try {
          // Send request to run ONLY this agent with the stored input
          const response = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEND_MESSAGE, {
              agent: step.agent,
              message: step.input, // The original input for this step
              context: { fileTree, activeContext, autoApply, autoMarkTasks }
          });

          // We append the result as a NEW message for clarity
          const retryMsg: IAgentMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            agentName: `${step.agent} (Retry)`,
            content: response.content,
            steps: [], 
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, retryMsg]);

      } catch (err) {
          console.error("Retry failed", err);
      } finally {
          setIsThinking(false);
          setCurrentAgent(null);
          stopTimer(); // Stop timer when done
      }
  };

  const handleStop = async () => {
    if (window.electron) {
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.ABORT_WORKFLOW);
        setIsThinking(false);
        setCurrentAgent(null);
        stopTimer(); // Stop timer on abort
    }
  };

  const handleCompressContext = async () => {
      if (!window.electron || isCompressing) return;
      setIsCompressing(true);
      try {
          // Pass current messages to backend for compression
          const newMessages = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.COMPRESS_CONTEXT, messages);
          if (newMessages) {
              setMessages(newMessages);
          }
      } catch (err) {
          console.error("Compression failed", err);
      } finally {
          setIsCompressing(false);
      }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isThinking) return;

    let finalContent = input;
    
    // Upload images if any
    if (attachments.length > 0 && window.electron) {
        setIsThinking(true); // temporary lock
        try {
            for (const att of attachments) {
                const result = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SAVE_TEMP_IMAGE, {
                    name: att.name,
                    data: att.data
                });
                
                if (result.success && result.path) {
                    finalContent += `\n\n{{IMAGE:${result.path}}}`;
                } else {
                    console.error("Failed to upload image", result.error);
                }
            }
        } catch (e) {
            console.error("Image upload failed", e);
        }
    }

    const userMsg: IAgentMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: finalContent,
      timestamp: Date.now()
    };

    // Add User Message
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]); // Clear attachments
    setIsThinking(true);
    setCurrentAgent('Router'); // Initial state
    initiateMission(); // Start timer immediately

    // Add Placeholder Bot Message
    const botId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
        id: botId,
        role: 'assistant',
        agentName: 'Gemini',
        content: '', // Empty initially
        steps: [],
        timestamp: Date.now(),
        isStreaming: true // Marker
    }]);

    try {
        let responseContent = "I am in browser mode. Connect to Electron for AI.";
        
        console.log("Frontend: Sending message. Current History Length:", messages.length);

        if (window.electron) {
            // Send to backend
            const response = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEND_MESSAGE, {
                agent: 'Router', // Default
                message: userMsg.content,
                context: {
                    fileTree: fileTree,
                    activeContext: activeContext,
                    autoApply: autoApply,
                    autoMarkTasks: autoMarkTasks
                },
                history: messages // Pass existing history
            });
            responseContent = response.content;
            
            // Update the placeholder with final content and remove streaming flag
            setMessages(prev => {
                return prev.map(msg => {
                    if (msg.id === botId) {
                        return { ...msg, content: responseContent, steps: response.steps || msg.steps, isStreaming: false };
                    }
                    return msg;
                });
            });
        } else {
             setMessages(prev => prev.map(msg => msg.id === botId ? { ...msg, content: responseContent, isStreaming: false } : msg));
        }

    } catch (err) {
        console.error(err);
        const errorMsg: IAgentMessage = {
            id: (Date.now() + 2).toString(),
            role: 'system',
            content: "Error communicating with Agent.",
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMsg]);
        setMessages(prev => prev.map(msg => msg.id === botId ? { ...msg, isStreaming: false } : msg));
    } finally {
        setIsThinking(false);
        setCurrentAgent(null);
        stopTimer(); // Stop timer when workflow completes
    }
  };

  const handlePause = async () => {
      if (window.electron) await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.PAUSE_WORKFLOW);
  };

  const handleResume = async () => {
      if (window.electron) await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.RESUME_WORKFLOW);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-900">
        <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-200">Agent Chat</span>
            <button 
                onClick={handleResetChat}
                className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-blue-400 transition-colors"
                title="Start New Task (Reset Conversation)"
            >
                <PlusCircle size={16} />
            </button>
        </div>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer group" title="When disabled, you will be asked to confirm task completion">
                <input 
                    type="checkbox" 
                    checked={autoMarkTasks} 
                    onChange={(e) => setAutoMarkTasks(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
                />
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">Auto-Mark</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer group" title="When disabled, you will review code changes before applying">
                <input 
                    type="checkbox" 
                    checked={autoApply} 
                    onChange={(e) => setAutoApply(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">Auto-Apply</span>
            </label>
            <span className="text-xs text-gray-500">{settings.selectedModel}</span>
        </div>
      </div>
      
      {/* Token Stats Bar */}
      <TokenStatsHeader 
          stats={tokenStats} 
          onCompress={handleCompressContext}
          isCompressing={isCompressing}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] rounded-lg p-3 ${ 
              msg.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : msg.role === 'system'
                ? 'bg-red-900/50 text-red-200 border border-red-800'
                : 'bg-gray-800 text-gray-200 border border-gray-700'
            }`}>
              {msg.agentName && <div className="text-xs font-bold mb-1 text-blue-400">{msg.agentName}</div>}
              <div className="text-sm">
                <MessageContent 
                    content={msg.content} 
                    steps={msg.steps} 
                    onStepRetry={handleStepRetry}
                />
              </div>
            </div>
          </div>
        ))}
        {isThinking && (
            <div className="flex justify-start items-center space-x-2">
                <div className="bg-gray-800 text-gray-400 text-xs px-3 py-2 rounded-lg animate-pulse">
                    Thinking...
                </div>
            </div>
        )}
        
        {/* Verification Modal Inject */}
        <TaskVerification />
        <div ref={messagesEndRef} />
      </div>

      <MissionStatus />

      {/* Input */}
      <div 
        className={`p-4 bg-gray-900 border-t border-gray-800 transition-colors ${isDragging ? 'bg-blue-900/20' : ''}`}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isThinking && currentAgent && (
            <div className="mb-2 flex items-center space-x-2 animate-pulse">
                <span className="text-xs font-mono text-blue-400 font-bold">{currentAgent}</span>
                <span className="text-xs text-gray-500">is working...</span>
            </div>
        )}

        {/* Attachment Previews */}
        {attachments.length > 0 && (
            <div className="flex space-x-2 mb-2 overflow-x-auto pb-2">
                {attachments.map((att, index) => (
                    <div key={index} className="relative group flex-shrink-0">
                        <img 
                            src={att.preview} 
                            alt={att.name} 
                            className="h-16 w-16 object-cover rounded border border-gray-700" 
                        />
                        <button 
                            onClick={() => removeAttachment(index)}
                            className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                            <X size={10} />
                        </button>
                    </div>
                ))}
            </div>
        )}

        <div className="relative flex items-end space-x-2">
           <input 
               type="file" 
               multiple 
               accept="image/*" 
               className="hidden" 
               ref={fileInputRef}
               onChange={handleFileSelect}
           />
           <button 
               onClick={() => fileInputRef.current?.click()}
               className="p-2 mb-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
               title="Attach Image"
           >
               <ImageIcon size={20} />
           </button>

          <textarea
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            placeholder={isDragging ? "Drop images here..." : "Ask the agents... (Paste images or use +)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          
          <div className="flex flex-col space-y-2 mb-1">
              {isThinking ? (
                <div className="flex space-x-1">
                    {executionStatus === 'PAUSED' ? (
                         <button 
                            onClick={handleResume}
                            className="p-1.5 bg-green-600 rounded-md text-white hover:bg-green-500 transition-colors"
                            title="Resume Workflow"
                          >
                            <Play size={16} fill="currentColor" />
                          </button>
                    ) : (
                          <button 
                            onClick={handlePause}
                            className="p-1.5 bg-yellow-600 rounded-md text-white hover:bg-yellow-500 transition-colors"
                            title="Pause Workflow"
                          >
                            <Pause size={16} fill="currentColor" />
                          </button>
                    )}
                    <button 
                      onClick={handleStop}
                      className="p-1.5 bg-red-600 rounded-md text-white hover:bg-red-500 transition-colors"
                      title="Stop Generation"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                </div>
              ) : (
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() && attachments.length === 0}
                  className="p-1.5 bg-blue-600 rounded-md text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};