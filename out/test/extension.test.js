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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
suite('File Length Lint Extension Tests', () => {
    vscode.window.showInformationMessage('Starting File Length Lint tests');
    let tempDir;
    let tempFilePath;
    setup(async () => {
        // Create a temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-length-lint-test-'));
        tempFilePath = path.join(tempDir, 'test-file.txt');
        // Set the configuration for testing
        await vscode.workspace.getConfiguration('fileLengthLint').update('maxLines', 5, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('enabled', true, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('include', ['**/*'], vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('exclude', [], vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('respectGitignore', true, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('backgroundScanEnabled', false, vscode.ConfigurationTarget.Global);
    });
    teardown(async () => {
        // Clean up temporary files and reset configuration
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        // Reset configuration to defaults
        await vscode.workspace.getConfiguration('fileLengthLint').update('maxLines', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('include', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('exclude', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('respectGitignore', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('fileLengthLint').update('backgroundScanEnabled', undefined, vscode.ConfigurationTarget.Global);
    });
    test('Should report diagnostic when file exceeds max lines', async () => {
        // Create a file with more than the max lines
        const content = Array(10).fill('Test line').join('\n');
        fs.writeFileSync(tempFilePath, content);
        // Open the file in VS Code
        const document = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document);
        // Wait for diagnostics to be calculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Get diagnostics for the file
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        // Verify that a diagnostic was reported
        assert.strictEqual(diagnostics.length, 1, 'Should have one diagnostic');
        assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error, 'Should be an error');
        assert.ok(diagnostics[0].message.includes('10 lines'), 'Message should include the line count');
        assert.ok(diagnostics[0].message.includes('5 lines'), 'Message should include the max line count');
    });
    test('Should not report diagnostic when file is under max lines', async () => {
        // Create a file with fewer than the max lines
        const content = Array(3).fill('Test line').join('\n');
        fs.writeFileSync(tempFilePath, content);
        // Open the file in VS Code
        const document = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document);
        // Wait for diagnostics to be calculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Get diagnostics for the file
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        // Verify that no diagnostic was reported
        assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
    });
    test('Should respect the enabled setting', async () => {
        // Create a file with more than the max lines
        const content = Array(10).fill('Test line').join('\n');
        fs.writeFileSync(tempFilePath, content);
        // Open the file in VS Code
        const document = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document);
        // Wait for diagnostics to be calculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Disable the extension
        await vscode.workspace.getConfiguration('fileLengthLint').update('enabled', false, vscode.ConfigurationTarget.Global);
        // Wait for diagnostics to be recalculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Get diagnostics for the file
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        // Verify that no diagnostic was reported when disabled
        assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics when disabled');
    });
    test('Should respect .gitignore files', async () => {
        // Create a .gitignore file that ignores the test file
        const gitignorePath = path.join(tempDir, '.gitignore');
        fs.writeFileSync(gitignorePath, 'test-file.txt');
        // Create a file with more than the max lines
        const content = Array(10).fill('Test line').join('\n');
        fs.writeFileSync(tempFilePath, content);
        // Open the file in VS Code
        const document = await vscode.workspace.openTextDocument(tempFilePath);
        await vscode.window.showTextDocument(document);
        // Wait for diagnostics to be calculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Get diagnostics for the file
        let diagnostics = vscode.languages.getDiagnostics(document.uri);
        // Verify that no diagnostic was reported because the file is in .gitignore
        assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics for files in .gitignore');
        // Disable .gitignore support
        await vscode.workspace.getConfiguration('fileLengthLint').update('respectGitignore', false, vscode.ConfigurationTarget.Global);
        // Wait for diagnostics to be recalculated
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Get diagnostics for the file again
        diagnostics = vscode.languages.getDiagnostics(document.uri);
        // Verify that a diagnostic was reported when .gitignore support is disabled
        assert.strictEqual(diagnostics.length, 1, 'Should have diagnostics when .gitignore support is disabled');
    });
});
//# sourceMappingURL=extension.test.js.map