/**
 * Tests for OWL 2 RL equality rules (eq-*).
 */
import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { OwlRlReasoner } from '../../owl-rl/index.js';
import { QuadIndex } from '../../quad-index.js';
import { equalityJoin } from './equality.js';

const { namedNode, quad, literal, blankNode } = DataFactory;

const g = namedNode('urn:g');
const A = namedNode('urn:A');
const B = namedNode('urn:B');
const C = namedNode('urn:C');
const p = namedNode('urn:p');

const sameAs       = namedNode('http://www.w3.org/2002/07/owl#sameAs');
const diffFrom     = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
const allDiff      = namedNode('http://www.w3.org/2002/07/owl#AllDifferent');
const members      = namedNode('http://www.w3.org/2002/07/owl#members');
const distMembers  = namedNode('http://www.w3.org/2002/07/owl#distinctMembers');
const rdfType      = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const rdfFirst     = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const rdfRest      = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
const rdfNil       = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');
const owlThing     = namedNode('http://www.w3.org/2002/07/owl#Thing');
const rdfsSubClassOf = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const owlNothing   = namedNode('http://www.w3.org/2002/07/owl#Nothing');

const reasoner = new OwlRlReasoner();

function makeStore(...quads: rdfjs.Quad[]) {
    const store = RdfStore.createDefault().asDataset();

    for (const q of quads) store.add(q);
    return store;
}

function infer(...quads: rdfjs.Quad[]) {
    return [...reasoner.infer(makeStore(...quads), [g])];
}

function hasTriple(quads: rdfjs.Quad[], s: string, pv: string, o: string) {
    return quads.some(q =>
        q.subject.value === s &&
        q.predicate.value === pv &&
        q.object.value === o
    );
}

const isInconsistent = (quads: rdfjs.Quad[]) =>
    hasTriple(quads, owlThing.value, rdfsSubClassOf.value, owlNothing.value);

describe('eq-sym', () => {
    it('x sameAs y → y sameAs x', () => {
        const result = infer(quad(A, sameAs, B, g));
        expect(hasTriple(result, B.value, sameAs.value, A.value)).toBe(true);
    });
});

describe('eq-rep-s', () => {
    it('x sameAs y, x p v → y p v', () => {
        const result = infer(
            quad(A, sameAs, B, g),
            quad(A, p, C, g),
        );
        expect(hasTriple(result, B.value, p.value, C.value)).toBe(true);
    });
});

describe('eq-rep-o', () => {
    it('x sameAs y, u p x → u p y', () => {
        const result = infer(
            quad(A, sameAs, B, g),
            quad(C, p, A, g),
        );
        expect(hasTriple(result, C.value, p.value, B.value)).toBe(true);
    });
});

describe('eq-trans', () => {
    it('x sameAs y, y sameAs z → x sameAs z', () => {
        const result = infer(
            quad(A, sameAs, B, g),
            quad(B, sameAs, C, g),
        );
        expect(hasTriple(result, A.value, sameAs.value, C.value)).toBe(true);
    });
});

describe('eq-diff1', () => {
    it('x sameAs y, x differentFrom y → inconsistency', () => {
        const result = infer(
            quad(A, sameAs, B, g),
            quad(A, diffFrom, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('x sameAs y, y differentFrom x → inconsistency', () => {
        const result = infer(
            quad(A, sameAs, B, g),
            quad(B, diffFrom, A, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });
});

describe('eq-diff2', () => {
    it('AllDifferent members list with a sameAs pair → inconsistency', () => {
        const list = blankNode('list');
        const tail = blankNode('tail');
        const result = infer(
            quad(blankNode('ad'), rdfType, allDiff, g),
            quad(blankNode('ad'), members, list, g),
            quad(list, rdfFirst, A, g),
            quad(list, rdfRest, tail, g),
            quad(tail, rdfFirst, B, g),
            quad(tail, rdfRest, rdfNil, g),
            quad(A, sameAs, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('AllDifferent with distinctMembers, sameAs pair → inconsistency', () => {
        const list = blankNode('dl');
        const tail = blankNode('dtail');
        const ad = blankNode('dad');
        const result = infer(
            quad(ad, rdfType, allDiff, g),
            quad(ad, distMembers, list, g),
            quad(list, rdfFirst, A, g),
            quad(list, rdfRest, tail, g),
            quad(tail, rdfFirst, B, g),
            quad(tail, rdfRest, rdfNil, g),
            quad(A, sameAs, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('AllDifferent with distinctMembers, reverse sameAs pair → inconsistency', () => {
        const list = blankNode('dl-rev');
        const tail = blankNode('dtail-rev');
        const ad = blankNode('dad-rev');
        const result = infer(
            quad(ad, rdfType, allDiff, g),
            quad(ad, distMembers, list, g),
            quad(list, rdfFirst, A, g),
            quad(list, rdfRest, tail, g),
            quad(tail, rdfFirst, B, g),
            quad(tail, rdfRest, rdfNil, g),
            quad(B, sameAs, A, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('AllDifferent with distinct members, no sameAs → no inconsistency', () => {
        const list = blankNode('ll');
        const tail = blankNode('lt');
        const ad = blankNode('lad');
        const result = infer(
            quad(ad, rdfType, allDiff, g),
            quad(ad, members, list, g),
            quad(list, rdfFirst, A, g),
            quad(list, rdfRest, tail, g),
            quad(tail, rdfFirst, B, g),
            quad(tail, rdfRest, rdfNil, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('walkList: single-element list (rdf:first, no rdf:rest) → no inconsistency', () => {
        // Covers walkList rests.size === 0 branch
        const list = blankNode('sl1');
        const ad = blankNode('sad1');
        const result = infer(
            quad(ad, rdfType, allDiff, g),
            quad(ad, members, list, g),
            quad(list, rdfFirst, A, g),
            // no rdf:rest triple → walkList returns [A], only 1 member → no pairs
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('walkList: empty list (no rdf:first on members node) → no inconsistency', () => {
        // Covers walkList firsts.size === 0 branch
        const emptyList = blankNode('el1');
        const ad = blankNode('ead1');
        const result = infer(
            quad(ad, rdfType, allDiff, g),
            quad(ad, members, emptyList, g),
            // emptyList has no rdf:first → walkList returns []
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('equalityJoin covers reverse sameAs lookup for allDifferent members', () => {
        const list = blankNode('direct-dl');
        const tail = blankNode('direct-dtail');
        const ad = blankNode('direct-ad');
        const index = new QuadIndex();

        for (const q of [
            quad(ad, rdfType, allDiff, g),
            quad(ad, distMembers, list, g),
            quad(list, rdfFirst, A, g),
            quad(list, rdfRest, tail, g),
            quad(tail, rdfFirst, B, g),
            quad(tail, rdfRest, rdfNil, g),
            quad(B, sameAs, A, g),
        ]) {
            index.add(q);
        }

        const results = [...equalityJoin(index)];
        expect(results.some(result => result.rule === 'eq-diff3')).toBe(true);
    });
});
