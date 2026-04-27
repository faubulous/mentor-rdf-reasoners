/**
 * OWL 2 RL — Table 5: Property semantics rules (prp-*)
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 5 — https://www.w3.org/TR/owl2-profiles/#tab-rules-properties
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { TripleIndex } from '../../triple-index.js';
import { infer, type InferenceResult } from '../../inference-result.js';
import { RDF, RDFS, OWL, rdf, rdfs, owl } from '../vocabulary.js';

const { namedNode } = DataFactory;

// Built-in annotation properties (prp-ap)
// @see https://www.w3.org/TR/owl2-profiles/#tab-rules-properties
const BUILTIN_ANNOTATION_PROPERTIES = [
    RDFS.label, RDFS.comment, RDFS.seeAlso, RDFS.isDefinedBy,
    OWL.deprecated, OWL.versionInfo, OWL.priorVersion,
    OWL.backwardCompatibleWith, OWL.incompatibleWith,
];

function makeTriple(subject: rdfjs.Quad_Subject, predicate: rdfjs.Quad_Predicate, object: rdfjs.Quad_Object): rdfjs.Quad {
    return DataFactory.quad(subject, predicate, object);
}

/**
 * Single-quad property rules that fire once per incoming quad.
 *
 * Rules applied:
 * - prp-dom:  p domain c, x p y  →  x type c
 * - prp-rng:  p range c, x p y  →  y type c
 * - prp-symp: p type SymmetricProperty, x p y  →  y p x
 * - prp-spo1: p1 subPropertyOf p2, x p1 y  →  x p2 y
 * - prp-eqp1: p1 equivalentProperty p2, x p1 y  →  x p2 y
 * - prp-eqp2: p1 equivalentProperty p2, x p2 y  →  x p1 y
 * - prp-inv1: p1 inverseOf p2, x p1 y  →  y p2 x
 * - prp-inv2: p1 inverseOf p2, x p2 y  →  y p1 x
 * - prp-irp:  p type IrreflexiveProperty, x p x  →  inconsistency
 *
 * Rules prp-npa1 and prp-npa2 are handled as join rules in {@link propertyJoin}.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-properties
 */
