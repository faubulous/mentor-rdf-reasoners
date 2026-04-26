import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { TripleIndex } from './triple-index.js';

export { TripleIndex };

const createQuad = DataFactory.quad.bind(DataFactory);
const defaultGraphTerm = DataFactory.defaultGraph();

/**
 * A reasoner that derives new triples from an RDF graph via forward-chaining inference.
 */
export interface Reasoner {
    /**
     * Apply inference over the source graph and yield all inferred triples.
     * The caller is responsible for adding the yielded quads to a graph.
     *
     * @param store The source dataset to reason over.
     * @param sourceGraph The named graph (or default graph) to read triples from.
     */
    expand(
        store: rdfjs.DatasetCore,
        sourceGraph: rdfjs.Quad_Graph,
        options?: ExpandOptions,
    ): Iterable<rdfjs.Quad>;
}

/**
 * A single inference step: the derived quad, the OWL RL rule that produced it,
 * and the direct antecedent quads that triggered it.
 */
export interface InferenceResult {
    quad: rdfjs.Quad;
    rule: string;
    antecedents: rdfjs.Quad[];
}

/** A source triple that came directly from the input dataset. */
export interface SourceRecord {
    origin: 'source';
    triple: rdfjs.Quad;
}

/** A profile axiom seeded into the index before inference began. */
export interface AxiomRecord {
    origin: 'axiom';
    triple: rdfjs.Quad;
}

/** A triple produced by applying a named OWL RL rule to its premises. */
export interface InferredRecord {
    origin: 'inferred';
    triple: rdfjs.Quad;
    rule: string;
    ruleDescription?: string;
    premises: ProvenanceRecord[];
}

/**
 * A node in a provenance explanation tree.
 *
 * - `SourceRecord`  — leaf: the triple came directly from the input dataset.
 * - `AxiomRecord`   — leaf: the triple is a profile axiom.
 * - `InferredRecord` — branch: the triple was derived by a named OWL RL rule from its premises.
 */
export type ProvenanceRecord = SourceRecord | AxiomRecord | InferredRecord;

/** Predicate used to match inferred quads of interest (e.g. inconsistency markers). */
export type InferredQuadMatcher = (quad: rdfjs.Quad) => boolean;

/** Optional controls for expansion workflows. */
export interface ExpandOptions {
    stopWhen?: InferredQuadMatcher;
}

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
    sourceGraph: rdfjs.Quad_Graph;
    targetGraph: rdfjs.Quad_Graph;
    severity: ReportSeverity;
    detail: ProvenanceRecord;
}

/** A SHACL-inspired report wrapper for reasoning outcomes. */
export interface ReasoningReport {
    consistent: boolean;
    results: ReasoningReportResult[];
}

/**
 * Factory for creating an `InferenceResult`. Used by rule functions to annotate
 * each derived quad with its rule name and direct antecedent quads.
 */
