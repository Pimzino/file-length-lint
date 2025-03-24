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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const minimatch_1 = require("minimatch");
const ignore_1 = __importDefault(require("ignore"));
const worker_threads_1 = require("worker_threads");
/**
 * Code action provider for file length lint diagnostics
 */
class FileLengthLintCodeActionProvider {
    provideCodeActions(document, range, context) {
        // Filter for our diagnostics only
        const fileLengthDiagnostics = context.diagnostics.filter(diagnostic => diagnostic.source === 'File Length Lint');
        if (fileLengthDiagnostics.length === 0) {
            return undefined;
        }
        // Get the configuration to check for custom message
        const config = getConfig();
        // Create the action title with the custom message appended if available
        let actionTitle = 'Suggest ways to split this file';
        if (config.customQuickFixMessage && config.customQuickFixMessage.trim() !== '') {
            actionTitle = `Suggest ways to split this file (${config.customQuickFixMessage})`;
        }
        // Create a code action for each diagnostic
        const actions = [];
        for (const diagnostic of fileLengthDiagnostics) {
            const action = new vscode.CodeAction(actionTitle, vscode.CodeActionKind.QuickFix);
            action.command = {
                command: 'fileLengthLint.suggestFileSplit',
                title: actionTitle,
                arguments: [document.uri]
            };
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            actions.push(action);
        }
        return actions;
    }
}
// Create a diagnostic collection to store file length diagnostics
let diagnosticCollection;
// Status bar item to show current file line count
let statusBarItem;
// Store gitignore parsers for each workspace folder
const gitignoreCache = new Map();
// Store worker threads for file scanning
let workerThreads = [];
// Track files that are currently open in the editor
const openFiles = new Set();
// Track files that are currently being scanned
let isScanning = false;
// File system watcher for .gitignore files
let gitignoreWatcher;
/**
 * Set up file watcher for .gitignore files
 */
function setupGitignoreWatcher(context) {
    // Dispose of existing watcher if it exists
    if (gitignoreWatcher) {
        gitignoreWatcher.dispose();
    }
    // Create a new file system watcher for .gitignore files
    gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
    // When a .gitignore file is created or changed
    gitignoreWatcher.onDidCreate(uri => {
        console.log(`New .gitignore file detected: ${uri.fsPath}`);
        handleGitignoreChange(uri);
    });
    gitignoreWatcher.onDidChange(uri => {
        console.log(`.gitignore file changed: ${uri.fsPath}`);
        handleGitignoreChange(uri);
    });
    gitignoreWatcher.onDidDelete(uri => {
        console.log(`.gitignore file deleted: ${uri.fsPath}`);
        handleGitignoreChange(uri);
    });
    // Add the watcher to subscriptions for proper disposal
    context.subscriptions.push(gitignoreWatcher);
}
/**
 * Handle changes to a .gitignore file
 */
function handleGitignoreChange(uri) {
    // Get the workspace folder containing this .gitignore file
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        // Clear the cache for this workspace folder
        gitignoreCache.delete(workspaceFolder.uri.fsPath);
        // Re-scan workspace files if real-time scanning is enabled
        if (getConfig().realtimeScanningEnabled) {
            scanWorkspaceFiles();
        }
    }
}
/**
 * Activate the extension
 */
