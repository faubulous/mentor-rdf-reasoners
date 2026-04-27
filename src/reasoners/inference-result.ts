import * as rdfjs from '@rdfjs/types';

/**
 * A single inference step: the derived quad, the OWL RL rule that produced it,
 * and the direct antecedent quads that triggered it.
 */
export interface InferenceResult {
    /**
     * The inferred quad.
     */
    quad: rdfjs.Quad;

    /**
     * The OWL RL rule that produced the inferred quad, e.g. "prp-spo1".
     */
    rule: string;

    /**
     * The direct antecedent quads that triggered this inference step. These are 
     * the quads that matched the rule's body patterns and caused the rule to fire. 
     * They may be source quads or previously inferred quads.
     */
    antecedents: rdfjs.Quad[];
}

/**
 * Factory for creating an `InferenceResult`. Used by rule functions to annotate
 * each derived quad with its rule name and direct antecedent quads.
 */
export function infer(quad: rdfjs.Quad, rule: string, ...antecedents: rdfjs.Quad[]): InferenceResult {
    return { quad, rule, antecedents };
}
