"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const fs = __importStar(require("fs"));
// Ensure data is serializable
function ensureSerializable(obj) {
    return JSON.parse(JSON.stringify(obj));
}
// Helper function to get file extension
function getFileExtension(filePath) {
    const extension = filePath.split('.').pop();
    return extension ? extension.toLowerCase() : '';
}
// Helper function to get language ID from file extension
function getLanguageIdFromExtension(extension) {
    const extensionToLanguageMap = {
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
function getMaxLinesForFile(filePath, defaultMaxLines, languageSpecificMaxLines) {
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
// Process the files assigned to this worker
if (worker_threads_1.parentPort) {
    // Ensure worker data is properly serialized
    let safeWorkerData;
    try {
        safeWorkerData = ensureSerializable(worker_threads_1.workerData);
    }
    catch (error) {
        console.error(`Worker data serialization error: ${error}`);
        // Provide fallback values
        safeWorkerData = {
            filePaths: [],
            maxLines: 300
        };
    }
    const { filePaths, maxLines, languageSpecificMaxLines, disabledLanguages } = safeWorkerData;
    const results = [];
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
                    // Count the number of lines
                    const lineCount = content.split('\n').length;
                    // Get the max lines for this file based on its language
                    const fileMaxLines = getMaxLinesForFile(filePath, maxLines, languageSpecificMaxLines);
                    // Check if the line count exceeds the maximum
                    if (lineCount > fileMaxLines) {
                        results.push({
                            filePath,
                            lineCount,
                            exceeds: true
                        });
                    }
                }
                catch (readError) {
                    // Log specific read errors but continue processing other files
                    console.error(`Worker error reading file ${filePath}: ${readError}`);
                }
            }
            else {
                // File doesn't exist or isn't a regular file
                console.log(`Worker skipping non-existent or non-file path: ${filePath}`);
            }
        }
        catch (error) {
            // Catch any other errors that might occur
            console.error(`Worker error processing file ${filePath}: ${error}`);
            // Continue with other files instead of crashing the worker
        }
    }
    // Send the results back to the main thread
    // Ensure the results are serializable before sending
    try {
        const serializableResults = ensureSerializable(results);
        worker_threads_1.parentPort.postMessage(serializableResults);
    }
    catch (error) {
        console.error(`Worker serialization error: ${error}`);
        // Send a simplified version if there's a serialization error
        worker_threads_1.parentPort.postMessage([]);
    }
}
//# sourceMappingURL=worker.js.map