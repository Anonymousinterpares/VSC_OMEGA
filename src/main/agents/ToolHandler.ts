import { FileSystemService } from '../services/FileSystem';

interface IToolResult {
    llmOutput: string; // Full content (including file dumps) for the Agent context
    userOutput: string; // Concise summary for the User UI
    actions: { type: 'write' | 'read' | 'replace', path: string }[];
}

export class ToolHandler {
  private fileSystem: FileSystemService;

  constructor(fileSystem: FileSystemService) {
    this.fileSystem = fileSystem;
  }

  async executeTools(response: string, autoApply = true): Promise<IToolResult | null> {
    const actions: { type: 'write' | 'read' | 'replace', path: string }[] = [];
    let llmOutputAccumulator = "";
    let userOutputAccumulator = "";
    let toolsFound = false;

    // 1. Handle <write_file>
    const writeRegex = /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g;
    let writeMatch;
    while ((writeMatch = writeRegex.exec(response)) !== null) {
      toolsFound = true;
      const path = writeMatch[1];
      const content = writeMatch[2];
      try {
        if (autoApply) {
            await this.fileSystem.handleWriteFile(path, content);
            const msg = `[System] Successfully wrote to ${path}`;
            llmOutputAccumulator += `\n${msg}`;
            userOutputAccumulator += `\n${msg}`;
        } else {
            const msg = `[System] (Auto-Apply OFF) Would write to ${path}`;
            llmOutputAccumulator += `\n${msg}`;
            userOutputAccumulator += `\n${msg}`;
        }
        actions.push({ type: 'write', path });
      } catch (e: any) {
        const msg = `[System] Error writing to ${path}: ${e.message}`;
        llmOutputAccumulator += `\n${msg}`;
        userOutputAccumulator += `\n${msg}`;
      }
    }

    // 2. Handle <replace> (Diffs)
    const replaceRegex = /<replace path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/replace>/g;
    let replaceMatch;
    while ((replaceMatch = replaceRegex.exec(response)) !== null) {
      toolsFound = true;
      const path = replaceMatch[1];
      const oldString = replaceMatch[2];
      const newString = replaceMatch[3];
      
      try {
          const currentContent = await this.fileSystem.handleReadFile(path);
          if (currentContent.includes(oldString)) {
              if (autoApply) {
                  const newContent = currentContent.replace(oldString, newString);
                  await this.fileSystem.handleWriteFile(path, newContent);
                  const msg = `[System] Successfully patched ${path}`;
                  llmOutputAccumulator += `\n${msg}`;
                  userOutputAccumulator += `\n${msg}`;
              } else {
                  const msg = `[System] (Auto-Apply OFF) Would patch ${path}`;
                  llmOutputAccumulator += `\n${msg}`;
                  userOutputAccumulator += `\n${msg}`;
              }
              actions.push({ type: 'replace', path });
          } else {
              const msg = `[System] Replace failed: 'old' string not found in ${path}`;
              llmOutputAccumulator += `\n${msg}`;
              userOutputAccumulator += `\n${msg}`;
          }
      } catch (e: any) {
          const msg = `[System] Error replacing in ${path}: ${e.message}`;
          llmOutputAccumulator += `\n${msg}`;
          userOutputAccumulator += `\n${msg}`;
      }
    }

    // 3. Handle <read_file>
    const readRegex = /<read_file>(.*?)<\/read_file>/g;
    let readMatch;
    while ((readMatch = readRegex.exec(response)) !== null) {
      toolsFound = true;
      const path = readMatch[1].trim();
      try {
        const content = await this.fileSystem.handleReadFile(path);
        // LLM gets the content
        llmOutputAccumulator += `\n### FILE: ${path}\n${content}\n### END FILE\n`;
        // User gets a summary (NO CONTENT DUMP)
        userOutputAccumulator += `\n[System] Read file: ${path}`;
        actions.push({ type: 'read', path });
      } catch (e: any) {
        const msg = `[System] Error reading ${path}: ${e.message}`;
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
}
