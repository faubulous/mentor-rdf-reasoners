import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import * as rdfjs from '@rdfjs/types';
const { namedNode, quad } = DataFactory;
import { OwlRlReasoner } from '../index.js';
import { ReasonerBase, TripleIndex } from '../reasoner.js';

const sourceGraph = namedNode('https://example.org/ontology');

function makeStore(...quads: rdfjs.Quad[]) {
    const store = RdfStore.createDefault().asDataset();

    for (const q of quads) {
        store.add(q);
    }

    return store;
}

describe('OwlRlReasoner', () => {
    it('should create a reasoner instance without arguments', () => {
        const reasoner = new OwlRlReasoner();
        expect(reasoner).toBeDefined();
    });

    it('expand() should return an iterable', () => {
        const store = makeStore();
        const reasoner = new OwlRlReasoner();
        const result = reasoner.infer(store, sourceGraph);
        expect(typeof result[Symbol.iterator]).toBe('function');
    });

    it('expand() should yield axiomatic triples for an empty graph', () => {
        const store = makeStore();
        const reasoner = new OwlRlReasoner();
        const inferred = [...reasoner.infer(store, sourceGraph)];
        // Axioms (prp-ap annotation properties, cls-thing/nothing, dt-type1 datatypes) are always yielded.
        expect(inferred.length).toBeGreaterThan(0);
    });

    it('expand() should not yield source triples', () => {
        const a = namedNode('https://example.org/A');
        const b = namedNode('https://example.org/B');
        const p = namedNode('https://example.org/prop');
        const store = makeStore(quad(a, p, b, sourceGraph));
        const reasoner = new OwlRlReasoner();
        const inferred = [...reasoner.infer(store, sourceGraph)];
        // Source triple (a p b) must not appear in the inferred set.
        const sourceInInferred = inferred.some(q =>
            q.subject.value === a.value &&
            q.predicate.value === p.value &&
            q.object.value === b.value
        );
        expect(sourceInInferred).toBe(false);
    });
});

describe('ReasonerBase default axioms', () => {
    it('base axioms() yields nothing when not overridden', () => {
        class MinimalReasoner extends ReasonerBase {
            protected *inferFromQuad(_quad: ReturnType<typeof quad>, _index: TripleIndex) {}
            protected *inferFromIndex(_index: TripleIndex) {}
        }
        const reasoner = new MinimalReasoner();
        const store = RdfStore.createDefault().asDataset();
        const g = namedNode('urn:g');
        const result = [...reasoner.infer(store, g)];
        expect(result.length).toBe(0);
    });
});

