"""One structured model boundary with instructions separate from source/user data."""

import json

from langchain_core.messages import HumanMessage, SystemMessage


def model_step(model, schema, instruction: str, data: dict):
    output = model.with_structured_output(schema).invoke(
        [
            SystemMessage(content=instruction),
            HumanMessage(content=json.dumps(data, ensure_ascii=False)),
        ]
    )
    return schema.model_validate(output)