export function* propertySingleQuad(quad: rdfjs.Quad, index: TripleIndex): Iterable<InferenceResult> {
    const { subject, predicate, object } = quad;
    const predicateIri = predicate.value;
    const subjectIri   = subject.value;
    const objectIri    = object.value;

    // prp-dom: p domain c, x p y → x type c
    for (const domainClass of index.getObjects(RDFS.domain, predicateIri)) {
        yield infer(
            makeTriple(subject, rdf.type, domainClass),
            'prp-dom',
            quad,
            makeTriple(predicate, namedNode(RDFS.domain), domainClass),
        );
    }

    // prp-rng: p range c, x p y → y type c
    for (const rangeClass of index.getObjects(RDFS.range, predicateIri)) {
        if (object.termType === 'NamedNode' || object.termType === 'BlankNode') {
            yield infer(
                makeTriple(object as rdfjs.Quad_Subject, rdf.type, rangeClass),
                'prp-rng',
                quad,
                makeTriple(predicate, namedNode(RDFS.range), rangeClass),
            );
        }
    }

    // prp-symp: p type SymmetricProperty, x p y → y p x
    if (index.has(RDF.type, predicateIri, OWL.SymmetricProperty)) {
        if (object.termType === 'NamedNode' || object.termType === 'BlankNode') {
            yield infer(
                makeTriple(object as rdfjs.Quad_Subject, predicate, subject as rdfjs.Quad_Object),
                'prp-symp',
                quad,
                makeTriple(predicate, rdf.type, namedNode(OWL.SymmetricProperty)),
            );
        }
    }

    // prp-spo1: p1 subPropertyOf p2, x p1 y → x p2 y
    for (const superProperty of index.getObjects(RDFS.subPropertyOf, predicateIri)) {
        yield infer(
            makeTriple(subject, namedNode(superProperty.value), object),
            'prp-spo1',
            quad,
            makeTriple(predicate, namedNode(RDFS.subPropertyOf), superProperty),
        );
    }

    // prp-eqp1/2: p1 equivalentProperty p2, x p1 y → x p2 y (and vice versa)
    for (const equivalentProperty of index.getObjects(OWL.equivalentProperty, predicateIri)) {
        yield infer(
            makeTriple(subject, namedNode(equivalentProperty.value), object),
            'prp-eqp1',
            quad,
            makeTriple(predicate, namedNode(OWL.equivalentProperty), equivalentProperty),
        );
    }

    for (const equivalentProperty of index.getSubjects(OWL.equivalentProperty, predicateIri)) {
        yield infer(
            makeTriple(subject, equivalentProperty as rdfjs.Quad_Predicate, object),
            'prp-eqp2',
            quad,
            makeTriple(equivalentProperty as rdfjs.Quad_Subject, namedNode(OWL.equivalentProperty), predicate),
        );
    }

    // prp-inv1: p1 inverseOf p2, x p1 y → y p2 x
    for (const inverseProperty of index.getObjects(OWL.inverseOf, predicateIri)) {
        if (object.termType === 'NamedNode' || object.termType === 'BlankNode') {
            yield infer(
                makeTriple(object as rdfjs.Quad_Subject, namedNode(inverseProperty.value), subject as rdfjs.Quad_Object),
                'prp-inv1',
                quad,
                makeTriple(predicate, namedNode(OWL.inverseOf), inverseProperty),
            );
        }
    }

    // prp-inv2: p1 inverseOf p2, x p2 y → y p1 x
    for (const inverseProperty of index.getSubjects(OWL.inverseOf, predicateIri)) {
        if (object.termType === 'NamedNode' || object.termType === 'BlankNode') {
            yield infer(
                makeTriple(object as rdfjs.Quad_Subject, inverseProperty as rdfjs.Quad_Predicate, subject as rdfjs.Quad_Object),
                'prp-inv2',
                quad,
                makeTriple(inverseProperty as rdfjs.Quad_Subject, namedNode(OWL.inverseOf), predicate),
            );
        }
    }

    // prp-irp: p type IrreflexiveProperty, x p x → inconsistency
    if (subjectIri === objectIri && index.has(RDF.type, predicateIri, OWL.IrreflexiveProperty)) {
        yield infer(
            makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
            'prp-irp',
            quad,
            makeTriple(predicate, rdf.type, namedNode(OWL.IrreflexiveProperty)),
        );
    }

    // prp-rflx: p type ReflexiveProperty, x type owl:Thing → x p x
    if (predicateIri === RDF.type) {
        if (objectIri === OWL.Thing) {
            for (const reflexiveProp of index.getSubjects(RDF.type, OWL.ReflexiveProperty)) {
                if (subject.termType === 'NamedNode' || subject.termType === 'BlankNode') {
                    yield infer(
                        makeTriple(subject, reflexiveProp as rdfjs.Quad_Predicate, subject as rdfjs.Quad_Object),
                        'prp-rflx',
                        quad,
                        makeTriple(reflexiveProp as rdfjs.Quad_Subject, rdf.type, namedNode(OWL.ReflexiveProperty)),
                    );
                }
            }
        }

        if (objectIri === OWL.ReflexiveProperty) {
            for (const thing of index.getSubjects(RDF.type, OWL.Thing)) {
                yield infer(
                    makeTriple(thing as rdfjs.Quad_Subject, subject as rdfjs.Quad_Predicate, thing as rdfjs.Quad_Object),
                    'prp-rflx',
                    quad,
                    makeTriple(thing as rdfjs.Quad_Subject, rdf.type, namedNode(OWL.Thing)),
                );
            }
        }
    }

    // prp-npa1: _x assertionProperty p, _x sourceIndividual s, _x targetIndividual o, s p o → inconsistency
    // prp-npa2: _x assertionProperty p, _x sourceIndividual s, _x targetValue v, s p v → inconsistency
    // These are handled more efficiently as join rules.
}

