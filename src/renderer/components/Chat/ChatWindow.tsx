import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown, ChevronRight, Activity, Layers, RefreshCw, Square } from 'lucide-react';
import { CHANNELS } from '@/shared/constants';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';
import { useContextStore } from '../../store/useContextStore';
import { IAgentMessage } from '@/shared/types';
import { TaskVerification } from './TaskVerification';

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
  // Regex to split by tags. Captures the full tag block.
  // Supports: <thought>, <write_file>, <replace>, <read_file>
  // Note: This simple regex assumes no nested tags of the same type.
  const regex = /(<(thought|write_file|replace|read_file)(?: path="([^"]+)")?>([\s\S]*?)<\/\2>)/g;
  
  const parts = content.split(regex);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // The split with capturing groups returns: 
      // [text, full_tag, tag_name, path_attr, inner_content, text, ...]
      // We need to detect if 'part' is one of the matched groups or plain text.
      // Actually, split output structure is:
      // 0: text before
      // 1: full tag
      // 2: tag name
      // 3: path (undefined if none)
      // 4: content
      // 5: text after (becomes next iteration's text before)
      // BUT, React's split logic or JS split might behave differently with multiple groups.
      // Let's use a cleaner matchAll approach or just a simple parser.
  }

  // Simpler Parser Approach
  let lastIndex = 0;
  let match;
  const parsedElements: React.ReactNode[] = [];
  
  // Reset regex
  const tagRegex = /<(thought|write_file|replace|read_file)(?: path="([^"]+)")?>([\s\S]*?)<\/\1>/g;

  while ((match = tagRegex.exec(content)) !== null) {
      // Push preceding text
      if (match.index > lastIndex) {
          parsedElements.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap">{content.substring(lastIndex, match.index)}</span>);
      }

      const tagName = match[1];
      const path = match[2]; // Might be undefined
      const innerContent = match[3];

      if (tagName === 'thought') {
          parsedElements.push(
              <details key={`thought-${match.index}`} className="mb-2 bg-gray-900/50 rounded border border-gray-700">
                  <summary className="cursor-pointer px-3 py-1 text-xs font-mono text-gray-500 hover:text-gray-300 select-none">
                      Thinking Process
                  </summary>
                  <div className="p-3 text-gray-400 font-mono text-xs whitespace-pre-wrap border-t border-gray-700">
                      {innerContent.trim()}
                  </div>
              </details>
          );
      } else if (tagName === 'write_file' || tagName === 'replace') {
          parsedElements.push(
              <div key={`file-${match.index}`} className="mb-2 border border-blue-900/50 rounded overflow-hidden">
                  <div className="bg-blue-900/20 px-3 py-1 text-xs font-mono flex items-center justify-between text-blue-300">
                      <span className="font-bold flex items-center">
                          {tagName === 'write_file' ? '📝 Write File' : '🔧 Patch File'}: {path || 'Unknown'}
                      </span>
                  </div>
                  <details>
                      <summary className="px-3 py-1 bg-black/20 text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">
                          Show Content
                      </summary>
                      <div className="p-3 bg-black/40 text-gray-300 font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                          {innerContent.trim()}
                      </div>
                  </details>
              </div>
          );
      } else if (tagName === 'read_file') {
           // Hide read_file blocks mostly, or show small pill
           parsedElements.push(
               <div key={`read-${match.index}`} className="inline-block mr-1 mb-1">
                   <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] font-mono text-gray-500">
                       📖 Read: {innerContent.trim()}
                   </span>
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
  const [autoMarkTasks, setAutoMarkTasks] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettingsStore();
  const { fileTree } = useFileStore();
  const { activeContext } = useContextStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Streaming Listener
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

          const removeContentListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_CONTENT_UPDATE, (data: { content: string }) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                    return [
                        ...prev.slice(0, -1),
                        { ...lastMsg, content: data.content }
                    ];
                }
                return prev;
            });
        });

        const removeStatusListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_STATUS_UPDATE, (data: { agent: string }) => {
            setCurrentAgent(data.agent);
        });

          return () => {
              removeStepListener();
              removeContentListener();
              removeStatusListener();
          };
      }
  }, []);

  const handleStepRetry = async (step: any) => {
      if (isThinking || !window.electron) return;
      
      setIsThinking(true);
      setCurrentAgent(step.agent);
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
      }
  };

  const handleStop = async () => {
    if (window.electron) {
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.ABORT_WORKFLOW);
        setIsThinking(false);
        setCurrentAgent(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg: IAgentMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    // Add User Message
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);
    setCurrentAgent('Router'); // Initial state

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
                }
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
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-900">
        <span className="font-semibold text-gray-200">Agent Chat</span>
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
      </div>

      {/* Input */}
      <div className="p-4 bg-gray-900 border-t border-gray-800">
        {isThinking && currentAgent && (
            <div className="mb-2 flex items-center space-x-2 animate-pulse">
                <span className="text-xs font-mono text-blue-400 font-bold">{currentAgent}</span>
                <span className="text-xs text-gray-500">is working...</span>
            </div>
        )}
        <div className="relative">
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            placeholder="Ask the agents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isThinking ? (
            <button 
              onClick={handleStop}
              className="absolute bottom-2 right-2 p-1.5 bg-red-600 rounded-md text-white hover:bg-red-500 transition-colors"
              title="Stop Generation"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute bottom-2 right-2 p-1.5 bg-blue-600 rounded-md text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
