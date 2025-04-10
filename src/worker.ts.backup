import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';

interface WorkerData {
    filePaths: string[];
    maxLines: number;
    languageSpecificMaxLines?: Record<string, number>;
    measurementType?: 'lines' | 'tokens';
    maxTokens?: number;
    languageSpecificMaxTokens?: Record<string, number>;
    disabledLanguages?: string[];
}

interface WorkerResult {
    filePath: string;
    lineCount: number;
    tokenCount?: number;
    exceeds: boolean;
    measurementType: 'lines' | 'tokens';
}

// Ensure data is serializable
function ensureSerializable(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

// Helper function to get file extension
function getFileExtension(filePath: string): string {
    const extension = filePath.split('.').pop();
    return extension ? extension.toLowerCase() : '';
}

// Helper function to get language ID from file extension
function getLanguageIdFromExtension(extension: string): string | undefined {
    const extensionToLanguageMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascriptreact',
        'ts': 'typescript',
        'tsx': 'typescriptreact',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'md': 'markdown',
        'py': 'python',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'swift': 'swift',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sh': 'shellscript',
        'bat': 'bat',
        'ps1': 'powershell'
    };

    return extensionToLanguageMap[extension];
}

// Helper function to get max lines for a file based on its language
function getMaxLinesForFile(filePath: string, defaultMaxLines: number, languageSpecificMaxLines?: Record<string, number>): number {
    if (!languageSpecificMaxLines) {
        return defaultMaxLines;
    }

    const extension = getFileExtension(filePath);
    const languageId = getLanguageIdFromExtension(extension);

    if (languageId && languageSpecificMaxLines[languageId] !== undefined) {
        return languageSpecificMaxLines[languageId];
    }

    return defaultMaxLines;
}

// Helper function to get max tokens for a file based on its language
function getMaxTokensForFile(filePath: string, defaultMaxTokens: number, languageSpecificMaxTokens?: Record<string, number>): number {
    if (!languageSpecificMaxTokens) {
        return defaultMaxTokens;
    }

    const extension = getFileExtension(filePath);
    const languageId = getLanguageIdFromExtension(extension);

    if (languageId && languageSpecificMaxTokens[languageId] !== undefined) {
        return languageSpecificMaxTokens[languageId];
    }

    return defaultMaxTokens;
}

// Helper function to count tokens in a text string
function countTokens(text: string): number {
    // Simple token counting approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}

// Process the files assigned to this worker
if (parentPort) {
    // Ensure worker data is properly serialized
    let safeWorkerData: WorkerData;
    try {
        safeWorkerData = ensureSerializable(workerData) as WorkerData;
    } catch (error) {
        console.error(`Worker data serialization error: ${error}`);
        // Provide fallback values
        safeWorkerData = {
            filePaths: [],
            maxLines: 300
        };
    }

    const { filePaths, maxLines, languageSpecificMaxLines, measurementType = 'lines', maxTokens = 2000, languageSpecificMaxTokens, disabledLanguages } = safeWorkerData;
    const results: WorkerResult[] = [];

    for (const filePath of filePaths) {
        try {
            // Check if file exists and is readable before attempting to read it
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                try {
                    // Check if the file's language is disabled
                    if (disabledLanguages && disabledLanguages.length > 0) {
                        const extension = getFileExtension(filePath);
                        const languageId = getLanguageIdFromExtension(extension);

                        if (languageId && disabledLanguages.includes(languageId)) {
                            // Skip this file as its language is disabled
                            continue;
                        }
                    }

                    // Read the file content
                    const content = fs.readFileSync(filePath, 'utf8');

                    // Check which measurement type to use
                    if (measurementType === 'tokens') {
                        // Count the number of tokens
                        const tokenCount = countTokens(content);

                        // Get the max tokens for this file based on its language
                        const fileMaxTokens = getMaxTokensForFile(filePath, maxTokens, languageSpecificMaxTokens);

                        // Check if the token count exceeds the maximum
                        if (tokenCount > fileMaxTokens) {
                            results.push({
                                filePath,
                                lineCount: content.split('\n').length, // Include line count for reference
                                tokenCount,
                                exceeds: true,
                                measurementType: 'tokens'
                            });
                        }
                    } else {
                        // Count the number of lines
                        const lineCount = content.split('\n').length;

                        // Get the max lines for this file based on its language
                        const fileMaxLines = getMaxLinesForFile(filePath, maxLines, languageSpecificMaxLines);

                        // Check if the line count exceeds the maximum
                        if (lineCount > fileMaxLines) {
                            results.push({
                                filePath,
                                lineCount,
                                exceeds: true,
                                measurementType: 'lines'
                            });
                        }
                    }
                } catch (readError) {
                    // Log specific read errors but continue processing other files
                    console.error(`Worker error reading file ${filePath}: ${readError}`);
                }
            } else {
                // File doesn't exist or isn't a regular file
                console.log(`Worker skipping non-existent or non-file path: ${filePath}`);
            }
        } catch (error) {
            // Catch any other errors that might occur
            console.error(`Worker error processing file ${filePath}: ${error}`);
            // Continue with other files instead of crashing the worker
        }
    }

    // Send the results back to the main thread
    // Ensure the results are serializable before sending
    try {
        const serializableResults = ensureSerializable(results);
        parentPort.postMessage(serializableResults);
    } catch (error) {
        console.error(`Worker serialization error: ${error}`);
        // Send a simplified version if there's a serialization error
        parentPort.postMessage([]);
    }
}
