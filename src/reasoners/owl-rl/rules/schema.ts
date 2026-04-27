/**
 * OWL 2 RL — Table 9: Schema vocabulary rules (scm-*)
 *
 * Implements rules scm-cls, scm-op, scm-dp, scm-eqc1/2, scm-eqp1/2, scm-sco, scm-spo,
 * scm-dom1/2, scm-rng1/2, scm-hv, scm-svf1/2, scm-avf1/2, scm-int, scm-uni.
 *
 * These rules exclusively operate on the schema (TBox) and propagate subclass/subproperty
 * relationships, domain/range constraints, and restriction-based subsumption.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 9 — https://www.w3.org/TR/owl2-profiles/#tab-rules-schema
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { QuadIndex } from '../../quad-index.js';
import { infer, type InferenceResult } from '../../inference-result.js';
import { RDF, RDFS, OWL, rdf, rdfs, owl } from '../vocabulary.js';

const { namedNode } = DataFactory;

function makeTriple(subject: rdfjs.Quad_Subject, predicate: rdfjs.Quad_Predicate, object: rdfjs.Quad_Object): rdfjs.Quad {
    return DataFactory.quad(subject, predicate, object);
}

/**
 * Single-quad schema rules that fire once per incoming quad.
 *
 * Rules applied:
 * - scm-cls: c type owl:Class  →  c subClassOf c, c equivalentClass c, c subClassOf owl:Thing,
 *            owl:Nothing subClassOf c
 * - scm-op:  p type owl:ObjectProperty  →  p subPropertyOf p, p equivalentProperty p
 * - scm-dp:  p type owl:DatatypeProperty  →  p subPropertyOf p, p equivalentProperty p
 * - scm-eqc1: c1 equivalentClass c2  →  c1 subClassOf c2 AND c2 subClassOf c1
 * - scm-eqp1: p1 equivalentProperty p2  →  p1 subPropertyOf p2 AND p2 subPropertyOf p1
 * - scm-int:  c intersectionOf list  →  c subClassOf each component
 * - scm-uni:  c unionOf list  →  each component subClassOf c
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-schema
 */
export function* schemaSingleQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult> {
    const { subject, predicate, object } = quad;
    const predicateIri = predicate.value;

    // scm-cls: every owl:Class gets reflexive subClassOf/equivalentClass + bounds
    if (predicateIri === RDF.type && object.value === OWL.Class) {
        yield infer(makeTriple(subject, rdfs.subClassOf, subject as rdfjs.Quad_Object), 'scm-cls', quad);
        yield infer(makeTriple(subject, owl.equivalentClass, subject as rdfjs.Quad_Object), 'scm-cls', quad);
        yield infer(makeTriple(subject, rdfs.subClassOf, owl.Thing), 'scm-cls', quad);
        yield infer(makeTriple(owl.Nothing, rdfs.subClassOf, subject as rdfjs.Quad_Object), 'scm-cls', quad);
    }

    // scm-op: every owl:ObjectProperty gets reflexive subPropertyOf/equivalentProperty
    if (predicateIri === RDF.type && object.value === OWL.ObjectProperty) {
        yield infer(makeTriple(subject, rdfs.subPropertyOf, subject as rdfjs.Quad_Object), 'scm-op', quad);
        yield infer(makeTriple(subject, owl.equivalentProperty, subject as rdfjs.Quad_Object), 'scm-op', quad);
    }

    // scm-dp: every owl:DatatypeProperty gets reflexive subPropertyOf/equivalentProperty
    if (predicateIri === RDF.type && object.value === OWL.DatatypeProperty) {
        yield infer(makeTriple(subject, rdfs.subPropertyOf, subject as rdfjs.Quad_Object), 'scm-dp', quad);
        yield infer(makeTriple(subject, owl.equivalentProperty, subject as rdfjs.Quad_Object), 'scm-dp', quad);
    }

    // scm-eqc1: c1 equivalentClass c2 → c1 subClassOf c2 AND c2 subClassOf c1
    if (predicateIri === OWL.equivalentClass) {
        yield infer(makeTriple(subject, rdfs.subClassOf, object), 'scm-eqc1', quad);
        yield infer(makeTriple(object as rdfjs.Quad_Subject, rdfs.subClassOf, subject as rdfjs.Quad_Object), 'scm-eqc1', quad);
    }

    // scm-eqp1: p1 equivalentProperty p2 → p1 subPropertyOf p2 AND p2 subPropertyOf p1
    if (predicateIri === OWL.equivalentProperty) {
        yield infer(makeTriple(subject, rdfs.subPropertyOf, object), 'scm-eqp1', quad);
        yield infer(makeTriple(object as rdfjs.Quad_Subject, rdfs.subPropertyOf, subject as rdfjs.Quad_Object), 'scm-eqp1', quad);
    }

    // scm-int: intersectionOf → each component is a superclass
    if (predicateIri === OWL.intersectionOf) {
        for (const member of walkRdfList(object.value, index)) {
            yield infer(makeTriple(subject, rdfs.subClassOf, member), 'scm-int', quad);
        }
    }

    // scm-uni: unionOf → each component is a subclass
    if (predicateIri === OWL.unionOf) {
        for (const member of walkRdfList(object.value, index)) {
            yield infer(makeTriple(member as rdfjs.Quad_Subject, rdfs.subClassOf, subject as rdfjs.Quad_Object), 'scm-uni', quad);
        }
    }
}

