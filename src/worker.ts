import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';

interface WorkerData {
    filePaths: string[];
    maxLines: number;
}

interface WorkerResult {
    filePath: string;
    lineCount: number;
    exceeds: boolean;
}

// Process the files assigned to this worker
if (parentPort) {
    const { filePaths, maxLines } = workerData as WorkerData;
    const results: WorkerResult[] = [];

    for (const filePath of filePaths) {
        try {
            // Read the file content
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Count the number of lines
            const lineCount = content.split('\n').length;
            
            // Check if the line count exceeds the maximum
            if (lineCount > maxLines) {
                results.push({
                    filePath,
                    lineCount,
                    exceeds: true
                });
            }
        } catch (error) {
            // Ignore errors reading files
            console.error(`Worker error processing file ${filePath}: ${error}`);
        }
    }

    // Send the results back to the main thread
    parentPort.postMessage(results);
}
