import { spawn } from 'child_process';
import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CHANNELS } from '../../shared/constants';

export class SyntaxService {
    constructor() {
        this.registerHandlers();
    }

    private registerHandlers() {
        ipcMain.handle(CHANNELS.TO_MAIN.CHECK_SYNTAX, async (_, { language, content }: { language: string, content: string }) => {
            if (language === 'python') {
                return this.checkPythonSyntax(content);
            }
            return [];
        });
    }

    private async checkPythonSyntax(content: string): Promise<any[]> {
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `temp_check_${Date.now()}.py`);

        try {
            await fs.writeFile(tempFile, content);

            return new Promise((resolve) => {
                const isWin = process.platform === 'win32';
                const pyrightBin = path.join(process.cwd(), 'node_modules', '.bin', isWin ? 'pyright.cmd' : 'pyright');
                
                // Spawn with shell: true for .cmd files on Windows
                const pyright = spawn(pyrightBin, ['--outputjson', tempFile], { shell: true });
                
                let output = '';
                
                pyright.stdout.on('data', (data) => {
                    output += data.toString();
                });

                pyright.on('close', async () => {
                    try {
                        // Cleanup
                        await fs.unlink(tempFile).catch(() => {});

                        const result = JSON.parse(output);
                        const markers = (result.generalDiagnostics || []).map((diag: any) => {
                            let severity = 8; // Error
                            if (diag.severity === 'warning') severity = 4;
                            else if (diag.severity === 'information') severity = 2;

                            return {
                                startLineNumber: diag.range.start.line + 1,
                                startColumn: diag.range.start.character + 1,
                                endLineNumber: diag.range.end.line + 1,
                                endColumn: diag.range.end.character + 1,
                                message: diag.message,
                                severity: severity
                            };
                        });
                        resolve(markers);
                    } catch (e) {
                        console.error("Pyright parsing error:", e);
                        resolve([]);
                    }
                });

                pyright.on('error', async (err) => {
                    console.error("Failed to spawn pyright:", err);
                    await fs.unlink(tempFile).catch(() => {});
                    resolve([]);
                });
            });
        } catch (e) {
            console.error("Syntax Check Setup Failed:", e);
            return [];
        }
    }
}
