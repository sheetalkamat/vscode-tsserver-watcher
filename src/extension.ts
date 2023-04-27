// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as  net from 'net';
import * as readline from 'readline';
import type { OnWatchChangeEventData, PluginRequest } from 'vscode-tsserver-watcher-plugin/types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-tsserver-watcher" is now active!');

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// let disposable = vscode.commands.registerCommand('vscode-tsserver-watcher.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from vscode-tsserver-watcher!');
	// });

	// context.subscriptions.push(disposable);

	// Get the TS extension
	const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
	if (!tsExtension) {
		return;
	}
	await tsExtension.activate();

	const api = tsExtension.exports?.getAPI?.(0);
	if (!api) {
		return;
	}
	const server = net.createServer(watchWithSocket);
	server.on('error', err => console.log(err));
	server.on('close', () => {
		// console.log('server disconnected');
	});
	server.listen(() => {
		const port = server.address();
		// console.log(`server bound:: ${JSON.stringify(server.address())}`);
		api.configurePlugin("vscode-tsserver-watcher-plugin", port);
	});
}

// This method is called when your extension is deactivated
export function deactivate() {
}

function watchWithSocket(socket: net.Socket) {
	const dirWatchers = new Map<number, vscode.FileSystemWatcher>();
	const dirRecursiveWatchers = new Map<number, vscode.FileSystemWatcher>();
	const fileWatchers = new Map<number, vscode.FileSystemWatcher>();

	// console.log(`client connected:: ${JSON.stringify(socket.address())}`);
	const rl = readline.createInterface({ input: socket });
	rl.on('line', data => processEvent(JSON.parse(data)));
	socket.on('close', () => {
		// console.log('client disconnected');
		dirWatchers.forEach(value => value.dispose());
		dirRecursiveWatchers.forEach(value => value.dispose());
		fileWatchers.forEach(value => value.dispose());
	});

	function processEvent(data: PluginRequest) {
		switch (data.eventName) {
			case 'createDirectoryWatcher': {
				return createFileSystemWatcher(
					data.recursive ? dirRecursiveWatchers : dirWatchers,
					data.id,
					new vscode.RelativePattern(vscode.Uri.file(data.path), data.recursive ? '**' : '*'),
				);
			}
			case 'createFileWatcher':
				return createFileSystemWatcher(
					fileWatchers,
					data.id,
					data.path
				);
			case 'closeWatcher':
				return closeFileSystemWatcher(
					data.type === 'file' ? fileWatchers : data.type === 'dir' ? dirWatchers : dirRecursiveWatchers,
					data.id
				);
				break;
		}
	}

	function createFileSystemWatcher(
		watches: Map<number, vscode.FileSystemWatcher>,
		id: number,
		pattern: vscode.GlobPattern,
	) {
		// console.log(`vscode-tsserver-watcher: createWatcher :: ${id}`);
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);
		watcher.onDidChange(changeFile =>
			onWatchChange({ id, path: changeFile.fsPath, eventType: 'update' })
		);
		watcher.onDidCreate(createFile =>
			onWatchChange({ id, path: createFile.fsPath, eventType: 'create' })
		);
		watcher.onDidDelete(deletedFile =>
			onWatchChange({ id, path: deletedFile.fsPath, eventType: 'delete' })
		);
		watches.set(id, watcher);
	}

	function closeFileSystemWatcher(
		watches: Map<number, vscode.FileSystemWatcher>,
		id: number,
	) {
		// console.log(`vscode-tsserver-watcher: closeWatcher :: ${id}`);
		const existing = watches.get(id);
		if (existing) {
			existing.dispose();
			watches.delete(id);
		}
	}

	function onWatchChange(event: OnWatchChangeEventData) {
		// console.log(`vscode-tsserver-watcher: Invoke :: ${event.id} ${event.path} ${event.eventType}`);
		socket.write(JSON.stringify(event) + "\r\n");
	}
}