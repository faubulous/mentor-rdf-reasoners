/**
 * Tests for OWL 2 RL class expression rules (cls-*).
 */
import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { OwlRlReasoner } from '../../owl-rl/index.js';

const { namedNode, quad, blankNode, literal } = DataFactory;

const g = namedNode('urn:g');
const A = namedNode('urn:A');
const B = namedNode('urn:B');
const C = namedNode('urn:C');
const x = namedNode('urn:x');
const y = namedNode('urn:y');
const p = namedNode('urn:p');
const v = namedNode('urn:v');

const rdfType        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const rdfFirst       = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const rdfRest        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
const rdfNil         = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');
const rdfsSubClassOf = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const owlClass       = namedNode('http://www.w3.org/2002/07/owl#Class');
const owlThing       = namedNode('http://www.w3.org/2002/07/owl#Thing');
const owlNothing     = namedNode('http://www.w3.org/2002/07/owl#Nothing');
const owlSameAs      = namedNode('http://www.w3.org/2002/07/owl#sameAs');
const owlCompOf      = namedNode('http://www.w3.org/2002/07/owl#complementOf');
const owlInterOf     = namedNode('http://www.w3.org/2002/07/owl#intersectionOf');
const owlUniOf       = namedNode('http://www.w3.org/2002/07/owl#unionOf');
const owlOneOf       = namedNode('http://www.w3.org/2002/07/owl#oneOf');
const owlSvf         = namedNode('http://www.w3.org/2002/07/owl#someValuesFrom');
const owlAvf         = namedNode('http://www.w3.org/2002/07/owl#allValuesFrom');
const owlOnProp      = namedNode('http://www.w3.org/2002/07/owl#onProperty');
const owlHasValue    = namedNode('http://www.w3.org/2002/07/owl#hasValue');
const owlMaxCard     = namedNode('http://www.w3.org/2002/07/owl#maxCardinality');
const owlMaxQC       = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
const owlOnClass     = namedNode('http://www.w3.org/2002/07/owl#onClass');

const lit0 = literal('0', namedNode('http://www.w3.org/2001/XMLSchema#nonNegativeInteger'));
const lit1 = literal('1', namedNode('http://www.w3.org/2001/XMLSchema#nonNegativeInteger'));

const reasoner = new OwlRlReasoner();

function makeStore(...quads: rdfjs.Quad[]) {
    const store = RdfStore.createDefault().asDataset();

    for (const q of quads) store.add(q);
    return store;
}

function infer(...quads: rdfjs.Quad[]) {
    return [...reasoner.infer(makeStore(...quads), g)];
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

describe('cls-thing (axiomatic)', () => {
    it('scm-cls fires on owl:Thing axiom: owl:Thing subClassOf owl:Thing', () => {
        // owl:Thing type owl:Class is an axiom; scm-cls derives owl:Thing subClassOf owl:Thing
        const result = infer();
        expect(hasTriple(result, owlThing.value, rdfsSubClassOf.value, owlThing.value)).toBe(true);
    });

    it('scm-cls fires on owl:Nothing axiom: owl:Nothing subClassOf owl:Nothing', () => {
        const result = infer();
        expect(hasTriple(result, owlNothing.value, rdfsSubClassOf.value, owlNothing.value)).toBe(true);
    });
});

describe('cls-nothing2', () => {
    it('x type owl:Nothing → inconsistency', () => {
        const result = infer(quad(x, rdfType, owlNothing, g));
        expect(isInconsistent(result)).toBe(true);
    });
});

describe('cls-int1 / cls-int2', () => {
    it('cls-int1: A intersectionOf [B,C], x type B, x type C → x type A', () => {
        const l1 = blankNode('il1');
        const l2 = blankNode('il2');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, rdfType, B, g),
            quad(x, rdfType, C, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
    });

    it('cls-int1: missing one component type → x not inferred as type A', () => {
        const l1 = blankNode('il3');
        const l2 = blankNode('il4');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, rdfType, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(false);
    });

    it('cls-int2: A intersectionOf [B,C], x type A → x type B and x type C', () => {
        const l1 = blankNode('il5');
        const l2 = blankNode('il6');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, B.value)).toBe(true);
        expect(hasTriple(result, x.value, rdfType.value, C.value)).toBe(true);
    });
});