export function infer(quad: rdfjs.Quad, rule: string, ...antecedents: rdfjs.Quad[]): InferenceResult {
    return { quad, rule, antecedents };
}

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

    *expand(store: rdfjs.DatasetCore, sourceGraph: rdfjs.Quad_Graph, options?: ExpandOptions,): Iterable<rdfjs.Quad> {
        let shouldStop = false;
        const stopWhen = options?.stopWhen;

        const inferredQuads: rdfjs.Quad[] = [];
        const index = new TripleIndex();

        // Seed the index with source triples.
        // Source triples are always in the index before any inference, so derived
        // triples that duplicate source triples will be rejected by index.add() and
        // will never reach inferredQuads — making a separate sourceKeys check redundant.
        for (const q of store.match(null, null, null, sourceGraph)) {
            index.add(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        // Pre-load profile axioms (not yielded as inferred).
        for (const q of this.axioms()) {
            index.add(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        // Build the initial delta from all source + axiomatic quads.
        let delta: rdfjs.Quad[] = [];

        for (const q of store.match(null, null, null, sourceGraph)) {
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
     * @param sourceGraph The named graph (or default graph) to read triples from.
     * @param target The inferred quad to compute provenance for (only subject, predicate, object are considered; graph is ignored).
     * @return A provenance record containing the derivation chain for the target quad, or undefined if the target quad is not derivable.
     */
    provenanceFor(store: rdfjs.DatasetCore, sourceGraph: rdfjs.Quad_Graph, target: rdfjs.Quad): ProvenanceRecord | undefined {
        const index = new TripleIndex();

        function termKey(t: rdfjs.Term): string {
            if (t.termType === 'Literal') {
                const lit = t as rdfjs.Literal;

                return `L\x00${lit.value}\x00${lit.language || (lit.datatype?.value ?? '')}`;
            } else {
                return `${t.termType[0]}\x00${t.value}`;
            }
        }

        function quadKey(q: rdfjs.Quad): string {
            return `${termKey(q.subject)}\x01${termKey(q.predicate)}\x01${termKey(q.object)}`;
        }

        const normalizedTarget = createQuad(target.subject, target.predicate, target.object, defaultGraphTerm);
        const targetKey = quadKey(normalizedTarget);
        const provenanceMap = new Map<string, ProvenanceRecord>();

        const resolvePremises = (antecedents: rdfjs.Quad[]): ProvenanceRecord[] => {
            return antecedents.map(ant => {
                const key = quadKey(createQuad(ant.subject, ant.predicate, ant.object, defaultGraphTerm));

                return provenanceMap.get(key) ?? { origin: 'source', triple: ant };
            });
        };

        for (const q of store.match(null, null, null, sourceGraph)) {
            const n = createQuad(q.subject, q.predicate, q.object, defaultGraphTerm);

            if (index.add(n)) {
                const record: ProvenanceRecord = { origin: 'source', triple: n };

                provenanceMap.set(quadKey(n), record);

                if (quadKey(n) === targetKey) return record;
            }
        }

        for (const q of this.axioms()) {
            const n = createQuad(q.subject, q.predicate, q.object, defaultGraphTerm);

            if (index.add(n)) {
                const record: ProvenanceRecord = { origin: 'axiom', triple: n };

                provenanceMap.set(quadKey(n), record);

                if (quadKey(n) === targetKey) return record;
            }
        }

        let delta: rdfjs.Quad[] = [];

        for (const q of store.match(null, null, null, sourceGraph)) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        for (const q of this.axioms()) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        while (delta.length > 0) {
            const nextDelta: rdfjs.Quad[] = [];

            for (const q of delta) {
                for (const result of this.inferFromQuad(q, index)) {
                    const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                    if (index.add(n)) {
                        const key = quadKey(n);
                        const ruleDescription = this.getRuleDescription(result.rule);
                        const record: ProvenanceRecord = {
                            origin: 'inferred',
                            triple: n,
                            rule: result.rule,
                            ...(ruleDescription ? { ruleDescription } : {}),
                            premises: resolvePremises(result.antecedents),
                        };

                        provenanceMap.set(key, record);

                        if (key === targetKey) {
                            return record;
                        }

                        nextDelta.push(n);
                    }
                }
            }

            for (const result of this.inferFromIndex(index)) {
                const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                if (index.add(n)) {
                    const key = quadKey(n);
                    const ruleDescription = this.getRuleDescription(result.rule);
                    const record: ProvenanceRecord = {
                        origin: 'inferred',
                        triple: n,
                        rule: result.rule,
                        ...(ruleDescription ? { ruleDescription } : {}),
                        premises: resolvePremises(result.antecedents),
                    };

                    provenanceMap.set(key, record);

                    if (key === targetKey) {
                        return record;
                    }

                    nextDelta.push(n);
                }
            }

            delta = nextDelta;
        }

        return undefined;
    }

    /**
     * Compute provenance for all inferred quads.
     *
     * Prefer `provenanceFor()` for editor workflows that need explanation for
     * a specific detected issue.
     */
    provenanceForAll(store: rdfjs.DatasetCore, sourceGraph: rdfjs.Quad_Graph): ProvenanceRecord[] {
        const index = new TripleIndex();

        // Stable key for an RDF term that preserves term type.
        function termKey(t: rdfjs.Term): string {
            if (t.termType === 'Literal') {
                const lit = t as rdfjs.Literal;
                return `L\x00${lit.value}\x00${lit.language || (lit.datatype?.value ?? '')}`;
            }
            return `${t.termType[0]}\x00${t.value}`;
        }

        function quadKey(q: rdfjs.Quad): string {
            return `${termKey(q.subject)}\x01${termKey(q.predicate)}\x01${termKey(q.object)}`;
        }

        const provenanceMap = new Map<string, ProvenanceRecord>();

        function resolvePremises(antecedents: rdfjs.Quad[]): ProvenanceRecord[] {
            return antecedents.map(ant => {
                const key = quadKey(createQuad(ant.subject, ant.predicate, ant.object, defaultGraphTerm));

                return provenanceMap.get(key) ?? { origin: 'source', triple: ant };
            });
        }

        // Seed index and provenance map with source triples.
        for (const q of store.match(null, null, null, sourceGraph)) {
            const n = createQuad(q.subject, q.predicate, q.object, defaultGraphTerm);

            if (index.add(n)) {
                provenanceMap.set(quadKey(n), { origin: 'source', triple: n });
            }
        }

        // Seed with profile axioms.
        for (const q of this.axioms()) {
            const n = createQuad(q.subject, q.predicate, q.object, defaultGraphTerm);

            if (index.add(n)) {
                provenanceMap.set(quadKey(n), { origin: 'axiom', triple: n });
            }
        }

        // Build the initial delta from all source + axiomatic quads.
        let delta: rdfjs.Quad[] = [];

        for (const q of store.match(null, null, null, sourceGraph)) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        for (const q of this.axioms()) {
            delta.push(createQuad(q.subject, q.predicate, q.object, defaultGraphTerm));
        }

        const inferredRecords: ProvenanceRecord[] = [];

        // Semi-naive fixpoint loop.
        while (delta.length > 0) {
            const nextDelta: rdfjs.Quad[] = [];

            for (const q of delta) {
                for (const result of this.inferFromQuad(q, index)) {
                    const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                    if (index.add(n)) {
                        const ruleDescription = this.getRuleDescription(result.rule);
                        const record: ProvenanceRecord = {
                            origin: 'inferred',
                            triple: n,
                            rule: result.rule,
                            ...(ruleDescription ? { ruleDescription } : {}),
                            premises: resolvePremises(result.antecedents),
                        };
                        provenanceMap.set(quadKey(n), record);
                        inferredRecords.push(record);
                        nextDelta.push(n);
                    }
                }
            }

            for (const result of this.inferFromIndex(index)) {
                const n = createQuad(result.quad.subject, result.quad.predicate, result.quad.object, defaultGraphTerm);

                if (index.add(n)) {
                    const ruleDescription = this.getRuleDescription(result.rule);
                    const record: ProvenanceRecord = {
                        origin: 'inferred',
                        triple: n,
                        rule: result.rule,
                        ...(ruleDescription ? { ruleDescription } : {}),
                        premises: resolvePremises(result.antecedents),
                    };
                    provenanceMap.set(quadKey(n), record);
                    inferredRecords.push(record);
                    nextDelta.push(n);
                }
            }

            delta = nextDelta;
        }

        return inferredRecords;
    }

    /**
     * Apply inference over the source graph and return a provenance record for
        * every inferred triple. Each inferred record contains the derived triple,
        * the rule id, an optional human-readable ruleDescription, and recursively
        * resolved premises that chain back to source and axiom leaf records.
     *
     * When the same quad is derivable by multiple paths only the first derivation
     * (earliest fixpoint round) is recorded.
     */
    expandWithProvenance(store: rdfjs.DatasetCore, sourceGraph: rdfjs.Quad_Graph): ProvenanceRecord[] {
        return this.provenanceForAll(store, sourceGraph);
    }

    /**
     * Build one SHACL-inspired report result for a specific target quad.
     *
     * The result contains source/target graph context, severity, and a detailed
     * provenance record for explainability.
     */
    reportFor(
        store: rdfjs.DatasetCore,
        sourceGraph: rdfjs.Quad_Graph,
        target: rdfjs.Quad,
        options?: ReportOptions,
    ): ReasoningReportResult | undefined {
        const detail = this.provenanceFor(store, sourceGraph, target);

        if (!detail) {
            return undefined;
        }

        const targetGraph = options?.targetGraph ?? sourceGraph;
        return this.toReportResult(detail, sourceGraph, targetGraph);
    }

    /**
     * Build a SHACL-inspired report for all inferred outcomes.
     *
     * `consistent` is true when no result has severity `Violation`.
     */
    reportForAll(
        store: rdfjs.DatasetCore,
        sourceGraph: rdfjs.Quad_Graph,
        options?: ReportOptions,
    ): ReasoningReport {
        const targetGraph = options?.targetGraph ?? sourceGraph;
        const results = this.provenanceForAll(store, sourceGraph).map(record =>
            this.toReportResult(record, sourceGraph, targetGraph),
        );

        const consistent = !results.some(r => r.severity === 'Violation');
        return { consistent, results };
    }

    /** Optional short human-readable text for a rule id (e.g. from profile specs). */
    protected getRuleDescription(_rule: string): string | undefined {
        return undefined;
    }

    /** Severity policy for inferred provenance nodes. Override in subclasses. */
    protected getSeverity(_record: InferredRecord): ReportSeverity {
        return 'Info';
    }

    private toReportResult(
        detail: ProvenanceRecord,
        sourceGraph: rdfjs.Quad_Graph,
        targetGraph: rdfjs.Quad_Graph,
    ): ReasoningReportResult {
        if (detail.origin === 'inferred') {
            return {
                sourceGraph,
                targetGraph,
                severity: this.getSeverity(detail),
                detail,
            };
        }

        return {
            sourceGraph,
            targetGraph,
            severity: 'Info',
            detail,
        };
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
    protected abstract inferFromQuad(quad: rdfjs.Quad, index: TripleIndex): Iterable<InferenceResult>;

    /**
     * Join rules requiring patterns across multiple quads.
     * Called once per fixpoint round over the full index.
     */
    protected abstract inferFromIndex(index: TripleIndex): Iterable<InferenceResult>;
}
