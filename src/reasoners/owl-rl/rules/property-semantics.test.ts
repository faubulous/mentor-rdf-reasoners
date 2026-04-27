/**
 * Tests for OWL 2 RL property semantics rules (prp-*).
 */
import { describe, it, expect } from 'vitest';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import type * as rdfjs from '@rdfjs/types';
import { OwlRlReasoner } from '../../owl-rl/index.js';
import { propertyJoin, propertySingleQuad } from './property-semantics.js';
import { QuadIndex } from '../../quad-index.js';

const { namedNode, quad, blankNode } = DataFactory;

const g = namedNode('urn:g');
const A = namedNode('urn:A');
const B = namedNode('urn:B');
const C = namedNode('urn:C');
const x = namedNode('urn:x');
const y = namedNode('urn:y');
const z = namedNode('urn:z');
const p = namedNode('urn:p');
const p2 = namedNode('urn:p2');
const q_ = namedNode('urn:q');

const rdfType        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const rdfFirst       = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
const rdfRest        = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
const rdfNil         = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil');
const rdfsDomain     = namedNode('http://www.w3.org/2000/01/rdf-schema#domain');
const rdfsRange      = namedNode('http://www.w3.org/2000/01/rdf-schema#range');
const rdfsSubPropOf  = namedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf');
const rdfsSubClassOf = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const owlSymmetric   = namedNode('http://www.w3.org/2002/07/owl#SymmetricProperty');
const owlAsymmetric  = namedNode('http://www.w3.org/2002/07/owl#AsymmetricProperty');
const owlTransitive  = namedNode('http://www.w3.org/2002/07/owl#TransitiveProperty');
const owlFunctional  = namedNode('http://www.w3.org/2002/07/owl#FunctionalProperty');
const owlInvFunctional = namedNode('http://www.w3.org/2002/07/owl#InverseFunctionalProperty');
const owlIrreflexive = namedNode('http://www.w3.org/2002/07/owl#IrreflexiveProperty');
const owlEqProp      = namedNode('http://www.w3.org/2002/07/owl#equivalentProperty');
const owlInverseOf   = namedNode('http://www.w3.org/2002/07/owl#inverseOf');
const owlDisjProp    = namedNode('http://www.w3.org/2002/07/owl#propertyDisjointWith');
const owlChain       = namedNode('http://www.w3.org/2002/07/owl#propertyChainAxiom');
const owlHasKey      = namedNode('http://www.w3.org/2002/07/owl#hasKey');
const owlSameAs      = namedNode('http://www.w3.org/2002/07/owl#sameAs');
const owlThing       = namedNode('http://www.w3.org/2002/07/owl#Thing');
const owlNothing     = namedNode('http://www.w3.org/2002/07/owl#Nothing');
const owlNPA         = namedNode('http://www.w3.org/2002/07/owl#NegativePropertyAssertion');
const owlSrcInd      = namedNode('http://www.w3.org/2002/07/owl#sourceIndividual');
const owlAssertProp  = namedNode('http://www.w3.org/2002/07/owl#assertionProperty');
const owlTgtInd      = namedNode('http://www.w3.org/2002/07/owl#targetIndividual');
const owlAnnotProp   = namedNode('http://www.w3.org/2002/07/owl#AnnotationProperty');

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

