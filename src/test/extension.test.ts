import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('File Length Lint Extension Tests', () => {
	vscode.window.showInformationMessage('Starting File Length Lint tests');

	let tempDir: string;
	let tempFilePath: string;

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
