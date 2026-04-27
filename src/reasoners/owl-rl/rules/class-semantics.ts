/**
 * OWL 2 RL — Table 6: Class expression rules (cls-*)
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 6 — https://www.w3.org/TR/owl2-profiles/#tab-rules-classes
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { QuadIndex } from '../../quad-index.js';
import { infer, type InferenceResult } from '../../inference-result.js';
import { RDF, RDFS, OWL, ZERO, ONE, rdf, rdfs, owl } from '../vocabulary.js';

const { namedNode } = DataFactory;

function makeTriple(subject: rdfjs.Quad_Subject, predicate: rdfjs.Quad_Predicate, object: rdfjs.Quad_Object): rdfjs.Quad {
    return DataFactory.quad(subject, predicate, object);
}

/**
 * Axiomatic class triples (cls-thing, cls-nothing1).
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-classes
 */
export function* classAxioms(): Iterable<rdfjs.Quad> {
    yield makeTriple(owl.Thing, rdf.type, owl.Class);
    yield makeTriple(owl.Nothing, rdf.type, owl.Class);
    // owl:NamedIndividual is a subclass of owl:Thing (OWL 2 meta-ontology).
    // This lets cax-sco propagate rdf:type owl:Thing to all named individuals,
    // which is required for prp-rflx (reflexive property assertions).
    yield makeTriple(owl.NamedIndividual, rdfs.subClassOf, owl.Thing);
}

/**
 * Single-quad class expression rules that fire once per incoming quad.
 *
 * Rules applied:
 * - cls-nothing2: x type owl:Nothing  →  inconsistency
 * - cls-hv1:      x type c, c hasValue v on p  →  x p v
 * - cls-hv2:      c hasValue v on p, x p v  →  x type c
 * - cls-svf2:     c someValuesFrom owl:Thing on p, x p y  →  x type c
 * - cls-oo:       c oneOf list, u in list  →  u type c
 * - cls-int2:     c intersectionOf list, x type c  →  x type each component
 * - cls-uni:      c unionOf list, x type component  →  x type c
 * - cls-com:      c complementOf d, x type c AND x type d  →  inconsistency
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-classes
 */
