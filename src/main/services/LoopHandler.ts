export class LoopHandler {
    // Configuration
    private readonly WINDOW_SIZE = 3000; // Look back at most 3000 characters
    private readonly REPETITION_THRESHOLD = 5; 
    
    // Anchored patterns: Must start at a new line or start of string
    private readonly TRIGGER_PATTERNS = [
      /(?:^|\n)Ready[\.,]/g,
      /(?:^|\n)Wait[\.,]/g,
      /(?:^|\n)Applying[\.,]/g,
      /(?:^|\n)Actually,/g,
      /(?:^|\n)\[COMPLETED:/g,
      /(?:^|\n)Final check/g
    ];
  
    /**
     * Analyzes the current output buffer to detect loops.
     * @param fullText The entire output text generated so far.
     * @returns object containing detected status and suggested trim index.
     */
    public analyze(fullText: string): { isLooping: boolean; trimIndex: number } {
      if (fullText.length < 100) return { isLooping: false, trimIndex: -1 };
  
      // 1. Check if we are inside a "Safe Zone" (Code Block OR Tool Tag)
      // Markdown Code Blocks
      const codeBlockCount = (fullText.match(/```/g) || []).length;
      const insideMarkdownBlock = codeBlockCount % 2 !== 0;

      // Tool Tags (XML-like)
      // We check if the last relevant tag was an OPEN tag for a tool
      const toolTags = ['write_file', 'replace', 'new', 'old', 'read_file', 'execute_command'];
      
      // Matches <tag> or <tag attr="..."...>
      const openTagRegex = new RegExp(`<(${toolTags.join('|')})[^>]*>`, 'g');
      // Matches </tag>
      const closeTagRegex = new RegExp(`</(${toolTags.join('|')})>`, 'g');
      
      const openMatches = fullText.match(openTagRegex) || [];
      const closeMatches = fullText.match(closeTagRegex) || [];
      
      // Simple heuristic: If more opens than closes, we are inside a tool
      const insideToolTag = openMatches.length > closeMatches.length;

      const isSafeZone = insideMarkdownBlock || insideToolTag;

      // **CRITICAL CHANGE**: If we are in a Safe Zone, we DO NOT detect loops.
      // Code generation and tool usage are allowed to be repetitive.
      if (isSafeZone) {
          return { isLooping: false, trimIndex: -1 };
      }

      // 1. Create the Analysis Window
      const windowStart = Math.max(0, fullText.length - this.WINDOW_SIZE);
      const windowText = fullText.slice(windowStart);
  
      // 2. Check for "State Oscillation" (The "Ready... Wait... Ready" loop)
      let stateChangeCount = 0;
      
      for (const pattern of this.TRIGGER_PATTERNS) {
        const matches = windowText.match(pattern);
        if (matches) {
          stateChangeCount += matches.length;
        }
      }
  
      if (stateChangeCount >= this.REPETITION_THRESHOLD) {
        return { 
          isLooping: true, 
          trimIndex: this.findSafeTrimPoint(fullText) 
        };
      }
  
      // 3. Check for "Literal Block Repetition" (Repeating the exact same sentence)
      // Text Mode Only: 150 chars (approx 2 sentences)
      const suffixSize = 150;

      if (windowText.length > suffixSize * 2) {
        const suffix = windowText.slice(-suffixSize);
        const searchPool = windowText.slice(0, -suffixSize); // Everything BEFORE the suffix
        
        const lastOccurrenceIndex = searchPool.lastIndexOf(suffix);
        
        if (lastOccurrenceIndex !== -1) {
          return { 
            isLooping: true, 
            trimIndex: windowStart + lastOccurrenceIndex 
          };
        }
      }
  
      return { isLooping: false, trimIndex: -1 };
    }
  
    private findSafeTrimPoint(fullText: string): number {
      // Cut 60% of the window size from the end
      return Math.max(0, fullText.length - (this.WINDOW_SIZE * 0.6));
    }
  }