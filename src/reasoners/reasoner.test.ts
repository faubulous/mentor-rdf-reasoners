import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { infer } from './inference-result.js';
import { ReasonerBase } from './reasoner-base.js';
import { TripleIndex } from './triple-index.js';

const namedNode = DataFactory.namedNode.bind(DataFactory);
const createQuad = DataFactory.quad.bind(DataFactory);
const literal = DataFactory.literal.bind(DataFactory);

const sourceGraph = namedNode('urn:source');
const sourceGraphTwo = namedNode('urn:source-two');
const s = namedNode('urn:s');
const p = namedNode('urn:p');
const o = namedNode('urn:o');
const derivedPredicate = namedNode('urn:derived');
const schemaPredicate = namedNode('urn:schema');
const hiddenAntecedent = createQuad(namedNode('urn:hidden-s'), namedNode('urn:hidden-p'), namedNode('urn:hidden-o'));

function makeDataset(...quads: rdfjs.Quad[]): rdfjs.DatasetCore {
    const data = [...quads];

    return {
        size: data.length,
        add(addedQuad: rdfjs.Quad) {
            data.push(addedQuad);
            this.size = data.length;
            return this;
        },
        delete(deletedQuad: rdfjs.Quad) {
            const index = data.findIndex(existing => existing.equals(deletedQuad));

            if (index >= 0) {
                data.splice(index, 1);
                this.size = data.length;
            }

            return this;
        },
        has(targetQuad: rdfjs.Quad) {
            return data.some(existing => existing.equals(targetQuad));
        },
        match(subject, predicate, object, graph) {
            return data.filter(existing =>
                (subject === null || existing.subject.equals(subject)) &&
                (predicate === null || existing.predicate.equals(predicate)) &&
                (object === null || existing.object.equals(object)) &&
                (graph === null || existing.graph.equals(graph)),
            ) as unknown as rdfjs.DatasetCore;
        },
        [Symbol.iterator]() {
            return data[Symbol.iterator]();
        },
    } as rdfjs.DatasetCore;
}

class HooklessReasoner extends ReasonerBase {
    protected *inferFromQuad(inputQuad: rdfjs.Quad, _index: TripleIndex) {
        if (inputQuad.predicate.value === p.value) {
            yield infer(createQuad(inputQuad.subject, derivedPredicate, inputQuad.object), 'custom-rule', hiddenAntecedent);
        }
    }

    protected *inferFromIndex(_index: TripleIndex) { }
}

class IndexOnlyReasoner extends ReasonerBase {
    protected *inferFromQuad(_inputQuad: rdfjs.Quad, _index: TripleIndex) { }

    protected *inferFromIndex(index: TripleIndex) {
        if (index.has(p.value, s.value, o.value)) {
            yield infer(createQuad(s, namedNode('urn:joined'), o), 'joined-rule', hiddenAntecedent);
        }
    }
}

class AxiomReasoner extends ReasonerBase {
    protected *axioms(): Iterable<rdfjs.Quad> {
        yield createQuad(namedNode('urn:axiom-s'), namedNode('urn:axiom-p'), namedNode('urn:axiom-o'));
    }

    protected *inferFromQuad(_inputQuad: rdfjs.Quad, _index: TripleIndex) { }

    protected *inferFromIndex(_index: TripleIndex) { }
}

class DuplicateAxiomReasoner extends ReasonerBase {
    protected *axioms(): Iterable<rdfjs.Quad> {
        const axiom = createQuad(namedNode('urn:dup-axiom-s'), namedNode('urn:dup-axiom-p'), namedNode('urn:dup-axiom-o'));
        yield axiom;
        yield axiom;
    }

    protected *inferFromQuad(_inputQuad: rdfjs.Quad, _index: TripleIndex) { }

    protected *inferFromIndex(_index: TripleIndex) { }
}

class CrossGraphReasoner extends ReasonerBase {
    protected *inferFromQuad(_inputQuad: rdfjs.Quad, _index: TripleIndex) { }

    protected *inferFromIndex(index: TripleIndex) {
        if (index.has(schemaPredicate.value, s.value, p.value) && index.has(p.value, s.value, o.value)) {
            yield infer(createQuad(s, namedNode('urn:cross-graph-derived'), o), 'cross-graph-rule');
        }
    }
}

