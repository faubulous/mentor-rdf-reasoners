/**
 * Tests for OWL 2 RL schema vocabulary rules (scm-*).
 */
import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { OwlRlReasoner } from '../../owl-rl/index.js';
import { schemaJoin } from './schema.js';
import { QuadIndex } from '../../quad-index.js';

const { namedNode, quad, blankNode } = DataFactory;

const g  = namedNode('urn:g');
const A  = namedNode('urn:A');
const B  = namedNode('urn:B');
const C  = namedNode('urn:C');
const p  = namedNode('urn:p');
const p2 = namedNode('urn:p2');
const p3 = namedNode('urn:p3');
const x  = namedNode('urn:x');

const rdfType        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const rdfFirst       = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const rdfRest        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
const rdfNil         = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');
const rdfsSubClassOf = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const rdfsSubPropOf  = namedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf');
const rdfsDomain     = namedNode('http://www.w3.org/2000/01/rdf-schema#domain');
const rdfsRange      = namedNode('http://www.w3.org/2000/01/rdf-schema#range');
const owlClass       = namedNode('http://www.w3.org/2002/07/owl#Class');
const owlObjProp     = namedNode('http://www.w3.org/2002/07/owl#ObjectProperty');
const owlDtProp      = namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty');
const owlThing       = namedNode('http://www.w3.org/2002/07/owl#Thing');
const owlNothing     = namedNode('http://www.w3.org/2002/07/owl#Nothing');
const owlEqClass     = namedNode('http://www.w3.org/2002/07/owl#equivalentClass');
const owlEqProp      = namedNode('http://www.w3.org/2002/07/owl#equivalentProperty');

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

describe('scm-cls', () => {
    it('A type owl:Class → A subClassOf A (reflexivity)', () => {
        const result = infer(quad(A, rdfType, owlClass, g));
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, A.value)).toBe(true);
    });

    it('A type owl:Class → A equivalentClass A', () => {
        const result = infer(quad(A, rdfType, owlClass, g));
        expect(hasTriple(result, A.value, owlEqClass.value, A.value)).toBe(true);
    });

    it('A type owl:Class → A subClassOf owl:Thing', () => {
        const result = infer(quad(A, rdfType, owlClass, g));
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, owlThing.value)).toBe(true);
    });

    it('A type owl:Class → owl:Nothing subClassOf A', () => {
        const result = infer(quad(A, rdfType, owlClass, g));
        expect(hasTriple(result, owlNothing.value, rdfsSubClassOf.value, A.value)).toBe(true);
    });
});

describe('scm-op', () => {
    it('p type owl:ObjectProperty → p subPropertyOf p', () => {
        const result = infer(quad(p, rdfType, owlObjProp, g));
        expect(hasTriple(result, p.value, rdfsSubPropOf.value, p.value)).toBe(true);
    });

    it('p type owl:ObjectProperty → p equivalentProperty p', () => {
        const result = infer(quad(p, rdfType, owlObjProp, g));
        expect(hasTriple(result, p.value, owlEqProp.value, p.value)).toBe(true);
    });
});

describe('scm-dp', () => {
    it('p type owl:DatatypeProperty → p subPropertyOf p', () => {
        const result = infer(quad(p, rdfType, owlDtProp, g));
        expect(hasTriple(result, p.value, rdfsSubPropOf.value, p.value)).toBe(true);
    });
});

describe('scm-eqc1 / scm-eqc2', () => {
    it('scm-eqc1: A equivalentClass B → A subClassOf B', () => {
        const result = infer(quad(A, owlEqClass, B, g));
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, B.value)).toBe(true);
    });

    it('scm-eqc1: A equivalentClass B → B subClassOf A', () => {
        const result = infer(quad(A, owlEqClass, B, g));
        expect(hasTriple(result, B.value, rdfsSubClassOf.value, A.value)).toBe(true);
    });

    it('scm-eqc2: A subClassOf B, B subClassOf A → A equivalentClass B', () => {
        const result = infer(
            quad(A, rdfsSubClassOf, B, g),
            quad(B, rdfsSubClassOf, A, g),
        );
        expect(hasTriple(result, A.value, owlEqClass.value, B.value)).toBe(true);
    });
});

