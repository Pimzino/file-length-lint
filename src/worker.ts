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
            // Check if file exists and is readable before attempting to read it
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
                } catch (readError) {
                    // Log specific read errors but continue processing other files
                    console.error(`Worker error reading file ${filePath}: ${readError}`);
                }
            } else {
                // File doesn't exist or isn't a regular file
                console.log(`Worker skipping non-existent or non-file path: ${filePath}`);
            }
        } catch (error) {
            // Catch any other errors that might occur
            console.error(`Worker error processing file ${filePath}: ${error}`);
            // Continue with other files instead of crashing the worker
        }
    }

    // Send the results back to the main thread
    parentPort.postMessage(results);
}