/**
 * Join-based schema rules that require scanning the full index.
 *
 * Rules applied:
 * - scm-sco:   c1 subClassOf c2, c2 subClassOf c3  →  c1 subClassOf c3
 * - scm-eqc2:  c1 subClassOf c2, c2 subClassOf c1  →  c1 equivalentClass c2
 * - scm-spo:   p1 subPropertyOf p2, p2 subPropertyOf p3  →  p1 subPropertyOf p3
 * - scm-eqp2:  p1 subPropertyOf p2, p2 subPropertyOf p1  →  p1 equivalentProperty p2
 * - scm-dom1:  p domain c1, c1 subClassOf c2  →  p domain c2
 * - scm-dom2:  p2 domain c, p1 subPropertyOf p2  →  p1 domain c
 * - scm-rng1:  p range c1, c1 subClassOf c2  →  p range c2
 * - scm-rng2:  p2 range c, p1 subPropertyOf p2  →  p1 range c
 * - scm-hv:    c1 hasValue v on p1, c2 hasValue v on p2, p1 subPropertyOf p2  →  c1 subClassOf c2
 * - scm-svf1:  c1 someValuesFrom d1 on p, c2 someValuesFrom d2 on p, d1 subClassOf d2  →  c1 subClassOf c2
 * - scm-svf2:  c1 someValuesFrom d on p1, c2 someValuesFrom d on p2, p1 subPropertyOf p2  →  c1 subClassOf c2
 * - scm-avf1:  c1 allValuesFrom d1 on p, c2 allValuesFrom d2 on p, d1 subClassOf d2  →  c1 subClassOf c2
 * - scm-avf2:  c1 allValuesFrom d on p1, c2 allValuesFrom d on p2, p1 subPropertyOf p2  →  c2 subClassOf c1
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-schema
 */