function activate(context) {
    console.log('File Length Lint extension is now active');
    // Create a diagnostic collection for our extension
    diagnosticCollection = vscode.languages.createDiagnosticCollection('fileLengthLint');
    context.subscriptions.push(diagnosticCollection);
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'fileLengthLint.scanWorkspace';
    context.subscriptions.push(statusBarItem);
    // Update status bar with current file
    updateStatusBar();
    // Register event listener for active editor change
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        updateStatusBar();
    }));
    // Set up .gitignore file watcher
    setupGitignoreWatcher(context);
    // Initial lint of all open files in the workspace
    lintOpenFiles();
    // Start real-time scanning if enabled
    if (getConfig().realtimeScanningEnabled) {
        // Scan workspace files initially
        scanWorkspaceFiles();
        // Track open files
        vscode.workspace.textDocuments.forEach(doc => {
            openFiles.add(doc.uri.fsPath);
        });
    }
    // Register commands
    const scanWorkspaceCommand = vscode.commands.registerCommand('fileLengthLint.scanWorkspace', async () => {
        const config = getConfig();
        if (!config.enabled) {
            vscode.window.showInformationMessage('File Length Lint is currently disabled. Enable it in settings to use this command.');
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'File Length Lint: Scanning workspace files...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });
            await scanWorkspaceFiles();
            progress.report({ increment: 100 });
            return;
        });
    });
    // Register the suggest file split command
    const suggestFileSplitCommand = vscode.commands.registerCommand('fileLengthLint.suggestFileSplit', async (uri) => {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
        // Get the configuration
        const config = getConfig();
        // Create the message with the custom message appended if available
        let message = 'This file exceeds the maximum line count. Consider splitting it into multiple files:';
        console.log('Custom message from config:', config.customQuickFixMessage);
        if (config.customQuickFixMessage && config.customQuickFixMessage.trim() !== '') {
            message += ' ' + config.customQuickFixMessage;
            console.log('Final message with custom part:', message);
        }
        // Show information message with suggestions
        vscode.window.showInformationMessage(message, 'Extract Functions/Methods', 'Create Modules', 'Use Inheritance').then(selection => {
            if (selection === 'Extract Functions/Methods') {
                vscode.env.openExternal(vscode.Uri.parse('https://refactoring.guru/extract-method'));
            }
            else if (selection === 'Create Modules') {
                vscode.env.openExternal(vscode.Uri.parse('https://refactoring.guru/replace-method-with-method-object'));
            }
            else if (selection === 'Use Inheritance') {
                vscode.env.openExternal(vscode.Uri.parse('https://refactoring.guru/extract-class'));
            }
        });
    });
    // Register code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider({ pattern: '**/*' }, new FileLengthLintCodeActionProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    });
    context.subscriptions.push(scanWorkspaceCommand, suggestFileSplitCommand, codeActionProvider);
    // Register event handlers
    context.subscriptions.push(
    // Lint when a text document is opened
    vscode.workspace.onDidOpenTextDocument(document => {
        // Add to open files set
        openFiles.add(document.uri.fsPath);
        // Lint the document
        lintDocument(document);
    }), 
    // Lint when a text document is saved
    vscode.workspace.onDidSaveTextDocument(document => {
        lintDocument(document);
    }), 
    // Handle document closing
    vscode.workspace.onDidCloseTextDocument(document => {
        // Remove from open files set
        openFiles.delete(document.uri.fsPath);
        // Clear diagnostics
        diagnosticCollection.delete(document.uri);
    }), 
    // Re-lint all files when configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('fileLengthLint')) {
            console.log('File Length Lint configuration changed');
            // Check which specific setting changed
            const settingsToCheck = [
                'fileLengthLint.exclude',
                'fileLengthLint.respectGitignore',
                'fileLengthLint.realtimeScanningEnabled',
                'fileLengthLint.enabled'
            ];
            // Check if exclusion settings changed
            const exclusionsChanged = settingsToCheck.some(setting => event.affectsConfiguration(setting));
            // Clear the gitignore cache when configuration changes
            if (event.affectsConfiguration('fileLengthLint.respectGitignore')) {
                console.log('Clearing gitignore cache due to configuration change');
                gitignoreCache.clear();
            }
            // Lint open files immediately
            lintOpenFiles();
            // Terminate any running worker threads
            terminateWorkers();
            // Re-scan workspace if real-time scanning is enabled and exclusions changed
            if (getConfig().realtimeScanningEnabled && exclusionsChanged) {
                console.log('Re-scanning workspace due to exclusion settings change');
                scanWorkspaceFiles();
            }
        }
    }), 
    // Handle workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        console.log('Workspace folders changed');
        // Clear the gitignore cache when workspace folders change
        gitignoreCache.clear();
        // Terminate any running worker threads
        terminateWorkers();
        // Set up gitignore watcher again for the new workspace folders
        setupGitignoreWatcher(context);
        // Re-scan workspace if real-time scanning is enabled
        if (getConfig().realtimeScanningEnabled) {
            scanWorkspaceFiles();
        }
    }), 
    // Handle file creation and deletion
    vscode.workspace.onDidCreateFiles(event => {
        if (getConfig().realtimeScanningEnabled) {
            // Scan only the newly created files
            const newFiles = event.files.map(uri => uri.fsPath);
            scanSpecificFiles(newFiles);
        }
    }), 
    // Handle file deletion
    vscode.workspace.onDidDeleteFiles(event => {
        // Remove diagnostics for deleted files
        event.files.forEach(uri => {
            diagnosticCollection.delete(uri);
            openFiles.delete(uri.fsPath);
        });
    }));
}
/**
 * Deactivate the extension
 */
