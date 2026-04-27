import * as rdfjs from '@rdfjs/types';
import type { QuadProvenanceRecord } from './quad-provenance-record.js';

/** SHACL-like severity levels for reasoner report entries. */
export type ReportSeverity = 'Violation' | 'Warning' | 'Info';

/** Optional controls for report workflows. */
export interface ReportOptions {
    /** Graph where inferred triples are intended to be written by the caller. */
    targetGraph?: rdfjs.Quad_Graph;
}

/**
 * A SHACL-inspired report result entry for one reasoning outcome.
 *
 * Compact top-level fields keep graph context and severity.
 * Triple/rule/message details are contained in `detail`.
 */
export interface ReasoningReportResult {
    sourceGraphs: rdfjs.Quad_Graph[];
    targetGraph: rdfjs.Quad_Graph;
    severity: ReportSeverity;
    detail: QuadProvenanceRecord;
}

/** A SHACL-inspired report wrapper for reasoning outcomes. */
export interface ReasoningReport {
    consistent: boolean;
    results: ReasoningReportResult[];
}
