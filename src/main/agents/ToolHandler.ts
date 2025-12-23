import { FileSystemService } from '../services/FileSystem';
import { ProposalManager } from '../services/ProposalManager';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { CHANNELS } from '../../shared/constants';
import { BrowserWindow } from 'electron';

export interface IToolAction {
    type: 'write' | 'read' | 'replace' | 'execute';
    path: string;
}

export interface IToolResult {
    llmOutput: string;
    userOutput: string;
    actions: IToolAction[];
}

export interface ISingleToolResult {
    llmOutput: string;
    userOutput: string;
    action: IToolAction | null;
}

export class ToolHandler {
  private fileSystem: FileSystemService;
  private proposalManager: ProposalManager;
  private mainWindow: BrowserWindow | null = null;
  private activeProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(fileSystem: FileSystemService, proposalManager: ProposalManager, mainWindow?: BrowserWindow) {
    this.fileSystem = fileSystem;
    this.proposalManager = proposalManager;
    if (mainWindow) this.mainWindow = mainWindow;
  }

  public setMainWindow(window: BrowserWindow) {
      this.mainWindow = window;
  }

  public killActiveProcess() {
      if (this.activeProcess) {
          this.activeProcess.kill();
          this.activeProcess = null;
          if (this.mainWindow) {
              this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.KILLED);
          }
      }
  }

  // --- Atomic Execution Methods ---

  async executeCommand(command: string, autoApply: boolean, isBackground = false): Promise<ISingleToolResult> {
      // 1. Ask for permission (or check autoApply)
      if (!autoApply) {
          const result = await this.proposalManager.requestApproval({
              id: Date.now().toString(),
              type: 'command',
              path: command + (isBackground ? ' (background)' : ''),
              original: '',
              modified: command
          });
          if (result.status !== 'accepted') {
               return {
                  llmOutput: `\n[System] User REJECTED command: ${command}`,
                  userOutput: `\n[System] User REJECTED command: ${command}`,
                  action: null
              };
          }
      }

      // 2. Start Execution
      return new Promise<ISingleToolResult>((resolve) => {
          let stdoutData = "";
          let stderrData = "";
          const cwd = this.fileSystem.getProjectRoot() || undefined;

          // Notify Renderer: Start
          if (this.mainWindow) {
              this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.START, { command, cwd });
          }

          try {
            const child = spawn(command, { 
                cwd,
                shell: true 
            });

            this.activeProcess = child;

            // BACKGROUND MODE: Resolve immediately (after small delay to check for immediate crash)
            if (isBackground) {
                setTimeout(() => {
                    // If process is already dead (exitCode not null), report it
                    if (child.exitCode !== null) {
                         const output = stdoutData + (stderrData ? `\n[STDERR]\n${stderrData}` : '');
                         resolve({
                            llmOutput: `\n[System] Background process exited immediately. Exit Code: ${child.exitCode}\nOutput:\n${output}`,
                            userOutput: `\n[System] Background process failed: ${command}`,
                            action: { type: 'execute', path: command }
                        });
                        this.activeProcess = null; // Clean up
                    } else {
                        // Still running - Resolve "Success" so Agent proceeds
                        resolve({
                            llmOutput: `\n[System] Command started in background (PID: ${child.pid}).\nOutput will stream to the User Terminal.\n[NOTE] You can proceed with other tasks while this runs.`,
                            userOutput: `\n[System] Started background process: ${command}`,
                            action: { type: 'execute', path: command }
                        });
                        // Note: activeProcess remains set, so 'Stop' button still works for this background task.
                        // Future improvement: Support multiple background pids.
                    }
                }, 2000);
            }

            child.stdout.on('data', (data) => {
                const str = data.toString();
                stdoutData += str;
                if (this.mainWindow) {
                    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.OUTPUT, { type: 'stdout', data: str });
                }
            });

            child.stderr.on('data', (data) => {
                const str = data.toString();
                stderrData += str;
                if (this.mainWindow) {
                    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.OUTPUT, { type: 'stderr', data: str });
                }
            });

            child.on('error', (err) => {
                 const errorMsg = err.message;
                 stderrData += errorMsg;
                 if (this.mainWindow) {
                     this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.OUTPUT, { type: 'stderr', data: errorMsg });
                     this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.STOP, { code: 1 });
                 }
                 this.activeProcess = null;
                 
                 // If background, we might have already resolved. 
                 // But typically 'error' fires on spawn fail.
            });

            child.on('close', (code) => {
                this.activeProcess = null;
                if (this.mainWindow) {
                    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.STOP, { code });
                }

                // If NOT background, we resolve here.
                if (!isBackground) {
                    const output = stdoutData + (stderrData ? `\n[STDERR]\n${stderrData}` : '');
                    const statusMsg = code === 0 ? "Successfully executed" : `Failed with exit code ${code}`;
                    
                    resolve({
                        llmOutput: `\n[System] Command executed: ${command}\nExit Code: ${code}\nOutput:\n${output}`,
                        userOutput: `\n[System] ${statusMsg}: ${command}`,
                        action: { type: 'execute', path: command }
                    });
                }
            });

          } catch (e: any) {
              this.activeProcess = null;
               if (this.mainWindow) {
                   this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.TERMINAL.STOP, { code: 1 });
               }
               resolve({
                  llmOutput: `\n[System] Exception executing command: ${command}\n${e.message}`,
                  userOutput: `\n[System] Exception executing command: ${command}`,
                  action: null
              });
          }
      });
  }

  async executeWrite(path: string, content: string, autoApply: boolean): Promise<ISingleToolResult> {
      try {
        if (autoApply) {
            await this.fileSystem.handleWriteFile(path, content);
            return {
                llmOutput: `\n[System] Successfully wrote to ${path}`,
                userOutput: `\n[System] Successfully wrote to ${path}`,
                action: { type: 'write', path }
            };
        } else {
            // PROPOSE NEW FILE
            const result = await this.proposalManager.requestApproval({
                id: Date.now().toString(),
                type: 'new',
                path: path,
                original: '', 
                modified: content
            });

            if (result.status === 'accepted') {
                await this.fileSystem.handleWriteFile(path, result.content || content);
                return {
                    llmOutput: `\n[System] User APPROVED new file creation: ${path}`,
                    userOutput: `\n[System] User APPROVED new file creation: ${path}`,
                    action: { type: 'write', path }
                };
            } else {
                return {
                    llmOutput: `\n[System] User REJECTED new file creation: ${path}`,
                    userOutput: `\n[System] User REJECTED new file creation: ${path}`,
                    action: null
                };
            }
        }
      } catch (e: any) {
        return {
            llmOutput: `\n[System] Error writing to ${path}: ${e.message}`,
            userOutput: `\n[System] Error writing to ${path}: ${e.message}`,
            action: null
        };
      }
  }

  async executeReplace(path: string, oldString: string, newString: string, autoApply: boolean): Promise<ISingleToolResult> {
      try {
          const currentContent = await this.fileSystem.handleReadFile(path);
          let targetBlock = oldString;
          let matchFound = false;

          // Try Exact Match
          if (currentContent.includes(oldString)) {
              matchFound = true;
          } else {
              // Try Fuzzy Match
              const fuzzyMatch = this.findFuzzyBlock(currentContent, oldString);
              if (fuzzyMatch) {
                  targetBlock = fuzzyMatch;
                  matchFound = true;
              }
          }

          if (matchFound) {
              if (autoApply) {
                  const newContent = currentContent.replace(targetBlock, newString);
                  await this.fileSystem.handleWriteFile(path, newContent);
                  return {
                      llmOutput: `\n[System] Successfully patched ${path}`,
                      userOutput: `\n[System] Successfully patched ${path}`,
                      action: { type: 'replace', path }
                  };
              } else {
                  // PROPOSE EDIT
                  const proposedContent = currentContent.replace(targetBlock, newString);
                  const result = await this.proposalManager.requestApproval({
                      id: Date.now().toString(),
                      type: 'edit',
                      path: path,
                      original: currentContent,
                      modified: proposedContent
                  });

                  if (result.status === 'accepted') {
                      await this.fileSystem.handleWriteFile(path, result.content || proposedContent);
                      return {
                          llmOutput: `\n[System] User APPROVED edit to ${path}`,
                          userOutput: `\n[System] User APPROVED edit to ${path}`,
                          action: { type: 'replace', path }
                      };
                  } else {
                      return {
                          llmOutput: `\n[System] User REJECTED edit to ${path}`,
                          userOutput: `\n[System] User REJECTED edit to ${path}`,
                          action: null
                      };
                  }
              }
          } else {
               return {
                   llmOutput: `\n[System] Replace failed: 'old' string not found in ${path}. \n\nHINT: Ensure <old> tag content matches the file EXACTLY, including whitespace and indentation.`,
                   userOutput: `\n[System] Replace failed: 'old' string not found in ${path}.`,
                   action: null
               };
          }
      } catch (e: any) {
          return {
              llmOutput: `\n[System] Error replacing in ${path}: ${e.message}`,
              userOutput: `\n[System] Error replacing in ${path}: ${e.message}`,
              action: null
          };
      }
  }

  async executeRead(path: string): Promise<ISingleToolResult> {
      try {
        const content = await this.fileSystem.handleReadFile(path);
        return {
            llmOutput: `\n### FILE: ${path}\n${content}\n### END FILE\n`,
            userOutput: `\n[System] Read file: ${path}`,
            action: { type: 'read', path }
        };
      } catch (e: any) {
        return {
            llmOutput: `\n[System] Error reading ${path}: ${e.message}`,
            userOutput: `\n[System] Error reading ${path}: ${e.message}`,
            action: null
        };
      }
  }

  // --- Main Processor (Legacy/Batch Support) ---

  async executeTools(response: string, autoApply = true): Promise<IToolResult | null> {
    const actions: IToolAction[] = [];
    let llmOutputAccumulator = "";
    let userOutputAccumulator = "";
    let toolsFound = false;

    // 1. Handle <write_file>
    const writeRegex = /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g;
    let writeMatch;
    while ((writeMatch = writeRegex.exec(response)) !== null) {
      toolsFound = true;
      const res = await this.executeWrite(writeMatch[1], writeMatch[2], autoApply);
      llmOutputAccumulator += res.llmOutput;
      userOutputAccumulator += res.userOutput;
      if (res.action) actions.push(res.action);
    }

    // 2. Handle <replace> (Diffs)
    const replaceRegex = /<replace path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/replace>/g;
    let replaceMatch;
    while ((replaceMatch = replaceRegex.exec(response)) !== null) {
      toolsFound = true;
      const res = await this.executeReplace(replaceMatch[1], replaceMatch[2], replaceMatch[3], autoApply);
      llmOutputAccumulator += res.llmOutput;
      userOutputAccumulator += res.userOutput;
      if (res.action) actions.push(res.action);
    }

    // 3. Handle <read_file>
    const readRegex = /<read_file>(.*?)<\/read_file>/g;
    let readMatch;
    while ((readMatch = readRegex.exec(response)) !== null) {
      toolsFound = true;
      const res = await this.executeRead(readMatch[1].trim());
      llmOutputAccumulator += res.llmOutput;
      userOutputAccumulator += res.userOutput;
      if (res.action) actions.push(res.action);
    }

    // 4. Handle <search> (Keeping inline for now as it maps to 'read')
    const searchRegex = /<search\s+query="([^"]+)"(?:\s+type="([^"]+)")?\s*\/>/g;
    let searchMatch;
    while ((searchMatch = searchRegex.exec(response)) !== null) {
        toolsFound = true;
        const query = searchMatch[1];
        const searchOptions = {
            query: query,
            matchCase: false,
            matchWholeWord: false,
            useRegex: false,
            includes: '',
            excludes: ''
        };
        
        try {
            const results = await this.fileSystem.handleSearch(searchOptions);
            const formattedResults = results.map(r => 
                `FILE: ${r.filePath}\n` + 
                r.matches.map(m => `  ${m.lineNumber}: ${m.lineText}`).join('\n')
            ).join('\n\n');
            
            llmOutputAccumulator += `\n### SEARCH RESULTS ("${query}")\n${formattedResults}\n### END SEARCH\n`;
            userOutputAccumulator += `\n[System] Searched for "${query}"`;
            actions.push({ type: 'read', path: 'SEARCH:' + query });
        } catch (e: any) {
             const msg = `[System] Error searching ${query}: ${e.message}`;
             llmOutputAccumulator += `\n${msg}`;
             userOutputAccumulator += `\n${msg}`;
        }
    }

    if (!toolsFound) return null;

    return {
        llmOutput: llmOutputAccumulator.trim(),
        userOutput: userOutputAccumulator.trim(),
        actions
    };
  }

  // --- FUZZY MATCHING HELPERS ---

  private findFuzzyBlock(fileContent: string, searchBlock: string): string | null {
      const normalize = (line: string) => line.trim();
      const fileLines = fileContent.split('\n');
      const searchLines = searchBlock.split('\n').filter(l => l.trim() !== ''); // Ignore empty lines in search block

      if (searchLines.length === 0) return null;

      // Brute force line-by-line match ignoring whitespace
      for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
          let match = true;
          // We need to advance 'j' (searchLines index) and 'k' (fileLines index) separately
          // because file might have extra empty lines that we want to skip?
          // OR assume strict vertical alignment of non-empty lines? 
          // Let's assume strict alignment of non-empty lines for now.
          
          let fileIndex = i;
          let matchCount = 0;
          
          for (let j = 0; j < searchLines.length; j++) {
             // Skip empty lines in file while matching?
             while (fileIndex < fileLines.length && fileLines[fileIndex].trim() === '') {
                 fileIndex++;
             }
             
             if (fileIndex >= fileLines.length) {
                 match = false;
                 break;
             }

             if (normalize(fileLines[fileIndex]) !== normalize(searchLines[j])) {
                 match = false;
                 break;
             }
             fileIndex++;
             matchCount++;
          }

          if (match && matchCount === searchLines.length) {
              // Found a match!
              // The block starts at 'i' (original index) and ends at 'fileIndex - 1'.
              // We must return the EXACT text from the file including whitespace/newlines.
              // Note: 'fileIndex' is currently pointing AFTER the last matched line.
              return fileLines.slice(i, fileIndex).join('\n');
          }
      }
      return null;
  }
}