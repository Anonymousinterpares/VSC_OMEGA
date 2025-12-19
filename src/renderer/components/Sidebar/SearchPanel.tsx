import React, { useState } from 'react';
import { ChevronRight, ChevronDown, CaseSensitive, WholeWord, Regex, Replace, MoreHorizontal, FileText, X } from 'lucide-react';
import clsx from 'clsx';
import { useSearchStore } from '../../store/useSearchStore';
import { useFileStore } from '../../store/useFileStore';

export const SearchPanel = () => {
  const { 
      query, setQuery, 
      options, setOptions, 
      performSearch, performReplace,
      results, isSearching, 
      clearResults, setHighlightTarget 
  } = useSearchStore();
  
  const { selectFile } = useFileStore();

  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(true); // Default to shown for now
  const [showDetails, setShowDetails] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const toggleFile = (path: string) => {
      setExpandedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          performSearch();
      }
  };

  const handleReplaceAll = () => {
      if (confirm(`Are you sure you want to replace all occurrences of "${query}" with "${replaceQuery}"?`)) {
          performReplace(replaceQuery);
      }
  };

  const handleMatchClick = (filePath: string, match: any) => {
      selectFile(filePath);
      // Determine end column based on match length
      const startCol = match.matchIndex + 1; // Monaco is 1-based
      const endCol = startCol + match.matchLength;
      
      setHighlightTarget({
          filePath,
          line: match.lineNumber,
          range: { startColumn: startCol, endColumn: endCol }
      });
  };

  const toggleOption = (key: keyof typeof options) => {
      // @ts-ignore
      setOptions({ [key]: !options[key] });
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] text-gray-300">
        <div className="p-4 border-b border-gray-700">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 block">Search</span>
            
            <div className="flex flex-col space-y-2 relative">
                {/* Search Input */}
                <div className="relative flex items-center">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l hidden" /> {/* Focus indicator */}
                    <input 
                        className="w-full bg-[#3c3c3c] border border-transparent focus:border-blue-500 outline-none text-sm p-1 pl-2 pr-20 rounded h-8 text-white placeholder-gray-500"
                        placeholder="Search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="absolute right-1 flex space-x-0.5">
                        <button 
                            onClick={() => toggleOption('matchCase')}
                            className={clsx("p-1 rounded hover:bg-gray-600", options.matchCase && "bg-gray-600 text-blue-300")}
                            title="Match Case (Alt+C)"
                        >
                            <CaseSensitive size={14} />
                        </button>
                        <button 
                             onClick={() => toggleOption('matchWholeWord')}
                             className={clsx("p-1 rounded hover:bg-gray-600", options.matchWholeWord && "bg-gray-600 text-blue-300")}
                             title="Match Whole Word (Alt+W)"
                        >
                            <WholeWord size={14} />
                        </button>
                        <button 
                             onClick={() => toggleOption('useRegex')}
                             className={clsx("p-1 rounded hover:bg-gray-600", options.useRegex && "bg-gray-600 text-blue-300")}
                             title="Use Regular Expression (Alt+R)"
                        >
                            <Regex size={14} />
                        </button>
                    </div>
                </div>

                {/* Replace Input */}
                <div className="flex items-center space-x-1">
                    <button onClick={() => setShowReplace(!showReplace)} className="text-gray-500 hover:text-white">
                        <ChevronRight size={14} className={clsx("transition-transform", showReplace && "rotate-90")} />
                    </button>
                    <div className="flex-1 relative">
                        <input 
                            className="w-full bg-[#3c3c3c] border border-transparent focus:border-blue-500 outline-none text-sm p-1 pl-2 rounded h-8 text-white placeholder-gray-500"
                            placeholder="Replace"
                            value={replaceQuery}
                            onChange={(e) => setReplaceQuery(e.target.value)}
                        />
                         <button 
                            className="absolute right-1 top-1 p-1 hover:bg-gray-600 rounded" 
                            title="Replace All"
                            onClick={handleReplaceAll}
                            disabled={!query}
                        >
                            <Replace size={14} />
                        </button>
                    </div>
                </div>

                {/* Details (Include/Exclude) */}
                <div className="flex flex-col space-y-2">
                     <div className="flex items-center space-x-1">
                        <button onClick={() => setShowDetails(!showDetails)} className="text-gray-500 hover:text-white">
                             <MoreHorizontal size={14} />
                        </button>
                        {showDetails && <span className="text-xs text-gray-500">files to include/exclude</span>}
                     </div>

                     {showDetails && (
                         <div className="space-y-2 pl-5">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">files to include</span>
                                <input 
                                    className="bg-[#3c3c3c] border border-transparent focus:border-blue-500 outline-none text-xs p-1 px-2 rounded h-7 text-white"
                                    value={options.includes}
                                    onChange={(e) => setOptions({ includes: e.target.value })}
                                />
                            </div>
                             <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">files to exclude</span>
                                <input 
                                    className="bg-[#3c3c3c] border border-transparent focus:border-blue-500 outline-none text-xs p-1 px-2 rounded h-7 text-white"
                                    value={options.excludes}
                                    onChange={(e) => setOptions({ excludes: e.target.value })}
                                />
                            </div>
                         </div>
                     )}
                </div>
            </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2">
            {isSearching && <div className="text-center text-sm text-gray-500 mt-4">Searching...</div>}
            {!isSearching && results.length === 0 && query && (
                <div className="text-center text-sm text-gray-500 mt-4">No results found.</div>
            )}

            {!isSearching && results.map((result) => {
                const fileName = result.filePath.replace(/\\/g, '/').split('/').pop();
                const isExpanded = expandedFiles[result.filePath] ?? true; // Default expanded

                return (
                    <div key={result.filePath} className="mb-1">
                        <div 
                            className="flex items-center cursor-pointer hover:bg-gray-700 p-1 rounded group"
                            onClick={() => toggleFile(result.filePath)}
                        >
                            <ChevronRight size={14} className={clsx("text-gray-500 transition-transform mr-1", isExpanded && "rotate-90")} />
                            <FileText size={14} className="text-gray-400 mr-2" />
                            <span className="text-sm text-gray-300 font-medium truncate flex-1" title={result.filePath}>{fileName}</span>
                            <span className="text-xs bg-gray-700 text-gray-400 px-1.5 rounded-full group-hover:bg-gray-600">{result.matches.length}</span>
                        </div>

                        {isExpanded && (
                            <div className="ml-6 border-l border-gray-700 pl-1 mt-1 space-y-1">
                                {result.matches.map((match, idx) => (
                                    <div 
                                        key={idx} 
                                        className="text-xs text-gray-400 cursor-pointer hover:bg-[#37373d] hover:text-white p-0.5 rounded truncate font-mono flex items-center"
                                        onClick={() => handleMatchClick(result.filePath, match)}
                                        title={match.lineText.trim()}
                                    >
                                        <span className="w-8 text-right mr-2 text-gray-600 select-none shrink-0">{match.lineNumber}</span>
                                        <span className="truncate">
                                            {match.lineText.substring(0, match.matchIndex)}
                                            <span className="bg-yellow-900/50 text-yellow-200 border border-yellow-700/50 rounded-sm">
                                                {match.lineText.substring(match.matchIndex, match.matchIndex + match.matchLength)}
                                            </span>
                                            {match.lineText.substring(match.matchIndex + match.matchLength)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
  );
};
