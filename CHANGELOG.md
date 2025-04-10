# Change Log

All notable changes to the "file-length-lint" extension will be documented in this file.

## [0.0.6] - 2025-04-15

- **Optimized Bundle Size**: Implemented esbuild bundling to reduce extension size by 71% (from 15.34MB to 4.43MB)
- **Improved Loading Performance**: Reduced file count from 523 to 22 files for faster extension loading
- **Web Compatibility**: Extension now works in VS Code for Web environments like github.dev and vscode.dev

## [0.0.5] - 2025-04-10

- **Performance Improvements**: Completely redesigned workspace scanning to prevent memory issues on large codebases
- **Redesigned Workspace Scanning**: We have redesigned extension to follow a language server architecture which will improve reliability and performance.
- **Smart Binary File Detection**: Automatically skips binary files like executables, images, and other non-text files
- **Configurable File Size Limit**: Added new setting `fileLengthLint.maxFileSizeInMB` to control maximum file size for processing (default: 5MB)
- **Batch Processing**: Files are now processed in small batches with memory monitoring to prevent crashes
- **Improved Error Handling**: Better error recovery and logging for more reliable operation

## [0.0.4] - 2025-03-25

- Fix bug where worker threads would crash with non-serialized objects
- Add ability to disable linting for specific languages
- Added .vscode/settings.json to default excludes (remove it manually if you want to lint this file)
- Added token based linting as an alternative to line count linting


## [0.0.3] - 2025-03-24

- Initial release of File Length Lint
- Basic functionality to check file line counts
- Configurable maximum line count with language-specific settings
- Status bar indicator showing current file's line count
- On-demand workspace scanning command
- Quick fix suggestions for splitting large files (Works for Fix with Cursor or Fix With Windsurf etc)
- Include/exclude patterns
- Background file scanning
- .gitignore support
- Error reporting in Problems panel