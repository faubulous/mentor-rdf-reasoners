/**
 * OWL 2 RL — Table 7: Class axiom rules (cax-*)
 *
 * Implements rules cax-sco, cax-eqc1, cax-eqc2, cax-dw, and cax-adc.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 7 — https://www.w3.org/TR/owl2-profiles/#tab-rules-class-axioms
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { TripleIndex } from '../../triple-index.js';
import { InferenceResult, infer } from '../../reasoner.js';
import { RDF, RDFS, OWL, rdf, rdfs, owl } from '../vocabulary.js';

const { namedNode } = DataFactory;

function makeTriple(subject: rdfjs.Quad_Subject, predicate: rdfjs.Quad_Predicate, object: rdfjs.Quad_Object): rdfjs.Quad {
    return DataFactory.quad(subject, predicate, object);
}

/**
 * Single-quad class axiom rules that fire once per incoming quad.
 *
 * Rules applied:
 * - cax-sco:  x type c1, c1 subClassOf c2  →  x type c2
 * - cax-eqc1: x type c1, c1 equivalentClass c2  →  x type c2
 * - cax-eqc2: x type c2, c1 equivalentClass c2  →  x type c1
 * - cax-dw:   x type c1, c1 disjointWith c2, x type c2  →  inconsistency
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-class-axioms
 */
export function* classAxiomSingleQuad(quad: rdfjs.Quad, index: TripleIndex): Iterable<InferenceResult> {
    const { subject, predicate, object } = quad;
    const predicateIri = predicate.value;
    const subjectIri   = subject.value;
    const objectIri    = object.value;

    if (predicateIri === RDF.type) {
        // cax-sco: x type c1, c1 subClassOf c2 → x type c2
        for (const superClass of index.getObjects(RDFS.subClassOf, objectIri)) {
            yield infer(
                makeTriple(subject, rdf.type, superClass),
                'cax-sco',
                quad,
                makeTriple(object as rdfjs.Quad_Subject, namedNode(RDFS.subClassOf), superClass),
            );
        }

        // cax-eqc1/2: x type c1, c1 equivalentClass c2 → x type c2 (and vice versa)
        for (const equivalentClass of index.getObjects(OWL.equivalentClass, objectIri)) {
            yield infer(
                makeTriple(subject, rdf.type, equivalentClass),
                'cax-eqc1',
                quad,
                makeTriple(object as rdfjs.Quad_Subject, namedNode(OWL.equivalentClass), equivalentClass),
            );
        }

        for (const equivalentClass of index.getSubjects(OWL.equivalentClass, objectIri)) {
            yield infer(
                makeTriple(subject, rdf.type, equivalentClass as rdfjs.Quad_Object),
                'cax-eqc2',
                quad,
                makeTriple(equivalentClass as rdfjs.Quad_Subject, namedNode(OWL.equivalentClass), object),
            );
        }

        // cax-dw: x type c1, c1 disjointWith c2, x type c2 → inconsistency
        for (const disjointClass of index.getObjects(OWL.disjointWith, objectIri)) {
            if (index.has(RDF.type, subjectIri, disjointClass.value)) {
                yield infer(
                    makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                    'cax-dw',
                    quad,
                    makeTriple(object as rdfjs.Quad_Subject, namedNode(OWL.disjointWith), disjointClass),
                    makeTriple(subject, rdf.type, disjointClass),
                );
            }
        }

        for (const disjointClass of index.getSubjects(OWL.disjointWith, objectIri)) {
            if (index.has(RDF.type, subjectIri, disjointClass.value)) {
                yield infer(
                    makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                    'cax-dw',
                    quad,
                    makeTriple(disjointClass as rdfjs.Quad_Subject, namedNode(OWL.disjointWith), object),
                    makeTriple(subject, rdf.type, disjointClass),
                );
            }
        }
    }

    if (predicateIri === RDFS.subClassOf) {
        // cax-sco propagation: if anything was typed as subject, it is now typed as object
        for (const instance of index.getSubjects(RDF.type, subjectIri)) {
            yield infer(
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, object),
                'cax-sco',
                quad,
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
            );
        }
    }

    if (predicateIri === OWL.equivalentClass) {
        // Propagate type for all existing instances of subject → typed as object too
        for (const instance of index.getSubjects(RDF.type, subjectIri)) {
            yield infer(
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, object),
                'cax-eqc1',
                quad,
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
            );
        }

        for (const instance of index.getSubjects(RDF.type, objectIri)) {
            yield infer(
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, subject as rdfjs.Quad_Object),
                'cax-eqc2',
                quad,
                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, object),
            );
        }
    }
}

/**
 * Join-based class axiom rules that require scanning the full index.
 *
 * Rules applied:
 * - cax-adc: AllDisjointClasses, any individual typed as two member classes  →  inconsistency
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-class-axioms
 */
export function* classAxiomJoin(index: TripleIndex): Iterable<InferenceResult> {
    for (const [allDisjointIri, listHeads] of index.byPredSubj.get(OWL.members) ?? []) {
        if (!index.has(RDF.type, allDisjointIri, OWL.AllDisjointClasses)) continue;

        for (const listHead of listHeads) {
            const memberClasses = walkRdfList(listHead.value, index);

            for (let i = 0; i < memberClasses.length; i++) {
                const class1Iri = memberClasses[i].value;
                const typedAsClass1 = index.getSubjects(RDF.type, class1Iri);

                for (let j = i + 1; j < memberClasses.length; j++) {
                    const class2Iri = memberClasses[j].value;

                    for (const instance of typedAsClass1) {
                        if (index.has(RDF.type, instance.value, class2Iri)) {
                            yield infer(
                                makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                'cax-adc',
                                makeTriple(namedNode(allDisjointIri), rdf.type, namedNode(OWL.AllDisjointClasses)),
                                makeTriple(namedNode(allDisjointIri), namedNode(OWL.members), listHead),
                                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(class1Iri)),
                                makeTriple(instance as rdfjs.Quad_Subject, rdf.type, namedNode(class2Iri)),
                            );
                        }
                    }
                }
            }
        }
    }
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
