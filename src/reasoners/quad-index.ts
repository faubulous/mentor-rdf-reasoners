import * as rdfjs from '@rdfjs/types';

/**
 * A multi-dimensional index over RDF quads for O(1) pattern lookups.
 * The index is used by the semi-naive fixpoint engine to perform joins
 * efficiently without scanning the full working store.
 */
export class QuadIndex {
    /**
     * Maps: predicate → subject → objects
     */
    readonly byPS = new Map<string, Map<string, Set<rdfjs.Quad_Object>>>();

    /**
     * Maps: predicate → object → subjects
     */
    readonly byPO = new Map<string, Map<string, Set<rdfjs.Quad_Subject>>>();

    /**
     * Maps: subject → predicate → objects
     */
    readonly bySP = new Map<string, Map<string, Set<rdfjs.Quad_Object>>>();

    /**
     * Maps: object (URI/bnode) → predicate → subjects
     */
    readonly byOP = new Map<string, Map<string, Set<rdfjs.Quad_Subject>>>();

    /**
     * Maps: subject value → subject term (for term recovery in pairs())
     */
    private readonly byST = new Map<string, rdfjs.Quad_Subject>();

    /**
     * Add a quad to the index.
     * @param quad The quad to add.
     * @returns `true` if the quad was added, `false` if it was already present.
     */
    add(quad: rdfjs.Quad): boolean {
        const s = quad.subject.value;
        const p = quad.predicate.value;
        const o = quad.object;
        const ov = o.value;

        this._setSubjectTermIfMissing(s, quad.subject);

        const objectsByPredicateAndSubject = this._getNestedSet(this.byPS, p, s);

        if (this._hasObject(objectsByPredicateAndSubject, o)) {
            return false;
        } else {
            objectsByPredicateAndSubject.add(o);

            this._getNestedSet(this.byPO, p, ov).add(quad.subject);
            this._getNestedSet(this.bySP, s, p).add(o);
            this._getNestedSet(this.byOP, ov, p).add(quad.subject);

            return true;
        }
    }

    /**
     * Look up all objects for a given predicate + subject.
     * @param predicate The predicate to look up.
     * @param subject The subject to look up.
     * @returns A read-only set of objects.
     */
    getObjects(predicate: string, subject: string): ReadonlySet<rdfjs.Quad_Object> {
        return this.byPS.get(predicate)?.get(subject) ?? _empty;
    }

    /**
     * Look up all subjects for a given predicate + object value.
     * @param predicate The predicate to look up.
     * @param objectValue The object value to look up.
     * @returns A read-only set of subjects.
     */
    getSubjects(predicate: string, objectValue: string): ReadonlySet<rdfjs.Quad_Subject> {
        return this.byPO.get(predicate)?.get(objectValue) ?? _emptySubjects;
    }

    /**
     * Look up all objects a subject has for a given predicate.
     * @param subject The subject to look up.
     * @param predicate The predicate to look up.
     * @returns A read-only set of objects.
     */
    getObjectsForSubject(subject: string, predicate: string): ReadonlySet<rdfjs.Quad_Object> {
        return this.bySP.get(subject)?.get(predicate) ?? _empty;
    }

    /**
     * Look up all subjects that have a given object for a given predicate.
     * @param objectValue The object value to look up.
     * @param predicate The predicate to look up.
     * @returns A read-only set of subjects.
     */
    getSubjectsForObject(objectValue: string, predicate: string): ReadonlySet<rdfjs.Quad_Subject> {
        return this.byOP.get(objectValue)?.get(predicate) ?? _emptySubjects;
    }

    /**
     * Iterate all (subject, object) pairs for a given predicate.
     * @param predicate The predicate to look up.
     * @returns An iterable of (subject, object) pairs.
     */
    *pairs(predicate: string): Iterable<[rdfjs.Quad_Subject, rdfjs.Quad_Object]> {
        const subjects = this.byPS.get(predicate);

        if (!subjects) {
            return;
        }

        for (const [subjectValue, objects] of subjects) {
            const subjectTerm = this.byST.get(subjectValue)!;

            for (const o of objects) {
                yield [subjectTerm, o];
            }
        }
    }

    /**
     * Check if the index contains a triple with this predicate, subject, and object value.
     * @param predicate The predicate to look up.
     * @param subject The subject to look up.
     * @param objectValue The object value to look up.
     * @returns `true` if the triple is present, `false` otherwise.
     */
    has(predicate: string, subject: string, objectValue: string): boolean {
        const objects = this.byPS.get(predicate)?.get(subject);

        if (!objects) {
            return false;
        }

        for (const o of objects) {
            if (o.value === objectValue) return true;
        }

        return false;
    }

    private _hasObject(set: Set<rdfjs.Quad_Object>, obj: rdfjs.Quad_Object): boolean {
        for (const o of set) {
            if (o.value === obj.value && o.termType === obj.termType) {
                return true;
            }
        }

        return false;
    }

    private _setSubjectTermIfMissing(subjectValue: string, subject: rdfjs.Quad_Subject): void {
        if (!this.byST.has(subjectValue)) {
            this.byST.set(subjectValue, subject);
        }
    }

    private _getNestedSet<K1, K2, TValue>(
        index: Map<K1, Map<K2, Set<TValue>>>,
        key1: K1,
        key2: K2,
    ): Set<TValue> {
        const levelTwo = this._getOrCreate(index, key1, () => new Map<K2, Set<TValue>>());

        return this._getOrCreate(levelTwo, key2, () => new Set<TValue>());
    }

    private _getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
        const existing = map.get(key);

        if (existing !== undefined) {
            return existing;
        }

        const created = create();

        map.set(key, created);

        return created;
    }
}

/**
 * A read-only empty set of objects, used as a default return 
 * value for lookups that yield no results.
 */
const _empty: ReadonlySet<rdfjs.Quad_Object> = new Set();

/**
 * A read-only empty set of subjects, used as a default return 
 * value for lookups that yield no results.
 */
const _emptySubjects: ReadonlySet<rdfjs.Quad_Subject> = new Set();