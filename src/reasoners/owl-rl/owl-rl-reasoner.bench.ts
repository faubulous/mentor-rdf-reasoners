import { bench, describe } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
const { namedNode } = DataFactory;
import { OwlRlReasoner } from '../index.js';

const sourceGraph = namedNode('https://example.org/ontology');

describe('OwlRlReasoner benchmarks', () => {
    bench('expand empty graph', () => {
        const store = RdfStore.createDefault().asDataset();
        const reasoner = new OwlRlReasoner();

        for (const _ of reasoner.infer(store, sourceGraph)) { /* consume */ }
    });
});