/**
 * Join-based property rules that require scanning the full index.
 *
 * Rules applied:
 * - prp-fp:    p FunctionalProperty, x p y1, x p y2  →  y1 sameAs y2
 * - prp-fp-dif: p FunctionalProperty, Y1 p X1, Y2 p X2, X1 differentFrom X2  →  Y1 differentFrom Y2
 * - prp-ifp:   p InverseFunctionalProperty, y1 p x, y2 p x  →  y1 sameAs y2
 * - prp-ifp-dif: p InverseFunctionalProperty, Y1 p X1, Y2 p X2, Y1 differentFrom Y2  →  X1 differentFrom X2
 * - prp-trp:   p TransitiveProperty, x p y, y p z  →  x p z
 * - prp-asyp:  p AsymmetricProperty, x p y, y p x  →  inconsistency
 * - prp-pdw:   p1 propertyDisjointWith p2, x p1 y, x p2 y  →  inconsistency
 * - prp-adp:   AllDisjointProperties members list, x p1 y, x p2 y  →  inconsistency
 * - prp-spo2:  p propertyChainAxiom list, chain steps  →  direct triple
 * - scm-chain-trans: p propertyChainAxiom [p, p]  →  p type TransitiveProperty
 * - prp-key:   c hasKey list, x type c, y type c, all key values equal  →  x sameAs y
 * - prp-npa1:  NegativePropertyAssertion + matching triple  →  inconsistency
 * - prp-npa2:  NegativePropertyAssertion + matching data value  →  inconsistency
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-properties
 */