describe('cls-uni', () => {
    it('A unionOf [B,C], x type B → x type A', () => {
        const l1 = blankNode('ul1');
        const l2 = blankNode('ul2');
        const result = infer(
            quad(A, owlUniOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, rdfType, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('cls-svf1 / cls-svf2', () => {
    it('cls-svf1: R someValuesFrom B on p, x p y, y type B → x type R', () => {
        const R = blankNode('R');
        const result = infer(
            quad(R, owlSvf, B, g),
            quad(R, owlOnProp, p, g),
            quad(x, p, y, g),
            quad(y, rdfType, B, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, R.value)).toBe(true);
    });

    it('cls-svf2: R someValuesFrom owl:Thing on p, x p y → x type R', () => {
        const R = blankNode('R2');
        const result = infer(
            quad(R, owlSvf, owlThing, g),
            quad(R, owlOnProp, p, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, R.value)).toBe(true);
    });
});

describe('cls-avf', () => {
    it('R allValuesFrom B on p, x type R, x p y → y type B', () => {
        const R = blankNode('avfR');
        const result = infer(
            quad(R, owlAvf, B, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, y.value, rdfType.value, B.value)).toBe(true);
    });
});

describe('cls-hv1 / cls-hv2', () => {
    it('cls-hv1: R hasValue v on p, x type R → x p v', () => {
        const R = blankNode('hvR');
        const result = infer(
            quad(R, owlHasValue, v, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
        );
        expect(hasTriple(result, x.value, p.value, v.value)).toBe(true);
    });

    it('cls-hv2: R hasValue v on p, x p v → x type R', () => {
        const R = blankNode('hvR2');
        const result = infer(
            quad(R, owlHasValue, v, g),
            quad(R, owlOnProp, p, g),
            quad(x, p, v, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, R.value)).toBe(true);
    });
});

describe('cls-oo', () => {
    it('A oneOf [x, y] → x type A and y type A', () => {
        const l1 = blankNode('ool1');
        const l2 = blankNode('ool2');
        const result = infer(
            quad(A, owlOneOf, l1, g),
            quad(l1, rdfFirst, x, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, y, g),
            quad(l2, rdfRest, rdfNil, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
        expect(hasTriple(result, y.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('cls-com', () => {
    it('A complementOf B, x type A and x type B → inconsistency', () => {
        const result = infer(
            quad(A, owlCompOf, B, g),
            quad(x, rdfType, A, g),
            quad(x, rdfType, B, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('A complementOf B, x type A only → no inconsistency', () => {
        const result = infer(
            quad(A, owlCompOf, B, g),
            quad(x, rdfType, A, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('cls-maxc1', () => {
    it('R maxCardinality 0 on p, x type R, x p y → inconsistency', () => {
        const R = blankNode('mc0R');
        const result = infer(
            quad(R, owlMaxCard, lit0, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('R maxCardinality 0 on p, x type R, no p assertion → no inconsistency', () => {
        const R = blankNode('mc0R2');
        const result = infer(
            quad(R, owlMaxCard, lit0, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('cls-maxc2', () => {
    it('R maxCardinality 1 on p, x type R, x p y1, x p y2 → y1 sameAs y2', () => {
        const R = blankNode('mc1R');
        const result = infer(
            quad(R, owlMaxCard, lit1, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
            quad(x, p, v, g),
        );
        expect(
            hasTriple(result, y.value, owlSameAs.value, v.value) ||
            hasTriple(result, v.value, owlSameAs.value, y.value)
        ).toBe(true);
    });
});

describe('cls-maxqc1 / cls-maxqc2', () => {
    it('cls-maxqc1: R maxQualifiedCardinality 0 on d (d != owl:Thing), x type R, x p y, y type d → inconsistency', () => {
        const R = blankNode('mqc0R');
        const d = namedNode('urn:D');
        const owlMaxQC = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
        const owlOnClass = namedNode('http://www.w3.org/2002/07/owl#onClass');
        const result = infer(
            quad(R, owlMaxQC, lit0, g),
            quad(R, owlOnProp, p, g),
            quad(R, owlOnClass, d, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
            quad(y, rdfType, d, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('cls-maxqc2: R maxQualifiedCardinality 0 on owl:Thing, x type R, x p y → inconsistency', () => {
        const R = blankNode('mqc0RT');
        const owlMaxQC = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
        const owlOnClass = namedNode('http://www.w3.org/2002/07/owl#onClass');
        const result = infer(
            quad(R, owlMaxQC, lit0, g),
            quad(R, owlOnProp, p, g),
            quad(R, owlOnClass, owlThing, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('cls-maxqc1: qualified cardinality 0, y not typed as d → no inconsistency', () => {
        const R = blankNode('mqc0Rno');
        const d = namedNode('urn:D2');
        const owlMaxQC = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
        const owlOnClass = namedNode('http://www.w3.org/2002/07/owl#onClass');
        const result = infer(
            quad(R, owlMaxQC, lit0, g),
            quad(R, owlOnProp, p, g),
            quad(R, owlOnClass, d, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
            // y is NOT typed as d → rule does not fire
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('cls-maxqc3 / cls-maxqc4', () => {
    it('cls-maxqc3: R maxQualifiedCardinality 1 on d, x type R, x p y1, x p y2, y1/y2 type d → y1 sameAs y2', () => {
        const R = blankNode('mqc1R');
        const d = namedNode('urn:Dq');
        const owlMaxQC = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
        const owlOnClass = namedNode('http://www.w3.org/2002/07/owl#onClass');
        const result = infer(
            quad(R, owlMaxQC, lit1, g),
            quad(R, owlOnProp, p, g),
            quad(R, owlOnClass, d, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
            quad(x, p, v, g),
            quad(y, rdfType, d, g),
            quad(v, rdfType, d, g),
        );
        expect(
            hasTriple(result, y.value, owlSameAs.value, v.value) ||
            hasTriple(result, v.value, owlSameAs.value, y.value)
        ).toBe(true);
    });

    it('cls-maxqc4: R maxQualifiedCardinality 1 on owl:Thing, x type R, x p y1, x p y2 → y1 sameAs y2', () => {
        const R = blankNode('mqc1RT');
        const owlMaxQC = namedNode('http://www.w3.org/2002/07/owl#maxQualifiedCardinality');
        const owlOnClass = namedNode('http://www.w3.org/2002/07/owl#onClass');
        const result = infer(
            quad(R, owlMaxQC, lit1, g),
            quad(R, owlOnProp, p, g),
            quad(R, owlOnClass, owlThing, g),
            quad(x, rdfType, R, g),
            quad(x, p, y, g),
            quad(x, p, v, g),
        );
        expect(
            hasTriple(result, y.value, owlSameAs.value, v.value) ||
            hasTriple(result, v.value, owlSameAs.value, y.value)
        ).toBe(true);
    });
});

describe('cls-avf literal object guard', () => {
    it('R allValuesFrom d on p, x type R, x p "literal" → no type inferred for literal', () => {
        const R = blankNode('avfLit');
        const litVal = literal('hello');
        const result = infer(
            quad(R, owlAvf, B, g),
            quad(R, owlOnProp, p, g),
            quad(x, rdfType, R, g),
            quad(x, p, litVal, g),
        );
        // literal can't be a subject, so B type triple is not inferred for it
        expect(hasTriple(result, litVal.value, rdfType.value, B.value)).toBe(false);
    });
});

describe('cls-oo literal member guard', () => {
    it('A oneOf [x, "literal"] → x type A but literal member skipped', () => {
        const l1 = blankNode('ool3');
        const l2 = blankNode('ool4');
        const litMember = literal('42');
        const result = infer(
            quad(A, owlOneOf, l1, g),
            quad(l1, rdfFirst, x, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, litMember, g),
            quad(l2, rdfRest, rdfNil, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
        // literal cannot be a subject → no type triple for the literal value
        expect(hasTriple(result, litMember.value, rdfType.value, A.value)).toBe(false);
    });
});

describe('cls walkList edge cases', () => {
    it('cls-int2: single-element intersectionOf list (no rdf:rest) → member type derived', () => {
        // Covers walkList rests.size === 0 branch in class-semantics.ts
        const l1 = blankNode('wci1');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            // no rdf:rest → walkList returns [B]
            quad(x, rdfType, A, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, B.value)).toBe(true);
    });

    it('cls-uni: empty unionOf list (no rdf:first) → no subclass inferred', () => {
        // Covers walkList firsts.size === 0 branch in class-semantics.ts
        const empty = blankNode('wcu1');
        const result = infer(
            quad(A, owlUniOf, empty, g),
            // empty has no rdf:first → walkList returns []
        );
        // No union members → nothing derived
        expect(hasTriple(result, A.value, rdfType.value, A.value)).toBe(false);
    });

    it('cls-int1: empty intersectionOf list → no type inferred (components.length === 0)', () => {
        // Covers components.length === 0 guard in clsJoin cls-int1
        const empty = blankNode('wce1');
        const result = infer(
            quad(A, owlInterOf, empty, g),
            // empty list has no rdf:first → walkList returns [] → components.length === 0 → skip
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(false);
    });
});
