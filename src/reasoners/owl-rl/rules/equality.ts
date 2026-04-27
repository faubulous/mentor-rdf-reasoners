/**
 * OWL 2 RL — Table 4: Equality rules (eq-*)
 *
 * Implements rules eq-sym, eq-trans, eq-rep-s, eq-rep-o, eq-diff1, eq-diff2,
 * and eq-diff3 from the OWL 2 RL/RDF rule set.
 *
 * Note: eq-ref is intentionally omitted — materialising reflexive sameAs for
 * every term in the graph produces O(N) triples that are almost never consumed
 * downstream, and the RL spec notes it is only required for completeness proofs.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 4 — https://www.w3.org/TR/owl2-profiles/#tab-rules-equality
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { QuadIndex } from '../../quad-index.js';
import { infer, type InferenceResult } from '../../inference-result.js';
import { RDF, OWL, RDFS, owl, rdfs } from '../vocabulary.js';

const { namedNode } = DataFactory;

function makeTriple(subject: rdfjs.Quad_Subject, predicate: rdfjs.Quad_Predicate, object: rdfjs.Quad_Object): rdfjs.Quad {
    return DataFactory.quad(subject, predicate, object);
}

/**
 * Single-quad equality rules that fire once per incoming quad.
 *
 * Rules applied:
 * - eq-sym:   x sameAs y  →  y sameAs x
 * - eq-rep-s: x sameAs y, x p v  →  y p v  (replace subject)
 * - eq-rep-o: x sameAs y, u p x  →  u p y  (replace object)
 * - eq-diff1: x sameAs y, x differentFrom y  →  inconsistency
 *
 * Rules eq-trans and eq-diff2/3 require joining multiple quads and are
 * handled in {@link equalityJoin}.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-equality
 */
export function* equalitySingleQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult> {
    const { subject, predicate, object } = quad;
    const subjectIri   = subject.value;
    const predicateIri = predicate.value;
    const objectIri    = object.value;

    if (predicateIri === OWL.sameAs) {
        // eq-sym: x sameAs y → y sameAs x
        yield infer(makeTriple(object as rdfjs.Quad_Subject, owl.sameAs, subject), 'eq-sym', quad);

        // eq-diff1: x sameAs y, x differentFrom y (or y differentFrom x) → inconsistency
        if (index.has(OWL.differentFrom, subjectIri, objectIri) || index.has(OWL.differentFrom, objectIri, subjectIri)) {
            const diffTriple = index.has(OWL.differentFrom, subjectIri, objectIri)
                ? makeTriple(subject, namedNode(OWL.differentFrom), object)
                : makeTriple(object as rdfjs.Quad_Subject, namedNode(OWL.differentFrom), subject as rdfjs.Quad_Object);
            yield infer(makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing), 'eq-diff1', quad, diffTriple);
        }

        // eq-rep-s: for each (x, p2, v) in the graph, emit (y, p2, v)
        for (const [otherPredicateIri, objects] of index.bySP.get(subjectIri)!) {
            const otherPredicate = namedNode(otherPredicateIri);

            for (const obj of objects) {
                yield infer(
                    makeTriple(object as rdfjs.Quad_Subject, otherPredicate, obj),
                    'eq-rep-s',
                    quad,
                    makeTriple(subject, otherPredicate, obj),
                );
            }
        }

        // eq-rep-o: for each (u, p2, x) in the graph, emit (u, p2, y)
        for (const [otherPredicateIri, subjects] of index.byOP.get(subjectIri)!) {
            const otherPredicate = namedNode(otherPredicateIri);

            for (const subj of subjects) {
                yield infer(
                    makeTriple(subj, otherPredicate, object),
                    'eq-rep-o',
                    quad,
                    makeTriple(subj, otherPredicate, subject as rdfjs.Quad_Object),
                );
            }
        }
    }
}

/**
 * Join-based equality rules that require scanning the full index.
 *
 * Rules applied:
 * - eq-trans:  x sameAs y, y sameAs z  →  x sameAs z
 * - eq-diff2:  AllDifferent(members list), x sameAs y for any pair (x, y)  →  inconsistency
 * - eq-diff3:  AllDifferent(distinctMembers list), x sameAs y for any pair  →  inconsistency
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-equality
 */
export function* equalityJoin(index: QuadIndex): Iterable<InferenceResult> {
    // eq-trans: x sameAs y, y sameAs z → x sameAs z
    for (const [subjectIri, sameAsTargets] of index.byPS.get(OWL.sameAs) ?? []) {
        for (const intermediate of sameAsTargets) {
            const transitiveTargets = index.getObjects(OWL.sameAs, intermediate.value);

            for (const transitiveTarget of transitiveTargets) {
                if (transitiveTarget.value !== subjectIri) {
                    yield infer(
                        makeTriple(namedNode(subjectIri), owl.sameAs, transitiveTarget),
                        'eq-trans',
                        makeTriple(namedNode(subjectIri), owl.sameAs, intermediate),
                        makeTriple(intermediate as rdfjs.Quad_Subject, owl.sameAs, transitiveTarget),
                    );
                }
            }
        }
    }

    // eq-diff2/3: owl:AllDifferent with owl:members or owl:distinctMembers
    for (const listPredicate of [OWL.members, OWL.distinctMembers]) {
        for (const [allDiffIri, listHeadNodes] of index.byPS.get(listPredicate) ?? []) {
            for (const listHeadNode of listHeadNodes) {
                const memberNodes = walkRdfList(listHeadNode.value, index);

                for (let i = 0; i < memberNodes.length; i++) {
                    for (let j = i + 1; j < memberNodes.length; j++) {
                        const memberIriA = memberNodes[i].value;
                        const memberIriB = memberNodes[j].value;
                        const sameTriple = index.has(OWL.sameAs, memberIriA, memberIriB)
                            ? makeTriple(namedNode(memberIriA), owl.sameAs, namedNode(memberIriB))
                            : index.has(OWL.sameAs, memberIriB, memberIriA)
                                ? makeTriple(namedNode(memberIriB), owl.sameAs, namedNode(memberIriA))
                                : null;

                        if (sameTriple) {
                            const rule = listPredicate === OWL.members ? 'eq-diff2' : 'eq-diff3';
                            yield infer(
                                makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                                rule,
                                makeTriple(namedNode(allDiffIri), namedNode(listPredicate), listHeadNode),
                                sameTriple,
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