export function* classSingleQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult> {
    const { subject, predicate, object } = quad;
    const predicateIri = predicate.value;
    const subjectIri   = subject.value;
    const objectIri    = object.value;

    if (predicateIri === RDF.type) {
        // cls-nothing2: x type owl:Nothing → inconsistency
        if (objectIri === OWL.Nothing) {
            yield infer(makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing), 'cls-nothing2', quad);
        }
    }

    // cls-hv2: c hasValue v on p, x p v → x type c
    // Fires for any quad x p v (not just rdf:type).
    for (const restriction of index.getSubjects(OWL.hasValue, objectIri)) {
        const propertiesOnRestriction = index.getObjects(OWL.onProperty, restriction.value);

        for (const propertyTerm of propertiesOnRestriction) {
            if (propertyTerm.value === predicateIri) {
                yield infer(
                    makeTriple(subject, rdf.type, restriction as rdfjs.Quad_Object),
                    'cls-hv2',
                    quad,
                    makeTriple(restriction as rdfjs.Quad_Subject, namedNode(OWL.hasValue), object),
                    makeTriple(restriction as rdfjs.Quad_Subject, namedNode(OWL.onProperty), predicate),
                );
            }
        }
    }

    // cls-svf2: c someValuesFrom owl:Thing on p, x p y → x type c
    // Fires for any quad x p y (not just rdf:type).
    for (const restriction of index.getSubjects(OWL.someValuesFrom, OWL.Thing)) {
        const propertiesOnRestriction = index.getObjects(OWL.onProperty, restriction.value);

        for (const propertyTerm of propertiesOnRestriction) {
            if (propertyTerm.value === predicateIri) {
                yield infer(
                    makeTriple(subject, rdf.type, restriction as rdfjs.Quad_Object),
                    'cls-svf2',
                    quad,
                    makeTriple(restriction as rdfjs.Quad_Subject, namedNode(OWL.someValuesFrom), owl.Thing),
                    makeTriple(restriction as rdfjs.Quad_Subject, namedNode(OWL.onProperty), predicate),
                );
            }
        }
    }

    // cls-hv1: x type c, c hasValue v on p → x p v
    if (predicateIri === RDF.type) {
        for (const value of index.getObjects(OWL.hasValue, objectIri)) {
            const propertiesOnRestriction = index.getObjects(OWL.onProperty, objectIri);

            for (const propertyTerm of propertiesOnRestriction) {
                yield infer(
                    makeTriple(subject, namedNode(propertyTerm.value), value),
                    'cls-hv1',
                    quad,
                    makeTriple(object as rdfjs.Quad_Subject, namedNode(OWL.hasValue), value),
                    makeTriple(object as rdfjs.Quad_Subject, namedNode(OWL.onProperty), propertyTerm),
                );
            }
        }
    }

    // cls-oo: c oneOf list, u in list → u type c
    if (predicateIri === OWL.oneOf) {
        for (const member of walkRdfList(objectIri, index)) {
            if (member.termType === 'NamedNode' || member.termType === 'BlankNode') {
                yield infer(
                    makeTriple(member as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
                    'cls-oo',
                    quad,
                );
            }
        }
    }

    // cls-int2: c intersectionOf list, x type c → x type each component
    if (predicateIri === OWL.intersectionOf) {
        for (const instance of index.getSubjects(RDF.type, subjectIri)) {
            for (const component of walkRdfList(objectIri, index)) {
                yield infer(
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, component),
                    'cls-int2',
                    quad,
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
                );
            }
        }
    }

    // cls-uni: c unionOf list, x type component → x type c
    if (predicateIri === OWL.unionOf) {
        for (const component of walkRdfList(objectIri, index)) {
            for (const instance of index.getSubjects(RDF.type, component.value)) {
                yield infer(
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
                    'cls-uni',
                    quad,
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, component),
                );
            }
        }
    }

    // cls-com: c complementOf d, x type c AND x type d → inconsistency
    if (predicateIri === OWL.complementOf) {
        for (const instance of index.getSubjects(RDF.type, subjectIri)) {
            if (index.has(RDF.type, instance.value, objectIri)) {
                yield infer(
                    makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                    'cls-com',
                    quad,
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, object),
                );
            }
        }
    }
}

/**
 * Join-based class expression rules that require scanning the full index.
 *
 * Rules applied:
 * - cls-int1:   c intersectionOf list, x type each component  →  x type c
 * - cls-svf1:   c someValuesFrom d on p (d ≠ owl:Thing), x p y, y type d  →  x type c
 * - cls-avf:    c allValuesFrom d on p, x type c, x p y  →  y type d
 * - cls-maxc1:  c maxCardinality "0" on p, x type c, x p y  →  inconsistency
 * - cls-maxc2:  c maxCardinality "1" on p, x type c, x p y1, x p y2  →  y1 sameAs y2
 * - cls-maxqc1: c maxQualifiedCardinality "0" on p scoped to d, x type c, x p y, y type d  →  inconsistency
 * - cls-maxqc2: c maxQualifiedCardinality "0" on p scoped to owl:Thing, x type c, x p y  →  inconsistency
 * - cls-maxqc3: c maxQualifiedCardinality "1" on p scoped to d, x p y1 y2 both typed d  →  y1 sameAs y2
 * - cls-maxqc4: c maxQualifiedCardinality "1" on p scoped to owl:Thing, x p y1 y2  →  y1 sameAs y2
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-classes
 */
