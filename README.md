# File Length Lint

<p align="center">
  <img src="https://raw.githubusercontent.com/Pimzino/file-length-lint/main/images/logo.png" width="128" height="128" alt="File Length Lint Logo">
</p>

<p align="center">
  <a href="https://github.com/Pimzino/file-length-lint/stargazers">
    <img src="https://img.shields.io/github/stars/Pimzino/file-length-lint.svg?style=social" alt="GitHub stars">
  </a>
  <a href="https://github.com/Pimzino/file-length-lint/issues">
    <img src="https://img.shields.io/github/issues/Pimzino/file-length-lint.svg" alt="GitHub issues">
  </a>
  <a href="https://github.com/Pimzino/file-length-lint/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Pimzino/file-length-lint.svg" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/pimzino">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="30">
  </a>
</p>

A lightweight VS Code extension that checks the number of lines in your files and reports problems when files exceed a configured maximum line count.

## Features

- Configurable maximum line count for files
- Language-specific line count limits (different limits for different file types)
- Ability to disable linting for specific languages
- Reports problems in the VS Code Problems panel
- Status bar indicator showing current file's line count
- On-demand workspace scanning command
- Quick fix suggestions for splitting large files
- Customizable exclude patterns with sensible defaults for binary files and build outputs
- Real-time scanning of files using a high-performance language server implementation
- Respects .gitignore files (can be disabled) with real-time updates when files change
- Prevents VS Code extension host crashes by running analysis in a separate process
- Immediately applies changes to exclusion settings and .gitignore files without requiring a reload
- Minimal performance impact with optimized file processing
- Token-based linting for estimating the number of tokens that would be used by an LLM (Large Language Model)
- Automatic binary file detection to skip files that can't be opened in the editor
- Configurable file size limit to prevent memory issues with very large files
- Memory-efficient batch processing for large codebases
- **NEW**: Optimized extension bundle size (67% smaller) for faster installation and loading

## How It Works

The extension works in several ways:

1. **Active file checking**: When you open or save a file, the extension immediately counts the number of lines in the file. If the line count exceeds the configured maximum, a problem is reported in the VS Code Problems panel.

<p align="center">
  <img src="https://raw.githubusercontent.com/Pimzino/file-length-lint/main/images/problemstab.gif" width="700" alt="Problems tab showing file length lint errors">
</p>

2. **Real-time scanning**: The extension scans files in your workspace in real-time using a high-performance language server to find files that exceed the maximum line count. This happens without requiring you to open the files, ensuring all problematic files are identified efficiently. Binary files and files larger than the configured size limit are automatically skipped.

3. **Status bar indicator**: The extension shows the current file's line count in the status bar, along with the maximum allowed for that file type. The indicator turns red when the file exceeds the limit.

4. **Quick fix suggestions**: When a file exceeds the maximum line count, you can use the quick fix feature to get suggestions on how to split the file into smaller, more manageable pieces.

<p align="center">
  <img src="https://raw.githubusercontent.com/Pimzino/file-length-lint/main/images/quickfixsuggestions.gif" width="700" alt="Quick fix suggestions for splitting large files">
</p>

5. **Customizable exclude patterns**: You can configure which files and directories should be excluded from linting. By default, common binary files, build outputs, and version control directories are excluded.

6. **Respects .gitignore files**: The extension can respect your .gitignore files, ensuring that files and directories you've excluded from version control are also excluded from linting.

7. **Minimal performance impact**: The extension is designed to have minimal impact on your VS Code performance. It uses a language server to scan files efficiently and only processes files that haven't been scanned recently.

8. **Token-based linting**: In addition to line count linting, you can also configure the extension to use token counting as an alternative. This is useful for estimating the number of tokens that would be used by an LLM (Large Language Model) when processing your files.

9. **Smart binary file detection**: The extension automatically detects and skips binary files like executables, images, and other non-text files that can't be opened in the editor.

