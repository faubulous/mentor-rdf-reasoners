import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import type { InferenceOptions } from './inference-options.js';
import type { InferenceResult } from './inference-result.js';
import type { InferredQuadRecord, QuadProvenanceRecord } from './quad-provenance-record.js';
import { QuadIndex } from './quad-index.js';
import { QuadProvenanceMap } from './quad-provenance-map.js';
import { Reasoner } from './reasoner.js';
import { ReasoningReportGenerator } from './reasoning-report-generator.js';
import type { ReasoningReport, ReasoningReportResult, ReportOptions, ReportSeverity } from './reasoning-report.js';

const createQuad = DataFactory.quad.bind(DataFactory);

const defaultGraphTerm = DataFactory.defaultGraph();

/**
 * Abstract base for semi-naive fixpoint reasoners.
 *
 * Subclasses implement inferFromQuad() (single-quad rules) and
 * inferFromIndex() (join rules that need multi-quad lookups).
 *
 * The engine:
 *  1. Seeds a TripleIndex with all source triples.
 *  2. Runs single-quad rules over every quad in the current delta.
 *  3. Runs join rules over the full index once per round.
 *  4. Adds newly derived triples to the index and the next delta.
 *  5. Repeats until the delta is empty (fixpoint).
 *  6. Yields every inferred triple that was not in the source graph.
 *
 * This is semi-naive because each round only processes the *new* triples
 * added in the previous round, not the entire working set.
 */
export abstract class ReasonerBase implements Reasoner {
    private readonly _reportGenerator = new ReasoningReportGenerator((record) => this.getRecordSeverity(record));

