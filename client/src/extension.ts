import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // Server module
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
  
  // Server options
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };
  
  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file' }], // All files
    synchronize: {
      // Notify server about these file changes
      fileEvents: [
        workspace.createFileSystemWatcher('**/.gitignore')
      ],
      // Notify server about these configuration changes
      configurationSection: 'fileLengthLint'
    }
  };
  
  // Create and start client
  client = new LanguageClient(
    'fileLengthLint',
    'File Length Lint',
    serverOptions,
    clientOptions
  );
  
  // Start the client
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