describe('ReasonerBase provenance and reports', () => {
    it('falls back to source premises when an antecedent is not in the provenance map', () => {
        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));
        const target = createQuad(s, derivedPredicate, o);

        const record = reasoner.getProvenanceForQuad(dataset, [sourceGraph], target);

        expect(record?.origin).toBe('inference');
        const inferred = record as Extract<typeof record, { origin: 'inference' }>;
        expect(inferred.rule).toBe('custom-rule');
        expect(inferred.ruleDescription).toBeUndefined();
        expect(inferred.premises).toHaveLength(1);
        expect(inferred.premises[0].origin).toBe('source');
        expect(inferred.premises[0].triple.subject.value).toBe(hiddenAntecedent.subject.value);
    });

    it('uses default Info severity and sourceGraph as targetGraph when building a report', () => {
        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));
        const target = createQuad(s, derivedPredicate, o);

        const reportResult = reasoner.getReportForQuad(dataset, [sourceGraph], target);

        expect(reportResult).toBeDefined();
        expect(reportResult?.severity).toBe('Info');
        expect(reportResult?.sourceGraphs).toHaveLength(1);
        expect(reportResult?.sourceGraphs[0].value).toBe(sourceGraph.value);
        expect(reportResult?.targetGraph.value).toBe(sourceGraph.value);
        expect(reportResult?.detail.origin).toBe('inference');
    });

    it('builds a source-level report result for a source triple target', () => {
        const reasoner = new HooklessReasoner();
        const sourceQuad = createQuad(s, p, literal('value'), sourceGraph);
        const dataset = makeDataset(sourceQuad);

        const reportResult = reasoner.getReportForQuad(dataset, [sourceGraph], sourceQuad);

        expect(reportResult).toBeDefined();
        expect(reportResult?.severity).toBe('Info');
        expect(reportResult?.detail.origin).toBe('source');
        expect(reportResult?.detail.triple.object.value).toBe('value');
    });

    it('handles literal targets even when the literal has no datatype set', () => {
        const rawLiteral = {
            termType: 'Literal',
            value: 'raw',
            language: '',
            datatype: undefined,
            equals(other: rdfjs.Term) {
                return other.termType === 'Literal' && other.value === 'raw';
            },
        } as unknown as rdfjs.Literal;

        const sourceQuad = {
            subject: namedNode('urn:raw-s'),
            predicate: namedNode('urn:raw-p'),
            object: rawLiteral,
            graph: sourceGraph,
            equals(other: rdfjs.Quad) {
                return other.subject.value === 'urn:raw-s' &&
                    other.predicate.value === 'urn:raw-p' &&
                    other.object.termType === 'Literal' &&
                    other.object.value === 'raw';
            },
        } as unknown as rdfjs.Quad;

        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(sourceQuad);
        const record = reasoner.getProvenanceForQuad(dataset, [sourceGraph], sourceQuad);

        expect(record?.origin).toBe('source');
        expect(record?.triple.object.termType).toBe('Literal');
        expect(record?.triple.object.value).toBe('raw');
    });

    it('getProvenanceForInferredQuads covers fallback premises and omitted ruleDescription branches', () => {
        const rawLiteral = {
            termType: 'Literal',
            value: 'raw-all',
            language: '',
            datatype: undefined,
            equals(other: rdfjs.Term) {
                return other.termType === 'Literal' && other.value === 'raw-all';
            },
        } as unknown as rdfjs.Literal;

        const sourceQuad = {
            subject: namedNode('urn:raw-all-s'),
            predicate: p,
            object: rawLiteral,
            graph: sourceGraph,
            equals(other: rdfjs.Quad) {
                return other.subject.value === 'urn:raw-all-s' &&
                    other.predicate.value === p.value &&
                    other.object.termType === 'Literal' &&
                    other.object.value === 'raw-all';
            },
        } as unknown as rdfjs.Quad;

        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(sourceQuad);
        const records = reasoner.getProvenanceForInferredQuads(dataset, [sourceGraph]);

        expect(records).toHaveLength(1);
        expect(records[0].origin).toBe('inference');
        expect((records[0] as Extract<typeof records[0], { origin: 'inference' }>).ruleDescription).toBeUndefined();
        expect((records[0] as Extract<typeof records[0], { origin: 'inference' }>).premises[0].origin).toBe('source');
    });

    it('covers join-based provenance paths when no ruleDescription is available', () => {
        const reasoner = new IndexOnlyReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));
        const target = createQuad(s, namedNode('urn:joined'), o);

        const single = reasoner.getProvenanceForQuad(dataset, [sourceGraph], target);
        const all = reasoner.getProvenanceForInferredQuads(dataset, [sourceGraph]);

        expect(single?.origin).toBe('inference');
        expect((single as Extract<typeof single, { origin: 'inference' }>).ruleDescription).toBeUndefined();
        expect(all).toHaveLength(1);
        expect(all[0].origin).toBe('inference');
        expect((all[0] as Extract<typeof all[0], { origin: 'inference' }>).ruleDescription).toBeUndefined();
    });

    it('returns an axiom record when the target quad is a seeded axiom', () => {
        const reasoner = new AxiomReasoner();
        const dataset = makeDataset();
        const target = createQuad(namedNode('urn:axiom-s'), namedNode('urn:axiom-p'), namedNode('urn:axiom-o'));

        const record = reasoner.getProvenanceForQuad(dataset, [sourceGraph], target);

        expect(record?.origin).toBe('axiom');
        expect(record?.triple.subject.value).toBe('urn:axiom-s');
    });

    it('returns undefined for reportFor when the requested target is not derivable', () => {
        const reasoner = new IndexOnlyReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));
        const missingTarget = createQuad(namedNode('urn:missing-s'), namedNode('urn:missing-p'), namedNode('urn:missing-o'));

        expect(reasoner.getReportForQuad(dataset, [sourceGraph], missingTarget)).toBeUndefined();
    });

    it('provenanceFor continues past a join result when it is not the requested target', () => {
        const reasoner = new IndexOnlyReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));
        const missingTarget = createQuad(namedNode('urn:other-s'), namedNode('urn:other-p'), namedNode('urn:other-o'));

        expect(reasoner.getProvenanceForQuad(dataset, [sourceGraph], missingTarget)).toBeUndefined();
    });

    it('expand stops early when stopWhen matches a single-quad inference', () => {
        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));

        const inferred = [...reasoner.infer(dataset, [sourceGraph], {
            stopWhen: result => result.predicate.value === derivedPredicate.value,
        })];

        expect(inferred.some(result => result.predicate.value === derivedPredicate.value)).toBe(true);
    });

    it('expand stops early when stopWhen matches a join inference', () => {
        const joinedPredicate = namedNode('urn:joined');
        const reasoner = new IndexOnlyReasoner();
        const dataset = makeDataset(createQuad(s, p, o, sourceGraph));

        const inferred = [...reasoner.infer(dataset, [sourceGraph], {
            stopWhen: result => result.predicate.value === joinedPredicate.value,
        })];

        expect(inferred.some(result => result.predicate.value === joinedPredicate.value)).toBe(true);
    });

    it('covers duplicate source and axiom insertion guards in provenance builders', () => {
        const duplicateSource = createQuad(namedNode('urn:dup-source-s'), namedNode('urn:dup-source-p'), namedNode('urn:dup-source-o'), sourceGraph);
        const reasoner = new DuplicateAxiomReasoner();
        const dataset = makeDataset(duplicateSource, duplicateSource);

        const all = reasoner.getProvenanceForInferredQuads(dataset, [sourceGraph]);
        const sourceRecord = reasoner.getProvenanceForQuad(dataset, [sourceGraph], duplicateSource);
        const axiomTarget = createQuad(namedNode('urn:dup-axiom-s'), namedNode('urn:dup-axiom-p'), namedNode('urn:dup-axiom-o'));
        const axiomRecord = reasoner.getProvenanceForQuad(dataset, [sourceGraph], axiomTarget);

        expect(all).toHaveLength(0);
        expect(sourceRecord?.origin).toBe('source');
        expect(axiomRecord?.origin).toBe('axiom');
    });

    it('covers duplicate axiom insertion else-branch in provenanceFor when no target matches', () => {
        const reasoner = new DuplicateAxiomReasoner();
        const dataset = makeDataset();
        const missingTarget = createQuad(namedNode('urn:none-s'), namedNode('urn:none-p'), namedNode('urn:none-o'));

        expect(reasoner.getProvenanceForQuad(dataset, [sourceGraph], missingTarget)).toBeUndefined();
    });

    it('supports merged inference across multiple source graphs', () => {
        const reasoner = new CrossGraphReasoner();
        const schemaQuad = createQuad(s, schemaPredicate, p, sourceGraph);
        const dataQuad = createQuad(s, p, o, sourceGraphTwo);
        const dataset = makeDataset(schemaQuad, dataQuad);

        const inferred = [...reasoner.infer(dataset, [sourceGraph, sourceGraphTwo])];

        expect(inferred.some(q => q.predicate.value === 'urn:cross-graph-derived')).toBe(true);
    });

    it('deduplicates identical source triples across multiple source graphs', () => {
        const reasoner = new HooklessReasoner();
        const dataset = makeDataset(
            createQuad(s, p, o, sourceGraph),
            createQuad(s, p, o, sourceGraphTwo),
        );

        const inferred = [...reasoner.infer(dataset, [sourceGraph, sourceGraphTwo])];

        expect(inferred).toHaveLength(1);
        expect(inferred[0].predicate.value).toBe(derivedPredicate.value);
    });
});