    *infer(store: rdfjs.DatasetCore, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>, options?: InferenceOptions,): Iterable<rdfjs.Quad> {
        let shouldStop = false;
        const stopWhen = options?.stopWhen;

        const inferredQuads: rdfjs.Quad[] = [];
        const index = new QuadIndex();

        // Seed the index with source triples.
        // Source triples are always in the index before any inference, so derived
        // triples that duplicate source triples will be rejected by index.add() and
        // will never reach inferredQuads — making a separate sourceKeys check redundant.
        for (const q of this._quadsFromSources(store, sourceGraphs)) {
            index.add(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        // Pre-load profile axioms (not yielded as inferred).
        for (const q of this.axioms()) {
            index.add(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        // Build the initial delta from all source + axiomatic quads.
        let delta: rdfjs.Quad[] = [];

        for (const q of this._quadsFromSources(store, sourceGraphs)) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        for (const q of this.axioms()) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        // Semi-naive fixpoint loop.
        while (delta.length > 0 && !shouldStop) {
            const nextDelta: rdfjs.Quad[] = [];

            // Single-quad rules: run only over the new delta.
            for (const q of delta) {
                for (const result of this.inferFromQuad(q, index)) {
                    const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                    if (index.add(n)) {
                        inferredQuads.push(n);
                        nextDelta.push(n);

                        if (stopWhen?.(n)) {
                            shouldStop = true;
                            break;
                        }
                    }
                }

                if (shouldStop) {
                    break;
                }
            }

            if (shouldStop) {
                break;
            }

            // Join rules: run over the full index; only new triples advance.
            for (const result of this.inferFromIndex(index)) {
                const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                if (index.add(n)) {
                    inferredQuads.push(n);
                    nextDelta.push(n);

                    if (stopWhen?.(n)) {
                        shouldStop = true;
                        break;
                    }
                }
            }

            delta = nextDelta;
        }

        // Yield all inferred triples.
        for (const q of inferredQuads) {
            yield createQuad(q.subject, q.predicate, q.object);
        }
    }

    /**
     * Compute provenance for a specific inferred quad.
     * @param store The source dataset to reason over.
     * @param sourceGraphs The named graphs (or default graph) to read triples from.
     * @param quad The inferred quad to compute provenance for (only subject, predicate, object are considered; graph is ignored).
     * @return A provenance record containing the derivation chain for the target quad, or undefined if the target quad is not derivable.
     */
    getProvenanceForQuad(store: rdfjs.DatasetCore, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>, quad: rdfjs.Quad): QuadProvenanceRecord | undefined {
        const index = new QuadIndex();
        const provenanceMap = new QuadProvenanceMap();

        const normalizedTarget = createQuad(quad.subject, quad.predicate, quad.object, defaultGraphTerm);
        const targetKey = provenanceMap.keyOf(normalizedTarget);

        const sourceMatch = this._indexSeedQuads(index, provenanceMap, 'source', this._quadsFromSources(store, sourceGraphs), targetKey);

        if (sourceMatch) {
            return sourceMatch;
        }

        const axiomMatch = this._indexSeedQuads(index, provenanceMap, 'axiom', this.axioms(), targetKey);

        if (axiomMatch) {
            return axiomMatch;
        }

        let delta: rdfjs.Quad[] = [];

        for (const q of this._quadsFromSources(store, sourceGraphs)) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        for (const q of this.axioms()) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        while (delta.length > 0) {
            const nextDelta: rdfjs.Quad[] = [];

            for (const q of delta) {
                for (const result of this.inferFromQuad(q, index)) {
                    const x = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                    if (index.add(x)) {
                        const ruleDescription = this.getRuleDescription(result.rule);
                        const record: QuadProvenanceRecord = {
                            origin: 'inference',
                            quad: x,
                            rule: result.rule,
                            ...(ruleDescription ? { ruleDescription } : {}),
                            premises: provenanceMap.resolvePremises(result.antecedents),
                        };

                        const key = provenanceMap.set(record);

                        if (key === targetKey) {
                            return record;
                        }

                        nextDelta.push(x);
                    }
                }
            }

            for (const result of this.inferFromIndex(index)) {
                const q = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                if (index.add(q)) {
                    const ruleDescription = this.getRuleDescription(result.rule);
                    const record: QuadProvenanceRecord = {
                        origin: 'inference',
                        quad: q,
                        rule: result.rule,
                        ...(ruleDescription ? { ruleDescription } : {}),
                        premises: provenanceMap.resolvePremises(result.antecedents),
                    };

                    const key = provenanceMap.set(record);

                    if (key === targetKey) {
                        return record;
                    }

                    nextDelta.push(q);
                }
            }

            delta = nextDelta;
        }

        return undefined;
    }

    /**
     * Compute provenance for all inferred quads.
     *
     * Prefer `getProvenanceForQuad()` for editor workflows that need explanation for
     * a specific detected issue.
     */
    getProvenanceForInferredQuads(store: rdfjs.DatasetCore, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>): QuadProvenanceRecord[] {
        const index = new QuadIndex();
        const provenanceMap = new QuadProvenanceMap();

        this._indexSeedQuads(index, provenanceMap, 'source', this._quadsFromSources(store, sourceGraphs));
        this._indexSeedQuads(index, provenanceMap, 'axiom', this.axioms());

        // Build the initial delta from all source + axiomatic quads.
        let delta: rdfjs.Quad[] = [];

        for (const q of this._quadsFromSources(store, sourceGraphs)) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        for (const q of this.axioms()) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        const inferredRecords: QuadProvenanceRecord[] = [];

        // Semi-naive fixpoint loop.
        while (delta.length > 0) {
            const nextDelta: rdfjs.Quad[] = [];

            for (const q of delta) {
                for (const result of this.inferFromQuad(q, index)) {
                    const x = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                    if (index.add(x)) {
                        const ruleDescription = this.getRuleDescription(result.rule);
                        const record: QuadProvenanceRecord = {
                            origin: 'inference',
                            quad: x,
                            rule: result.rule,
                            ...(ruleDescription ? { ruleDescription } : {}),
                            premises: provenanceMap.resolvePremises(result.antecedents),
                        };

                        provenanceMap.set(record);
                        inferredRecords.push(record);

                        nextDelta.push(x);
                    }
                }
            }

            for (const result of this.inferFromIndex(index)) {
                const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                if (index.add(n)) {
                    const ruleDescription = this.getRuleDescription(result.rule);
                    const record: QuadProvenanceRecord = {
                        origin: 'inference',
                        quad: n,
                        rule: result.rule,
                        ...(ruleDescription ? { ruleDescription } : {}),
                        premises: provenanceMap.resolvePremises(result.antecedents),
                    };
                    provenanceMap.set(record);
                    inferredRecords.push(record);
                    nextDelta.push(n);
                }
            }

            delta = nextDelta;
        }

        return inferredRecords;
    }

    /**
     * Build one SHACL-inspired report result for a specific target quad.
     *
     * The result contains source/target graph context, severity, and a detailed
     * provenance record for explainability.
     */
    getReportForQuad(
        store: rdfjs.DatasetCore,
        sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>,
        quad: rdfjs.Quad,
        options?: ReportOptions,
    ): ReasoningReportResult | undefined {
        const detail = this.getProvenanceForQuad(store, sourceGraphs, quad);

        if (!detail) {
            return undefined;
        }

        const targetGraph = options?.targetGraph ?? sourceGraphs[0] ?? defaultGraphTerm;

        return this._reportGenerator.generate(detail, sourceGraphs, targetGraph);
    }

    /**
     * Build a SHACL-inspired report for all inferred outcomes.
     *
     * `consistent` is true when no result has severity `Violation`.
     */
    getReportForAllQuads(
        store: rdfjs.DatasetCore,
        sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>,
        options?: ReportOptions,
    ): ReasoningReport {
        const targetGraph = options?.targetGraph ?? sourceGraphs[0] ?? defaultGraphTerm;

        return this._reportGenerator.generateAll(
            this.getProvenanceForInferredQuads(store, sourceGraphs),
            sourceGraphs,
            targetGraph,
        );
    }

    /**
     * Optional short human-readable text for a rule id (e.g. from profile specs).
     */
    protected getRuleDescription(_rule: string): string | undefined {
        return undefined;
    }

    /**
     * Severity policy for inferred provenance nodes. Override in subclasses.
     */
    protected getRecordSeverity(_record: InferredQuadRecord): ReportSeverity {
        return 'Info';
    }

    /**
     * Iterate over all quads in the specified source graphs.
     * @param store The RDF dataset to query.
     * @param sourceGraphs The graphs to iterate over.
     */
    private *_quadsFromSources(store: rdfjs.DatasetCore, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>): Iterable<rdfjs.Quad> {
        for (const graph of sourceGraphs) {
            for (const q of store.match(null, null, null, graph)) {
                yield q;
            }
        }
    }

    /**
     * Populate the index and provenance map with quads from the specified iterable, marking 
     * them with the given origin.
     * @param quads The quads to process.
     * @param origin The origin to assign to the quads.
     * @param index The index to populate.
     * @param provenanceMap The provenance map to populate.
     * @param targetKey An optional key to stop processing when matched.
     * @returns A provenance record if a quad matching the targetKey was added, or undefined otherwise.
     */
    private _indexSeedQuads(
        index: QuadIndex,
        provenanceMap: QuadProvenanceMap,
        origin: 'source' | 'axiom',
        quads: Iterable<rdfjs.Quad>,
        targetKey?: string
    ): QuadProvenanceRecord | undefined {
        for (const quad of quads) {
            const normalizedQuad = createQuad(quad.subject, quad.predicate, quad.object, defaultGraphTerm);

            if (!index.add(normalizedQuad)) {
                continue;
            }

            const { key, record } = provenanceMap.addSeedRecord(origin, normalizedQuad);

            if (key === targetKey) {
                return record;
            }
        }

        return undefined;
    }

    /**
     * Axiomatic triples pre-loaded into the working index before inference begins.
     * Override to provide profile-specific axioms (e.g. owl:Thing a owl:Class).
     */
    protected *axioms(): Iterable<rdfjs.Quad> { }

    /**
     * Single-quad rules. Called once per quad in the current delta.
     * Yield any triples derivable from this quad (optionally using the index for lookups).
     */
    protected abstract inferFromQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult>;

    /**
     * Join rules requiring patterns across multiple quads.
     * Called once per fixpoint round over the full index.
     */
    protected abstract inferFromIndex(index: QuadIndex): Iterable<InferenceResult>;
}