function deactivate() {
    // Terminate any running worker threads
    terminateWorkers();
    // Clean up diagnostics when the extension is deactivated
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
    // Dispose of status bar item
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    // Dispose of gitignore watcher
    if (gitignoreWatcher) {
        gitignoreWatcher.dispose();
        gitignoreWatcher = undefined;
    }
    // Clear the gitignore cache
    gitignoreCache.clear();
}
/**
 * Update the status bar with the current file's line count
 */
function updateStatusBar() {
    const editor = vscode.window.activeTextEditor;
    const config = getConfig();
    // Hide status bar item if no editor is active or extension is disabled
    if (!editor || !config.enabled) {
        statusBarItem.hide();
        return;
    }
    // Get the line count of the current file
    const lineCount = editor.document.lineCount;
    // Get the maximum line count for this document type
    const maxLines = getMaxLinesForDocument(editor.document, config);
    // Check if the file should be linted
    if (!shouldLintFile(editor.document.uri.fsPath, config)) {
        statusBarItem.text = `$(list-unordered) ${lineCount} lines`;
        statusBarItem.tooltip = 'This file is excluded from line length linting';
        statusBarItem.show();
        return;
    }
    // Update the status bar text
    if (lineCount > maxLines) {
        statusBarItem.text = `$(error) ${lineCount}/${maxLines} lines`;
        statusBarItem.tooltip = `This file exceeds the maximum line count of ${maxLines}${editor.document.languageId ? ` for ${editor.document.languageId} files` : ''}`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    else {
        statusBarItem.text = `$(pass) ${lineCount}/${maxLines} lines`;
        statusBarItem.tooltip = `This file is within the maximum line count of ${maxLines}${editor.document.languageId ? ` for ${editor.document.languageId} files` : ''}`;
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
}
/**
 * Get the extension configuration
 */
function getConfig() {
    const config = vscode.workspace.getConfiguration('fileLengthLint');
    return {
        maxLines: config.get('maxLines', 300),
        languageSpecificMaxLines: config.get('languageSpecificMaxLines', {
            javascript: 500,
            typescript: 500,
            markdown: 1000,
            json: 5000,
            html: 800
        }),
        enabled: config.get('enabled', true),
        exclude: config.get('exclude', [
            '**/.git/**',
            '**/node_modules/**',
            '**/dist/**',
            '**/out/**',
            '**/bin/**',
            '**/obj/**',
            '**/.vs/**',
            '**/.idea/**',
            '**/*.min.js',
            '**/*.min.css',
            '**/*.dll',
            '**/*.exe',
            '**/*.png',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.gif',
            '**/*.ico',
            '**/*.svg',
            '**/*.woff',
            '**/*.woff2',
            '**/*.ttf',
            '**/*.eot',
            '**/*.pdf',
            '**/*.zip',
            '**/*.tar',
            '**/*.gz',
            '**/*.7z'
        ]),
        respectGitignore: config.get('respectGitignore', true),
        realtimeScanningEnabled: config.get('realtimeScanningEnabled', true),
        customQuickFixMessage: config.get('customQuickFixMessage', '')
    };
}
/**
 * Get the maximum line count for a specific document
 * @param document The document to get the maximum line count for
 * @param config The extension configuration
 */
function getMaxLinesForDocument(document, config) {
    // Get the language ID of the document
    const languageId = document.languageId.toLowerCase();
    // Check if there's a language-specific setting for this language
    if (config.languageSpecificMaxLines && config.languageSpecificMaxLines[languageId] !== undefined) {
        return config.languageSpecificMaxLines[languageId];
    }
    // Fall back to the global setting
    return config.maxLines;
}
/**
 * Get or create a gitignore parser for a workspace folder
 */
function getGitignoreParser(workspaceFolderPath) {
    // Check if we already have a parser for this workspace folder
    if (gitignoreCache.has(workspaceFolderPath)) {
        return gitignoreCache.get(workspaceFolderPath);
    }
    // Create a new parser
    const gitignorePath = path.join(workspaceFolderPath, '.gitignore');
    // Check if the .gitignore file exists
    if (!fs.existsSync(gitignorePath)) {
        // No .gitignore file, return undefined
        return undefined;
    }
    try {
        // Read the .gitignore file
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        // Create a new parser
        const parser = (0, ignore_1.default)().add(gitignoreContent);
        // Cache the parser
        gitignoreCache.set(workspaceFolderPath, parser);
        return parser;
    }
    catch (error) {
        console.error(`Error reading .gitignore file: ${error}`);
        return undefined;
    }
}
/**
 * Check if a file should be linted based on exclude patterns and .gitignore
 */
function shouldLintFile(filePath, config) {
    const relativePath = vscode.workspace.asRelativePath(filePath);
    // Check if file matches any exclude pattern
    for (const pattern of config.exclude) {
        if ((0, minimatch_1.minimatch)(relativePath, pattern, { nocase: true })) {
            return false;
        }
    }
    // Check if file should be ignored based on .gitignore
    if (config.respectGitignore) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (workspaceFolder) {
            const gitignoreParser = getGitignoreParser(workspaceFolder.uri.fsPath);
            if (gitignoreParser) {
                // Get the path relative to the workspace folder
                const workspaceRelativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
                // Check if the file is ignored by .gitignore
                if (gitignoreParser.ignores(workspaceRelativePath.replace(/\\/g, '/'))) {
                    return false;
                }
            }
        }
    }
    // If the file wasn't excluded, include it
    return true;
}
/**
 * Terminate all worker threads
 */
function terminateWorkers() {
    // Terminate all worker threads
    for (const worker of workerThreads) {
        worker.terminate();
    }
    // Clear the worker threads array
    workerThreads = [];
    // Reset scanning flag
    isScanning = false;
}
/**
 * Lint all open files in the workspace
 */
async function lintOpenFiles() {
    // Get the configuration
    const config = getConfig();
    // If linting is disabled, return early
    if (!config.enabled) {
        // Clear existing diagnostics
        diagnosticCollection.clear();
        return;
    }
    // Get all open text documents in the workspace
    const textDocuments = vscode.workspace.textDocuments;
    // Lint each open document
    for (const document of textDocuments) {
        await lintDocument(document);
    }
}
/**
 * Scan workspace files using worker threads
 */
async function scanWorkspaceFiles() {
    // Get the configuration
    const config = getConfig();
    // If linting is disabled or already scanning, return early
    if (!config.enabled || !config.realtimeScanningEnabled || isScanning) {
        return;
    }
    // Set scanning flag
    isScanning = true;
    // Get all workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        isScanning = false;
        return;
    }
    try {
        // Find all files in the workspace
        const fileUris = await vscode.workspace.findFiles('**/*', '{' + config.exclude.join(',') + '}');
        // Filter files
        const filesToScan = [];
        for (const uri of fileUris) {
            // Skip files that are already open in the editor
            if (openFiles.has(uri.fsPath)) {
                continue;
            }
            // Check if the file should be linted
            if (shouldLintFile(uri.fsPath, config)) {
                filesToScan.push(uri.fsPath);
            }
        }
        // If no files to scan, return early
        if (filesToScan.length === 0) {
            isScanning = false;
            return;
        }
        // Terminate any existing workers
        terminateWorkers();
        // Use a fixed number of worker threads (4 is a good balance for most systems)
        const threadCount = Math.min(4, filesToScan.length);
        // Split files among worker threads
        const filesPerThread = Math.ceil(filesToScan.length / threadCount);
        const fileGroups = [];
        for (let i = 0; i < threadCount; i++) {
            const start = i * filesPerThread;
            const end = Math.min(start + filesPerThread, filesToScan.length);
            fileGroups.push(filesToScan.slice(start, end));
        }
        // Create a promise for each worker thread
        const workerPromises = fileGroups.map(group => {
            return new Promise((resolve, reject) => {
                try {
                    // Create a worker thread
                    const worker = new worker_threads_1.Worker(path.join(__dirname, 'worker.js'), {
                        workerData: {
                            filePaths: group,
                            maxLines: config.maxLines
                        }
                    });
                    // Add to worker threads array
                    workerThreads.push(worker);
                    // Handle worker messages
                    worker.on('message', (results) => {
                        resolve(results);
                    });
                    // Handle worker errors
                    worker.on('error', (error) => {
                        console.error(`Worker error: ${error}`);
                        reject(error);
                    });
                    // Handle worker exit
                    worker.on('exit', (code) => {
                        if (code !== 0) {
                            console.error(`Worker stopped with exit code ${code}`);
                            reject(new Error(`Worker stopped with exit code ${code}`));
                        }
                    });
                }
                catch (error) {
                    console.error(`Error creating worker: ${error}`);
                    reject(error);
                }
            });
        });
        // Wait for all worker threads to complete
        const results = await Promise.allSettled(workerPromises);
        // Process results
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                const fileResults = result.value;
                // Process each file result
                fileResults.forEach((fileResult) => {
                    if (fileResult.exceeds) {
                        // Create a diagnostic for the file
                        const uri = vscode.Uri.file(fileResult.filePath);
                        const diagnostics = [];
                        // Create a diagnostic for the first line of the file
                        const range = new vscode.Range(0, 0, 0, 0);
                        // Build the diagnostic message, including custom message if available
                        let diagnosticMessage = `File has ${fileResult.lineCount} lines, which exceeds the maximum of ${config.maxLines} lines.`;
                        if (config.customQuickFixMessage && config.customQuickFixMessage.trim() !== '') {
                            diagnosticMessage += ` ${config.customQuickFixMessage}`;
                        }
                        const diagnostic = new vscode.Diagnostic(range, diagnosticMessage, vscode.DiagnosticSeverity.Error);
                        // Set the source of the diagnostic
                        diagnostic.source = 'File Length Lint';
                        // Add the diagnostic to the array
                        diagnostics.push(diagnostic);
                        // Set the diagnostics for this document
                        diagnosticCollection.set(uri, diagnostics);
                    }
                });
            }
        });
    }
    catch (error) {
        console.error(`Error scanning workspace files: ${error}`);
    }
    finally {
        // Terminate worker threads
        terminateWorkers();
        // Reset scanning flag
        isScanning = false;
    }
}
/**
 * Scan specific files using worker threads
 * @param filePaths Array of file paths to scan
 */
