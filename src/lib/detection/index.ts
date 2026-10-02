/**
 * Detection Engine — Public API
 *
 * Usage:
 *   import { runDetection, generateSummary } from '../lib/detection';
 *   const results = runDetection(scannedFiles);
 *   const summary = generateSummary(results);
 */

export { runDetection, generateSummary } from './engine';
export { detectFromExtension } from './extensionDetector';
export { detectFromFilename, detectFromSidecarText } from './filenameDetector';
export { detectFromFolderPath } from './folderDetector';
export { inferFromNeighbors } from './neighborInference';
export { groupIntoSubject } from './subjectGrouping';
export { readJsonSidecars, getSidecarBaseName, sidecarKey } from './sidecarReader';
export { readNiftiHeaders } from './niftiHeaderReader';
export type { SidecarInfo } from './sidecarReader';
export { readEdfHeaders } from './edfHeaderReader';
export type { EdfHeaderInfo } from './edfHeaderReader';