export function* schemaJoin(index: QuadIndex): Iterable<InferenceResult> {
    // scm-sco: c1 subClassOf c2, c2 subClassOf c3 → c1 subClassOf c3
    for (const [class1Iri, superClasses] of index.byPS.get(RDFS.subClassOf) ?? []) {
        for (const class2 of superClasses) {
            for (const class3 of index.getObjects(RDFS.subClassOf, class2.value)) {
                if (class3.value !== class1Iri) {
                    yield infer(
                        makeTriple(namedNode(class1Iri), rdfs.subClassOf, class3),
                        'scm-sco',
                        makeTriple(namedNode(class1Iri), rdfs.subClassOf, class2),
                        makeTriple(class2 as rdfjs.Quad_Subject, rdfs.subClassOf, class3),
                    );
                }
            }
        }
    }

    // scm-eqc2: c1 subClassOf c2 AND c2 subClassOf c1 → c1 equivalentClass c2
    for (const [class1Iri, superClasses] of index.byPS.get(RDFS.subClassOf) ?? []) {
        const class1Term = namedNode(class1Iri);

        for (const class2 of superClasses) {
            if (index.has(RDFS.subClassOf, class2.value, class1Iri)) {
                yield infer(
                    makeTriple(class1Term, owl.equivalentClass, class2),
                    'scm-eqc2',
                    makeTriple(class1Term, rdfs.subClassOf, class2),
                    makeTriple(class2 as rdfjs.Quad_Subject, rdfs.subClassOf, class1Term),
                );
            }
        }
    }

    // scm-spo: p1 subPropertyOf p2, p2 subPropertyOf p3 → p1 subPropertyOf p3
    for (const [property1Iri, superProperties] of index.byPS.get(RDFS.subPropertyOf) ?? []) {
        for (const property2 of superProperties) {
            for (const property3 of index.getObjects(RDFS.subPropertyOf, property2.value)) {
                if (property3.value !== property1Iri) {
                    yield infer(
                        makeTriple(namedNode(property1Iri), rdfs.subPropertyOf, property3),
                        'scm-spo',
                        makeTriple(namedNode(property1Iri), rdfs.subPropertyOf, property2),
                        makeTriple(property2 as rdfjs.Quad_Subject, rdfs.subPropertyOf, property3),
                    );
                }
            }
        }
    }

    // scm-eqp2: p1 subPropertyOf p2, p2 subPropertyOf p1 → p1 equivalentProperty p2
    for (const [property1Iri, superProperties] of index.byPS.get(RDFS.subPropertyOf) ?? []) {
        const property1Term = namedNode(property1Iri);

        for (const property2 of superProperties) {
            if (index.has(RDFS.subPropertyOf, property2.value, property1Iri)) {
                yield infer(
                    makeTriple(property1Term, owl.equivalentProperty, property2),
                    'scm-eqp2',
                    makeTriple(property1Term, rdfs.subPropertyOf, property2),
                    makeTriple(property2 as rdfjs.Quad_Subject, rdfs.subPropertyOf, property1Term),
                );
            }
        }
    }

    // scm-dom1: p domain c1, c1 subClassOf c2 → p domain c2
    for (const [propertyIri, domainClasses] of index.byPS.get(RDFS.domain) ?? []) {
        const propertyTerm = namedNode(propertyIri);

        for (const class1 of domainClasses) {
            for (const class2 of index.getObjects(RDFS.subClassOf, class1.value)) {
                yield infer(
                    makeTriple(propertyTerm, rdfs.domain, class2),
                    'scm-dom1',
                    makeTriple(propertyTerm, rdfs.domain, class1),
                    makeTriple(class1 as rdfjs.Quad_Subject, rdfs.subClassOf, class2),
                );
            }
        }
    }

    // scm-dom2: p2 domain c, p1 subPropertyOf p2 → p1 domain c
    for (const [property2Iri, domainClasses] of index.byPS.get(RDFS.domain) ?? []) {
        for (const domainClass of domainClasses) {
            for (const property1 of index.getSubjects(RDFS.subPropertyOf, property2Iri)) {
                yield infer(
                    makeTriple(property1 as rdfjs.Quad_Subject, rdfs.domain, domainClass),
                    'scm-dom2',
                    makeTriple(namedNode(property2Iri), rdfs.domain, domainClass),
                    makeTriple(property1 as rdfjs.Quad_Subject, rdfs.subPropertyOf, namedNode(property2Iri)),
                );
            }
        }
    }

    // scm-rng1: p range c1, c1 subClassOf c2 → p range c2
    for (const [propertyIri, rangeClasses] of index.byPS.get(RDFS.range) ?? []) {
        const propertyTerm = namedNode(propertyIri);

        for (const class1 of rangeClasses) {
            for (const class2 of index.getObjects(RDFS.subClassOf, class1.value)) {
                yield infer(
                    makeTriple(propertyTerm, rdfs.range, class2),
                    'scm-rng1',
                    makeTriple(propertyTerm, rdfs.range, class1),
                    makeTriple(class1 as rdfjs.Quad_Subject, rdfs.subClassOf, class2),
                );
            }
        }
    }

    // scm-rng2: p2 range c, p1 subPropertyOf p2 → p1 range c
    for (const [property2Iri, rangeClasses] of index.byPS.get(RDFS.range) ?? []) {
        for (const rangeClass of rangeClasses) {
            for (const property1 of index.getSubjects(RDFS.subPropertyOf, property2Iri)) {
                yield infer(
                    makeTriple(property1 as rdfjs.Quad_Subject, rdfs.range, rangeClass),
                    'scm-rng2',
                    makeTriple(namedNode(property2Iri), rdfs.range, rangeClass),
                    makeTriple(property1 as rdfjs.Quad_Subject, rdfs.subPropertyOf, namedNode(property2Iri)),
                );
            }
        }
    }

    // scm-hv: c1 hasValue v on p1, c2 hasValue v on p2, p1 subPropertyOf p2 → c1 subClassOf c2
    for (const [class1Iri, values1] of index.byPS.get(OWL.hasValue) ?? []) {
        const class1Term = namedNode(class1Iri);
        const properties1 = index.getObjects(OWL.onProperty, class1Iri);

        for (const value1 of values1) {
            for (const class2 of index.getSubjects(OWL.hasValue, value1.value)) {
                if (class2.value === class1Iri) continue;

                const properties2 = index.getObjects(OWL.onProperty, class2.value);

                for (const property1 of properties1) {
                    for (const property2 of properties2) {
                        if (index.has(RDFS.subPropertyOf, property1.value, property2.value)) {
                            yield infer(
                                makeTriple(class1Term, rdfs.subClassOf, class2 as rdfjs.Quad_Object),
                                'scm-hv',
                                makeTriple(class1Term, namedNode(OWL.hasValue), value1),
                                makeTriple(class1Term, namedNode(OWL.onProperty), property1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.hasValue), value1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.onProperty), property2),
                                makeTriple(property1 as rdfjs.Quad_Subject, rdfs.subPropertyOf, property2),
                            );
                        }
                    }
                }
            }
        }
    }

    // scm-svf1: c1 someValuesFrom d1 on p, c2 someValuesFrom d2 on p, d1 subClassOf d2 → c1 subClassOf c2
    // scm-svf2: c1 someValuesFrom d on p1, c2 someValuesFrom d on p2, p1 subPropertyOf p2 → c1 subClassOf c2
    for (const [class1Iri, fillers1] of index.byPS.get(OWL.someValuesFrom) ?? []) {
        const class1Term = namedNode(class1Iri);
        const properties1 = index.getObjects(OWL.onProperty, class1Iri);

        for (const filler1 of fillers1) {
            // scm-svf1: same property, filler1 subClassOf filler2
            for (const class2 of index.getSubjects(OWL.someValuesFrom, filler1.value)) {
                if (class2.value === class1Iri) continue;

                const properties2 = index.getObjects(OWL.onProperty, class2.value);

                for (const property1 of properties1) {
                    for (const property2 of properties2) {
                        if (property1.value === property2.value) {
                            yield infer(
                                makeTriple(class1Term, rdfs.subClassOf, class2 as rdfjs.Quad_Object),
                                'scm-svf1',
                                makeTriple(class1Term, namedNode(OWL.someValuesFrom), filler1),
                                makeTriple(class1Term, namedNode(OWL.onProperty), property1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.someValuesFrom), filler1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.onProperty), property2),
                            );
                        }
                    }
                }
            }

            // scm-svf2: same filler, property1 subPropertyOf property2
            for (const class2 of index.getSubjects(OWL.someValuesFrom, filler1.value)) {
                if (class2.value === class1Iri) continue;

                const properties2 = index.getObjects(OWL.onProperty, class2.value);

                for (const property1 of properties1) {
                    for (const property2 of properties2) {
                        if (index.has(RDFS.subPropertyOf, property1.value, property2.value)) {
                            yield infer(
                                makeTriple(class1Term, rdfs.subClassOf, class2 as rdfjs.Quad_Object),
                                'scm-svf2',
                                makeTriple(class1Term, namedNode(OWL.someValuesFrom), filler1),
                                makeTriple(class1Term, namedNode(OWL.onProperty), property1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.someValuesFrom), filler1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.onProperty), property2),
                                makeTriple(property1 as rdfjs.Quad_Subject, rdfs.subPropertyOf, property2),
                            );
                        }
                    }
                }
            }
        }
    }

    // scm-avf1: c1 allValuesFrom d1 on p, c2 allValuesFrom d2 on p, d1 subClassOf d2 → c1 subClassOf c2
    // scm-avf2: c1 allValuesFrom d on p1, c2 allValuesFrom d on p2, p1 subPropertyOf p2 → c2 subClassOf c1 (contravariant)
    for (const [class1Iri, fillers1] of index.byPS.get(OWL.allValuesFrom) ?? []) {
        const class1Term = namedNode(class1Iri);
        const properties1 = index.getObjects(OWL.onProperty, class1Iri);

        for (const filler1 of fillers1) {
            // scm-avf1: filler1 subClassOf filler2, same property → c1 subClassOf c2
            for (const filler2 of index.getObjects(RDFS.subClassOf, filler1.value)) {
                for (const class2 of index.getSubjects(OWL.allValuesFrom, filler2.value)) {
                    if (class2.value === class1Iri) continue;

                    const properties2 = index.getObjects(OWL.onProperty, class2.value);

                    for (const property1 of properties1) {
                        for (const property2 of properties2) {
                            if (property1.value === property2.value) {
                                yield infer(
                                    makeTriple(class1Term, rdfs.subClassOf, class2 as rdfjs.Quad_Object),
                                    'scm-avf1',
                                    makeTriple(class1Term, namedNode(OWL.allValuesFrom), filler1),
                                    makeTriple(class1Term, namedNode(OWL.onProperty), property1),
                                    makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.allValuesFrom), filler2),
                                    makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.onProperty), property2),
                                    makeTriple(filler1 as rdfjs.Quad_Subject, rdfs.subClassOf, filler2),
                                );
                            }
                        }
                    }
                }
            }

            // scm-avf2: same filler, p1 subPropertyOf p2 → c2 subClassOf c1 (contravariant)
            for (const class2 of index.getSubjects(OWL.allValuesFrom, filler1.value)) {
                if (class2.value === class1Iri) continue;

                const properties2 = index.getObjects(OWL.onProperty, class2.value);

                for (const property1 of properties1) {
                    for (const property2 of properties2) {
                        if (index.has(RDFS.subPropertyOf, property1.value, property2.value)) {
                            yield infer(
                                makeTriple(class2 as rdfjs.Quad_Subject, rdfs.subClassOf, class1Term),
                                'scm-avf2',
                                makeTriple(class1Term, namedNode(OWL.allValuesFrom), filler1),
                                makeTriple(class1Term, namedNode(OWL.onProperty), property1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.allValuesFrom), filler1),
                                makeTriple(class2 as rdfjs.Quad_Subject, namedNode(OWL.onProperty), property2),
                                makeTriple(property1 as rdfjs.Quad_Subject, rdfs.subPropertyOf, property2),
                            );
                        }
                    }
                }
            }
        }
    }
}

function walkRdfList(listHeadIri: string, index: QuadIndex): rdfjs.Quad_Object[] {
    const firstNodes = index.getObjects(RDF.first, listHeadIri);

    if (firstNodes.size === 0) return [];

    const [first] = firstNodes;
    const restNodes = index.getObjects(RDF.rest, listHeadIri);

    if (restNodes.size === 0) return [first];

    const [rest] = restNodes;

    if (rest.value === RDF.nil) return [first];

    return [first, ...walkRdfList(rest.value, index)];
}
