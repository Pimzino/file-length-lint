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
        // Get the configuration
        const config = getConfig(true);
        // Only proceed if the extension is enabled and respects gitignore
        if (!config.enabled || !config.respectGitignore) {
            return;
        }
        console.log('.gitignore file changed - updating diagnostics');
        // Clear all existing diagnostics first
        diagnosticCollection.clear();
        // Terminate any running worker threads
        terminateWorkers();
        // Show a notification that we're updating
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'File Length Lint: Updating with new .gitignore patterns...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });
            // Lint open files immediately with the new configuration
            await lintOpenFiles(true);
            // Re-scan workspace if real-time scanning is enabled
            if (config.realtimeScanningEnabled) {
                await scanWorkspaceFiles(true);
            }
            progress.report({ increment: 100 });
            return;
        });
    }
}
/**
 * Activate the extension
 */
async function activate(context) {
    console.log('File Length Lint extension is now active');
    // Validate and restore any missing settings before initializing
    const settingsRestored = await validateAndRestoreSettings();
    if (settingsRestored) {
        console.log('File Length Lint: Restored missing settings');
    }
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
    // Register a command to reset all settings to defaults
    const resetSettingsCommand = vscode.commands.registerCommand('fileLengthLint.resetSettings', async () => {
        const resetAction = 'Reset All Settings';
        const cancelAction = 'Cancel';
        const result = await vscode.window.showWarningMessage('This will reset all File Length Lint settings to their default values. Are you sure you want to continue?', { modal: true }, resetAction, cancelAction);
        if (result === resetAction) {
            // Get the configuration
            const config = vscode.workspace.getConfiguration('fileLengthLint');
            // Reset all settings to defaults
            await config.update('maxLines', DEFAULT_CONFIG.maxLines, vscode.ConfigurationTarget.Global);
            await config.update('languageSpecificMaxLines', DEFAULT_CONFIG.languageSpecificMaxLines, vscode.ConfigurationTarget.Global);
            await config.update('enabled', DEFAULT_CONFIG.enabled, vscode.ConfigurationTarget.Global);
            await config.update('exclude', DEFAULT_CONFIG.exclude, vscode.ConfigurationTarget.Global);
            await config.update('respectGitignore', DEFAULT_CONFIG.respectGitignore, vscode.ConfigurationTarget.Global);
            await config.update('realtimeScanningEnabled', DEFAULT_CONFIG.realtimeScanningEnabled, vscode.ConfigurationTarget.Global);
            await config.update('customQuickFixMessage', DEFAULT_CONFIG.customQuickFixMessage, vscode.ConfigurationTarget.Global);
            // Show a notification that settings were reset
            const viewSettings = 'View Settings';
            vscode.window.showInformationMessage('File Length Lint: All settings have been reset to defaults.', viewSettings)
                .then(selection => {
                if (selection === viewSettings) {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'fileLengthLint');
                }
            });
            // Re-scan workspace with new settings
            await lintOpenFiles(true);
            if (DEFAULT_CONFIG.realtimeScanningEnabled) {
                await scanWorkspaceFiles(true);
            }
        }
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
    context.subscriptions.push(scanWorkspaceCommand, resetSettingsCommand, suggestFileSplitCommand, codeActionProvider);
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
        // Don't clear diagnostics when a file is closed
        // This allows problems to remain visible in the Problems tab
    }), 
    // Re-lint all files when configuration changes
    vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('fileLengthLint')) {
            console.log('File Length Lint configuration changed');
            // Check if any critical settings were deleted and restore them if needed
            const settingsRestored = await validateAndRestoreSettings(false);
            if (settingsRestored) {
                console.log('File Length Lint: Restored missing settings after configuration change');
                // Show a notification that settings were restored
                const message = 'File Length Lint: Some settings were missing and have been restored to defaults.';
                const viewSettings = 'View Settings';
                vscode.window.showInformationMessage(message, viewSettings).then(selection => {
                    if (selection === viewSettings) {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'fileLengthLint');
                    }
                });
            }
            // Handle exclude pattern changes specifically
            if (event.affectsConfiguration('fileLengthLint.exclude')) {
                console.log('Exclusion patterns changed - updating diagnostics');
                // Get the new configuration with a forced refresh
                const newConfig = getConfig(true);
                // Clear all existing diagnostics first
                diagnosticCollection.clear();
                // Terminate any running worker threads
                terminateWorkers();
                // Show a notification that we're updating
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'File Length Lint: Applying new exclusion patterns...',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    // Lint open files immediately with the new configuration
                    await lintOpenFiles(true);
                    // Re-scan workspace if real-time scanning is enabled
                    if (newConfig.realtimeScanningEnabled) {
                        await scanWorkspaceFiles(true);
                    }
                    progress.report({ increment: 100 });
                    return;
                });
            }
            else {
                // Handle other configuration changes
                // Clear the gitignore cache when configuration changes
                if (event.affectsConfiguration('fileLengthLint.respectGitignore')) {
                    console.log('Clearing gitignore cache due to configuration change');
                    gitignoreCache.clear();
                }
                // Lint open files immediately
                lintOpenFiles(true);
                // Terminate any running worker threads
                terminateWorkers();
                // Re-scan workspace if real-time scanning is enabled
                if (getConfig(true).realtimeScanningEnabled &&
                    (event.affectsConfiguration('fileLengthLint.respectGitignore') ||
                        event.affectsConfiguration('fileLengthLint.realtimeScanningEnabled') ||
                        event.affectsConfiguration('fileLengthLint.enabled'))) {
                    console.log('Re-scanning workspace due to configuration change');
                    scanWorkspaceFiles(true);
                }
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
        if (getConfig(true).realtimeScanningEnabled) {
            // Scan only the newly created files
            const newFiles = event.files.map(uri => uri.fsPath);
            scanSpecificFiles(newFiles, true);
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
// Default configuration values
const DEFAULT_CONFIG = {
    maxLines: 300,
    languageSpecificMaxLines: {
        javascript: 500,
        typescript: 500,
        markdown: 1000,
        json: 5000,
        html: 800
    },
    enabled: true,
    exclude: [
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
    ],
    respectGitignore: true,
    realtimeScanningEnabled: true,
    customQuickFixMessage: ''
};
/**
 * Validate and restore missing settings
 * @param showNotification Whether to show a notification when settings are restored
 */
async function validateAndRestoreSettings(showNotification = true) {
    const config = vscode.workspace.getConfiguration('fileLengthLint');
    let settingsRestored = false;
    let restoredSettings = [];
    // Check for missing critical settings and restore them
    if (config.get('maxLines') === undefined) {
        await config.update('maxLines', DEFAULT_CONFIG.maxLines, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('maxLines');
    }
    if (config.get('enabled') === undefined) {
        await config.update('enabled', DEFAULT_CONFIG.enabled, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('enabled');
    }
    if (config.get('exclude') === undefined) {
        await config.update('exclude', DEFAULT_CONFIG.exclude, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('exclude');
    }
    if (config.get('respectGitignore') === undefined) {
        await config.update('respectGitignore', DEFAULT_CONFIG.respectGitignore, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('respectGitignore');
    }
    if (config.get('realtimeScanningEnabled') === undefined) {
        await config.update('realtimeScanningEnabled', DEFAULT_CONFIG.realtimeScanningEnabled, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('realtimeScanningEnabled');
    }
    if (config.get('languageSpecificMaxLines') === undefined) {
        await config.update('languageSpecificMaxLines', DEFAULT_CONFIG.languageSpecificMaxLines, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
        restoredSettings.push('languageSpecificMaxLines');
    }
    // Show notification if settings were restored
    if (settingsRestored && showNotification) {
        const message = `File Length Lint: Restored missing settings (${restoredSettings.join(', ')})`;
        const viewSettings = 'View Settings';
        vscode.window.showInformationMessage(message, viewSettings).then(selection => {
            if (selection === viewSettings) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'fileLengthLint');
            }
        });
    }
    return settingsRestored;
}
/**
 * Get the extension configuration
 * @param forceRefresh Force a refresh of the configuration from VS Code
 */
function getConfig(forceRefresh = false) {
    // Always get a fresh configuration to ensure we have the latest settings
    const config = vscode.workspace.getConfiguration('fileLengthLint');
    console.log('Getting configuration' + (forceRefresh ? ' (forced refresh)' : ''));
    // Create a config object with default values as fallbacks
    return {
        maxLines: config.get('maxLines', DEFAULT_CONFIG.maxLines),
        languageSpecificMaxLines: config.get('languageSpecificMaxLines', DEFAULT_CONFIG.languageSpecificMaxLines),
        enabled: config.get('enabled', DEFAULT_CONFIG.enabled),
        exclude: config.get('exclude', DEFAULT_CONFIG.exclude),
        respectGitignore: config.get('respectGitignore', DEFAULT_CONFIG.respectGitignore),
        realtimeScanningEnabled: config.get('realtimeScanningEnabled', DEFAULT_CONFIG.realtimeScanningEnabled),
        customQuickFixMessage: config.get('customQuickFixMessage', DEFAULT_CONFIG.customQuickFixMessage)
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
    try {
        // Check if the .gitignore file exists and is readable
        if (!fs.existsSync(gitignorePath) || !fs.statSync(gitignorePath).isFile()) {
            // No .gitignore file or not a regular file, return undefined
            return undefined;
        }
        // Read the .gitignore file
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        // Create a new parser with default rules
        const parser = (0, ignore_1.default)()
            // Add some common default rules that are often in .gitignore files
            .add('node_modules/')
            .add('.git/')
            .add('*.log')
            // Add the content from the .gitignore file
            .add(gitignoreContent);
        // Cache the parser
        gitignoreCache.set(workspaceFolderPath, parser);
        console.log(`Created gitignore parser for ${workspaceFolderPath}`);
        return parser;
    }
    catch (error) {
        console.error(`Error reading .gitignore file at ${gitignorePath}: ${error}`);
        // Create a default parser with common patterns
        const defaultParser = (0, ignore_1.default)()
            .add('node_modules/')
            .add('.git/')
            .add('*.log');
        // Cache the default parser
        gitignoreCache.set(workspaceFolderPath, defaultParser);
        return defaultParser;
    }
}
/**
 * Check if a file should be linted based on exclude patterns and .gitignore
 */
function shouldLintFile(filePath, config) {
    const relativePath = vscode.workspace.asRelativePath(filePath);
    // Log the current exclusion patterns for debugging
    console.log(`Checking file ${relativePath} against ${config.exclude.length} exclusion patterns`);
    // Check if file matches any exclude pattern
    for (const pattern of config.exclude) {
        try {
            // Try both with and without the dot option to ensure consistent behavior
            if ((0, minimatch_1.minimatch)(relativePath, pattern, { nocase: true, dot: true }) ||
                (0, minimatch_1.minimatch)(relativePath, pattern, { nocase: true })) {
                console.log(`Excluded file ${relativePath} by pattern ${pattern}`);
                return false;
            }
            // Also try matching just the filename for patterns like *.dll
            const fileName = path.basename(relativePath);
            if (pattern.startsWith('*.') && (0, minimatch_1.minimatch)(fileName, pattern, { nocase: true })) {
                console.log(`Excluded file ${relativePath} by filename pattern ${pattern}`);
                return false;
            }
            // For directory patterns like **/bin/**, also check if the path contains the directory
            if (pattern.includes('/**/') || pattern.startsWith('**/') || pattern.endsWith('/**')) {
                // Convert pattern to a simpler form for checking directory inclusion
                const dirPattern = pattern.replace(/\*\*/g, '');
                if (dirPattern && relativePath.includes(dirPattern)) {
                    console.log(`Excluded file ${relativePath} by directory pattern ${pattern}`);
                    return false;
                }
            }
        }
        catch (error) {
            // Log error but continue checking other patterns
            console.error(`Error checking pattern ${pattern} against ${relativePath}: ${error}`);
        }
    }
    // Check if file should be ignored based on .gitignore
    if (config.respectGitignore) {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
            if (workspaceFolder) {
                const gitignoreParser = getGitignoreParser(workspaceFolder.uri.fsPath);
                if (gitignoreParser) {
                    // Get the path relative to the workspace folder
                    const workspaceRelativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
                    // Normalize path separators for cross-platform compatibility
                    const normalizedPath = workspaceRelativePath.replace(/\\/g, '/');
                    // Check if the file is ignored by .gitignore
                    if (gitignoreParser.ignores(normalizedPath)) {
                        console.log(`File ${relativePath} ignored by .gitignore rules`);
                        return false;
                    }
                }
            }
        }
        catch (error) {
            // Log error but continue with other checks
            console.error(`Error checking .gitignore rules for ${relativePath}: ${error}`);
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
 * @param forceRefresh Force a refresh of the configuration
 */
async function lintOpenFiles(forceRefresh = false) {
    // Get the configuration
    const config = getConfig(forceRefresh);
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
 * @param forceRefresh Force a refresh of the configuration
 */
async function scanWorkspaceFiles(forceRefresh = false) {
    // Get the configuration
    const config = getConfig(forceRefresh);
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
        // Note: VS Code's findFiles uses a different glob syntax than minimatch
        // We'll get all files and filter them ourselves to ensure consistent behavior
        const fileUris = await vscode.workspace.findFiles('**/*', '**/node_modules/**' // Only exclude node_modules to improve performance
        );
        // Filter files
        const filesToScan = [];
        for (const uri of fileUris) {
            // Don't skip open files - we want to scan all files in the workspace
            // Check if the file should be linted
            if (shouldLintFile(uri.fsPath, config)) {
                filesToScan.push(uri.fsPath);
            }
            else {
                // File was excluded by pattern or gitignore
                const relativePath = vscode.workspace.asRelativePath(uri.fsPath);
                console.log(`Skipping file ${relativePath} due to exclusion rules`);
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
                            // Don't reject the promise on non-zero exit code
                            // This allows the extension to continue processing other files
                            // Just resolve with an empty array for this worker
                            resolve([]);
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
 * @param forceRefresh Force a refresh of the configuration
 */
async function scanSpecificFiles(filePaths, forceRefresh = false) {
    // Get the configuration
    const config = getConfig(forceRefresh);
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
            // Don't skip open files - we want to scan all files in the workspace
            // Check if the file should be linted
            if (shouldLintFile(filePath, config)) {
                filesToScan.push(filePath);
            }
            else {
                console.log(`Skipping file ${filePath} due to exclusion rules`);
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
                // Even if the worker exits with an error, we'll continue
                // This prevents the extension from getting stuck
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