describe('scm-eqp1 / scm-eqp2', () => {
    it('scm-eqp1: p equivalentProperty p2 → p subPropertyOf p2', () => {
        const result = infer(quad(p, owlEqProp, p2, g));
        expect(hasTriple(result, p.value, rdfsSubPropOf.value, p2.value)).toBe(true);
    });

    it('scm-eqp1: p equivalentProperty p2 → p2 subPropertyOf p', () => {
        const result = infer(quad(p, owlEqProp, p2, g));
        expect(hasTriple(result, p2.value, rdfsSubPropOf.value, p.value)).toBe(true);
    });

    it('scm-eqp2: p subPropertyOf p2, p2 subPropertyOf p → p equivalentProperty p2', () => {
        const result = infer(
            quad(p, rdfsSubPropOf, p2, g),
            quad(p2, rdfsSubPropOf, p, g),
        );
        expect(hasTriple(result, p.value, owlEqProp.value, p2.value)).toBe(true);
    });
});

describe('scm-sco (transitive subClassOf)', () => {
    it('A subClassOf B, B subClassOf C → A subClassOf C', () => {
        const result = infer(
            quad(A, rdfsSubClassOf, B, g),
            quad(B, rdfsSubClassOf, C, g),
        );
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, C.value)).toBe(true);
    });
});

describe('scm-spo (transitive subPropertyOf)', () => {
    it('p subPropertyOf p2, p2 subPropertyOf p3 → p subPropertyOf p3', () => {
        const result = infer(
            quad(p, rdfsSubPropOf, p2, g),
            quad(p2, rdfsSubPropOf, p3, g),
        );
        expect(hasTriple(result, p.value, rdfsSubPropOf.value, p3.value)).toBe(true);
    });
});

describe('scm-dom1 / scm-dom2', () => {
    it('scm-dom1: p domain A, A subClassOf B → p domain B', () => {
        const result = infer(
            quad(p, rdfsDomain, A, g),
            quad(A, rdfsSubClassOf, B, g),
        );
        expect(hasTriple(result, p.value, rdfsDomain.value, B.value)).toBe(true);
    });

    it('scm-dom2: p2 domain A, p subPropertyOf p2 → p domain A', () => {
        const result = infer(
            quad(p2, rdfsDomain, A, g),
            quad(p, rdfsSubPropOf, p2, g),
        );
        expect(hasTriple(result, p.value, rdfsDomain.value, A.value)).toBe(true);
    });
});

describe('scm-rng1 / scm-rng2', () => {
    it('scm-rng1: p range A, A subClassOf B → p range B', () => {
        const result = infer(
            quad(p, rdfsRange, A, g),
            quad(A, rdfsSubClassOf, B, g),
        );
        expect(hasTriple(result, p.value, rdfsRange.value, B.value)).toBe(true);
    });

    it('scm-rng2: p2 range A, p subPropertyOf p2 → p range A', () => {
        const result = infer(
            quad(p2, rdfsRange, A, g),
            quad(p, rdfsSubPropOf, p2, g),
        );
        expect(hasTriple(result, p.value, rdfsRange.value, A.value)).toBe(true);
    });
});

describe('scm-int', () => {
    it('A intersectionOf [B,C] → A subClassOf B and A subClassOf C', () => {
        const l1 = blankNode('sl1');
        const l2 = blankNode('sl2');
        const owlInterOf = namedNode('http://www.w3.org/2002/07/owl#intersectionOf');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
        );
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, B.value)).toBe(true);
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, C.value)).toBe(true);
    });
});

describe('scm-uni', () => {
    it('A unionOf [B,C] → B subClassOf A and C subClassOf A', () => {
        const l1 = blankNode('ul1');
        const l2 = blankNode('ul2');
        const owlUniOf = namedNode('http://www.w3.org/2002/07/owl#unionOf');
        const result = infer(
            quad(A, owlUniOf, l1, g),
            quad(l1, rdfFirst, B, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, C, g),
            quad(l2, rdfRest, rdfNil, g),
        );
        expect(hasTriple(result, B.value, rdfsSubClassOf.value, A.value)).toBe(true);
        expect(hasTriple(result, C.value, rdfsSubClassOf.value, A.value)).toBe(true);
    });
});

