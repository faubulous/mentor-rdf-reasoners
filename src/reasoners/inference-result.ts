import * as rdfjs from '@rdfjs/types';

/**
 * A single inference step: the derived quad, the OWL RL rule that produced it,
 * and the direct antecedent quads that triggered it.
 */
export interface InferenceResult {
    quad: rdfjs.Quad;
    rule: string;
    antecedents: rdfjs.Quad[];
}

/**
 * Factory for creating an `InferenceResult`. Used by rule functions to annotate
 * each derived quad with its rule name and direct antecedent quads.
 */
export function infer(quad: rdfjs.Quad, rule: string, ...antecedents: rdfjs.Quad[]): InferenceResult {
    return { quad, rule, antecedents };
}
