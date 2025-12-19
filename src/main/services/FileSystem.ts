import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IFileNode, ISearchResult, ISearchMatch, ISearchOptions } from '../../shared/types';
import { CHANNELS } from '../../shared/constants';

export class FileSystemService {
  private mainWindow: BrowserWindow;
  private projectRoot: string | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async handleOpenFolder() {
    const { canceled, filePaths } = await dialog.showOpenDialog(this.mainWindow, {
      properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) {
      return;
    }

    this.projectRoot = filePaths[0];
    const tree = await this.readDirectory(this.projectRoot);
    
    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.FOLDER_OPENED, {
      rootPath: this.projectRoot,
      tree
    });
  }

  async handleReadFile(filePath: string): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    return await fs.readFile(resolvedPath, 'utf-8');
  }

  async handleWriteFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);
    
    // Create Shadow Backup
    await this.createBackup(resolvedPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    await fs.writeFile(resolvedPath, content, 'utf-8');

    // Notify Frontend
    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.FILE_UPDATED, {
        path: resolvedPath,
        content: content
    });
    
    // Refresh Tree (in case new file created)
    if (this.projectRoot) {
        const tree = await this.readDirectory(this.projectRoot);
        this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.REFRESH_TREE, { tree });
    }
  }

  private async createBackup(resolvedPath: string): Promise<void> {
      try {
          // Check if file exists
          await fs.access(resolvedPath);
      } catch {
          // File doesn't exist, no backup needed
          return;
      }

      if (!this.projectRoot) return;

      const historyDir = path.join(this.projectRoot, '.hive', 'history');
      try {
          await fs.mkdir(historyDir, { recursive: true });
          
          const filename = path.basename(resolvedPath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(historyDir, `${filename}.${timestamp}.bak`);
          
          await fs.copyFile(resolvedPath, backupPath);
      } catch (err) {
          console.error("Failed to create backup:", err);
      }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    // If we have a project root, resolve against it
    if (this.projectRoot) {
      return path.join(this.projectRoot, filePath);
    }
    return path.resolve(filePath);
  }

  private async readDirectory(dirPath: string): Promise<IFileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: IFileNode[] = [];

    const ignoreList = [
      'node_modules', 
      '.git', 
      '.hive', 
      'dist', 
      'out', 
      'build', 
      '.env', 
      '.DS_Store', 
      '__pycache__', 
      '.pytest_cache',
      '.vscode',
      '.idea',
      'coverage'
    ];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (ignoreList.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const children = await this.readDirectory(fullPath);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'folder',
          children: children.sort((a, b) => {
             if (a.type === b.type) return a.name.localeCompare(b.name);
             return a.type === 'folder' ? -1 : 1;
          })
        });
      } else {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file'
        });
      }
    }

    return nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });
  }

  async handleSearch(options: ISearchOptions): Promise<ISearchResult[]> {
    if (!this.projectRoot) {
        return [];
    }

    const { query, matchCase, matchWholeWord, useRegex, includes, excludes } = options;
    const results: ISearchResult[] = [];

    // Parse patterns
    const includePatterns = includes ? includes.split(';').map(s => s.trim()).filter(Boolean) : [];
    const excludePatterns = excludes ? excludes.split(';').map(s => s.trim()).filter(Boolean) : [];
    
    // Prepare Regex
    let searchRegex: RegExp;
    try {
        let flags = 'g';
        if (!matchCase) flags += 'i';
        
        let pattern = query;
        if (!useRegex) {
            // Escape special chars
            pattern = pattern.replace(/[.*+?^${}()|[\\]/g, '\\$&');
        }
        
        if (matchWholeWord) {
            pattern = `\\b${pattern}\\b`;
        }
        
        searchRegex = new RegExp(pattern, flags);
    } catch (e) {
        console.error("Invalid Regex:", e);
        return [];
    }

    const searchInternal = async (dir: string) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(this.projectRoot!, fullPath).replace(/\\/g, '/');

                // Default Excludes
                if (['node_modules', '.git', 'dist', 'out', 'build', '.hive'].includes(entry.name)) continue;
                
                // User Excludes
                if (excludePatterns.some(p => this.matchesPattern(relativePath, p))) continue;

                if (entry.isDirectory()) {
                    await searchInternal(fullPath);
                } else {
                    // Include Check (if specified)
                    if (includePatterns.length > 0 && !includePatterns.some(p => this.matchesPattern(relativePath, p))) {
                        continue;
                    }

                    // Perform Search
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const fileMatches: ISearchMatch[] = [];
                        const lines = content.split('\n');
                        
                        lines.forEach((line: string, lineIdx: number) => {
                            // Reset lastIndex for global regex
                            searchRegex.lastIndex = 0;
                            let match;
                            
                            while ((match = searchRegex.exec(line)) !== null) {
                                fileMatches.push({
                                    lineText: line.trimEnd(),
                                    lineNumber: lineIdx + 1,
                                    matchIndex: match.index,
                                    matchLength: match[0].length
                                });
                                // Avoid infinite loop on zero-width matches
                                if (match.index === searchRegex.lastIndex) {
                                    searchRegex.lastIndex++;
                                }
                            }
                        });

                        if (fileMatches.length > 0) {
                            results.push({
                                filePath: fullPath,
                                matches: fileMatches
                            });
                        }

                    } catch (err) {
                        // Ignore binary/read errors
                    }
                }
            }
        } catch (err) {
            console.error(`Error searching ${dir}:`, err);
        }
    };

    await searchInternal(this.projectRoot);
    return results;
  }

  async handleReplace(options: ISearchOptions, replaceText: string): Promise<{ filesChanged: number; matchesReplaced: number }> {
    if (!this.projectRoot) return { filesChanged: 0, matchesReplaced: 0 };

    const { query, matchCase, matchWholeWord, useRegex, includes, excludes } = options;
    let filesChanged = 0;
    let matchesReplaced = 0;

    // Parse patterns
    const includePatterns = includes ? includes.split(';').map(s => s.trim()).filter(Boolean) : [];
    const excludePatterns = excludes ? excludes.split(';').map(s => s.trim()).filter(Boolean) : [];

    // Prepare Regex
    let searchRegex: RegExp;
    try {
        let flags = 'g';
        if (!matchCase) flags += 'i';
        let pattern = query;
        if (!useRegex) pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (matchWholeWord) pattern = `\\b${pattern}\\b`;
        searchRegex = new RegExp(pattern, flags);
    } catch (e) {
        return { filesChanged: 0, matchesReplaced: 0 };
    }

    const replaceInternal = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(this.projectRoot!, fullPath).replace(/\\/g, '/');

            if (['node_modules', '.git', 'dist', 'out', 'build', '.hive'].includes(entry.name)) continue;
            if (excludePatterns.some(p => this.matchesPattern(relativePath, p))) continue;

            if (entry.isDirectory()) {
                await replaceInternal(fullPath);
            } else {
                if (includePatterns.length > 0 && !includePatterns.some(p => this.matchesPattern(relativePath, p))) continue;

                try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    let matchCount = 0;
                    const newContent = content.replace(searchRegex, (match) => {
                        matchCount++;
                        return replaceText;
                    });

                    if (matchCount > 0) {
                        await this.handleWriteFile(fullPath, newContent);
                        filesChanged++;
                        matchesReplaced += matchCount;
                    }
                } catch (err) {}
            }
        }
    };

    await replaceInternal(this.projectRoot);
    return { filesChanged, matchesReplaced };
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
      let regexStr = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '___DOUBLE_WILD___')
          .replace(/\*/g, '[^/]*')
          .replace(/___DOUBLE_WILD___/g, '.*');
      
      const regex = new RegExp(`^${regexStr}$`);
      return regex.test(filePath) || filePath.endsWith(pattern.replace(/^\*\*/, '')); 
  }
}