export function* propertyJoin(index: TripleIndex): Iterable<InferenceResult> {
    // prp-fp: p FunctionalProperty, x p y1, x p y2 → y1 sameAs y2
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.FunctionalProperty)) continue;

        const bySubject = index.byPredSubj.get(propertyIri);

        if (!bySubject) continue;

        for (const [subjectIri, objects] of bySubject) {
            const objectArray = [...objects];

            for (let i = 0; i < objectArray.length; i++) {
                for (let j = i + 1; j < objectArray.length; j++) {
                    if (objectArray[i].value !== objectArray[j].value) {
                        // dt-diff: if both are literals they denote distinct values → inconsistency
                        const firstAssertion = makeTriple(namedNode(subjectIri), namedNode(propertyIri), objectArray[i]);
                        const secondAssertion = makeTriple(namedNode(subjectIri), namedNode(propertyIri), objectArray[j]);

                        if (objectArray[i].termType === 'Literal' && objectArray[j].termType === 'Literal') {
                            yield infer(
                                makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                'dt-diff',
                                makeTriple(namedNode(propertyIri), rdf.type, namedNode(OWL.FunctionalProperty)),
                                firstAssertion,
                                secondAssertion,
                            );
                        } else {
                            yield infer(
                                makeTriple(objectArray[i] as rdfjs.Quad_Subject, owl.sameAs, objectArray[j]),
                                'prp-fp',
                                makeTriple(namedNode(propertyIri), rdf.type, namedNode(OWL.FunctionalProperty)),
                                firstAssertion,
                                secondAssertion,
                            );
                        }
                    }
                }
            }
        }
    }

    // prp-fp contrapositive: p FunctionalProperty, Y1 p X1, Y2 p X2, X1 differentFrom X2 → Y1 differentFrom Y2
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.FunctionalProperty)) continue;

        const bySubject = index.byPredSubj.get(propertyIri);

        if (!bySubject) continue;

        const entries = [...bySubject.entries()];

        for (let i = 0; i < entries.length; i++) {
            const [y1Iri, x1Set] = entries[i];

            for (let j = i + 1; j < entries.length; j++) {
                const [y2Iri, x2Set] = entries[j];

                for (const x1 of x1Set) {
                    for (const x2 of x2Set) {
                        const diffTriple = index.has(OWL.differentFrom, x1.value, x2.value)
                            ? makeTriple(x1 as rdfjs.Quad_Subject, owl.differentFrom, x2)
                            : index.has(OWL.differentFrom, x2.value, x1.value)
                                ? makeTriple(x2 as rdfjs.Quad_Subject, owl.differentFrom, x1)
                                : null;

                        if (diffTriple) {
                            yield infer(
                                makeTriple(namedNode(y1Iri), owl.differentFrom, namedNode(y2Iri)),
                                'prp-fp-dif',
                                makeTriple(namedNode(propertyIri), rdf.type, namedNode(OWL.FunctionalProperty)),
                                makeTriple(namedNode(y1Iri), namedNode(propertyIri), x1),
                                makeTriple(namedNode(y2Iri), namedNode(propertyIri), x2),
                                diffTriple,
                            );
                        }
                    }
                }
            }
        }
    }

    // prp-ifp: p InverseFunctionalProperty, y1 p x, y2 p x → y1 sameAs y2
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.InverseFunctionalProperty)) continue;

        const byObject = index.byPredObj.get(propertyIri);

        if (!byObject) continue;

        for (const [objectIri, subjects] of byObject) {
            const subjectArray = [...subjects];
            const firstSubject = subjectArray[0] as rdfjs.Quad_Subject;
            const objectTerm = [...index.getObjects(propertyIri, firstSubject.value)].find(obj => obj.value === objectIri) as rdfjs.Quad_Object;

            for (let i = 0; i < subjectArray.length; i++) {
                for (let j = i + 1; j < subjectArray.length; j++) {
                    yield infer(
                        makeTriple(subjectArray[i] as rdfjs.Quad_Subject, owl.sameAs, subjectArray[j] as rdfjs.Quad_Object),
                        'prp-ifp',
                        makeTriple(subjectArray[i] as rdfjs.Quad_Subject, namedNode(propertyIri), objectTerm),
                        makeTriple(subjectArray[j] as rdfjs.Quad_Subject, namedNode(propertyIri), objectTerm),
                    );
                }
            }
        }
    }

    // prp-trp: p TransitiveProperty, x p y, y p z → x p z
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.TransitiveProperty)) continue;

        const bySubject = index.byPredSubj.get(propertyIri);

        if (!bySubject) continue;

        const propertyTerm = namedNode(propertyIri);

        for (const [subjectIri, intermediates] of bySubject) {
            const subjectTerm = namedNode(subjectIri);

            for (const intermediate of intermediates) {
                for (const transitiveTarget of index.getObjects(propertyIri, intermediate.value)) {
                    if (transitiveTarget.value !== subjectIri) {
                        yield infer(
                            makeTriple(subjectTerm, propertyTerm, transitiveTarget),
                            'prp-trp',
                            makeTriple(subjectTerm, propertyTerm, intermediate),
                            makeTriple(intermediate as rdfjs.Quad_Subject, propertyTerm, transitiveTarget),
                        );
                    }
                }
            }
        }
    }

    // prp-asyp: p AsymmetricProperty, x p y, y p x → inconsistency
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.AsymmetricProperty)) continue;

        const bySubject = index.byPredSubj.get(propertyIri);

        if (!bySubject) continue;

        for (const [subjectIri, objects] of bySubject) {
            for (const object of objects) {
                if (index.has(propertyIri, object.value, subjectIri)) {
                    yield infer(
                        makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                        'prp-asyp',
                        makeTriple(namedNode(subjectIri), namedNode(propertyIri), object),
                        makeTriple(object as rdfjs.Quad_Subject, namedNode(propertyIri), namedNode(subjectIri)),
                    );
                }
            }
        }
    }

    // prp-pdw: p1 propertyDisjointWith p2, x p1 y, x p2 z
    //   → inconsistency if y = z (same object in both relations)
    //   → y differentFrom z if y ≠ z (objects in disjoint relations must be distinct)
    for (const [firstPropertyIri, disjointProperties] of index.byPredSubj.get(OWL.propertyDisjointWith) ?? []) {
        for (const disjointProperty of disjointProperties) {
            const secondPropertyIri = disjointProperty.value;
            const bySubjectForFirst = index.byPredSubj.get(firstPropertyIri);

            if (!bySubjectForFirst) continue;

            for (const [subjectIri, firstObjects] of bySubjectForFirst) {
                const secondObjects = index.byPredSubj.get(secondPropertyIri)?.get(subjectIri);

                if (!secondObjects) continue;

                for (const firstObject of firstObjects) {
                    for (const secondObject of secondObjects) {
                        if (firstObject.value === secondObject.value) {
                            yield infer(
                                makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                'prp-pdw',
                                makeTriple(namedNode(firstPropertyIri), namedNode(OWL.propertyDisjointWith), namedNode(secondPropertyIri)),
                                makeTriple(namedNode(subjectIri), namedNode(firstPropertyIri), firstObject),
                                makeTriple(namedNode(subjectIri), namedNode(secondPropertyIri), secondObject),
                            );
                        } else if (
                            (firstObject.termType === 'NamedNode' || firstObject.termType === 'BlankNode') &&
                            (secondObject.termType === 'NamedNode' || secondObject.termType === 'BlankNode')
                        ) {
                            yield infer(
                                makeTriple(firstObject as rdfjs.Quad_Subject, owl.differentFrom, secondObject),
                                'prp-pdw',
                                makeTriple(namedNode(firstPropertyIri), namedNode(OWL.propertyDisjointWith), namedNode(secondPropertyIri)),
                                makeTriple(namedNode(subjectIri), namedNode(firstPropertyIri), firstObject),
                                makeTriple(namedNode(subjectIri), namedNode(secondPropertyIri), secondObject),
                            );
                        }
                    }
                }
            }
        }
    }

    // prp-adp: AllDisjointProperties members list
    for (const [allDisjointIri, listHeadNodes] of index.byPredSubj.get(OWL.members) ?? []) {
        if (!index.has(RDF.type, allDisjointIri, OWL.AllDisjointProperties)) continue;

        for (const listHeadNode of listHeadNodes) {
            const memberProperties = walkRdfList(listHeadNode.value, index);

            for (let i = 0; i < memberProperties.length; i++) {
                for (let j = i + 1; j < memberProperties.length; j++) {
                    const firstPropertyIri  = memberProperties[i].value;
                    const secondPropertyIri = memberProperties[j].value;
                    const bySubjectForFirst = index.byPredSubj.get(firstPropertyIri);

                    if (!bySubjectForFirst) continue;

                    for (const [subjectIri, firstObjects] of bySubjectForFirst) {
                        const secondObjects = index.byPredSubj.get(secondPropertyIri)?.get(subjectIri);

                        if (!secondObjects) continue;

                        for (const firstObject of firstObjects) {
                            for (const secondObject of secondObjects) {
                                if (firstObject.value === secondObject.value) {
                                    yield infer(
                                        makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                        'prp-adp',
                                        makeTriple(namedNode(allDisjointIri), rdf.type, namedNode(OWL.AllDisjointProperties)),
                                        makeTriple(namedNode(allDisjointIri), namedNode(OWL.members), listHeadNode),
                                        makeTriple(namedNode(subjectIri), namedNode(firstPropertyIri), firstObject),
                                        makeTriple(namedNode(subjectIri), namedNode(secondPropertyIri), secondObject),
                                    );
                                } else if (
                                    (firstObject.termType === 'NamedNode' || firstObject.termType === 'BlankNode') &&
                                    (secondObject.termType === 'NamedNode' || secondObject.termType === 'BlankNode')
                                ) {
                                    yield infer(
                                        makeTriple(firstObject as rdfjs.Quad_Subject, owl.differentFrom, secondObject),
                                        'prp-adp',
                                        makeTriple(namedNode(allDisjointIri), rdf.type, namedNode(OWL.AllDisjointProperties)),
                                        makeTriple(namedNode(allDisjointIri), namedNode(OWL.members), listHeadNode),
                                        makeTriple(namedNode(subjectIri), namedNode(firstPropertyIri), firstObject),
                                        makeTriple(namedNode(subjectIri), namedNode(secondPropertyIri), secondObject),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // prp-ifp contrapositive: p InverseFunctionalProperty, Y1 p X1, Y2 p X2, Y1 differentFrom Y2 → X1 differentFrom X2
    for (const [propertyIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, propertyIri, OWL.InverseFunctionalProperty)) continue;

        const byObject = index.byPredObj.get(propertyIri);

        if (!byObject) continue;

        const entries = [...byObject.entries()];

        for (let i = 0; i < entries.length; i++) {
            const [x1Iri, y1Set] = entries[i];

            for (let j = i + 1; j < entries.length; j++) {
                const [x2Iri, y2Set] = entries[j];

                for (const y1 of y1Set) {
                    for (const y2 of y2Set) {
                        const diffTriple = index.has(OWL.differentFrom, y1.value, y2.value)
                            ? makeTriple(y1 as rdfjs.Quad_Subject, owl.differentFrom, y2)
                            : index.has(OWL.differentFrom, y2.value, y1.value)
                                ? makeTriple(y2 as rdfjs.Quad_Subject, owl.differentFrom, y1)
                                : null;

                        if (diffTriple) {
                            yield infer(
                                makeTriple(namedNode(x1Iri), owl.differentFrom, namedNode(x2Iri)),
                                'prp-ifp-dif',
                                makeTriple(y1 as rdfjs.Quad_Subject, namedNode(propertyIri), namedNode(x1Iri)),
                                makeTriple(y2 as rdfjs.Quad_Subject, namedNode(propertyIri), namedNode(x2Iri)),
                                diffTriple,
                            );
                        }
                    }
                }
            }
        }
    }

    // prp-spo2: p propertyChainAxiom list, chain steps → direct triple
    for (const [propertyIri, listHeadNodes] of index.byPredSubj.get(OWL.propertyChainAxiom) ?? []) {
        const propertyTerm = namedNode(propertyIri);

        for (const listHeadNode of listHeadNodes) {
            const chainProperties = walkRdfList(listHeadNode.value, index);

            if (chainProperties.length < 2) continue;

            for (const start of (index.byPredSubj.get(chainProperties[0].value) ?? new Map())) {
                const [startSubjectIri] = start as [string, Set<rdfjs.Quad_Object>];
                const reachableEnds = followPropertyChainWithPath(startSubjectIri, chainProperties.map(chainProperty => chainProperty.value), 0, index);

                for (const { endIri, path } of reachableEnds) {
                    yield infer(
                        makeTriple(namedNode(startSubjectIri), propertyTerm, namedNode(endIri)),
                        'prp-spo2',
                        makeTriple(namedNode(propertyIri), namedNode(OWL.propertyChainAxiom), listHeadNode),
                        ...path,
                    );
                }
            }
        }
    }

    // scm-chain-trans: p propertyChainAxiom [p, p] → p rdf:type owl:TransitiveProperty
    for (const [propertyIri, listHeadNodes] of index.byPredSubj.get(OWL.propertyChainAxiom) ?? []) {
        for (const listHeadNode of listHeadNodes) {
            const chain = walkRdfList(listHeadNode.value, index);

            if (chain.length === 2 && chain[0].value === propertyIri && chain[1].value === propertyIri) {
                yield infer(
                    makeTriple(namedNode(propertyIri), rdf.type, owl.TransitiveProperty),
                    'scm-chain-trans',
                    makeTriple(namedNode(propertyIri), namedNode(OWL.propertyChainAxiom), listHeadNode),
                );
            }
        }
    }

    // prp-key: c hasKey list, x type c, y type c, all key values equal → x sameAs y
    for (const [classIri, listHeadNodes] of index.byPredSubj.get(OWL.hasKey) ?? []) {
        for (const listHeadNode of listHeadNodes) {
            const keyProperties = walkRdfList(listHeadNode.value, index).map(keyProperty => keyProperty.value);
            const instances     = [...(index.getSubjects(RDF.type, classIri))];

            for (let i = 0; i < instances.length; i++) {
                for (let j = i + 1; j < instances.length; j++) {
                    const firstInstanceIri  = instances[i].value;
                    const secondInstanceIri = instances[j].value;

                    if (allKeyValuesMatch(firstInstanceIri, secondInstanceIri, keyProperties, index)) {
                        yield infer(
                            makeTriple(namedNode(firstInstanceIri), owl.sameAs, namedNode(secondInstanceIri)),
                            'prp-key',
                            makeTriple(namedNode(classIri), namedNode(OWL.hasKey), listHeadNode),
                            makeTriple(namedNode(firstInstanceIri), rdf.type, namedNode(classIri)),
                            makeTriple(namedNode(secondInstanceIri), rdf.type, namedNode(classIri)),
                        );
                    }
                }
            }
        }
    }

    // prp-npa1: NegativePropertyAssertion + actual triple → inconsistency
    for (const [assertionIri] of index.byPredSubj.get(RDF.type) ?? []) {
        if (!index.has(RDF.type, assertionIri, OWL.NegativePropertyAssertion)) continue;

        for (const sourceIndividual of index.getObjects(OWL.sourceIndividual, assertionIri)) {
            for (const assertionProperty of index.getObjects(OWL.assertionProperty, assertionIri)) {
                for (const targetIndividual of index.getObjects(OWL.targetIndividual, assertionIri)) {
                    if (index.has(assertionProperty.value, sourceIndividual.value, targetIndividual.value)) {
                        yield infer(
                            makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                            'prp-npa1',
                            makeTriple(namedNode(assertionIri), rdf.type, namedNode(OWL.NegativePropertyAssertion)),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.sourceIndividual), sourceIndividual),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.assertionProperty), assertionProperty),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.targetIndividual), targetIndividual),
                            makeTriple(sourceIndividual as rdfjs.Quad_Subject, assertionProperty as rdfjs.Quad_Predicate, targetIndividual),
                        );
                    }
                }

                for (const targetValue of index.getObjects(OWL.targetValue, assertionIri)) {
                    if (index.has(assertionProperty.value, sourceIndividual.value, targetValue.value)) {
                        yield infer(
                            makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                            'prp-npa2',
                            makeTriple(namedNode(assertionIri), rdf.type, namedNode(OWL.NegativePropertyAssertion)),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.sourceIndividual), sourceIndividual),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.assertionProperty), assertionProperty),
                            makeTriple(namedNode(assertionIri), namedNode(OWL.targetValue), targetValue),
                            makeTriple(sourceIndividual as rdfjs.Quad_Subject, assertionProperty as rdfjs.Quad_Predicate, targetValue),
                        );
                    }
                }
            }
        }
    }
}

