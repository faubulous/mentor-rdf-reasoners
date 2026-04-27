import * as rdfjs from '@rdfjs/types';

/**
 * Predicate used to match inferred quads of interest (e.g. inconsistency markers).
 */
export type InferredQuadMatcher = (quad: rdfjs.Quad) => boolean;

/**
 * Optional controls for inference workflows.
 */
export interface InferenceOptions {
    stopWhen?: InferredQuadMatcher;
}
