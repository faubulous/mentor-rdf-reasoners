import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import * as rdfjs from '@rdfjs/types';
import type { ProvenanceRecord, InferredRecord } from '../reasoner.js';
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
    return records.find(r => r.triple.subject.value === s && r.triple.predicate.value === p && r.triple.object.value === o);
}

function collectRules(record: ProvenanceRecord): string[] {
    if (record.origin === 'inferred') {
        return [record.rule, ...record.premises.flatMap(collectRules)];
    }

    return [record.origin];
}

function collectSourceQuadKeys(record: ProvenanceRecord): Set<string> {
    const keys = new Set<string>();

    const visit = (node: ProvenanceRecord): void => {
        if (node.origin === 'source') {
            keys.add(quadKey(node.triple as ReturnType<typeof quad>));
        }

        if (node.origin === 'inferred') {
            for (const premise of node.premises) visit(premise);
        }
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
        expect(record?.origin).toBe('inferred');
        const inferred = record as InferredRecord;
        expect(inferred.rule).toBe('eq-sym');
        expect(inferred.ruleDescription).toContain('symmetry');
        expect(inferred.premises.length).toBe(1);
        expect(inferred.premises[0].origin).toBe('source');
        expect(inferred.premises[0].triple.subject.value).toBe(a.value);
        expect(inferred.premises[0].triple.predicate.value).toBe(OWL_SAME_AS);
        expect(inferred.premises[0].triple.object.value).toBe(b.value);
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
            r.origin === 'inferred' &&
            r.rule === 'dt-diff' &&
            r.triple.subject.value === OWL_THING &&
            r.triple.predicate.value === RDFS_SUBCLASS_OF &&
            r.triple.object.value === OWL_NOTHING,
        ) as InferredRecord | undefined;

        expect(record).toBeDefined();
        expect(record?.ruleDescription).toContain('functional data property');

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
        expect(record?.origin).toBe('inferred');
        expect(['eq-trans', 'eq-rep-o', 'eq-rep-s']).toContain((record as InferredRecord).rule);

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

        const inferredUntilStop = [...reasoner.infer(store, sourceGraph, { stopWhen })];
        const inconsistency = inferredUntilStop.find(stopWhen);

        expect(inconsistency).toBeDefined();

        const explanation = reasoner.provenanceFor(store, sourceGraph, inconsistency!);
        expect(explanation).toBeDefined();
        expect(explanation?.triple.subject.value).toBe(OWL_THING);
        expect(explanation?.triple.predicate.value).toBe(RDFS_SUBCLASS_OF);
        expect(explanation?.triple.object.value).toBe(OWL_NOTHING);

        const sourceKeys = collectSourceQuadKeys(explanation!);
        expect(sourceKeys.has(quadKey(typeTriple))).toBe(true);
        expect(sourceKeys.has(quadKey(v1Triple))).toBe(true);
        expect(sourceKeys.has(quadKey(v2Triple))).toBe(true);
    });

    it('builds a SHACL-like report result with source/target graph and severity', () => {
        const a = namedNode('https://example.org/a');
        const p = namedNode('https://example.org/p');
        const targetGraph = namedNode('https://example.org/inferred');

        const typeTriple = quad(p, namedNode(RDF_TYPE), namedNode(OWL_FUNCTIONAL_PROPERTY), sourceGraph);
        const v1Triple = quad(a, p, literal('v1'), sourceGraph);
        const v2Triple = quad(a, p, literal('v2'), sourceGraph);

        const store = makeStore(typeTriple, v1Triple, v2Triple);
        const reasoner = new OwlRlReasoner();

        const inconsistency = [...reasoner.infer(store, sourceGraph)].find(q =>
            q.subject.value === OWL_THING &&
            q.predicate.value === RDFS_SUBCLASS_OF &&
            q.object.value === OWL_NOTHING,
        );

        expect(inconsistency).toBeDefined();

        const result = reasoner.reportFor(store, sourceGraph, inconsistency!, { targetGraph });
        expect(result).toBeDefined();
        expect(result?.sourceGraph.value).toBe(sourceGraph.value);
        expect(result?.targetGraph.value).toBe(targetGraph.value);
        expect(result?.severity).toBe('Violation');
        expect(result?.detail.origin).toBe('inferred');
        expect((result?.detail as InferredRecord).rule).toBe('dt-diff');
        expect((result?.detail as InferredRecord).ruleDescription).toContain('functional data property');
        expect(result?.detail.triple.subject.value).toBe(OWL_THING);
        expect(result?.detail.triple.predicate.value).toBe(RDFS_SUBCLASS_OF);
        expect(result?.detail.triple.object.value).toBe(OWL_NOTHING);
    });

    it('builds a SHACL-like report wrapper with consistent flag', () => {
        const a = namedNode('https://example.org/a');
        const p = namedNode('https://example.org/p');

        const typeTriple = quad(p, namedNode(RDF_TYPE), namedNode(OWL_FUNCTIONAL_PROPERTY), sourceGraph);
        const v1Triple = quad(a, p, literal('v1'), sourceGraph);
        const v2Triple = quad(a, p, literal('v2'), sourceGraph);

        const store = makeStore(typeTriple, v1Triple, v2Triple);
        const reasoner = new OwlRlReasoner();

        const report = reasoner.reportForAll(store, sourceGraph);
        expect(report.results.length).toBeGreaterThan(0);
        expect(report.results.some(r => r.severity === 'Violation')).toBe(true);
        expect(report.consistent).toBe(false);
    });
});