async function scanSpecificFiles(filePaths) {
    // Get the configuration
    const config = getConfig();
    // If linting is disabled or already scanning, return early
    if (!config.enabled || !config.realtimeScanningEnabled || isScanning || filePaths.length === 0) {
        return;
    }
    // Set scanning flag
    isScanning = true;
    try {
        // Filter files
        const filesToScan = [];
        for (const filePath of filePaths) {
            // Skip files that are already open in the editor
            if (openFiles.has(filePath)) {
                continue;
            }
            // Check if the file should be linted
            if (shouldLintFile(filePath, config)) {
                filesToScan.push(filePath);
            }
        }
        // If no files to scan, return early
        if (filesToScan.length === 0) {
            isScanning = false;
            return;
        }
        // Create a worker thread
        const worker = new worker_threads_1.Worker(path.join(__dirname, 'worker.js'), {
            workerData: {
                filePaths: filesToScan,
                maxLines: config.maxLines
            }
        });
        // Add to worker threads array
        workerThreads.push(worker);
        // Handle worker messages
        worker.on('message', (results) => {
            // Process each file result
            results.forEach((fileResult) => {
                if (fileResult.exceeds) {
                    // Create a diagnostic for the file
                    const uri = vscode.Uri.file(fileResult.filePath);
                    const diagnostics = [];
                    // Create a diagnostic for the first line of the file
                    const range = new vscode.Range(0, 0, 0, 0);
                    // Build the diagnostic message, including custom message if available
                    let diagnosticMessage = `File has ${fileResult.lineCount} lines, which exceeds the maximum of ${config.maxLines} lines.`;
                    if (config.customQuickFixMessage && config.customQuickFixMessage.trim() !== '') {
                        diagnosticMessage += ` ${config.customQuickFixMessage}`;
                    }
                    const diagnostic = new vscode.Diagnostic(range, diagnosticMessage, vscode.DiagnosticSeverity.Error);
                    // Set the source of the diagnostic
                    diagnostic.source = 'File Length Lint';
                    // Add the diagnostic to the array
                    diagnostics.push(diagnostic);
                    // Set the diagnostics for this document
                    diagnosticCollection.set(uri, diagnostics);
                }
            });
            // Terminate the worker
            worker.terminate();
            // Remove from worker threads array
            const index = workerThreads.indexOf(worker);
            if (index !== -1) {
                workerThreads.splice(index, 1);
            }
            // Reset scanning flag
            isScanning = false;
        });
        // Handle worker errors
        worker.on('error', (error) => {
            console.error(`Worker error: ${error}`);
            // Terminate the worker
            worker.terminate();
            // Remove from worker threads array
            const index = workerThreads.indexOf(worker);
            if (index !== -1) {
                workerThreads.splice(index, 1);
            }
            // Reset scanning flag
            isScanning = false;
        });
        // Handle worker exit
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
            }
            // Remove from worker threads array
            const index = workerThreads.indexOf(worker);
            if (index !== -1) {
                workerThreads.splice(index, 1);
            }
            // Reset scanning flag
            isScanning = false;
        });
    }
    catch (error) {
        console.error(`Error scanning specific files: ${error}`);
        // Reset scanning flag
        isScanning = false;
    }
}
/**
 * Lint a single document
 */
