import * as rdfjs from '@rdfjs/types';
import { InferenceOptions } from './inference-options';

/**
 * A reasoner that derives new triples from an RDF graph via forward-chaining inference.
 */
export interface Reasoner {
    /**
     * Apply inference over all source graphs and yield all inferred triples.
     * The caller is responsible for adding the yielded quads to a graph.
     *
     * @param store The source dataset to reason over.
     * @param sourceGraphs The named graphs (or default graph) to read triples from.
     * @param options Optional controls for inference workflows (e.g. early stopping).
     * @returns An iterable of inferred quads (with graph term normalized to defaultGraph).
     */
    infer(store: rdfjs.DatasetCore, sourceGraphs: ReadonlyArray<rdfjs.Quad_Graph>, options?: InferenceOptions): Iterable<rdfjs.Quad>;
}