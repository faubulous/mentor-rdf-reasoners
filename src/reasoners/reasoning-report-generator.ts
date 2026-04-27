import * as rdfjs from '@rdfjs/types';
import type { InferredTripleRecord, ProvenanceRecord } from './provenance-record.js';
import type { ReasoningReport, ReasoningReportResult, ReportSeverity } from './reasoning-report.js';

/**
 * Converts `ProvenanceRecord` values into reasoning reports.
 *
 * Severity is delegated to the `severityOf` function supplied at construction,
 * allowing reasoner subclasses to inject their own severity policy without
 * coupling to this class.
 */
export class ReasoningReportGenerator {
    constructor(
        private readonly severityOf: (record: InferredTripleRecord) => ReportSeverity = () => 'Info',
    ) { }

    /**
     * Convert a single provenance record into a `ReasoningReportResult`.
     */
    generate(detail: ProvenanceRecord, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>, targetGraph: rdfjs.Quad_Graph): ReasoningReportResult {
        return {
            sourceGraphs: [...sourceGraphs],
            targetGraph,
            severity: detail.origin === 'inference' ? this.severityOf(detail) : 'Info',
            detail,
        };
    }

    /**
     * Convert an array of provenance records into a `ReasoningReport`.
     * `consistent` is `true` when no result has severity `Violation`.
     */
    generateAll(records: ProvenanceRecord[], sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>, targetGraph: rdfjs.Quad_Graph): ReasoningReport {
        const results = records.map(r => this.generate(r, sourceGraphs, targetGraph));

        return { consistent: !results.some(r => r.severity === 'Violation'), results };
    }
}