describe('scm-hv', () => {
    it('c1 hasValue v on p1, c2 hasValue v on p2, p1 subPropertyOf p2 → c1 subClassOf c2', () => {
        const c1 = blankNode('hvc1');
        const c2 = blankNode('hvc2');
        const v = namedNode('urn:v');
        const owlHasValue = namedNode('http://www.w3.org/2002/07/owl#hasValue');
        const owlOnProp   = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlHasValue, v, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlHasValue, v, g),
            quad(c2, owlOnProp, p2, g),
            quad(p, rdfsSubPropOf, p2, g),
        );
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value)).toBe(true);
    });
});

describe('scm-svf1 / scm-svf2', () => {
    it('scm-svf1: c1 someValuesFrom d on p, c2 someValuesFrom d on p → c1 subClassOf c2', () => {
        const c1 = blankNode('svfc1');
        const c2 = blankNode('svfc2');
        const d = namedNode('urn:D');
        const owlSvf    = namedNode('http://www.w3.org/2002/07/owl#someValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlSvf, d, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlSvf, d, g),
            quad(c2, owlOnProp, p, g),
        );
        // scm-svf1: same d and same p → mutual subClassOf
        expect(
            hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value) ||
            hasTriple(result, c2.value, rdfsSubClassOf.value, c1.value)
        ).toBe(true);
    });

    it('scm-svf2: c1 someValuesFrom d on p1, c2 someValuesFrom d on p2, p1 subPropertyOf p2 → c1 subClassOf c2', () => {
        const c1 = blankNode('svf2c1');
        const c2 = blankNode('svf2c2');
        const d = namedNode('urn:D2');
        const owlSvf    = namedNode('http://www.w3.org/2002/07/owl#someValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlSvf, d, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlSvf, d, g),
            quad(c2, owlOnProp, p2, g),
            quad(p, rdfsSubPropOf, p2, g),
        );
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value)).toBe(true);
    });
});

describe('scm-avf1 / scm-avf2', () => {
    it('scm-avf1: c1 allValuesFrom d1 on p, c2 allValuesFrom d2 on p, d1 subClassOf d2 → c1 subClassOf c2', () => {
        const c1 = blankNode('avfc1');
        const c2 = blankNode('avfc2');
        const d1 = namedNode('urn:D3');
        const d2 = namedNode('urn:D4');
        const owlAvf    = namedNode('http://www.w3.org/2002/07/owl#allValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlAvf, d1, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlAvf, d2, g),
            quad(c2, owlOnProp, p, g),
            quad(d1, rdfsSubClassOf, d2, g),
        );
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value)).toBe(true);
    });

    it('scm-avf1: c1 allValuesFrom d1 on p1 and d2 on p2 (different props) → no subClassOf (p1 !== p2 branch)', () => {
        // Covers the p1.value === p2.value ELSE branch in scm-avf1
        const c1 = blankNode('avf1_ep_c1');
        const c2 = blankNode('avf1_ep_c2');
        const d1 = namedNode('urn:D3b');
        const d2 = namedNode('urn:D4b');
        const owlAvf    = namedNode('http://www.w3.org/2002/07/owl#allValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlAvf, d1, g),
            quad(c1, owlOnProp, p, g),   // c1 uses p
            quad(c2, owlAvf, d2, g),
            quad(c2, owlOnProp, p2, g),  // c2 uses p2 (different)
            quad(d1, rdfsSubClassOf, d2, g),
            // p !== p2 → scm-avf1 condition false → no c1 subClassOf c2
        );
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value)).toBe(false);
    });

    it('scm-avf1: c1 and c2 have allValuesFrom same d → self-loop guard (c2.value === c1v continue)', () => {
        // When getSubjects(allValuesFrom, d2) returns c1 itself, the self-loop guard fires
        const c1 = blankNode('avf1_self_c1');
        const d1 = namedNode('urn:D3c');
        const d2 = namedNode('urn:D4c');
        const owlAvf    = namedNode('http://www.w3.org/2002/07/owl#allValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlAvf, d1, g),
            quad(c1, owlAvf, d2, g),  // c1 also has allValuesFrom d2
            quad(c1, owlOnProp, p, g),
            quad(d1, rdfsSubClassOf, d2, g),
            // getSubjects(allValuesFrom, d2) = {c1} = c1v → continue guard fires
        );
        // c1 should NOT be inferred to be a subClassOf itself via avf1
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c1.value)).toBe(false);
    });

    it('scm-avf2: c1 allValuesFrom d on p1, c2 allValuesFrom d on p2, p1 subPropertyOf p2 → c2 subClassOf c1', () => {
        const c1 = blankNode('avf2c1');
        const c2 = blankNode('avf2c2');
        const d = namedNode('urn:D5');
        const owlAvf    = namedNode('http://www.w3.org/2002/07/owl#allValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlAvf, d, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlAvf, d, g),
            quad(c2, owlOnProp, p2, g),
            quad(p, rdfsSubPropOf, p2, g),
        );
        // contravariant: p1 ⊑ p2 means c2 ⊑ c1
        expect(hasTriple(result, c2.value, rdfsSubClassOf.value, c1.value)).toBe(true);
    });
});

