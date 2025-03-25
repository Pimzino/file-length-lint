# Change Log

All notable changes to the "file-length-lint" extension will be documented in this file.

## [0.0.4] - 2025-03-25

- Fix bug where worker threads would crash with non-serialized objects
- Add ability to disable linting for specific languages
- Added .vscode/settings.json to default excludes (remove it manually if you want to lint this file)


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