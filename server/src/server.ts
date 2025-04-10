import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  DidChangeConfigurationNotification,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { minimatch } from 'minimatch';
import ignore from 'ignore';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Default settings
interface FileLengthSettings {
  maxLines: number;
  languageSpecificMaxLines: Record<string, number>;
  measurementType: 'lines' | 'tokens';
  maxTokens: number;
  languageSpecificMaxTokens: Record<string, number>;
  enabled: boolean;
  exclude: string[];
  respectGitignore: boolean;
  realtimeScanningEnabled: boolean;
  customQuickFixMessage: string;
  disabledLanguages: string[];
  maxFileSizeInMB: number; // Maximum file size to process in MB
}

const defaultSettings: FileLengthSettings = {
  maxLines: 300,
  languageSpecificMaxLines: {
    javascript: 500,
    typescript: 500,
    markdown: 1000,
    json: 5000,
    html: 800
  },
  measurementType: 'lines',
  maxTokens: 2000,
  languageSpecificMaxTokens: {
    javascript: 2000,
    typescript: 2000,
    markdown: 4000,
    json: 8000,
    html: 3000
  },
  enabled: true,
  exclude: [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/bin/**',
    '**/obj/**',
    '**/.vs/**',
    '**/.idea/**',
    '**/.vscode/settings.json',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.dll',
    '**/*.exe',
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.ico',
    '**/*.svg',
    '**/*.woff',
    '**/*.woff2',
    '**/*.ttf',
    '**/*.eot',
    '**/*.pdf',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.7z'
  ],
  respectGitignore: true,
  realtimeScanningEnabled: true,
  customQuickFixMessage: '',
  disabledLanguages: [],
  maxFileSizeInMB: 5 // Default to 5MB max file size
};

let globalSettings: FileLengthSettings = defaultSettings;
const documentSettings = new Map<string, Thenable<FileLengthSettings>>();

// Cache for gitignore parsers
const gitignoreCache = new Map<string, ReturnType<typeof ignore>>();

// Cache for file system operations with memory limits
const fsCache = new Map<string, { exists: boolean, stats?: fs.Stats, content?: string, timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds
const MAX_CACHE_SIZE = 1000; // Maximum number of entries in the cache

// Initialize
connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    }
  };

  return result;
});

// After initialization
connection.onInitialized(async () => {
  // Register for configuration changes
  connection.client.register(
    DidChangeConfigurationNotification.type,
    undefined
  );

  // Validate all open documents
  documents.all().forEach(validateTextDocument);

  // Scan the entire workspace
  await scanWorkspace();
});

// Register custom request handler for workspace scan
connection.onRequest('fileLengthLint/scanWorkspace', async () => {
  await scanWorkspace();
  return { success: true };
});

// Shutdown handler
connection.onShutdown(() => {
  // Clear caches
  documentSettings.clear();
  gitignoreCache.clear();
  fsCache.clear();

  // Clear pending validations
  for (const [_, timeout] of pendingValidations.entries()) {
    clearTimeout(timeout);
  }
  pendingValidations.clear();
});

// Configuration change
connection.onDidChangeConfiguration(async change => {
  // Clear cached settings
  documentSettings.clear();

  // Validate all open documents
  documents.all().forEach(validateTextDocument);

  // Scan the entire workspace
  await scanWorkspace();
});

// File change notification
connection.onDidChangeWatchedFiles(async change => {
  // Handle gitignore changes
  for (const fileEvent of change.changes) {
    const uri = fileEvent.uri;
    const filePath = URI.parse(uri).fsPath;

    // Check if it's a .gitignore file
    if (filePath.endsWith('.gitignore')) {
      // Clear gitignore cache for the workspace folder
      const workspaceFolder = getWorkspaceFolder(filePath);
      if (workspaceFolder) {
        gitignoreCache.delete(workspaceFolder);
      }

      // Validate all open documents
      documents.all().forEach(validateTextDocument);

      // Scan the entire workspace
      await scanWorkspace();
    }
  }
});

