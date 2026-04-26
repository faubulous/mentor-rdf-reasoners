import * as rdfjs from '@rdfjs/types';
import { InferenceResult, ReasonerBase, TripleIndex } from '../reasoner.js';
import { equalitySingleQuad, equalityJoin } from './rules/equality.js';
import { classAxiomSingleQuad, classAxiomJoin } from './rules/class-axioms.js';
import { propertySingleQuad, propertyJoin, propertyAxioms } from './rules/property-semantics.js';
import { classAxioms, classSingleQuad, classJoin } from './rules/class-semantics.js';
import { schemaSingleQuad, schemaJoin } from './rules/schema.js';
import { dtAxioms } from './rules/datatypes.js';

/**
 * An OWL 2 RL reasoner.
 *
 * Implements the OWL 2 RL profile as specified at https://www.w3.org/TR/owl2-profiles/
 * using semi-naive forward chaining over a `TripleIndex`.
 *
 * Usage:
 * ```ts
 * const reasoner = new OwlRlReasoner();
 * const store = RdfStore.createDefault().asDataset();
 * // load your ontology into store / sourceGraph ...
 * for (const quad of reasoner.expand(store, sourceGraph)) {
 *     store.add(DataFactory.quad(quad.subject, quad.predicate, quad.object, targetGraph));
 * }
 * ```
 */
export class OwlRlReasoner extends ReasonerBase {
    protected *axioms(): Iterable<rdfjs.Quad> {
        yield* propertyAxioms();
        yield* classAxioms();
        yield* dtAxioms();
    }

    /** Returns all axiomatic triples pre-loaded before inference (profile axioms). */
    public *getAxioms(): Iterable<rdfjs.Quad> {
        yield* this.axioms();
    }

    protected *inferFromQuad(quad: rdfjs.Quad, index: TripleIndex): Iterable<InferenceResult> {
        yield* equalitySingleQuad(quad, index);
        yield* propertySingleQuad(quad, index);
        yield* classSingleQuad(quad, index);
        yield* classAxiomSingleQuad(quad, index);
        yield* schemaSingleQuad(quad, index);
    }

    protected *inferFromIndex(index: TripleIndex): Iterable<InferenceResult> {
        yield* equalityJoin(index);
        yield* propertyJoin(index);
        yield* classJoin(index);
        yield* classAxiomJoin(index);
        yield* schemaJoin(index);
    }
}