describe('prp-ap', () => {
    it('rdfs:label domain typing works because it is treated as an annotation property', () => {
        // prp-ap pre-loads rdfs:label as owl:AnnotationProperty so domain/range rules apply.
        // Here we directly assert a domain and verify prp-dom fires.
        const rdfsLabel = namedNode('http://www.w3.org/2000/01/rdf-schema#label');
        const result = infer(
            quad(rdfsLabel, rdfsDomain, A, g),
            quad(x, rdfsLabel, y, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('prp-dom', () => {
    it('p domain A, x p y → x type A', () => {
        const result = infer(
            quad(p, rdfsDomain, A, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, x.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('prp-rng', () => {
    it('p range A, x p y → y type A', () => {
        const result = infer(
            quad(p, rdfsRange, A, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, y.value, rdfType.value, A.value)).toBe(true);
    });
});

describe('prp-symp', () => {
    it('p type SymmetricProperty, x p y → y p x', () => {
        const result = infer(
            quad(p, rdfType, owlSymmetric, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, y.value, p.value, x.value)).toBe(true);
    });
});

describe('prp-asyp', () => {
    it('p type AsymmetricProperty, x p y, y p x → inconsistency', () => {
        const result = infer(
            quad(p, rdfType, owlAsymmetric, g),
            quad(x, p, y, g),
            quad(y, p, x, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('p type AsymmetricProperty, x p y only → no inconsistency', () => {
        const result = infer(
            quad(p, rdfType, owlAsymmetric, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('prp-irp', () => {
    it('p type IrreflexiveProperty, x p x → inconsistency', () => {
        const result = infer(
            quad(p, rdfType, owlIrreflexive, g),
            quad(x, p, x, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('p type IrreflexiveProperty, x p y (x≠y) → no inconsistency', () => {
        const result = infer(
            quad(p, rdfType, owlIrreflexive, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('prp-spo1', () => {
    it('p subPropertyOf q, x p y → x q y', () => {
        const result = infer(
            quad(p, rdfsSubPropOf, q_, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, x.value, q_.value, y.value)).toBe(true);
    });
});

describe('prp-eqp1 / prp-eqp2', () => {
    it('p1 equivalentProperty p2, x p1 y → x p2 y (eqp1)', () => {
        const result = infer(
            quad(p, owlEqProp, p2, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, x.value, p2.value, y.value)).toBe(true);
    });

    it('p1 equivalentProperty p2, x p2 y → x p1 y (eqp2)', () => {
        const result = infer(
            quad(p, owlEqProp, p2, g),
            quad(x, p2, y, g),
        );
        expect(hasTriple(result, x.value, p.value, y.value)).toBe(true);
    });
});

describe('prp-inv1 / prp-inv2', () => {
    it('p1 inverseOf p2, x p1 y → y p2 x', () => {
        const result = infer(
            quad(p, owlInverseOf, p2, g),
            quad(x, p, y, g),
        );
        expect(hasTriple(result, y.value, p2.value, x.value)).toBe(true);
    });

    it('p1 inverseOf p2, y p2 x → x p1 y', () => {
        const result = infer(
            quad(p, owlInverseOf, p2, g),
            quad(y, p2, x, g),
        );
        expect(hasTriple(result, x.value, p.value, y.value)).toBe(true);
    });
});

describe('prp-fp', () => {
    it('p type FunctionalProperty, x p y1, x p y2 → y1 sameAs y2', () => {
        const result = infer(
            quad(p, rdfType, owlFunctional, g),
            quad(x, p, y, g),
            quad(x, p, z, g),
        );
        expect(
            hasTriple(result, y.value, owlSameAs.value, z.value) ||
            hasTriple(result, z.value, owlSameAs.value, y.value)
        ).toBe(true);
    });

    it('p type FunctionalProperty, single value → no sameAs', () => {
        // Use propertyJoin directly so that eq-ref (now on by default) doesn't interfere.
        const index = new QuadIndex();
        index.add(quad(p, rdfType, owlFunctional, g));
        index.add(quad(x, p, y, g));
        const results = [...propertyJoin(index)];
        expect(results.some(r => r.rule === 'prp-fp')).toBe(false);
    });

    it('p type FunctionalProperty with reverse differentFrom evidence → different subjects become differentFrom', () => {
        const x1 = namedNode('urn:x1');
        const x2 = namedNode('urn:x2');
        const y1 = namedNode('urn:y1');
        const y2 = namedNode('urn:y2');
        const result = infer(
            quad(p, rdfType, owlFunctional, g),
            quad(y1, p, x1, g),
            quad(y2, p, x2, g),
            quad(x2, namedNode('http://www.w3.org/2002/07/owl#differentFrom'), x1, g),
        );

        expect(hasTriple(result, y1.value, 'http://www.w3.org/2002/07/owl#differentFrom', y2.value)).toBe(true);
    });
});

describe('prp-ifp', () => {
    it('p type InverseFunctionalProperty, y1 p x, y2 p x → y1 sameAs y2', () => {
        const result = infer(
            quad(p, rdfType, owlInvFunctional, g),
            quad(y, p, x, g),
            quad(z, p, x, g),
        );
        expect(
            hasTriple(result, y.value, owlSameAs.value, z.value) ||
            hasTriple(result, z.value, owlSameAs.value, y.value)
        ).toBe(true);
    });

    it('p type InverseFunctionalProperty with reverse differentFrom evidence → objects become differentFrom', () => {
        const x1 = namedNode('urn:ifp-x1');
        const x2 = namedNode('urn:ifp-x2');
        const y1 = namedNode('urn:ifp-y1');
        const y2 = namedNode('urn:ifp-y2');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        const result = infer(
            quad(p, rdfType, owlInvFunctional, g),
            quad(y1, p, x1, g),
            quad(y2, p, x2, g),
            quad(y2, owlDifferentFrom, y1, g),
        );

        expect(hasTriple(result, x1.value, owlDifferentFrom.value, x2.value)).toBe(true);
    });
});

describe('prp-trp', () => {
    it('p type TransitiveProperty, x p y, y p z → x p z', () => {
        const result = infer(
            quad(p, rdfType, owlTransitive, g),
            quad(x, p, y, g),
            quad(y, p, z, g),
        );
        expect(hasTriple(result, x.value, p.value, z.value)).toBe(true);
    });
});

describe('prp-pdw', () => {
    it('p1 propertyDisjointWith p2, x p1 y, x p2 y → inconsistency', () => {
        const result = infer(
            quad(p, owlDisjProp, p2, g),
            quad(x, p, y, g),
            quad(x, p2, y, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('p1 propertyDisjointWith p2, x p1 y only → no inconsistency', () => {
        const result = infer(
            quad(p, owlDisjProp, p2, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('prp-spo2 (property chain)', () => {
    it('p propertyChainAxiom [p1,p2], x p1 y, y p2 z → x p z', () => {
        const list1 = blankNode('cl1');
        const list2 = blankNode('cl2');
        const p1 = namedNode('urn:p1');
        const result = infer(
            quad(p, owlChain, list1, g),
            quad(list1, rdfFirst, p1, g),
            quad(list1, rdfRest, list2, g),
            quad(list2, rdfFirst, p2, g),
            quad(list2, rdfRest, rdfNil, g),
            quad(x, p1, y, g),
            quad(y, p2, z, g),
        );
        expect(hasTriple(result, x.value, p.value, z.value)).toBe(true);
    });
});

describe('prp-key', () => {
    it('A hasKey [p], x type A, y type A, x p v, y p v → x sameAs y', () => {
        const list = blankNode('kl');
        const v = namedNode('urn:v');
        const result = infer(
            quad(A, owlHasKey, list, g),
            quad(list, rdfFirst, p, g),
            quad(list, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
            quad(y, rdfType, A, g),
            quad(x, p, v, g),
            quad(y, p, v, g),
        );
        expect(
            hasTriple(result, x.value, owlSameAs.value, y.value) ||
            hasTriple(result, y.value, owlSameAs.value, x.value)
        ).toBe(true);
    });

    it('A hasKey [p], different key values → no sameAs', () => {
        const list = blankNode('kl2');
        const v1 = namedNode('urn:v1');
        const v2 = namedNode('urn:v2');
        const result = infer(
            quad(A, owlHasKey, list, g),
            quad(list, rdfFirst, p, g),
            quad(list, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
            quad(y, rdfType, A, g),
            quad(x, p, v1, g),
            quad(y, p, v2, g),
        );
        expect(hasTriple(result, x.value, owlSameAs.value, y.value)).toBe(false);
        expect(hasTriple(result, y.value, owlSameAs.value, x.value)).toBe(false);
    });
});

describe('prp-npa1', () => {
    it('NegativePropertyAssertion(x p y), x p y → inconsistency', () => {
        const npa = blankNode('npa');
        const result = infer(
            quad(npa, rdfType, owlNPA, g),
            quad(npa, owlSrcInd, x, g),
            quad(npa, owlAssertProp, p, g),
            quad(npa, owlTgtInd, y, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('NegativePropertyAssertion(x p y) without the actual triple → no inconsistency', () => {
        const npa = blankNode('npa2');
        const result = infer(
            quad(npa, rdfType, owlNPA, g),
            quad(npa, owlSrcInd, x, g),
            quad(npa, owlAssertProp, p, g),
            quad(npa, owlTgtInd, y, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });
});

describe('prp-npa2', () => {
    it('NegativePropertyAssertion(x p v^^literal), x p v → inconsistency', () => {
        const npa = blankNode('npa3');
        const owlTgtVal = namedNode('http://www.w3.org/2002/07/owl#targetValue');
        const litVal = namedNode('urn:litVal');
        const result = infer(
            quad(npa, rdfType, owlNPA, g),
            quad(npa, owlSrcInd, x, g),
            quad(npa, owlAssertProp, p, g),
            quad(npa, owlTgtVal, litVal, g),
            quad(x, p, litVal, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });
});

describe('prp-adp (AllDisjointProperties)', () => {
    it('AllDisjointProperties {p, p2}, x p y and x p2 y → inconsistency', () => {
        const owlADP = namedNode('http://www.w3.org/2002/07/owl#AllDisjointProperties');
        const owlMembers = namedNode('http://www.w3.org/2002/07/owl#members');
        const adp = blankNode('adp');
        const l1 = blankNode('adpl1');
        const l2 = blankNode('adpl2');
        const result = infer(
            quad(adp, rdfType, owlADP, g),
            quad(adp, owlMembers, l1, g),
            quad(l1, rdfFirst, p, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, p2, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, p, y, g),
            quad(x, p2, y, g),
        );
        expect(isInconsistent(result)).toBe(true);
    });

    it('AllDisjointProperties {p, p2}, x p y only → no inconsistency', () => {
        const owlADP = namedNode('http://www.w3.org/2002/07/owl#AllDisjointProperties');
        const owlMembers = namedNode('http://www.w3.org/2002/07/owl#members');
        const adp = blankNode('adp2');
        const l1 = blankNode('adpl3');
        const l2 = blankNode('adpl4');
        const result = infer(
            quad(adp, rdfType, owlADP, g),
            quad(adp, owlMembers, l1, g),
            quad(l1, rdfFirst, p, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, p2, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, p, y, g),
        );
        expect(isInconsistent(result)).toBe(false);
    });

    it('AllDisjointProperties with distinct blank-node objects → infer differentFrom between blanks', () => {
        const owlADP = namedNode('http://www.w3.org/2002/07/owl#AllDisjointProperties');
        const adp = blankNode('adp-blanks');
        const l1 = blankNode('adp-blanks-l1');
        const l2 = blankNode('adp-blanks-l2');
        const b1 = blankNode('b1');
        const b2 = blankNode('b2');
        const result = infer(
            quad(adp, rdfType, owlADP, g),
            quad(adp, namedNode('http://www.w3.org/2002/07/owl#members'), l1, g),
            quad(l1, rdfFirst, p, g),
            quad(l1, rdfRest, l2, g),
            quad(l2, rdfFirst, p2, g),
            quad(l2, rdfRest, rdfNil, g),
            quad(x, p, b1, g),
            quad(x, p2, b2, g),
        );

        expect(hasTriple(result, b1.value, 'http://www.w3.org/2002/07/owl#differentFrom', b2.value)).toBe(true);
    });
});

describe('prp-pdw distinct blank-node objects', () => {
    it('p1 propertyDisjointWith p2, x p1 _:b1, x p2 _:b2 → infer differentFrom between blanks', () => {
        const b1 = blankNode('pdw-b1');
        const b2 = blankNode('pdw-b2');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        const result = infer(
            quad(p, owlDisjProp, p2, g),
            quad(x, p, b1, g),
            quad(x, p2, b2, g),
        );

        expect(hasTriple(result, b1.value, owlDifferentFrom.value, b2.value)).toBe(true);
    });
});

describe('prp-rflx blank node subject', () => {
    it('blank node typed owl:Thing with reflexive property → infer blank self-triple', () => {
        const reflexiveProperty = namedNode('urn:reflexive');
        const instance = blankNode('thing-bn');
        const result = infer(
            quad(reflexiveProperty, rdfType, namedNode('http://www.w3.org/2002/07/owl#ReflexiveProperty'), g),
            quad(instance, rdfType, owlThing, g),
        );

        expect(hasTriple(result, instance.value, reflexiveProperty.value, instance.value)).toBe(true);
    });

    it('literal typed as owl:Thing is ignored by the prp-rflx subject guard in propertySingleQuad', () => {
        const reflexiveProperty = namedNode('urn:reflexive-literal');
        const lit = DataFactory.literal('not-a-node');
        const index = new QuadIndex();

        index.add(quad(reflexiveProperty, rdfType, namedNode('http://www.w3.org/2002/07/owl#ReflexiveProperty'), g));

        const result = [...propertySingleQuad(quad(lit as unknown as rdfjs.Quad_Subject, rdfType, owlThing, g), index)];

        expect(result.some(entry => entry.rule === 'prp-rflx')).toBe(false);
    });
});

describe('prp-pdw non-node object guard', () => {
    it('p1 propertyDisjointWith p2 with two distinct literals does not infer differentFrom', () => {
        const lit1 = DataFactory.literal('l1');
        const lit2 = DataFactory.literal('l2');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        // Use propertyJoin directly: prp-pdw guards against emitting differentFrom for literal objects.
        const index = new QuadIndex();
        index.add(quad(p, owlDisjProp, p2, g));
        index.add(quad(x, p, lit1, g));
        index.add(quad(x, p2, lit2, g));
        const results = [...propertyJoin(index)];
        expect(results.some(r =>
            r.rule === 'prp-pdw' &&
            r.quad.predicate.value === owlDifferentFrom.value,
        )).toBe(false);
    });
});

describe('prp-adp non-node object guard', () => {
    it('AllDisjointProperties with two distinct literals does not infer differentFrom', () => {
        const owlADP = namedNode('http://www.w3.org/2002/07/owl#AllDisjointProperties');
        const adp = blankNode('adp-lit');
        const l1 = blankNode('adp-lit-l1');
        const l2 = blankNode('adp-lit-l2');
        const lit1 = DataFactory.literal('lit-a');
        const lit2 = DataFactory.literal('lit-b');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        // Use propertyJoin directly: prp-adp guards against emitting differentFrom for literal objects.
        const index = new QuadIndex();
        const owlMembers = namedNode('http://www.w3.org/2002/07/owl#members');
        index.add(quad(adp, rdfType, owlADP, g));
        index.add(quad(adp, owlMembers, l1, g));
        index.add(quad(l1, rdfFirst, p, g));
        index.add(quad(l1, rdfRest, l2, g));
        index.add(quad(l2, rdfFirst, p2, g));
        index.add(quad(l2, rdfRest, rdfNil, g));
        index.add(quad(x, p, lit1, g));
        index.add(quad(x, p2, lit2, g));
        const results = [...propertyJoin(index)];
        expect(results.some(r =>
            r.rule === 'prp-adp' &&
            r.quad.predicate.value === owlDifferentFrom.value,
        )).toBe(false);
    });
});

describe('prp-rng literal object guard', () => {
    it('p range A, x p "literal" → literal not typed as A', () => {
        const litVal = DataFactory.literal('hello');
        const result = infer(
            quad(p, rdfsRange, A, g),
            quad(x, p, litVal, g),
        );
        expect(hasTriple(result, litVal.value, rdfType.value, A.value)).toBe(false);
    });
});

describe('prp-symp literal object guard', () => {
    it('p type SymmetricProperty, x p "literal" → no symmetric triple', () => {
        const litVal = DataFactory.literal('hello');
        const result = infer(
            quad(p, rdfType, owlSymmetric, g),
            quad(x, p, litVal, g),
        );
        // literal cannot be a subject → no symmetric triple
        expect(hasTriple(result, litVal.value, p.value, x.value)).toBe(false);
    });
});

describe('prp-inv literal object guard', () => {
    it('p1 inverseOf p2, x p1 "literal" → no inverse triple', () => {
        const litVal = DataFactory.literal('hello');
        const result = infer(
            quad(p, owlInverseOf, p2, g),
            quad(x, p, litVal, g),
        );
        expect(hasTriple(result, litVal.value, p2.value, x.value)).toBe(false);
    });

    it('p1 inverseOf p2, x p2 "literal" → no inverse triple', () => {
        const litVal = DataFactory.literal('world');
        const result = infer(
            quad(p, owlInverseOf, p2, g),
            quad(x, p2, litVal, g),
        );
        expect(hasTriple(result, litVal.value, p.value, x.value)).toBe(false);
    });
});

describe('prp-spo2 short chain guard', () => {
    it('p propertyChainAxiom [p1] (single-element chain) → no inference', () => {
        // Covers chain.length < 2 branch
        const list = blankNode('scl1');
        const p1 = namedNode('urn:p1');
        const result = infer(
            quad(p, owlChain, list, g),
            quad(list, rdfFirst, p1, g),
            // no rdf:rest → chain.length === 1 < 2 → skip
            quad(x, p1, y, g),
        );
        expect(hasTriple(result, x.value, p.value, y.value)).toBe(false);
    });
});

describe('prp-key missing key value guard', () => {
    it('A hasKey [p], x type A, y type A, x p v but y has no p value → no sameAs', () => {
        // Covers allKeysMatch xVals.size===0 || yVals.size===0 branch
        const list = blankNode('kl3');
        const v = namedNode('urn:v');
        const result = infer(
            quad(A, owlHasKey, list, g),
            quad(list, rdfFirst, p, g),
            quad(list, rdfRest, rdfNil, g),
            quad(x, rdfType, A, g),
            quad(y, rdfType, A, g),
            quad(x, p, v, g),
            // y has NO p value at all → allKeysMatch returns false
        );
        expect(hasTriple(result, x.value, owlSameAs.value, y.value)).toBe(false);
        expect(hasTriple(result, y.value, owlSameAs.value, x.value)).toBe(false);
    });
});

describe('prp walkList edge cases', () => {
    it('prp-spo2: single-element list (no rdf:rest) → walkList covers rests===0 branch', () => {
        // This test is redundant with short-chain test but directly exercises walkList
        const list = blankNode('wpl1');
        const p1 = namedNode('urn:wp1');
        const result = infer(
            quad(p, owlChain, list, g),
            quad(list, rdfFirst, p1, g),
            // no rdf:rest → walkList returns [p1], chain.length < 2 → no output
        );
        expect(hasTriple(result, x.value, p.value, y.value)).toBe(false);
    });

    it('prp-key: empty key list (no rdf:first) → walkList covers firsts===0 branch', () => {
        const emptyList = blankNode('wpl2');
        const result = infer(
            quad(A, owlHasKey, emptyList, g),
            // emptyList has no rdf:first → walkList returns [] → no key props → allKeysMatch trivially true
            quad(x, rdfType, A, g),
            quad(y, rdfType, A, g),
        );
        // With empty key list, allKeysMatch vacuously returns true → x sameAs y
        expect(
            hasTriple(result, x.value, owlSameAs.value, y.value) ||
            hasTriple(result, y.value, owlSameAs.value, x.value)
        ).toBe(true);
    });
});

describe('prp coverage edge cases', () => {
    it('no rdf:type triples → ?? [] fallback for all RDF.type join loops', () => {
        // Covers byPredSubj.get(RDF.type) ?? [] right side for prp-fp/ifp/trp/asyp/npa1
        // Must call prpJoin directly because OwlRlReasoner always loads axioms (type triples)
        const index = new QuadIndex();
        const result = [...propertyJoin(index)];
        expect(result.length).toBe(0);
    });

    it('FP/IFP/TRP/ASYP typed but never used as predicate → bySubj/byObj null guards fire', () => {
        // Covers if(!bySubj) for prp-fp/trp/asyp and if(!byObj) for prp-ifp
        const result = infer(
            quad(p, rdfType, owlFunctional, g),
            quad(p, rdfType, owlInvFunctional, g),
            quad(p, rdfType, owlTransitive, g),
            quad(p, rdfType, owlAsymmetric, g),
        );
        // p typed but never used as predicate → no sameAs or inconsistency inferred
        expect(hasTriple(result, x.value, owlSameAs.value, y.value)).toBe(false);
    });

    it('prp-fp: two objects with same value but different termType → no sameAs (equal values guard)', () => {
        // Covers arr[i].value !== arr[j].value ELSE branch for prp-fp
        const sv = 'sameval';
        // Use propertyJoin directly so eq-ref (now on by default) does not produce the reflexive sameAs.
        const index = new QuadIndex();
        index.add(quad(p, rdfType, owlFunctional, g));
        index.add(quad(x, p, namedNode(sv), g));
        index.add(quad(x, p, DataFactory.blankNode(sv), g));
        const results = [...propertyJoin(index)];
        expect(results.some(r => r.rule === 'prp-fp')).toBe(false);
    });

    it('prp-ifp: two subjects with same value but different termType → no sameAs (equal values guard)', () => {
        // Covers arr[i].value !== arr[j].value ELSE branch for prp-ifp
        const sv = 'sameval2';
        // Use propertyJoin directly so eq-ref (now on by default) does not produce the reflexive sameAs.
        const index = new QuadIndex();
        index.add(quad(p, rdfType, owlInvFunctional, g));
        index.add(quad(namedNode(sv), p, y, g));
        index.add(quad(DataFactory.blankNode(sv), p, y, g));
        const results = [...propertyJoin(index)];
        expect(results.some(r => r.rule === 'prp-ifp')).toBe(false);
    });

    it('prp-trp: x p y, y p x → self-loop x p x guarded (z.value === xv branch)', () => {
        // Covers if(z.value !== xv) ELSE branch for prp-trp
        const result = infer(
            quad(p, rdfType, owlTransitive, g),
            quad(x, p, y, g),
            quad(y, p, x, g),
        );
        // x→y→x would produce x p x, but the self-loop guard prevents it
        expect(hasTriple(result, x.value, p.value, x.value)).toBe(false);
    });

    it('prp-pdw: p1 propertyDisjointWith p2 but p1 never used as predicate → bySubjP1 null guard', () => {
        // Covers if(!bySubjP1) continue for prp-pdw
        const result = infer(
            quad(p, owlDisjProp, p2, g),
            // p is declared disjoint with p2 but no x p y triples exist → bySubjP1 = null
        );
        // no inconsistency since p is never used
        const isInconsistent = hasTriple(result, owlThing.value, rdfsSubClassOf.value, owlNothing.value);
        expect(isInconsistent).toBe(false);
    });

    it('prp-adp: AllDisjointProperties with member never used as predicate → bySubjP1 null guard', () => {
        // Covers if(!bySubjP1) continue for prp-adp
        const owlADP = namedNode('http://www.w3.org/2002/07/owl#AllDisjointProperties');
        const owlMembers = namedNode('http://www.w3.org/2002/07/owl#members');
        const adp = blankNode('adp_null');
        const l1 = blankNode('adp_null_l1');
        const l2 = blankNode('adp_null_l2');
        const result = infer(
            quad(adp, rdfType, owlADP, g),
            quad(adp, owlMembers, l1, g),
            quad(l1, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'), p, g),
            quad(l1, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'), l2, g),
            quad(l2, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'), p2, g),
            quad(l2, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'), namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'), g),
            // p and p2 are members but neither is used as a predicate → bySubjP1 = null
        );
        // no inconsistency since neither p nor p2 is used as a predicate
        const isInconsistent = hasTriple(result, owlThing.value, rdfsSubClassOf.value, owlNothing.value);
        expect(isInconsistent).toBe(false);
    });

    it('prp-spo2: chain declared but chain[0] never used as predicate → ?? new Map() fallback', () => {
        // Covers byPredSubj.get(chain[0].value) ?? new Map() right side for prp-spo2
        const l1 = blankNode('spo2_null_l1');
        const l2 = blankNode('spo2_null_l2');
        const q1 = namedNode('urn:q1');
        const q2 = namedNode('urn:q2');
        const result = infer(
            quad(p, owlChain, l1, g),
            quad(l1, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'), q1, g),
            quad(l1, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'), l2, g),
            quad(l2, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first'), q2, g),
            quad(l2, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'), namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'), g),
            quad(x, q2, y, g),
            // q1 is in the chain but never used as predicate → ?? new Map() fallback
        );
        expect(hasTriple(result, x.value, p.value, y.value)).toBe(false);
    });

    it('prp-npa1: NPA targetValue declared but triple not in index → if(has) ELSE branch', () => {
        // Covers if(index.has(ap, src, tv)) ELSE branch for prp-npa1 targetValue check
        const npa = blankNode('npa_nomatch');
        const owlTgtVal = namedNode('http://www.w3.org/2002/07/owl#targetValue');
        const litVal = DataFactory.literal('secret');
        const result = infer(
            quad(npa, rdfType, owlNPA, g),
            quad(npa, owlSrcInd, x, g),
            quad(npa, owlAssertProp, p, g),
            quad(npa, owlTgtVal, litVal, g),
            // x p "secret" is NOT asserted → no inconsistency
        );
        const isInconsistent = hasTriple(result, owlThing.value, rdfsSubClassOf.value, owlNothing.value);
        expect(isInconsistent).toBe(false);
    });

    it('propertyJoin covers reverse differentFrom lookup for functional-property contrapositive', () => {
        const x1 = namedNode('urn:direct-x1');
        const x2 = namedNode('urn:direct-x2');
        const y1 = namedNode('urn:direct-y1');
        const y2 = namedNode('urn:direct-y2');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        const index = new QuadIndex();

        for (const q of [
            quad(p, rdfType, owlFunctional, g),
            quad(y1, p, x1, g),
            quad(y2, p, x2, g),
            quad(x2, owlDifferentFrom, x1, g),
        ]) {
            index.add(q);
        }

        const result = [...propertyJoin(index)];
        expect(hasTriple(result.map(entry => entry.quad), y1.value, owlDifferentFrom.value, y2.value)).toBe(true);
    });

    it('propertyJoin covers reverse differentFrom lookup for inverse-functional contrapositive', () => {
        const x1 = namedNode('urn:direct-ifp-x1');
        const x2 = namedNode('urn:direct-ifp-x2');
        const y1 = namedNode('urn:direct-ifp-y1');
        const y2 = namedNode('urn:direct-ifp-y2');
        const owlDifferentFrom = namedNode('http://www.w3.org/2002/07/owl#differentFrom');
        const index = new QuadIndex();

        for (const q of [
            quad(p, rdfType, owlInvFunctional, g),
            quad(y1, p, x1, g),
            quad(y2, p, x2, g),
            quad(y2, owlDifferentFrom, y1, g),
        ]) {
            index.add(q);
        }

        const result = [...propertyJoin(index)];
        expect(hasTriple(result.map(entry => entry.quad), x1.value, owlDifferentFrom.value, x2.value)).toBe(true);
    });

    it('propertyJoin covers functional-property contrapositive fallthrough when no differentFrom triple exists', () => {
        const index = new QuadIndex();

        for (const q of [
            quad(p, rdfType, owlFunctional, g),
            quad(namedNode('urn:null-y1'), p, namedNode('urn:null-x1'), g),
            quad(namedNode('urn:null-y2'), p, namedNode('urn:null-x2'), g),
        ]) {
            index.add(q);
        }

        const result = [...propertyJoin(index)];
        expect(result.some(entry => entry.rule === 'prp-fp-dif')).toBe(false);
    });

    it('propertyJoin covers inverse-functional contrapositive fallthrough when no differentFrom triple exists', () => {
        const index = new QuadIndex();

        for (const q of [
            quad(p, rdfType, owlInvFunctional, g),
            quad(namedNode('urn:null-ifp-y1'), p, namedNode('urn:null-ifp-x1'), g),
            quad(namedNode('urn:null-ifp-y2'), p, namedNode('urn:null-ifp-x2'), g),
        ]) {
            index.add(q);
        }

        const result = [...propertyJoin(index)];
        expect(result.some(entry => entry.rule === 'prp-ifp-dif')).toBe(false);
    });
});
