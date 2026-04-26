#!/usr/bin/env python3
"""
Generate W3C OWL 2 RL conformance test fixtures.

Downloads the approved OWL 2 RL test cases from the W3C test suite at
https://www.w3.org/2009/11/owl-test/profile-RL.rdf and converts them to
N-Triples format for use in the TypeScript conformance test suite.

Run:
    python3 scripts/generate-w3c-fixtures.py

Output:
    src/reasoners/owl-rl/tests/w3c-conformance.json
"""

import json
import sys
import urllib.request
from io import StringIO
from pathlib import Path

try:
    import rdflib
    from rdflib import Graph, RDF, URIRef
except ImportError:
    print("Error: rdflib is required. Install with: pip install rdflib", file=sys.stderr)
    sys.exit(1)

TEST_SUITE_URL = "https://www.w3.org/2009/11/owl-test/profile-RL.rdf"
OUTPUT_PATH = Path(__file__).parent.parent / "src/reasoners/owl-rl/tests/w3c-conformance.json"

TEST = rdflib.Namespace("http://www.w3.org/2007/OWL/testOntology#")


def rdfxml_to_ntriples(rdfxml_string: str) -> str:
    """Parse an RDF/XML string and serialize as N-Triples."""
    g = Graph()
    g.parse(data=rdfxml_string, format="xml")
    return g.serialize(format="ntriples")


def main():
    print(f"Downloading OWL RL test cases from {TEST_SUITE_URL} ...")
    with urllib.request.urlopen(TEST_SUITE_URL) as response:
        rdf_data = response.read().decode("utf-8")

    print("Parsing test manifest ...")
    manifest = Graph()
    manifest.parse(data=rdf_data, format="xml")

    test_cases = []
    skipped = 0

    for tc_iri in manifest.subjects(RDF.type, TEST.TestCase):
        # Only include approved tests
        status = manifest.value(tc_iri, TEST.status)
        if str(status) != str(TEST.Approved):
            continue

        # Only include tests that apply to the RL profile
        profiles = {str(p) for p in manifest.objects(tc_iri, TEST.profile)}
        if str(TEST.RL) not in profiles:
            continue

        # Collect test types (excluding the generic TestCase and ProfileIdentificationTest)
        all_types = {str(t) for t in manifest.objects(tc_iri, RDF.type)}
        test_types = [
            t.replace(str(TEST), "")
            for t in all_types
            if t.startswith(str(TEST)) and t not in (str(TEST.TestCase), str(TEST.ProfileIdentificationTest))
        ]

        # Applicable semantics
        semantics = {str(s).replace(str(TEST), "") for s in manifest.objects(tc_iri, TEST.semantics)}

        identifier = str(manifest.value(tc_iri, TEST.identifier) or "")
        description = str(manifest.value(tc_iri, TEST.description) or "")

        # Get RDF/XML ontology strings embedded in the test case
        premise_rdfxml = str(manifest.value(tc_iri, TEST.rdfXmlPremiseOntology) or "")
        conclusion_rdfxml = str(manifest.value(tc_iri, TEST.rdfXmlConclusionOntology) or "")
        non_conclusion_rdfxml = str(manifest.value(tc_iri, TEST.rdfXmlNonConclusionOntology) or "")

        # Convert RDF/XML to N-Triples
        try:
            premise_ntriples = rdfxml_to_ntriples(premise_rdfxml) if premise_rdfxml else ""
            conclusion_ntriples = rdfxml_to_ntriples(conclusion_rdfxml) if conclusion_rdfxml else ""
            non_conclusion_ntriples = rdfxml_to_ntriples(non_conclusion_rdfxml) if non_conclusion_rdfxml else ""
        except Exception as e:
            print(f"  WARNING: Skipping {identifier} due to parse error: {e}", file=sys.stderr)
            skipped += 1
            continue

        test_cases.append({
            "id": identifier,
            "iri": str(tc_iri),
            "types": sorted(test_types),
            "semantics": sorted(semantics),
            "description": description,
            "premiseNTriples": premise_ntriples,
            "conclusionNTriples": conclusion_ntriples,
            "nonConclusionNTriples": non_conclusion_ntriples,
        })

    test_cases.sort(key=lambda x: x["id"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(test_cases, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Generated {len(test_cases)} test cases ({skipped} skipped) -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
