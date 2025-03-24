# File Length Lint

A lightweight VS Code extension that checks the number of lines in your files and reports problems when files exceed a configured maximum line count.

## Features

- Configurable maximum line count for files
- Reports problems in the VS Code Problems panel
- Customizable include/exclude patterns to control which files are checked
- Minimal performance impact

## How It Works

When you open or save a file, the extension counts the number of lines in the file. If the line count exceeds the configured maximum, a problem is reported in the VS Code Problems panel.

## Extension Settings

This extension contributes the following settings:

* `fileLengthLint.maxLines`: Maximum number of lines allowed in a file before showing a lint error (default: 300)
* `fileLengthLint.enabled`: Enable or disable file length linting (default: true)
* `fileLengthLint.exclude`: Glob patterns to exclude from file length linting (default: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/out/**"])
* `fileLengthLint.include`: Glob patterns to include in file length linting (default: ["**/*"])

## Why Use This Extension?

Excessively long files can be difficult to navigate, understand, and maintain. By setting a maximum line count for your files, you can encourage better code organization and modularization. This extension helps enforce these best practices by providing immediate feedback when files grow too large.

## Release Notes

### 0.0.1

Initial release of File Length Lint

- Basic functionality to check file line counts
- Configurable maximum line count
- Include/exclude patterns
- Error reporting in Problems panel

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests on the GitHub repository.

**Enjoy!**