// Get document settings
async function getDocumentSettings(resource: string): Promise<FileLengthSettings> {
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'fileLengthLint'
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Document open
documents.onDidOpen(event => {
  validateTextDocument(event.document);
});

// Document change
const pendingValidations = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 300; // 300ms debounce

documents.onDidChangeContent(change => {
  // Debounce validation
  const uri = change.document.uri;

  // Cancel existing validation
  const existing = pendingValidations.get(uri);
  if (existing) {
    clearTimeout(existing);
  }

  // Schedule new validation
  const timeout = setTimeout(() => {
    pendingValidations.delete(uri);
    validateTextDocument(change.document);
  }, DEBOUNCE_DELAY);

  pendingValidations.set(uri, timeout);
});

// Validate text document
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // Get settings
  const settings = await getDocumentSettings(textDocument.uri);

  // If disabled, clear diagnostics
  if (!settings.enabled || !settings.realtimeScanningEnabled) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  // Get file path
  const uri = URI.parse(textDocument.uri);
  const filePath = uri.fsPath;

  // Check if file should be excluded
  if (await shouldExcludeFile(filePath, settings)) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  // Create diagnostics
  const diagnostics: Diagnostic[] = [];

  // Get document text
  const text = textDocument.getText();

  // Check which measurement type to use
  if (settings.measurementType === 'tokens') {
    // Count tokens
    const tokenCount = countTokens(text);

    // Get max tokens for this document
    const languageId = textDocument.languageId.toLowerCase();
    const maxTokens = settings.languageSpecificMaxTokens[languageId] || settings.maxTokens;

    // Check if token count exceeds maximum
    if (tokenCount > maxTokens) {
      let message = `File has ${tokenCount} tokens, which exceeds the maximum of ${maxTokens} tokens.`;

      // Add custom message if available
      if (settings.customQuickFixMessage && settings.customQuickFixMessage.trim() !== '') {
        message += ` ${settings.customQuickFixMessage}`;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Number.MAX_SAFE_INTEGER }
        },
        message,
        source: 'File Length Lint'
      });
    }
  } else {
    // Count lines
    const lineCount = text.split(/\r?\n/).length;

    // Get max lines for this document
    const languageId = textDocument.languageId.toLowerCase();
    const maxLines = settings.languageSpecificMaxLines[languageId] || settings.maxLines;

    // Check if line count exceeds maximum
    if (lineCount > maxLines) {
      let message = `File has ${lineCount} lines, which exceeds the maximum of ${maxLines} lines.`;

      // Add custom message if available
      if (settings.customQuickFixMessage && settings.customQuickFixMessage.trim() !== '') {
        message += ` ${settings.customQuickFixMessage}`;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Number.MAX_SAFE_INTEGER }
        },
        message,
        source: 'File Length Lint'
      });
    }
  }

  // Send diagnostics
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// File system utilities
function getFileStats(filePath: string): { exists: boolean, stats?: fs.Stats } {
  const now = Date.now();
  const cached = fsCache.get(filePath);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return { exists: cached.exists, stats: cached.stats };
  }

  try {
    const stats = fs.statSync(filePath);

    // Manage cache size
    if (fsCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entries when cache gets too large
      const entries = Array.from(fsCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Remove the oldest 10% of entries
      const entriesToRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
      for (let i = 0; i < entriesToRemove; i++) {
        if (entries[i]) {
          fsCache.delete(entries[i][0]);
        }
      }
    }

    const result = { exists: true, stats, timestamp: now };
    fsCache.set(filePath, result);
    return { exists: true, stats };
  } catch (error) {
    const result = { exists: false, timestamp: now };
    fsCache.set(filePath, result);
    return { exists: false };
  }
}

