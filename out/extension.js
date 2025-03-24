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
// Create a diagnostic collection to store file length diagnostics
let diagnosticCollection;
// Store background scan timer
let backgroundScanTimer;
// Store gitignore parsers for each workspace folder
const gitignoreCache = new Map();
/**
 * Activate the extension
 */
function activate(context) {
    console.log('File Length Lint extension is now active');
    // Create a diagnostic collection for our extension
    diagnosticCollection = vscode.languages.createDiagnosticCollection('fileLengthLint');
    context.subscriptions.push(diagnosticCollection);
    // Initial lint of all open files in the workspace
    lintOpenFiles();
    // Start background scanning if enabled
    startBackgroundScanning();
    // Register event handlers
    context.subscriptions.push(
    // Lint when a text document is opened
    vscode.workspace.onDidOpenTextDocument(document => {
        lintDocument(document);
    }), 
    // Lint when a text document is saved
    vscode.workspace.onDidSaveTextDocument(document => {
        lintDocument(document);
        // If the saved file is a .gitignore file, clear the cache for that workspace folder
        if (path.basename(document.uri.fsPath) === '.gitignore') {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                gitignoreCache.delete(workspaceFolder.uri.fsPath);
            }
        }
    }), 
    // Clear diagnostics when a document is closed
    vscode.workspace.onDidCloseTextDocument(document => {
        diagnosticCollection.delete(document.uri);
    }), 
    // Re-lint all files when configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('fileLengthLint')) {
            // Clear the gitignore cache when configuration changes
            gitignoreCache.clear();
            // Lint open files immediately
            lintOpenFiles();
            // Restart background scanning with new settings
            stopBackgroundScanning();
            startBackgroundScanning();
        }
    }), 
    // Handle workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // Clear the gitignore cache when workspace folders change
        gitignoreCache.clear();
        // Restart background scanning
        stopBackgroundScanning();
        startBackgroundScanning();
    }));
}
/**
 * Deactivate the extension
 */
function deactivate() {
    // Stop background scanning
    stopBackgroundScanning();
    // Clean up diagnostics when the extension is deactivated
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
    // Clear the gitignore cache
    gitignoreCache.clear();
}
/**
 * Get the extension configuration
 */
function getConfig() {
    const config = vscode.workspace.getConfiguration('fileLengthLint');
    return {
        maxLines: config.get('maxLines', 300),
        enabled: config.get('enabled', true),
        exclude: config.get('exclude', ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/out/**']),
        include: config.get('include', ['**/*']),
        respectGitignore: config.get('respectGitignore', true),
        backgroundScanEnabled: config.get('backgroundScanEnabled', true),
        backgroundScanIntervalMinutes: config.get('backgroundScanIntervalMinutes', 30),
        maxFilesPerScan: config.get('maxFilesPerScan', 100)
    };
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
 * Check if a file should be linted based on include/exclude patterns and .gitignore
 */
function shouldLintFile(filePath, config) {
    const relativePath = vscode.workspace.asRelativePath(filePath);
    // Check if file matches any exclude pattern
    for (const pattern of config.exclude) {
        if ((0, minimatch_1.minimatch)(relativePath, pattern)) {
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
    // Check if file matches any include pattern
    for (const pattern of config.include) {
        if ((0, minimatch_1.minimatch)(relativePath, pattern)) {
            return true;
        }
    }
    return false;
}
/**
 * Start background scanning
 */
function startBackgroundScanning() {
    // Get the configuration
    const config = getConfig();
    // If background scanning is disabled, return early
    if (!config.backgroundScanEnabled) {
        return;
    }
    // Convert minutes to milliseconds
    const intervalMs = config.backgroundScanIntervalMinutes * 60 * 1000;
    // Start the timer
    backgroundScanTimer = setInterval(async () => {
        await scanWorkspaceFiles();
    }, intervalMs);
    // Run an initial scan after a short delay
    setTimeout(async () => {
        await scanWorkspaceFiles();
    }, 5000);
}
/**
 * Stop background scanning
 */
function stopBackgroundScanning() {
    if (backgroundScanTimer) {
        clearInterval(backgroundScanTimer);
        backgroundScanTimer = undefined;
    }
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
 * Scan workspace files in the background
 */
async function scanWorkspaceFiles() {
    // Get the configuration
    const config = getConfig();
    // If linting is disabled, return early
    if (!config.enabled || !config.backgroundScanEnabled) {
        return;
    }
    // Get all workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return;
    }
    // Process each workspace folder
    for (const folder of workspaceFolders) {
        // Find files in the workspace folder
        const fileUris = await vscode.workspace.findFiles('{' + config.include.join(',') + '}', '{' + config.exclude.join(',') + '}', config.maxFilesPerScan);
        // Process files in batches to avoid blocking the UI
        for (const uri of fileUris) {
            // Skip files that are already open in the editor
            if (vscode.workspace.textDocuments.some(doc => doc.uri.fsPath === uri.fsPath)) {
                continue;
            }
            // Check if the file should be linted
            if (!shouldLintFile(uri.fsPath, config)) {
                continue;
            }
            try {
                // Read the file content
                const content = fs.readFileSync(uri.fsPath, 'utf8');
                // Count the number of lines
                const lineCount = content.split('\n').length;
                // If the line count exceeds the maximum, create a diagnostic
                if (lineCount > config.maxLines) {
                    const diagnostics = [];
                    // Create a diagnostic for the first line of the file
                    const range = new vscode.Range(0, 0, 0, 0);
                    const diagnostic = new vscode.Diagnostic(range, `File has ${lineCount} lines, which exceeds the maximum of ${config.maxLines} lines.`, vscode.DiagnosticSeverity.Error);
                    // Set the source of the diagnostic
                    diagnostic.source = 'File Length Lint';
                    // Add the diagnostic to the array
                    diagnostics.push(diagnostic);
                    // Set the diagnostics for this document
                    diagnosticCollection.set(uri, diagnostics);
                }
                else {
                    // Clear any existing diagnostics for this document
                    diagnosticCollection.delete(uri);
                }
            }
            catch (error) {
                // Ignore errors reading files
                console.error(`Error processing file ${uri.fsPath}: ${error}`);
            }
            // Yield to the event loop to avoid blocking the UI
            await new Promise(resolve => setTimeout(resolve, 0));
        }
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
    // If the line count exceeds the maximum, create a diagnostic
    if (lineCount > config.maxLines) {
        const diagnostics = [];
        // Create a diagnostic for the first line of the file
        const range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
        const diagnostic = new vscode.Diagnostic(range, `File has ${lineCount} lines, which exceeds the maximum of ${config.maxLines} lines.`, vscode.DiagnosticSeverity.Error);
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
}
//# sourceMappingURL=extension.js.map