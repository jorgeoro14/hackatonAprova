"""Check documentation extraction and synthetic response shapes entirely offline."""

from copy import deepcopy

import pytest
from agents.aprova_reference import API_CONTRACT, RESOURCE_GUIDE, RESPONSE_TEMPLATES, get_reference
from agents.extract_aprova_docs import extract_contract, schema_from_openapi
from jsonschema import Draft202012Validator, FormatChecker


def test_all_documented_shapes_are_valid_and_templates_match_operation_schema():
    operations = API_CONTRACT["operations"]
    for operation in operations.values():
        for parameter in operation["parameters"]:
            Draft202012Validator.check_schema(parameter["schema"])
        if operation["request_body"]:
            Draft202012Validator.check_schema(operation["request_body"]["schema"])
        for schema in operation["responses"].values():
            if schema is not None:
                Draft202012Validator.check_schema(schema)
    for template in RESPONSE_TEMPLATES["templates"]:
        operation = operations[template["operation_id"]]
        schema = operation["responses"][template["status"]]
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(template["body"])
    read_operations = {
        name for name, operation in operations.items() if operation["method"] == "GET"
    }
    represented = {template["operation_id"] for template in RESPONSE_TEMPLATES["templates"]}
    assert read_operations <= represented


@pytest.mark.parametrize("resource", ["process", "forms", "templates", "dispatches", "blueprints"])
def test_reference_is_scoped_and_cannot_be_mutated_by_caller(resource):
    reference = get_reference(resource)
    assert reference["is_employee_answer"] is False
    assert reference["is_municipal_catalog"] is False
    assert reference["is_official_developer_questionnaire"] is False
    assert reference["execution_policy"] == "reference_only_no_api_calls"
    assert reference["response_templates"]["data_kind"] == "synthetic_response_templates"
    assert reference["guide"]["documentation_url"].startswith("https://hubapi.aprova.com.br/")
    assert all(
        API_CONTRACT["operations"][name]["resource"] == resource for name in reference["operations"]
    )
    reference["guide"]["facts"].clear()
    assert get_reference(resource)["guide"]["facts"]


def test_full_operation_lookup_and_unknown_resource_rejection():
    operation_id = "getBlueprintPostV1Http"
    reference = get_reference("dispatches", operation_id)
    assert reference["operations"][operation_id]["responses"]["200"]["type"] == "object"
    assert all(
        template["operation_id"] == operation_id
        for template in reference["response_templates"]["templates"]
    )
    with pytest.raises(ValueError, match="Unknown"):
        get_reference("../../secrets")
    with pytest.raises(ValueError, match="does not belong"):
        get_reference("templates", operation_id)


def test_nullable_conversion_preserves_actual_property_names_and_does_not_mutate_source():
    schema = {
        "type": "object",
        "description": "Source prose",
        "properties": {
            "description": {"type": "string", "nullable": True, "example": "example text"},
            "title": {"type": "string"},
        },
    }
    original = deepcopy(schema)
    converted = schema_from_openapi(schema)
    assert "description" not in converted
    assert set(converted["properties"]) == {"description", "title"}
    validator = Draft202012Validator(converted)
    validator.validate({"description": None, "title": "Example"})
    validator.validate({"description": "Text", "title": "Example"})
    assert schema == original


def test_extraction_excludes_unrelated_operations_and_preserves_method_specific_types():
    def operation(operation_id, tag):
        return {
            "operationId": operation_id,
            "tags": [tag],
            "security": [{"InternalAuth": []}],
            "responses": {"200": {"content": {"application/json": {"schema": {"type": "object"}}}}},
        }

    spec = {
        "openapi": "3.0.0",
        "servers": [{"url": "https://api.example.invalid"}],
        "paths": {
            "/example": {"get": operation("exampleRead", "Process")},
            "/unrelated": {"post": operation("unrelatedWrite", "API keys")},
        },
    }
    extracted = extract_contract(spec, b"synthetic source bytes")
    assert set(extracted["operations"]) == {"exampleRead"}
    assert extracted["source_kind"] == "public_api_documentation"
    assert len(extracted["source_sha256"]) == 64
    operations = API_CONTRACT["operations"]
    read = operations["getBlueprintPostV1Http"]["responses"]["200"]["properties"]
    create = operations["createBlueprintPostV1Http"]["responses"]["201"]["properties"]
    assert read["statusList"]["items"]["type"] == "object"
    assert create["statusList"]["items"]["type"] == "string"
    assert read["deadlineValue"]["anyOf"][0]["type"] == "string"
    assert create["deadlineValue"]["anyOf"][0]["type"] == "number"


def test_every_resource_has_reference_only_capabilities_and_known_limits():
    assert set(RESOURCE_GUIDE["resources"]) == {
        "process",
        "forms",
        "templates",
        "dispatches",
        "blueprints",
    }
    for resource in RESOURCE_GUIDE["resources"].values():
        assert resource["meaning"]
        assert resource["facts"]
        assert resource["limits"]
        assert resource["interview_questions"]
