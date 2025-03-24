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
const minimatch_1 = require("minimatch");
// Create a diagnostic collection to store file length diagnostics
let diagnosticCollection;
/**
 * Activate the extension
 */
function activate(context) {
    console.log('File Length Lint extension is now active');
    // Create a diagnostic collection for our extension
    diagnosticCollection = vscode.languages.createDiagnosticCollection('fileLengthLint');
    context.subscriptions.push(diagnosticCollection);
    // Initial lint of all files in the workspace
    lintWorkspace();
    // Register event handlers
    context.subscriptions.push(
    // Lint when a text document is opened
    vscode.workspace.onDidOpenTextDocument(document => {
        lintDocument(document);
    }), 
    // Lint when a text document is saved
    vscode.workspace.onDidSaveTextDocument(document => {
        lintDocument(document);
    }), 
    // Clear diagnostics when a document is closed
    vscode.workspace.onDidCloseTextDocument(document => {
        diagnosticCollection.delete(document.uri);
    }), 
    // Re-lint all files when configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('fileLengthLint')) {
            lintWorkspace();
        }
    }));
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
        include: config.get('include', ['**/*'])
    };
}
/**
 * Check if a file should be linted based on include/exclude patterns
 */
function shouldLintFile(filePath, config) {
    const relativePath = vscode.workspace.asRelativePath(filePath);
    // Check if file matches any exclude pattern
    for (const pattern of config.exclude) {
        if ((0, minimatch_1.minimatch)(relativePath, pattern)) {
            return false;
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
 * Lint all files in the workspace
 */
async function lintWorkspace() {
    // Clear existing diagnostics
    diagnosticCollection.clear();
    const config = getConfig();
    // If linting is disabled, return early
    if (!config.enabled) {
        return;
    }
    // Get all text documents in the workspace
    const textDocuments = vscode.workspace.textDocuments;
    // Lint each document
    for (const document of textDocuments) {
        await lintDocument(document);
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