describe('scm walkList edge cases', () => {
    it('scm-int: single-element intersectionOf list (no rdf:rest) → A subClassOf B', () => {
        // Covers walkList rests.size === 0 branch in schema.ts
        const l1 = blankNode('wsl1');
        const owlInterOf = namedNode('http://www.w3.org/2002/07/owl#intersectionOf');
        const result = infer(
            quad(A, owlInterOf, l1, g),
            quad(l1, rdfFirst, B, g),
            // no rdf:rest → walkList returns [B]
        );
        expect(hasTriple(result, A.value, rdfsSubClassOf.value, B.value)).toBe(true);
    });

    it('scm-uni: empty unionOf list (no rdf:first) → no subClassOf inferred', () => {
        // Covers walkList firsts.size === 0 branch in schema.ts
        const empty = blankNode('wsl2');
        const owlUniOf = namedNode('http://www.w3.org/2002/07/owl#unionOf');
        const result = infer(
            quad(A, owlUniOf, empty, g),
        );
        // empty list → no members → no B/C subClassOf A inferred
        expect(hasTriple(result, B.value, rdfsSubClassOf.value, A.value)).toBe(false);
    });
});

describe('scm coverage edge cases', () => {
    it('no subClassOf triples → ?? [] fallback for scm-sco and scm-eqc2 loops', () => {
        // Must call scmJoin directly since OwlRlReasoner always injects subClassOf axioms
        const index = new QuadIndex();
        const result = [...schemaJoin(index)];
        expect(result.length).toBe(0);
    });

    it('scm-hv: c1 hasValue v on p1, c2 hasValue v on p2, but p1 === p2 → scm-svf1 p1===p2 false branch not exercised here', () => {
        // scm-svf1: the p1.value !== p2.value branch: two c nodes with same d but DIFFERENT properties
        const c1 = blankNode('svf1_diff_c1');
        const c2 = blankNode('svf1_diff_c2');
        const d  = namedNode('urn:D_diff');
        const owlSvf    = namedNode('http://www.w3.org/2002/07/owl#someValuesFrom');
        const owlOnProp = namedNode('http://www.w3.org/2002/07/owl#onProperty');
        const result = infer(
            quad(c1, owlSvf, d, g),
            quad(c1, owlOnProp, p, g),
            quad(c2, owlSvf, d, g),
            quad(c2, owlOnProp, p2, g),
            // p and p2 are different → scm-svf1 condition (p1.value === p2.value) is FALSE
            // so scm-svf1 yields nothing, but scm-svf2 would apply if p subPropertyOf p2
        );
        // p is NOT subPropertyOf p2 → no subClassOf inferred either way
        expect(
            hasTriple(result, c1.value, rdfsSubClassOf.value, c2.value) ||
            hasTriple(result, c2.value, rdfsSubClassOf.value, c1.value)
        ).toBe(false);
    });

    it('scm-sco: c1 subClassOf c2, c2 subClassOf c1 (self-loop) → c2 === c1v continue branch exercised', () => {
        // c1 ⊑ c2 and c2 ⊑ c1: getObjects(subClassOf, c2) includes c1 → c2.value === c1v → continue
        const c1 = namedNode('urn:SloopC1');
        const c2 = namedNode('urn:SloopC2');
        const result = infer(
            quad(c1, rdfsSubClassOf, c2, g),
            quad(c2, rdfsSubClassOf, c1, g),
        );
        // The transitivity should NOT produce c1 subClassOf c1 (the guard skips it)
        expect(hasTriple(result, c1.value, rdfsSubClassOf.value, c1.value)).toBe(false);
    });
});
