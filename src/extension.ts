import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';

// Create a diagnostic collection to store file length diagnostics
let diagnosticCollection: vscode.DiagnosticCollection;

// Configuration interface
interface FileLengthLintConfig {
	maxLines: number;
	enabled: boolean;
	exclude: string[];
	include: string[];
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
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
		})
	);
}

/**
 * Deactivate the extension
 */
export function deactivate() {
	// Clean up diagnostics when the extension is deactivated
	if (diagnosticCollection) {
		diagnosticCollection.clear();
		diagnosticCollection.dispose();
	}
}

/**
 * Get the extension configuration
 */
function getConfig(): FileLengthLintConfig {
	const config = vscode.workspace.getConfiguration('fileLengthLint');
	return {
		maxLines: config.get<number>('maxLines', 300),
		enabled: config.get<boolean>('enabled', true),
		exclude: config.get<string[]>('exclude', ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/out/**']),
		include: config.get<string[]>('include', ['**/*'])
	};
}

/**
 * Check if a file should be linted based on include/exclude patterns
 */
function shouldLintFile(filePath: string, config: FileLengthLintConfig): boolean {
	const relativePath = vscode.workspace.asRelativePath(filePath);

	// Check if file matches any exclude pattern
	for (const pattern of config.exclude) {
		if (minimatch(relativePath, pattern)) {
			return false;
		}
	}

	// Check if file matches any include pattern
	for (const pattern of config.include) {
		if (minimatch(relativePath, pattern)) {
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
async function lintDocument(document: vscode.TextDocument) {
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
		const diagnostics: vscode.Diagnostic[] = [];

		// Create a diagnostic for the first line of the file
		const range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
		const diagnostic = new vscode.Diagnostic(
			range,
			`File has ${lineCount} lines, which exceeds the maximum of ${config.maxLines} lines.`,
			vscode.DiagnosticSeverity.Error
		);

		// Set the source of the diagnostic
		diagnostic.source = 'File Length Lint';

		// Add the diagnostic to the array
		diagnostics.push(diagnostic);

		// Set the diagnostics for this document
		diagnosticCollection.set(document.uri, diagnostics);
	} else {
		// Clear any existing diagnostics for this document
		diagnosticCollection.delete(document.uri);
	}
}
