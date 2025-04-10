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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Import the language client module
const node_1 = require("vscode-languageclient/node");
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
        // Get the configuration
        const config = vscode.workspace.getConfiguration('fileLengthLint');
        const customQuickFixMessage = config.get('customQuickFixMessage', '');
        // Create the action title with the custom message appended if available
        let actionTitle = 'Suggest ways to split this file';
        if (customQuickFixMessage && customQuickFixMessage.trim() !== '') {
            actionTitle = `Suggest ways to split this file (${customQuickFixMessage})`;
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
// Create a status bar item
let statusBarItem;
// Language client
let client;
/**
 * Suggest ways to split a file
 */
async function suggestFileSplit(uri) {
    // Get the document
    const document = await vscode.workspace.openTextDocument(uri);
    // Get the file name
    const fileName = path.basename(document.fileName);
    // Show the suggestions
    vscode.window.showInformationMessage(`Suggestions for splitting ${fileName}:`, 'Extract Components', 'Create Modules', 'Separate by Function');
}
/**
 * Update the status bar with the current file's line count
 */
function updateStatusBar() {
    const editor = vscode.window.activeTextEditor;
    // Hide status bar item if no editor is active
    if (!editor) {
        statusBarItem.hide();
        return;
    }
    // Get the line count
    const lineCount = editor.document.lineCount;
    // Update the status bar item
    statusBarItem.text = `$(list-unordered) ${lineCount} lines`;
    statusBarItem.tooltip = 'File Length Lint: Click to scan workspace';
    statusBarItem.show();
}
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    maxLines: 300,
    languageSpecificMaxLines: {
        javascript: 500,
        typescript: 500,
        markdown: 1000,
        json: 5000,
        html: 800
    },
    measurementType: 'lines',
    maxTokens: 2000,
    languageSpecificMaxTokens: {
        javascript: 2000,
        typescript: 2000,
        markdown: 4000,
        json: 8000,
        html: 3000
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
        '**/.vscode/settings.json',
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
    customQuickFixMessage: '',
    disabledLanguages: [],
    maxFileSizeInMB: 5
};
/**
 * Validate and restore missing settings
 */
async function validateAndRestoreSettings() {
    const config = vscode.workspace.getConfiguration('fileLengthLint');
    let settingsRestored = false;
    // Check for missing critical settings and restore them
    if (config.get('maxLines') === undefined) {
        await config.update('maxLines', DEFAULT_CONFIG.maxLines, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('enabled') === undefined) {
        await config.update('enabled', DEFAULT_CONFIG.enabled, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('exclude') === undefined) {
        await config.update('exclude', DEFAULT_CONFIG.exclude, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('respectGitignore') === undefined) {
        await config.update('respectGitignore', DEFAULT_CONFIG.respectGitignore, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('realtimeScanningEnabled') === undefined) {
        await config.update('realtimeScanningEnabled', DEFAULT_CONFIG.realtimeScanningEnabled, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('languageSpecificMaxLines') === undefined) {
        await config.update('languageSpecificMaxLines', DEFAULT_CONFIG.languageSpecificMaxLines, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('disabledLanguages') === undefined) {
        await config.update('disabledLanguages', DEFAULT_CONFIG.disabledLanguages, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('measurementType') === undefined) {
        await config.update('measurementType', DEFAULT_CONFIG.measurementType, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('maxTokens') === undefined) {
        await config.update('maxTokens', DEFAULT_CONFIG.maxTokens, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('languageSpecificMaxTokens') === undefined) {
        await config.update('languageSpecificMaxTokens', DEFAULT_CONFIG.languageSpecificMaxTokens, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('customQuickFixMessage') === undefined) {
        await config.update('customQuickFixMessage', DEFAULT_CONFIG.customQuickFixMessage, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    if (config.get('maxFileSizeInMB') === undefined) {
        await config.update('maxFileSizeInMB', DEFAULT_CONFIG.maxFileSizeInMB, vscode.ConfigurationTarget.Global);
        settingsRestored = true;
    }
    return settingsRestored;
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
    // Register the code action provider
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ pattern: '**/*' }, new FileLengthLintCodeActionProvider()));
    // Register the suggest file split command
    context.subscriptions.push(vscode.commands.registerCommand('fileLengthLint.suggestFileSplit', (uri) => {
        suggestFileSplit(uri);
    }));
    // Register the scan workspace command
    context.subscriptions.push(vscode.commands.registerCommand('fileLengthLint.scanWorkspace', () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'File Length Lint: Scanning workspace files...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });
            progress.report({ message: 'Scanning workspace files...' });
            try {
                // Send custom request to language server to scan workspace
                if (client) {
                    await client.sendRequest('fileLengthLint/scanWorkspace');
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Error scanning workspace: ${error}`);
            }
            progress.report({ increment: 100 });
            return;
        });
    }));
    // Register the reset settings command
    context.subscriptions.push(vscode.commands.registerCommand('fileLengthLint.resetSettings', async () => {
        const result = await vscode.window.showWarningMessage('Are you sure you want to reset all File Length Lint settings to their default values?', { modal: true }, 'Yes', 'No');
        if (result === 'Yes') {
            try {
                const config = vscode.workspace.getConfiguration('fileLengthLint');
                // Reset all settings to their default values
                await config.update('maxLines', DEFAULT_CONFIG.maxLines, vscode.ConfigurationTarget.Global);
                await config.update('languageSpecificMaxLines', DEFAULT_CONFIG.languageSpecificMaxLines, vscode.ConfigurationTarget.Global);
                await config.update('measurementType', DEFAULT_CONFIG.measurementType, vscode.ConfigurationTarget.Global);
                await config.update('maxTokens', DEFAULT_CONFIG.maxTokens, vscode.ConfigurationTarget.Global);
                await config.update('languageSpecificMaxTokens', DEFAULT_CONFIG.languageSpecificMaxTokens, vscode.ConfigurationTarget.Global);
                await config.update('enabled', DEFAULT_CONFIG.enabled, vscode.ConfigurationTarget.Global);
                await config.update('exclude', DEFAULT_CONFIG.exclude, vscode.ConfigurationTarget.Global);
                await config.update('respectGitignore', DEFAULT_CONFIG.respectGitignore, vscode.ConfigurationTarget.Global);
                await config.update('realtimeScanningEnabled', DEFAULT_CONFIG.realtimeScanningEnabled, vscode.ConfigurationTarget.Global);
                await config.update('customQuickFixMessage', DEFAULT_CONFIG.customQuickFixMessage, vscode.ConfigurationTarget.Global);
                await config.update('disabledLanguages', DEFAULT_CONFIG.disabledLanguages, vscode.ConfigurationTarget.Global);
                await config.update('maxFileSizeInMB', DEFAULT_CONFIG.maxFileSizeInMB, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('File Length Lint settings have been reset to their default values.');
            }
            catch (error) {
                vscode.window.showErrorMessage(`Error resetting settings: ${error}`);
            }
        }
    }));
    // Server module
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    // Server options
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    // Client options
    const clientOptions = {
        documentSelector: [{ scheme: 'file' }], // All files
        synchronize: {
            // Notify server about these file changes
            fileEvents: [
                vscode.workspace.createFileSystemWatcher('**/.gitignore')
            ],
            // Notify server about these configuration changes
            configurationSection: 'fileLengthLint'
        },
        diagnosticCollectionName: 'fileLengthLint'
    };
    // Create and start client
    client = new node_1.LanguageClient('fileLengthLint', 'File Length Lint', serverOptions, clientOptions);
    // Start the client
    client.start();
}
/**
 * Deactivate the extension
 */
function deactivate() {
    // Clean up diagnostics when the extension is deactivated
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
    // Dispose of status bar item
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    // Stop the language client
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map