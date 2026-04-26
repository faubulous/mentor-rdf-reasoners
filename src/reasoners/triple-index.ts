import * as rdfjs from '@rdfjs/types';

/**
 * A multi-dimensional index over RDF triples for O(1) pattern lookups.
 *
 * Maintains three access paths:
 *   - by predicate → subject → set of objects
 *   - by predicate → object → set of subjects
 *   - by subject → set of predicates (for property chain and key joins)
 *
 * The index is used by the semi-naive fixpoint engine to perform joins
 * efficiently without scanning the full working store.
 */
export class TripleIndex {
    /** predicate → subject → objects */
    readonly byPredSubj = new Map<string, Map<string, Set<rdfjs.Quad_Object>>>();

    /** predicate → object → subjects */
    readonly byPredObj = new Map<string, Map<string, Set<rdfjs.Quad_Subject>>>();

    /** subject → predicate → objects */
    readonly bySubjPred = new Map<string, Map<string, Set<rdfjs.Quad_Object>>>();

    /** object (URI/bnode) → predicate → subjects */
    readonly byObjPred = new Map<string, Map<string, Set<rdfjs.Quad_Subject>>>();

    /** subject value → subject term (for term recovery in pairs()) */
    private readonly bySubjTerm = new Map<string, rdfjs.Quad_Subject>();

    add(quad: rdfjs.Quad): boolean {
        const s = quad.subject.value;
        const p = quad.predicate.value;
        const o = quad.object;
        const ov = o.value;

        if (!this.bySubjTerm.has(s)) {
            this.bySubjTerm.set(s, quad.subject);
        }

        // byPredSubj
        let bySubj = this.byPredSubj.get(p);

        if (!bySubj) { bySubj = new Map(); this.byPredSubj.set(p, bySubj); }
        let objs = bySubj.get(s);

        if (!objs) { objs = new Set(); bySubj.set(s, objs); }
        const isNew = !this._hasObject(objs, o);

        if (!isNew) return false;
        objs.add(o);

        // byPredObj
        let byObj = this.byPredObj.get(p);

        if (!byObj) { byObj = new Map(); this.byPredObj.set(p, byObj); }
        let subjs = byObj.get(ov);

        if (!subjs) { subjs = new Set(); byObj.set(ov, subjs); }
        subjs.add(quad.subject);

        // bySubjPred
        let predMap = this.bySubjPred.get(s);

        if (!predMap) { predMap = new Map(); this.bySubjPred.set(s, predMap); }
        let objsS = predMap.get(p);

        if (!objsS) { objsS = new Set(); predMap.set(p, objsS); }
        objsS.add(o);

        // byObjPred
        let objPredMap = this.byObjPred.get(ov);

        if (!objPredMap) { objPredMap = new Map(); this.byObjPred.set(ov, objPredMap); }
        let subjsO = objPredMap.get(p);

        if (!subjsO) { subjsO = new Set(); objPredMap.set(p, subjsO); }
        subjsO.add(quad.subject);

        return true;
    }

    /** Look up all objects for a given predicate + subject. */
    getObjects(predicate: string, subject: string): ReadonlySet<rdfjs.Quad_Object> {
        return this.byPredSubj.get(predicate)?.get(subject) ?? _empty;
    }

    /** Look up all subjects for a given predicate + object value. */
    getSubjects(predicate: string, objectValue: string): ReadonlySet<rdfjs.Quad_Subject> {
        return this.byPredObj.get(predicate)?.get(objectValue) ?? _emptySubj;
    }

    /** Look up all objects a subject has for a given predicate. */
    getObjectsForSubject(subject: string, predicate: string): ReadonlySet<rdfjs.Quad_Object> {
        return this.bySubjPred.get(subject)?.get(predicate) ?? _empty;
    }

    /** Look up all subjects that have a given object for a given predicate. */
    getSubjectsForObject(objectValue: string, predicate: string): ReadonlySet<rdfjs.Quad_Subject> {
        return this.byObjPred.get(objectValue)?.get(predicate) ?? _emptySubj;
    }

    /** Iterate all (subject, object) pairs for a given predicate. */
    *pairs(predicate: string): Iterable<[rdfjs.Quad_Subject, rdfjs.Quad_Object]> {
        const bySubj = this.byPredSubj.get(predicate);

        if (!bySubj) return;

        for (const [sv, objs] of bySubj) {
            const subjectTerm = this.bySubjTerm.get(sv)!;

            for (const obj of objs) {
                yield [subjectTerm, obj];
            }
        }
    }

    /** Check if the index contains a triple with this predicate, subject, and object value. */
    has(predicate: string, subject: string, objectValue: string): boolean {
        const objs = this.byPredSubj.get(predicate)?.get(subject);

        if (!objs) return false;

        for (const o of objs) {
            if (o.value === objectValue) return true;
        }
        return false;
    }

    private _hasObject(set: Set<rdfjs.Quad_Object>, obj: rdfjs.Quad_Object): boolean {
        for (const o of set) {
            if (o.value === obj.value && o.termType === obj.termType) return true;
        }
        return false;
    }
}

const _empty: ReadonlySet<rdfjs.Quad_Object> = new Set();
const _emptySubj: ReadonlySet<rdfjs.Quad_Subject> = new Set();
