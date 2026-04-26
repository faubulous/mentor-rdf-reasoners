import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import * as rdfjs from '@rdfjs/types';
import type { ProvenanceRecord } from '../reasoner.js';
import { OwlRlReasoner } from './index.js';

const { namedNode, quad, literal } = DataFactory;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const OWL_SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs';
const OWL_FUNCTIONAL_PROPERTY = 'http://www.w3.org/2002/07/owl#FunctionalProperty';
const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';
const OWL_NOTHING = 'http://www.w3.org/2002/07/owl#Nothing';
const OWL_NAMED_INDIVIDUAL = 'http://www.w3.org/2002/07/owl#NamedIndividual';

const sourceGraph = namedNode('https://example.org/ontology');

function makeStore(...quads: rdfjs.Quad[]) {
    const store = RdfStore.createDefault().asDataset();

    for (const q of quads) {
        store.add(q);
    }

    return store;
}

function quadKey(q: ReturnType<typeof quad>): string {
    return `${q.subject.value} ${q.predicate.value} ${q.object.termType}:${q.object.value}`;
}

function findRecord(records: ProvenanceRecord[], s: string, p: string, o: string): ProvenanceRecord | undefined {
    return records.find(r => r.quad.subject.value === s && r.quad.predicate.value === p && r.quad.object.value === o);
}

function collectRules(record: ProvenanceRecord): string[] {
    return [record.rule, ...record.antecedents.flatMap(collectRules)];
}

function collectSourceQuadKeys(record: ProvenanceRecord): Set<string> {
    const keys = new Set<string>();

    const visit = (node: ProvenanceRecord): void => {
        if (node.rule === 'source') {
            keys.add(quadKey(node.quad as ReturnType<typeof quad>));
        }

        for (const ant of node.antecedents) visit(ant);
    };

    visit(record);
    return keys;
}

describe('OwlRlReasoner provenance', () => {
    it('records eq-sym with source antecedent', () => {
        const a = namedNode('https://example.org/A');
        const b = namedNode('https://example.org/B');

        const store = makeStore(quad(a, namedNode(OWL_SAME_AS), b, sourceGraph));
        const reasoner = new OwlRlReasoner();
        const records = reasoner.expandWithProvenance(store, sourceGraph);

        const record = findRecord(records, b.value, OWL_SAME_AS, a.value);
        expect(record).toBeDefined();
        expect(record?.rule).toBe('eq-sym');
        expect(record?.antecedents.length).toBe(1);
        expect(record?.antecedents[0].rule).toBe('source');
        expect(record?.antecedents[0].quad.subject.value).toBe(a.value);
        expect(record?.antecedents[0].quad.predicate.value).toBe(OWL_SAME_AS);
        expect(record?.antecedents[0].quad.object.value).toBe(b.value);
    });

    it('records dt-diff inconsistency with full source chain', () => {
        const a = namedNode('https://example.org/a');
        const p = namedNode('https://example.org/p');

        const typeTriple = quad(p, namedNode(RDF_TYPE), namedNode(OWL_FUNCTIONAL_PROPERTY), sourceGraph);
        const v1Triple = quad(a, p, literal('v1'), sourceGraph);
        const v2Triple = quad(a, p, literal('v2'), sourceGraph);

        const store = makeStore(typeTriple, v1Triple, v2Triple);
        const reasoner = new OwlRlReasoner();
        const records = reasoner.expandWithProvenance(store, sourceGraph);

        const record = records.find(r =>
            r.rule === 'dt-diff' &&
            r.quad.subject.value === OWL_THING &&
            r.quad.predicate.value === RDFS_SUBCLASS_OF &&
            r.quad.object.value === OWL_NOTHING,
        );

        expect(record).toBeDefined();

        const sourceKeys = collectSourceQuadKeys(record!);
        expect(sourceKeys.has(quadKey(typeTriple))).toBe(true);
        expect(sourceKeys.has(quadKey(v1Triple))).toBe(true);
        expect(sourceKeys.has(quadKey(v2Triple))).toBe(true);
    });

    it('includes axiom nodes in provenance chains', () => {
        const a = namedNode('https://example.org/a');

        const store = makeStore(quad(a, namedNode(RDF_TYPE), namedNode(OWL_NAMED_INDIVIDUAL), sourceGraph));
        const reasoner = new OwlRlReasoner();
        const records = reasoner.expandWithProvenance(store, sourceGraph);

        const record = findRecord(records, a.value, RDF_TYPE, OWL_THING);
        expect(record).toBeDefined();

        const rules = collectRules(record!);
        expect(rules).toContain('cax-sco');
        expect(rules).toContain('axiom');
        expect(rules).toContain('source');
    });

    it('records a two-hop sameAs derivation with both source antecedents', () => {
        const a = namedNode('https://example.org/A');
        const b = namedNode('https://example.org/B');
        const c = namedNode('https://example.org/C');

        const ab = quad(a, namedNode(OWL_SAME_AS), b, sourceGraph);
        const bc = quad(b, namedNode(OWL_SAME_AS), c, sourceGraph);
        const store = makeStore(ab, bc);

        const reasoner = new OwlRlReasoner();
        const records = reasoner.expandWithProvenance(store, sourceGraph);

        const record = findRecord(records, a.value, OWL_SAME_AS, c.value);
        expect(record).toBeDefined();
        expect(['eq-trans', 'eq-rep-o', 'eq-rep-s']).toContain(record?.rule);

        const sourceKeys = collectSourceQuadKeys(record!);
        expect(sourceKeys.has(quadKey(ab))).toBe(true);
        expect(sourceKeys.has(quadKey(bc))).toBe(true);
    });

    it('supports two-phase inconsistency workflow (detect, then explain target)', () => {
        const a = namedNode('https://example.org/a');
        const p = namedNode('https://example.org/p');

        const typeTriple = quad(p, namedNode(RDF_TYPE), namedNode(OWL_FUNCTIONAL_PROPERTY), sourceGraph);
        const v1Triple = quad(a, p, literal('v1'), sourceGraph);
        const v2Triple = quad(a, p, literal('v2'), sourceGraph);

        const store = makeStore(typeTriple, v1Triple, v2Triple);
        const reasoner = new OwlRlReasoner();

        const stopWhen = (q: ReturnType<typeof quad>) =>
            q.subject.value === OWL_THING &&
            q.predicate.value === RDFS_SUBCLASS_OF &&
            q.object.value === OWL_NOTHING;

        const inferredUntilStop = [...reasoner.expand(store, sourceGraph, { stopWhen })];
        const inconsistency = inferredUntilStop.find(stopWhen);

        expect(inconsistency).toBeDefined();

        const explanation = reasoner.provenanceFor(store, sourceGraph, inconsistency!);
        expect(explanation).toBeDefined();
        expect(explanation?.quad.subject.value).toBe(OWL_THING);
        expect(explanation?.quad.predicate.value).toBe(RDFS_SUBCLASS_OF);
        expect(explanation?.quad.object.value).toBe(OWL_NOTHING);

        const sourceKeys = collectSourceQuadKeys(explanation!);
        expect(sourceKeys.has(quadKey(typeTriple))).toBe(true);
        expect(sourceKeys.has(quadKey(v1Triple))).toBe(true);
        expect(sourceKeys.has(quadKey(v2Triple))).toBe(true);
    });
});
