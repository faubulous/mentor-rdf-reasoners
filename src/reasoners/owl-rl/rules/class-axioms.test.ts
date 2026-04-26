/**
 * Tests for OWL 2 RL class axiom rules (cax-*).
 */
import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { OwlRlReasoner } from '../../owl-rl/index.js';

const { namedNode, quad, blankNode } = DataFactory;

const g = namedNode('urn:g');
const A = namedNode('urn:A');
const B = namedNode('urn:B');
const C = namedNode('urn:C');
const x = namedNode('urn:x');

const rdfType        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const rdfFirst       = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const rdfRest        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
const rdfNil         = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');
const rdfsSubClassOf = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const owlEqClass     = namedNode('http://www.w3.org/2002/07/owl#equivalentClass');
const owlDisjoint    = namedNode('http://www.w3.org/2002/07/owl#disjointWith');
const owlADC         = namedNode('http://www.w3.org/2002/07/owl#AllDisjointClasses');
const owlMembers     = namedNode('http://www.w3.org/2002/07/owl#members');
const owlThing       = namedNode('http://www.w3.org/2002/07/owl#Thing');
const owlNothing     = namedNode('http://www.w3.org/2002/07/owl#Nothing');

const reasoner = new OwlRlReasoner();

function makeStore(...quads: rdfjs.Quad[]) {
    const store = RdfStore.createDefault().asDataset();

    for (const q of quads) store.add(q);
    return store;
}

function infer(...quads: rdfjs.Quad[]) {
    return [...reasoner.expand(makeStore(...quads), g)];
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

describe('cax-sco', () => {
    it('x type A, A subClassOf B → x type B', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(A, rdfsSubClassOf, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, B.value)).toBe(true);
    });

    it('transitivity via subClassOf chain: x type A, A⊆B, B⊆C → x type C', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(A, rdfsSubClassOf, B, g),
            quad(B, rdfsSubClassOf, C, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, C.value)).toBe(true);
    });
});

describe('cax-eqc1 / cax-eqc2', () => {
    it('x type A, A equivalentClass B → x type B (cax-eqc1)', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(A, owlEqClass, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, B.value)).toBe(true);
    });

    it('x type B, A equivalentClass B → x type A (cax-eqc2)', () => {
        const result = infer(
            quad(x, rdfType, B, g),
            quad(A, owlEqClass, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('cax-dw', () => {
    it('x type A, x type B, A disjointWith B → inconsistency', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(x, rdfType, B, g),
            quad(A, owlDisjoint, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('x type A, x type B, B disjointWith A → inconsistency (symmetric lookup)', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(x, rdfType, B, g),
            quad(B, owlDisjoint, A, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('x type A only, A disjointWith B → no inconsistency', () => {
        const result = infer(
            quad(x, rdfType, A, g),
            quad(A, owlDisjoint, B, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('y type B only, A disjointWith B → no inconsistency (reverse lookup, no match)', () => {
        // Covers getSubjects(disjointWith, ov) ELSE branch (has(type, sv, c1) → false)
        const y = namedNode('urn:y');
        const result = infer(
            quad(y, rdfType, B, g),
            quad(A, owlDisjoint, B, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('cax-adc', () => {
    it('AllDisjointClasses {A,B,C}, x type A and B → inconsistency', () => {
        const l1 = blankNode('l1');
        const l2 = blankNode('l2');
        const l3 = blankNode('l3');
        const adc = blankNode('adc');
        const result = infer(
            quad(adc, rdfType, owlADC, g),
            quad(adc, owlMembers, l1, g),
            quad(l1, rdfFirst, A, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, B, g),
            quad(l2, rdfRest, l3, g),
            quad(l3, rdfFirst, C, g),
            quad(l3, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
            quad(x, rdfType, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('AllDisjointClasses {A,B,C}, x type A only → no inconsistency', () => {
        const l1 = blankNode('al1');
        const l2 = blankNode('al2');
        const l3 = blankNode('al3');
        const adc = blankNode('aadc');
        const result = infer(
            quad(adc, rdfType, owlADC, g),
            quad(adc, owlMembers, l1, g),
            quad(l1, rdfFirst, A, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, B, g),
            quad(l2, rdfRest, l3, g),
            quad(l3, rdfFirst, C, g),
            quad(l3, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('walkList: single-element members list (no rdf:rest) → no inconsistency', () => {
        // Covers walkList rests.size === 0 branch and members.length < 2 branch
        const l1 = blankNode('wl1');
        const adc = blankNode('wadc');
        const result = infer(
            quad(adc, rdfType, owlADC, g),
            quad(adc, owlMembers, l1, g),
            quad(l1, rdfFirst, A, g),
            // no rdf:rest → walkList returns [A], length < 2 → no inconsistency check
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('walkList: empty members list (no rdf:first) → no inconsistency', () => {
        // Covers walkList firsts.size === 0 branch and members.length < 2 branch
        const emptyList = blankNode('wl2');
        const adc = blankNode('wadc2');
        const result = infer(
            quad(adc, rdfType, owlADC, g),
            quad(adc, owlMembers, emptyList, g),
            // emptyList has no rdf:first → walkList returns [], length < 2 → skip
        );
        expect(isInconsistent(result)).toBe(false);
    });
});
