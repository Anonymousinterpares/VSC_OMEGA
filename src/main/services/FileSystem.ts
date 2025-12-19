import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
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
                    const newContent = content.replace(searchRegex, (_) => {
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

  // --- Backup / Crash Recovery ---

  private getBackupPath(filePath: string): string {
      if (!this.projectRoot) return '';
      const relativePath = path.relative(this.projectRoot, filePath);
      // Create a safe filename hash or just encode the path
      const safeName = Buffer.from(relativePath).toString('base64').replace(/\//g, '_');
      const backupDir = path.join(this.projectRoot, '.hive', 'backups');
      if (!fsExtra.existsSync(backupDir)) {
          fsExtra.mkdirpSync(backupDir);
      }
      return path.join(backupDir, safeName);
  }

  async handleBackupFile(filePath: string, content: string | null): Promise<void> {
      if (!this.projectRoot) return;
      
      const backupPath = this.getBackupPath(filePath);
      if (!backupPath) return;

      if (content === null) {
          // Remove backup
          if (await fsExtra.pathExists(backupPath)) {
              await fsExtra.remove(backupPath);
          }
      } else {
          // Write backup
          await fsExtra.writeFile(backupPath, content, 'utf-8');
      }
  }

  async getBackups(): Promise<string[]> {
      if (!this.projectRoot) return [];
      const backupDir = path.join(this.projectRoot, '.hive', 'backups');
      if (!await fsExtra.pathExists(backupDir)) return [];

      const files = await fsExtra.readdir(backupDir);
      const restoredPaths: string[] = [];

      for (const file of files) {
          try {
              // Decode filename to get original relative path
              const originalRelative = Buffer.from(file.replace(/_/g, '/'), 'base64').toString('utf-8');
              const fullPath = path.join(this.projectRoot, originalRelative);
              restoredPaths.push(fullPath);
          } catch (e) {
              console.error("Failed to decode backup filename:", file);
          }
      }
      return restoredPaths;
  }

  async handleRestoreBackup(filePath: string): Promise<string | null> {
      if (!this.projectRoot) return null;
      const backupPath = this.getBackupPath(filePath);
      if (await fsExtra.pathExists(backupPath)) {
          return await fsExtra.readFile(backupPath, 'utf-8');
      }
      return null;
  }

  async commitBackupsToFiles(): Promise<void> {
      if (!this.projectRoot) return;
      const backupDir = path.join(this.projectRoot, '.hive', 'backups');
      if (!await fsExtra.pathExists(backupDir)) return;

      const files = await fsExtra.readdir(backupDir);
      for (const file of files) {
          try {
              const originalRelative = Buffer.from(file.replace(/_/g, '/'), 'base64').toString('utf-8');
              const fullPath = path.join(this.projectRoot, originalRelative);
              const backupPath = path.join(backupDir, file);
              
              const content = await fsExtra.readFile(backupPath, 'utf-8');
              await fsExtra.writeFile(fullPath, content, 'utf-8');
              
              // Clean up backup after commit
              await fsExtra.remove(backupPath);
          } catch (e) {
              console.error("Failed to commit backup:", file, e);
          }
      }
  }
}