10. **Memory-efficient processing**: Files are processed in small batches with memory monitoring to prevent crashes on large codebases. You can also configure the maximum file size to process using the `fileLengthLint.maxFileSizeInMB` setting.

## Extension Settings

This extension contributes the following settings:

* `fileLengthLint.maxLines`: Maximum number of lines allowed in a file before showing a lint error (default: 300)
* `fileLengthLint.languageSpecificMaxLines`: Language-specific maximum line counts that override the global setting (default: { "javascript": 500, "typescript": 500, "markdown": 1000, "json": 5000, "html": 800 })
* `fileLengthLint.disabledLanguages`: List of language IDs for which linting should be disabled (default: []). For example: ["markdown", "json", "yaml"]
* `fileLengthLint.enabled`: Enable or disable file length linting (default: true)
* `fileLengthLint.exclude`: Glob patterns to exclude from file length linting. Supports patterns like `**/*.dll` (all .dll files in any directory) or `*.dll` (any .dll file). By default, excludes common binary files, build outputs, and version control directories.
* `fileLengthLint.respectGitignore`: Respect .gitignore files when scanning for files to lint (default: true)
* `fileLengthLint.realtimeScanningEnabled`: Enable real-time scanning of files in the workspace (default: true)
* `fileLengthLint.customQuickFixMessage`: Custom message to append to the diagnostic and quick fix suggestion (default: ""). For example: "Please consider refactoring this file according to our team guidelines." This message will appear in the Problems panel, in the quick fix suggestion, and in the information message when using the quick fix.
* `fileLengthLint.measurementType`: Measurement type to use for file length linting. 'lines' counts the number of lines in a file, 'tokens' estimates the number of tokens that would be used by an LLM (using the approximation of 4 characters ≈ 1 token).
* `fileLengthLint.maxTokens`: Maximum number of tokens allowed in a file before showing a lint error (only used when measurementType is set to 'tokens'). For LLMs, approximately 4 characters ≈ 1 token.
* `fileLengthLint.languageSpecificMaxTokens`: Language-specific maximum token counts. Overrides the global maxTokens setting for specified languages (only used when measurementType is set to 'tokens'). For LLMs, approximately 4 characters ≈ 1 token.
* `fileLengthLint.maxFileSizeInMB`: Maximum file size in MB to process. Files larger than this will be skipped to prevent memory issues (default: 5MB).

## Language Server Implementation

This extension uses a language server implementation to provide high-performance file analysis without causing VS Code extension host crashes. The language server runs in a separate process, which prevents it from affecting the stability of VS Code.

Key benefits of the language server approach:

- **Improved Performance**: Analysis runs in a separate process, preventing VS Code extension host crashes
- **Efficient Resource Management**: Better memory usage and cleanup
- **Incremental Processing**: Only changed files are processed, not the entire workspace
- **Debounced Validation**: Prevents excessive CPU usage during rapid file changes
- **Simplified Codebase**: Removed worker threads and complex file scanning logic

### How It Works

The language server implementation follows the Language Server Protocol (LSP) which standardizes the communication between language tooling and code editors. This approach has several advantages:

1. **Separate Process**: The language server runs in a separate process, which prevents it from affecting the stability of VS Code.
2. **Efficient Communication**: The client and server communicate using a standardized protocol, which reduces overhead.
3. **Better Resource Management**: The server can manage its own resources independently of the VS Code extension host.

### Architecture

The extension is divided into two parts:

- **Client**: The VS Code extension that communicates with the language server.
- **Server**: A separate process that analyzes files and reports diagnostics.

This separation allows for better performance and stability, as the server can run intensive operations without affecting the VS Code UI.

## Why Use This Extension?

Excessively long files can be difficult to navigate, understand, and maintain. By setting a maximum line count for your files, you can encourage better code organization and modularization. This extension helps enforce these best practices by providing immediate feedback when files grow too large.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests on the GitHub repository.

**Enjoy!**