async function lintDocument(document) {
    const config = getConfig();
    // If linting is disabled, return early
    if (!config.enabled) {
        // Clear any existing diagnostics for this document
        diagnosticCollection.delete(document.uri);
        return;
    }
    // Check if we should lint this file
    if (!shouldLintFile(document.uri.fsPath, config)) {
        // Clear any existing diagnostics for this document
        diagnosticCollection.delete(document.uri);
        return;
    }
    // Count the number of lines in the document
    const lineCount = document.lineCount;
    // Get the maximum line count for this document type
    const maxLines = getMaxLinesForDocument(document, config);
    // If the line count exceeds the maximum, create a diagnostic
    if (lineCount > maxLines) {
        const diagnostics = [];
        // Create a diagnostic for the first line of the file
        const range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
        // Build the diagnostic message, including custom message if available
        let diagnosticMessage = `File has ${lineCount} lines, which exceeds the maximum of ${maxLines} lines${document.languageId ? ` for ${document.languageId} files` : ''}.`;
        if (config.customQuickFixMessage && config.customQuickFixMessage.trim() !== '') {
            diagnosticMessage += ` ${config.customQuickFixMessage}`;
        }
        const diagnostic = new vscode.Diagnostic(range, diagnosticMessage, vscode.DiagnosticSeverity.Error);
        // Set the source of the diagnostic
        diagnostic.source = 'File Length Lint';
        // Add the diagnostic to the array
        diagnostics.push(diagnostic);
        // Set the diagnostics for this document
        diagnosticCollection.set(document.uri, diagnostics);
    }
    else {
        // Clear any existing diagnostics for this document
        diagnosticCollection.delete(document.uri);
    }
    // Update status bar if this is the active document
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.fsPath === document.uri.fsPath) {
        updateStatusBar();
    }
}
//# sourceMappingURL=extension.js.map