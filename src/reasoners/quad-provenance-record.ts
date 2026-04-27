import * as rdfjs from '@rdfjs/types';

/**
 * A node in a provenance explanation tree.
 *
 * - `SourceQuadRecord` - The quad came directly from the input dataset (leaf node).
 * - `SourceAxiomRecord` - The quad is a profile axiom (leaf node).
 * - `InferredQuadRecord` - The quad was derived by a named OWL RL rule from its premises (branch node).
 */
export type QuadProvenanceRecord = SourceQuadRecord | SourceAxiomRecord | InferredQuadRecord;

/**
 * A profile axiom seeded into the index before inference began.
 */
export interface SourceAxiomRecord {
    /**
     * Indicates that the provenance record is an axiom.
     */
    origin: 'axiom';

    /**
     * The axiom triple.
     */
    quad: rdfjs.Quad;
}

/**
 * A source triple that came directly from the input dataset.
 */
export interface SourceQuadRecord {
    /**
     * Indicates that the provenance record is about a triple that came directly from the input dataset.
     */
    origin: 'source';

    /**
     * The source quad.
     */
    quad: rdfjs.Quad;
}

/**
 * A quad produced by applying a named OWL RL rule to its premises.
 */
export interface InferredQuadRecord {
    /**
     * Indicates that the provenance record is about a quad that was inferred by applying a reasoning rule to its premises.
     */
    origin: 'inference';

    /**
     * The inferred quad.
     */
    quad: rdfjs.Quad;

    /**
     * The OWL RL rule that produced the inferred quad, e.g. "prp-spo1".
     */
    rule: string;

    /**
     * Optional human-readable description of the rule, e.g. "If ?p rdfs:subPropertyOf ?q and ?s ?p ?o then infer ?s ?q ?o".
     */
    ruleDescription?: string;

    /**
     * The premises that were used to infer the triple.
     */
    premises: QuadProvenanceRecord[];
}
