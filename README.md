# File Length Lint

<p align="center">
  <img src="images/logo.svg" width="128" height="128" alt="File Length Lint Logo">
</p>

A lightweight VS Code extension that checks the number of lines in your files and reports problems when files exceed a configured maximum line count.

## Features

- Configurable maximum line count for files
- Language-specific line count limits (different limits for different file types)
- Reports problems in the VS Code Problems panel
- Status bar indicator showing current file's line count
- On-demand workspace scanning command
- Quick fix suggestions for splitting large files
- Customizable exclude patterns with sensible defaults for binary files and build outputs
- Real-time scanning of files using multi-threading for better performance
- Respects .gitignore files (can be disabled) with real-time updates when files change
- Immediately applies changes to exclusion settings and .gitignore files without requiring a reload
- Minimal performance impact with optimized file processing

## How It Works

The extension works in several ways:

1. **Active file checking**: When you open or save a file, the extension immediately counts the number of lines in the file. If the line count exceeds the configured maximum, a problem is reported in the VS Code Problems panel.

2. **Real-time scanning**: The extension scans files in your workspace in real-time using multi-threading to find files that exceed the maximum line count. This happens without requiring you to open the files, ensuring all problematic files are identified efficiently.

3. **Status bar indicator**: The extension shows the current file's line count in the status bar, along with the maximum allowed for that file type. The indicator turns red when the file exceeds the limit.

4. **Quick fix suggestions**: When a file exceeds the maximum line count, you can use the quick fix feature to get suggestions on how to split the file into smaller, more manageable pieces.

## Extension Settings

This extension contributes the following settings:

* `fileLengthLint.maxLines`: Maximum number of lines allowed in a file before showing a lint error (default: 300)
* `fileLengthLint.languageSpecificMaxLines`: Language-specific maximum line counts that override the global setting (default: { "javascript": 500, "typescript": 500, "markdown": 1000, "json": 5000, "html": 800 })
* `fileLengthLint.enabled`: Enable or disable file length linting (default: true)
* `fileLengthLint.exclude`: Glob patterns to exclude from file length linting. Supports patterns like `**/*.dll` (all .dll files in any directory) or `*.dll` (any .dll file). By default, excludes common binary files, build outputs, and version control directories.
* `fileLengthLint.respectGitignore`: Respect .gitignore files when scanning for files to lint (default: true)
* `fileLengthLint.realtimeScanningEnabled`: Enable real-time scanning of files in the workspace (default: true)
* `fileLengthLint.customQuickFixMessage`: Custom message to append to the diagnostic and quick fix suggestion (default: ""). For example: "Please consider refactoring this file according to our team guidelines." This message will appear in the Problems panel, in the quick fix suggestion, and in the information message when using the quick fix.

## Why Use This Extension?

Excessively long files can be difficult to navigate, understand, and maintain. By setting a maximum line count for your files, you can encourage better code organization and modularization. This extension helps enforce these best practices by providing immediate feedback when files grow too large.

## Release Notes

### 0.0.1

Initial release of File Length Lint

- Basic functionality to check file line counts
- Configurable maximum line count with language-specific settings
- Status bar indicator showing current file's line count
- On-demand workspace scanning command
- Quick fix suggestions for splitting large files
- Include/exclude patterns
- Background file scanning
- .gitignore support
- Error reporting in Problems panel

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests on the GitHub repository.

**Enjoy!**