export function* classJoin(index: QuadIndex): Iterable<InferenceResult> {
    // cls-int1: c intersectionOf list, x type each component → x type c
    for (const [classIri, listHeadNodes] of index.byPS.get(OWL.intersectionOf) ?? []) {
        for (const listHeadNode of listHeadNodes) {
            const components = walkRdfList(listHeadNode.value, index);

            if (components.length === 0) continue;

            // Find candidates: typed as first component.
            const candidates = index.getSubjects(RDF.type, components[0].value);

            outer: for (const instance of candidates) {
                for (let i = 1; i < components.length; i++) {
                    if (!index.has(RDF.type, instance.value, components[i].value)) continue outer;
                }

                yield infer(
                    makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                    'cls-int1',
                    makeTriple(namedNode(classIri), namedNode(OWL.intersectionOf), listHeadNode),
                    ...components.map(component => makeTriple(instance as rdfjs.Quad_Subject, rdf.type, component)),
                );
            }
        }
    }

    // cls-svf1: c someValuesFrom d on p (d != owl:Thing), x p y, y type d → x type c
    for (const [classIri, fillerNodes] of index.byPS.get(OWL.someValuesFrom) ?? []) {
        for (const filler of fillerNodes) {
            if (filler.value === OWL.Thing) continue;

            const propertiesOnRestriction = index.getObjects(OWL.onProperty, classIri);

            for (const propertyTerm of propertiesOnRestriction) {
                for (const fillerInstance of index.getSubjects(RDF.type, filler.value)) {
                    for (const instance of index.getSubjects(propertyTerm.value, fillerInstance.value)) {
                        yield infer(
                            makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                            'cls-svf1',
                            makeTriple(namedNode(classIri), namedNode(OWL.someValuesFrom), filler),
                            makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                            makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, fillerInstance),
                            makeTriple(fillerInstance as rdfjs.Quad_Subject, rdf.type, filler),
                        );
                    }
                }
            }
        }
    }

    // cls-avf: c allValuesFrom d on p, x type c, x p y → y type d
    for (const [classIri, fillerNodes] of index.byPS.get(OWL.allValuesFrom) ?? []) {
        for (const filler of fillerNodes) {
            const propertiesOnRestriction = index.getObjects(OWL.onProperty, classIri);

            for (const propertyTerm of propertiesOnRestriction) {
                for (const instance of index.getSubjects(RDF.type, classIri)) {
                    for (const value of index.getObjects(propertyTerm.value, instance.value)) {
                        if (value.termType === 'NamedNode' || value.termType === 'BlankNode') {
                            yield infer(
                                makeTriple(value as rdfjs.Quad_Subject, rdf.type, filler),
                                'cls-avf',
                                makeTriple(namedNode(classIri), namedNode(OWL.allValuesFrom), filler),
                                makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                                makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, value),
                            );
                        }
                    }
                }
            }
        }
    }

    // cls-maxc1: c maxCardinality "0" on p, x type c, x p y → inconsistency
    for (const [classIri, cardinalityNodes] of index.byPS.get(OWL.maxCardinality) ?? []) {
        for (const cardinality of cardinalityNodes) {
            if (cardinality.value !== ZERO) continue;

            const propertiesOnRestriction = index.getObjects(OWL.onProperty, classIri);

            for (const propertyTerm of propertiesOnRestriction) {
                for (const instance of index.getSubjects(RDF.type, classIri)) {
                    const values = index.getObjects(propertyTerm.value, instance.value);

                    if (values.size > 0) {
                        yield infer(
                            makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                            'cls-maxc1',
                            makeTriple(namedNode(classIri), namedNode(OWL.maxCardinality), cardinality),
                            makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                            makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                            ...[...values].map(value => makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, value)),
                        );
                    }
                }
            }
        }
    }

    // cls-maxc2: c maxCardinality "1" on p, x type c, x p y1, x p y2 → y1 sameAs y2
    for (const [classIri, cardinalityNodes] of index.byPS.get(OWL.maxCardinality) ?? []) {
        for (const cardinality of cardinalityNodes) {
            if (cardinality.value !== ONE) continue;

            const propertiesOnRestriction = index.getObjects(OWL.onProperty, classIri);

            for (const propertyTerm of propertiesOnRestriction) {
                for (const instance of index.getSubjects(RDF.type, classIri)) {
                    const values = [...index.getObjects(propertyTerm.value, instance.value)];

                    for (let i = 0; i < values.length; i++) {
                        for (let j = i + 1; j < values.length; j++) {
                            yield infer(
                                makeTriple(values[i] as rdfjs.Quad_Subject, owl.sameAs, values[j]),
                                'cls-maxc2',
                                makeTriple(namedNode(classIri), namedNode(OWL.maxCardinality), cardinality),
                                makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                                makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, values[i]),
                                makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, values[j]),
                            );
                        }
                    }
                }
            }
        }
    }

    // cls-maxqc1/2/3/4: qualified max cardinality constraints
    for (const [classIri, cardinalityNodes] of index.byPS.get(OWL.maxQualifiedCardinality) ?? []) {
        for (const cardinality of cardinalityNodes) {
            const propertiesOnRestriction = index.getObjects(OWL.onProperty, classIri);
            const scopedClasses           = index.getObjects(OWL.onClass, classIri);

            for (const propertyTerm of propertiesOnRestriction) {
                for (const scopedClass of scopedClasses) {
                    const isScopedToOwlThing = scopedClass.value === OWL.Thing;

                    if (cardinality.value === ZERO) {
                        // cls-maxqc1: qualifiedCardinality "0" on d, x type c, x p y, y type d → inconsistency
                        // cls-maxqc2: qualifiedCardinality "0" on owl:Thing, x type c, x p y → inconsistency
                        for (const instance of index.getSubjects(RDF.type, classIri)) {
                            for (const value of index.getObjects(propertyTerm.value, instance.value)) {
                                if (isScopedToOwlThing || index.has(RDF.type, value.value, scopedClass.value)) {
                                    yield infer(
                                        makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                        isScopedToOwlThing ? 'cls-maxqc2' : 'cls-maxqc1',
                                        makeTriple(namedNode(classIri), namedNode(OWL.maxQualifiedCardinality), cardinality),
                                        makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                                        makeTriple(namedNode(classIri), namedNode(OWL.onClass), scopedClass),
                                        makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                                        makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, value),
                                        ...(isScopedToOwlThing ? [] : [makeTriple(value as rdfjs.Quad_Subject, rdf.type, scopedClass)]),
                                    );
                                }
                            }
                        }
                    }

                    if (cardinality.value === ONE) {
                        // cls-maxqc3/4: two qualified values → sameAs
                        for (const instance of index.getSubjects(RDF.type, classIri)) {
                            const qualifiedValues = [...index.getObjects(propertyTerm.value, instance.value)]
                                .filter(value => isScopedToOwlThing || index.has(RDF.type, value.value, scopedClass.value));

                            for (let i = 0; i < qualifiedValues.length; i++) {
                                for (let j = i + 1; j < qualifiedValues.length; j++) {
                                    yield infer(
                                        makeTriple(qualifiedValues[i] as rdfjs.Quad_Subject, owl.sameAs, qualifiedValues[j]),
                                        isScopedToOwlThing ? 'cls-maxqc4' : 'cls-maxqc3',
                                        makeTriple(namedNode(classIri), namedNode(OWL.maxQualifiedCardinality), cardinality),
                                        makeTriple(namedNode(classIri), namedNode(OWL.onProperty), propertyTerm),
                                        makeTriple(namedNode(classIri), namedNode(OWL.onClass), scopedClass),
                                        makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(classIri)),
                                        makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, qualifiedValues[i]),
                                        makeTriple(instance as rdfjs.Quad_Subject, propertyTerm as rdfjs.Quad_Predicate, qualifiedValues[j]),
                                    );
                                }
                            }
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