function readFileContent(filePath: string): string | undefined {
  const now = Date.now();
  const cached = fsCache.get(filePath);

  if (cached && cached.content !== undefined && now - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  try {
    // Get file stats first to check size
    const stats = fs.statSync(filePath);

    // Skip files larger than the default limit to prevent memory issues
    // We use a fixed limit here since we don't have access to settings
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (stats.size > MAX_FILE_SIZE) {
      connection.console.log(`Skipping large file for content reading ${filePath} (${Math.round(stats.size / 1024)}KB)`);
      return undefined;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Manage cache size
    if (fsCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entries when cache gets too large
      const entries = Array.from(fsCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Remove the oldest 10% of entries
      const entriesToRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
      for (let i = 0; i < entriesToRemove; i++) {
        if (entries[i]) {
          fsCache.delete(entries[i][0]);
        }
      }
    }

    const result = {
      exists: true,
      stats,
      content,
      timestamp: now
    };
    fsCache.set(filePath, result);
    return content;
  } catch (error) {
    const result = { exists: false, timestamp: now };
    fsCache.set(filePath, result);
    return undefined;
  }
}

// Gitignore utilities
function getGitignoreParser(workspaceFolderPath: string): ReturnType<typeof ignore> | undefined {
  // Check cache
  if (gitignoreCache.has(workspaceFolderPath)) {
    return gitignoreCache.get(workspaceFolderPath);
  }

  // Get gitignore path
  const gitignorePath = path.join(workspaceFolderPath, '.gitignore');

  // Check if gitignore exists
  const { exists } = getFileStats(gitignorePath);
  if (!exists) {
    return undefined;
  }

  // Read gitignore content
  const content = readFileContent(gitignorePath);
  if (!content) {
    return undefined;
  }

  // Create parser
  const parser = ignore()
    .add('node_modules/')
    .add('.git/')
    .add('*.log')
    .add(content);

  // Cache parser
  gitignoreCache.set(workspaceFolderPath, parser);

  return parser;
}

function getWorkspaceFolder(filePath: string): string | undefined {
  // Simple implementation - find the closest directory with a .git folder
  let dir = path.dirname(filePath);

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return undefined;
}

async function shouldExcludeFile(filePath: string, settings: FileLengthSettings): Promise<boolean> {
  // Check if file exists
  const { exists } = getFileStats(filePath);
  if (!exists) {
    return true;
  }

  // Check language exclusions
  const extension = path.extname(filePath).toLowerCase();
  const languageId = getLanguageIdFromExtension(extension);
  if (languageId && settings.disabledLanguages.includes(languageId)) {
    return true;
  }

  // Check exclude patterns
  for (const pattern of settings.exclude) {
    try {
      if (minimatch(filePath, pattern, { nocase: true, dot: true }) ||
          minimatch(filePath, pattern, { nocase: true })) {
        return true;
      }

      // Also try matching just the filename
      const fileName = path.basename(filePath);
      if (pattern.startsWith('*.') && minimatch(fileName, pattern, { nocase: true })) {
        return true;
      }
    } catch (error) {
      // Ignore errors in pattern matching
    }
  }

  // Check gitignore if enabled
  if (settings.respectGitignore) {
    const workspaceFolder = getWorkspaceFolder(filePath);
    if (workspaceFolder) {
      const gitignoreParser = getGitignoreParser(workspaceFolder);
      if (gitignoreParser) {
        const relativePath = path.relative(workspaceFolder, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        if (gitignoreParser.ignores(normalizedPath)) {
          return true;
        }
      }
    }
  }

  return false;
}

// Helper function to get language ID from file extension
function getLanguageIdFromExtension(extension: string): string | undefined {
  const extensionToLanguageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.json': 'json',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.php': 'php',
    '.py': 'python',
    '.rb': 'ruby',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.dart': 'dart',
    '.sh': 'shellscript',
    '.ps1': 'powershell'
  };

  return extensionToLanguageMap[extension];
}

// Token counting function
function countTokens(text: string): number {
  // Simple approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Listen for documents
documents.listen(connection);

// Scan workspace for files
async function scanWorkspace(): Promise<void> {
  // Get global settings
  const settings = await connection.workspace.getConfiguration({ section: 'fileLengthLint' });

  // If disabled, don't scan
  if (!settings.enabled) {
    return;
  }

  // Get workspace folders
  const workspaceFolders = await connection.workspace.getWorkspaceFolders();
  if (!workspaceFolders) {
    return;
  }

  // Process each workspace folder
  for (const folder of workspaceFolders) {
    const folderPath = URI.parse(folder.uri).fsPath;
    try {
      // Collect files to process in batches
      const filesToProcess = await collectFilesToProcess(folderPath, settings);

      // Process files in batches
      await processFilesInBatches(filesToProcess, settings);
    } catch (error) {
      connection.console.error(`Error scanning workspace folder ${folderPath}: ${error}`);
    }
  }
}

// Collect files to process
async function collectFilesToProcess(dirPath: string, settings: FileLengthSettings): Promise<string[]> {
  const filesToProcess: string[] = [];
  await collectFilesRecursively(dirPath, settings, filesToProcess);
  return filesToProcess;
}

// Recursively collect files
async function collectFilesRecursively(dirPath: string, settings: FileLengthSettings, filesToProcess: string[]): Promise<void> {
  try {
    // Check if directory should be excluded
    if (await shouldExcludeFile(dirPath, settings)) {
      return;
    }

    // Read directory contents
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Process each entry
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        await collectFilesRecursively(entryPath, settings, filesToProcess);
      } else if (entry.isFile()) {
        // Check if file should be excluded
        if (await shouldExcludeFile(entryPath, settings)) {
          continue;
        }

        // Check if file is already open in editor
        const isOpen = documents.all().some(doc => {
          const docPath = URI.parse(doc.uri).fsPath;
          return docPath === entryPath;
        });

        // Skip open files as they're already being validated
        if (isOpen) {
          continue;
        }

        // Check file extension for common binary formats to skip early
        const ext = path.extname(entryPath).toLowerCase();
        const commonBinaryExtensions = [
          '.exe', '.dll', '.so', '.bin', '.obj', '.o',
          '.zip', '.gz', '.tar', '.rar', '.7z',
          '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
          '.mp3', '.mp4', '.wav', '.avi', '.mov',
          '.pdf', '.doc', '.docx', '.xls', '.xlsx'
        ];

        if (commonBinaryExtensions.includes(ext)) {
          continue;
        }

        // Add file to the list
        filesToProcess.push(entryPath);
      }
    }
  } catch (error) {
    // Log error but continue processing
    connection.console.error(`Error collecting files in directory ${dirPath}: ${error}`);
  }
}

// Monitor memory usage
function getMemoryUsage(): { usedMB: number, percentUsage: number } {
  const memoryUsage = process.memoryUsage();
  const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const percentUsage = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
  return { usedMB, percentUsage };
}

// Process files in batches
async function processFilesInBatches(files: string[], settings: FileLengthSettings): Promise<void> {
  // Constants for batch processing
  let BATCH_SIZE = 50; // Process 50 files at a time (reduced from 100)
  let BATCH_DELAY = 100; // 100ms delay between batches to allow GC (increased from 50ms)
  const MEMORY_CHECK_INTERVAL = 5; // Check memory every 5 batches
  const HIGH_MEMORY_THRESHOLD = 80; // 80% memory usage is considered high
  const CRITICAL_MEMORY_THRESHOLD = 90; // 90% memory usage is critical

  // Log initial memory usage
  const initialMemory = getMemoryUsage();
  connection.console.log(`Starting batch processing with ${initialMemory.usedMB}MB memory usage (${initialMemory.percentUsage}%)`);

  // Process files in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    // Check memory usage periodically
    if (i > 0 && i % (BATCH_SIZE * MEMORY_CHECK_INTERVAL) === 0) {
      const memory = getMemoryUsage();
      connection.console.log(`Memory usage: ${memory.usedMB}MB (${memory.percentUsage}%)`);

      // If memory usage is high, force garbage collection with a longer pause
      if (memory.percentUsage > HIGH_MEMORY_THRESHOLD) {
        connection.console.log(`High memory usage detected (${memory.percentUsage}%). Pausing for garbage collection...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second pause

        // If memory usage is critical, reduce batch size and increase delay
        if (memory.percentUsage > CRITICAL_MEMORY_THRESHOLD) {
          const newBatchSize = Math.max(10, Math.floor(BATCH_SIZE / 2));
          connection.console.log(`Critical memory usage! Reducing batch size from ${BATCH_SIZE} to ${newBatchSize}`);
          BATCH_SIZE = newBatchSize;
          BATCH_DELAY = 200; // Increase delay to 200ms
        }
      }
    }

    // Get current batch
    const batch = files.slice(i, i + BATCH_SIZE);

    // Process batch
    await Promise.all(batch.map(async (filePath) => {
      try {
        await validateFile(filePath, settings);
      } catch (error) {
        connection.console.error(`Error validating file ${filePath}: ${error}`);
      }
    }));

    // Allow some time for garbage collection between batches
    if (i + BATCH_SIZE < files.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }

    // Report progress periodically
    if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= files.length) {
      connection.console.log(`Processed ${Math.min(i + BATCH_SIZE, files.length)} of ${files.length} files`);
    }
  }

  // Log final memory usage
  const finalMemory = getMemoryUsage();
  connection.console.log(`Finished batch processing with ${finalMemory.usedMB}MB memory usage (${finalMemory.percentUsage}%)`);
}

// Check if a file is likely binary (non-text)
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    // Common binary file extensions
    const binaryExtensions = [
      // Executables and libraries
      '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o',
      // Compressed files
      '.zip', '.gz', '.tar', '.rar', '.7z', '.jar', '.war',
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.tiff', '.webp',
      // Audio/Video
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.flv', '.wmv', '.mkv',
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      // Other binary formats
      '.class', '.pyc', '.pyd', '.pyo', '.db', '.sqlite', '.mdb',
      '.iso', '.img', '.dmg', '.bin', '.dat'
    ];

    // Check extension first
    const ext = path.extname(filePath).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return true;
    }

    // For files without a clear binary extension, check content
    // Read a small chunk of the file to detect binary content
    const SAMPLE_SIZE = 4096; // 4KB sample
    const buffer = Buffer.alloc(SAMPLE_SIZE);

    try {
      const fd = fs.openSync(filePath, 'r');
      try {
        const bytesRead = fs.readSync(fd, buffer, 0, SAMPLE_SIZE, 0);
        if (bytesRead === 0) return false;

        // Check for null bytes and other binary characters
        // Text files typically don't contain null bytes or many control characters
        let suspiciousBytes = 0;
        for (let i = 0; i < bytesRead; i++) {
          const byte = buffer[i];
          // Check for null bytes or non-printable characters (except common whitespace)
          if (byte === 0 || (byte < 9 || (byte > 13 && byte < 32))) {
            suspiciousBytes++;
          }
        }

        // If more than 10% of the bytes are suspicious, consider it binary
        return suspiciousBytes > bytesRead * 0.1;
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      // If we can't read the file, assume it's not binary
      return false;
    }
  } catch (error) {
    connection.console.error(`Error checking if file is binary: ${filePath}: ${error}`);
    return false;
  }
}

// Validate a file that's not open in the editor
async function validateFile(filePath: string, settings: FileLengthSettings): Promise<void> {
  try {
    // Get file stats first to check size
    const { exists, stats } = getFileStats(filePath);
    if (!exists || !stats) {
      return;
    }

    // Skip files larger than the configured limit to prevent memory issues
    const maxFileSizeMB = settings.maxFileSizeInMB || 5; // Default to 5MB if not set
    const MAX_FILE_SIZE = maxFileSizeMB * 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
      connection.console.log(`Skipping large file ${filePath} (${Math.round(stats.size / 1024)}KB, limit: ${maxFileSizeMB}MB)`);
      return;
    }

    // Skip binary files
    if (await isBinaryFile(filePath)) {
      connection.console.log(`Skipping binary file ${filePath}`);
      return;
    }

    // Create diagnostics
    const diagnostics: Diagnostic[] = [];

    // Check which measurement type to use
    if (settings.measurementType === 'tokens') {
      // For token counting, we need to read the file content
      const content = readFileContent(filePath);
      if (!content) {
        return;
      }

      // Count tokens
      const tokenCount = countTokens(content);

      // Get max tokens for this file
      const extension = path.extname(filePath).toLowerCase();
      const languageId = getLanguageIdFromExtension(extension);
      const maxTokens = languageId && settings.languageSpecificMaxTokens[languageId] || settings.maxTokens;

      // Check if token count exceeds maximum
      if (tokenCount > maxTokens) {
        let message = `File has ${tokenCount} tokens, which exceeds the maximum of ${maxTokens} tokens.`;

        // Add custom message if available
        if (settings.customQuickFixMessage && settings.customQuickFixMessage.trim() !== '') {
          message += ` ${settings.customQuickFixMessage}`;
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: Number.MAX_SAFE_INTEGER }
          },
          message,
          source: 'File Length Lint'
        });
      }
    } else {
      // For line counting, we can use a more efficient approach
      const lineCount = countLinesInFile(filePath);
      if (lineCount === -1) {
        return; // Error reading file
      }

      // Get max lines for this file
      const extension = path.extname(filePath).toLowerCase();
      const languageId = getLanguageIdFromExtension(extension);
      const maxLines = languageId && settings.languageSpecificMaxLines[languageId] || settings.maxLines;

      // Check if line count exceeds maximum
      if (lineCount > maxLines) {
        let message = `File has ${lineCount} lines, which exceeds the maximum of ${maxLines} lines.`;

        // Add custom message if available
        if (settings.customQuickFixMessage && settings.customQuickFixMessage.trim() !== '') {
          message += ` ${settings.customQuickFixMessage}`;
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: Number.MAX_SAFE_INTEGER }
          },
          message,
          source: 'File Length Lint'
        });
      }
    }

    // Always send diagnostics (even if empty to clear previous diagnostics)
    const uri = URI.file(filePath).toString();
    connection.sendDiagnostics({ uri, diagnostics });
  } catch (error) {
    connection.console.error(`Error validating file ${filePath}: ${error}`);
  }
}

// Count lines in a file efficiently without loading the entire file into memory
function countLinesInFile(filePath: string): number {
  try {
    // Use a more efficient line counting approach
    let lineCount = 0;
    const BUFFER_SIZE = 16 * 1024; // 16KB buffer
    const buffer = Buffer.alloc(BUFFER_SIZE);
    const fd = fs.openSync(filePath, 'r');

    try {
      let bytesRead = 0;
      let leftover = '';

      do {
        bytesRead = fs.readSync(fd, buffer, 0, BUFFER_SIZE, null);
        if (bytesRead === 0) break;

        const chunk = buffer.toString('utf8', 0, bytesRead);
        const combined = leftover + chunk;
        const lines = combined.split(/\r?\n/);

        // If the chunk doesn't end with a newline, save the last line for the next iteration
        leftover = lines.pop() || '';

        // Add the number of complete lines found
        lineCount += lines.length;
      } while (bytesRead > 0);

      // Add the last line if it's not empty
      if (leftover.length > 0) {
        lineCount++;
      }

      return lineCount;
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    connection.console.error(`Error counting lines in file ${filePath}: ${error}`);
    return -1;
  }
}

// Listen for connection
connection.listen();