/**
 * Yield axiomatic type triples for OWL 2 RL built-in annotation properties (prp-ap).
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-properties
 */
export function* propertyAxioms(): Iterable<rdfjs.Quad> {
    for (const uri of BUILTIN_ANNOTATION_PROPERTIES) {
        yield DataFactory.quad(namedNode(uri), rdf.type, owl.AnnotationProperty);
    }
    // owl:differentFrom is declared symmetric in the OWL 2 meta-ontology.
    // This lets prp-symp automatically derive symmetry of differentFrom.
    yield DataFactory.quad(owl.differentFrom, rdf.type, owl.SymmetricProperty);
}

function walkRdfList(listHeadIri: string, index: TripleIndex): rdfjs.Quad_Object[] {
    const firstNodes = index.getObjects(RDF.first, listHeadIri);

    if (firstNodes.size === 0) return [];

    const [first] = firstNodes;
    const restNodes = index.getObjects(RDF.rest, listHeadIri);

    if (restNodes.size === 0) return [first];

    const [rest] = restNodes;

    if (rest.value === RDF.nil) return [first];

    return [first, ...walkRdfList(rest.value, index)];
}

function* followPropertyChainWithPath(
    currentIri: string,
    chainPropertyIris: string[],
    step: number,
    index: TripleIndex,
    path: rdfjs.Quad[] = [],
): Iterable<{ endIri: string; path: rdfjs.Quad[] }> {
    if (step === chainPropertyIris.length - 1) {
        // Last step: yield each reachable end node with full chain evidence.
        for (const end of index.getObjects(chainPropertyIris[step], currentIri)) {
            yield {
                endIri: end.value,
                path: [...path, makeTriple(namedNode(currentIri), namedNode(chainPropertyIris[step]), end)],
            };
        }

        return;
    }

    for (const next of index.getObjects(chainPropertyIris[step], currentIri)) {
        yield* followPropertyChainWithPath(
            next.value,
            chainPropertyIris,
            step + 1,
            index,
            [...path, makeTriple(namedNode(currentIri), namedNode(chainPropertyIris[step]), next)],
        );
    }
}

function allKeyValuesMatch(firstInstanceIri: string, secondInstanceIri: string, keyPropertyIris: string[], index: TripleIndex): boolean {
    for (const keyPropertyIri of keyPropertyIris) {
        const firstValues  = index.getObjects(keyPropertyIri, firstInstanceIri);
        const secondValues = index.getObjects(keyPropertyIri, secondInstanceIri);

        if (firstValues.size === 0 || secondValues.size === 0) return false;

        let matched = false;

        for (const firstValue of firstValues) {
            for (const secondValue of secondValues) {
                if (firstValue.value === secondValue.value) {
                    matched = true;
                    break;
                }
            }

            if (matched) break;
        }

        if (!matched) return false;
    }

    return true;
}
