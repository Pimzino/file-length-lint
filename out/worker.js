"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const fs = __importStar(require("fs"));
// Process the files assigned to this worker
if (worker_threads_1.parentPort) {
    const { filePaths, maxLines } = worker_threads_1.workerData;
    const results = [];
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
        }
        catch (error) {
            // Ignore errors reading files
            console.error(`Worker error processing file ${filePath}: ${error}`);
        }
    }
    // Send the results back to the main thread
    worker_threads_1.parentPort.postMessage(results);
}
//# sourceMappingURL=worker.js.map