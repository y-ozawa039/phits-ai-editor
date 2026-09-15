//! Bounded server-initiated interactions. Never infer approval from prompt text.
use serde_json::{Value, json};

pub fn is_interaction(method: &str) -> bool {
    matches!(
        method,
        "item/tool/requestUserInput" | "tool/requestUserInput" | "mcpServer/elicitation/request"
    )
}

// Deliberately grant nothing in every exposed mode; do not echo requested access.
pub fn permissions_response(_params: &Value) -> Value {
    json!({"permissions":{},"scope":"turn"})
}

pub fn permissions_diagnostic(id: &Value) -> String {
    format!(
        "[editorPolicyDenied] エディタの権限制限により追加権限を付与しませんでした。ユーザーによる拒否ではありません。method=item/permissions/requestApproval requestId={id}"
    )
}

// This gate permits entry to the editor MCP bridge, NOT the PHITS calculation.
// The bridge applies the current mode, selected input and all Runner checks afterwards.
pub fn is_editor_run_gate(params: &Value, item: &Value) -> bool {
    params["serverName"] == "phits_ai_editor"
        && params["mode"] == "form"
        && params["requestedSchema"]["type"] == "object"
        && params["requestedSchema"]["properties"]
            .as_object()
            .is_some_and(|v| v.is_empty())
        && params["_meta"]["codex_approval_kind"] == "mcp_tool_call"
        && item["type"] == "mcpToolCall"
        && item["server"] == "phits_ai_editor"
        && item["tool"] == "run_phits"
        && item["arguments"].is_object()
        && item["arguments"] == params["_meta"]["tool_params"]
}

pub fn questions(method: &str, params: &Value) -> Result<Value, String> {
    if params.get("threadId").and_then(Value::as_str).is_none() {
        return Err("threadIdがありません。".into());
    }
    let result = if method != "mcpServer/elicitation/request" {
        let questions = params
            .get("questions")
            .and_then(Value::as_array)
            .ok_or("questionsがありません。")?;
        for question in questions {
            for field in ["id", "header", "question"] {
                if question.get(field).and_then(Value::as_str).is_none() {
                    return Err(format!("質問の{field}がありません。"));
                }
            }
            if let Some(options) = question.get("options").filter(|v| !v.is_null()) {
                let options = options.as_array().ok_or("optionsが配列ではありません。")?;
                if options.iter().any(|v| {
                    v.get("label").and_then(Value::as_str).is_none()
                        || v.get("description").and_then(Value::as_str).is_none()
                }) {
                    return Err("選択肢の形式に対応していません。".into());
                }
            }
        }
        Value::Array(questions.clone())
    } else {
        if params.get("serverName").and_then(Value::as_str).is_none()
            || params.get("message").and_then(Value::as_str).is_none()
        {
            return Err("MCPサーバー名または要求内容がありません。".into());
        }
        // URL and arbitrary openai/form requests cannot silently grant external access.
        if params["mode"] != "form" {
            return Err(
                "このMCP確認形式にはまだ対応していません。外部URLは自動で開きません。".into(),
            );
        }
        let schema = &params["requestedSchema"];
        if schema["type"] != "object" {
            return Err("MCPフォームがobject形式ではありません。".into());
        }
        let properties = schema["properties"]
            .as_object()
            .ok_or("MCPフォームの項目がありません。")?;
        if schema.as_object().is_none_or(|fields| {
            fields
                .keys()
                .any(|key| !matches!(key.as_str(), "$schema" | "type" | "properties" | "required"))
        }) {
            return Err("このMCPフォーム全体の制約にはまだ対応していません。".into());
        }
        if let Some(required) = schema.get("required").filter(|v| !v.is_null()) {
            let required = required
                .as_array()
                .ok_or("必須項目が配列ではありません。")?;
            if required
                .iter()
                .any(|v| v.as_str().is_none_or(|id| !properties.contains_key(id)))
            {
                return Err("必須項目の定義が一致しません。".into());
            }
        }
        let mut result = Vec::new();
        for (id, field) in properties {
            let field_type = field["type"]
                .as_str()
                .ok_or("MCPフォームの型がありません。")?;
            if !matches!(field_type, "string" | "boolean" | "number" | "integer")
                || field.as_object().is_none_or(|fields| {
                    fields.keys().any(|key| {
                        !matches!(
                            key.as_str(),
                            "type"
                                | "title"
                                | "description"
                                | "default"
                                | "enum"
                                | "enumNames"
                                | "minLength"
                                | "maxLength"
                                | "minimum"
                                | "maximum"
                        )
                    })
                })
            {
                return Err("このMCPフォームの型・制約にはまだ対応していません。".into());
            }
            for key in ["minimum", "maximum"] {
                if let Some(value) = field.get(key).filter(|v| !v.is_null())
                    && (!matches!(field_type, "number" | "integer") || value.as_f64().is_none())
                {
                    return Err("MCPフォームの数値制約形式に対応していません。".into());
                }
            }
            for key in ["minLength", "maxLength"] {
                if let Some(value) = field.get(key).filter(|v| !v.is_null())
                    && (field_type != "string" || value.as_u64().is_none())
                {
                    return Err("MCPフォームの文字数制約形式に対応していません。".into());
                }
            }
            if let Some(value) = field.get("enum").filter(|v| !v.is_null())
                && (field_type != "string" || value.as_array().is_none_or(|v| v.is_empty()))
            {
                return Err("MCPフォームの選択肢制約形式に対応していません。".into());
            }
            let options = if field_type == "boolean" {
                json!([{"label":"true","description":"はい"},{"label":"false","description":"いいえ"}])
            } else if let Some(values) = field.get("enum").and_then(Value::as_array) {
                if field_type != "string" || values.iter().any(|v| !v.is_string()) {
                    return Err("MCPフォームの選択肢形式には対応していません。".into());
                }
                json!(values.iter().enumerate().map(|(index, v)| json!({"label":v,
                    "description":field.get("enumNames").and_then(|v| v.get(index)).and_then(Value::as_str).unwrap_or("")})).collect::<Vec<_>>())
            } else {
                Value::Null
            };
            result.push(json!({"id":id,"header":field.get("title").and_then(Value::as_str).unwrap_or(id),
                "question":field.get("description").and_then(Value::as_str).unwrap_or(id),
                "options":options,"inputType":field_type,"isOther":false,"isSecret":false,
                "required":schema["required"].as_array().is_some_and(|v| v.iter().any(|v| v.as_str() == Some(id.as_str())))}));
        }
        Value::Array(result)
    };
    let rows = result.as_array().ok_or("質問が配列ではありません。")?;
    if rows.len() > 20 || (rows.is_empty() && method != "mcpServer/elicitation/request") {
        return Err("質問数が対応範囲外です。".into());
    }
    let mut ids = std::collections::HashSet::new();
    if rows
        .iter()
        .any(|v| !ids.insert(v["id"].as_str().unwrap_or("")))
    {
        return Err("質問IDが重複しています。".into());
    }
    Ok(result)
}

pub fn response(
    method: &str,
    params: &Value,
    decision: &str,
    answers: Option<&Value>,
) -> Result<Value, String> {
    if !matches!(decision, "accept" | "decline" | "cancel") {
        return Err("この確認要求はセッション・コマンド規則の承認に対応していません。".into());
    }
    let rows = questions(method, params)?;
    let form = method == "mcpServer/elicitation/request";
    if decision != "accept" {
        return Ok(if form {
            json!({"action":decision,"content":null})
        } else {
            json!({"answers":{}})
        });
    }
    let empty = serde_json::Map::new();
    let answers = if form && rows.as_array().unwrap().is_empty() {
        answers.and_then(Value::as_object).unwrap_or(&empty)
    } else {
        answers
            .and_then(Value::as_object)
            .ok_or("回答がありません。")?
    };
    if answers.keys().any(|id| {
        !rows
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == id.as_str())
    }) {
        return Err("要求されていない質問への回答があります。".into());
    }
    let mut output = serde_json::Map::new();
    for row in rows.as_array().unwrap() {
        let id = row["id"].as_str().unwrap();
        let answer = answers.get(id).and_then(Value::as_str).unwrap_or("");
        if answer.is_empty() {
            if !form || row["required"] == true {
                return Err("未回答の必須項目があります。".into());
            }
            continue;
        }
        if answer.len() > 16_384 {
            return Err("回答が長すぎます。".into());
        }
        if let Some(options) = row["options"].as_array().filter(|v| !v.is_empty())
            && row["isOther"] != true
            && !options.iter().any(|v| v["label"] == answer)
        {
            return Err("提示されていない選択肢です。".into());
        }
        if !form {
            output.insert(id.into(), json!({"answers":[answer]}));
            continue;
        }
        let field = &params["requestedSchema"]["properties"][id];
        let value = match row["inputType"].as_str().unwrap_or("string") {
            "boolean" => json!(answer.parse::<bool>().map_err(|_| "真偽値が必要です。")?),
            "number" | "integer" => {
                let value: Value = serde_json::from_str(answer).map_err(|_| "数値が必要です。")?;
                let number = value.as_f64().ok_or("数値が必要です。")?;
                if (row["inputType"] == "integer" && number.fract() != 0.0)
                    || field["minimum"].as_f64().is_some_and(|v| number < v)
                    || field["maximum"].as_f64().is_some_and(|v| number > v)
                {
                    return Err("数値が指定された範囲外です。".into());
                }
                value
            }
            _ => {
                let length = answer.chars().count() as u64;
                if field["minLength"].as_u64().is_some_and(|v| length < v)
                    || field["maxLength"].as_u64().is_some_and(|v| length > v)
                {
                    return Err("文字数が指定された範囲外です。".into());
                }
                json!(answer)
            }
        };
        output.insert(id.into(), value);
    }
    Ok(if form {
        json!({"action":"accept","content":output})
    } else {
        json!({"answers":output})
    })
}

pub fn diagnostic(id: &Value, method: &str, params: &Value, reason: &str) -> String {
    // Only protocol identifiers: never log arbitrary question/form contents or answers.
    format!(
        "[editorUnsupported] エディタが対応できない要求です。ユーザーによる拒否ではありません。method={} requestId={} threadId={} turnId={} reason={}",
        method,
        id,
        params
            .get("threadId")
            .and_then(Value::as_str)
            .unwrap_or("—"),
        params.get("turnId").and_then(Value::as_str).unwrap_or("—"),
        reason
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_gate_requires_exact_correlated_tool_and_arguments() {
        let params = json!({"serverName":"phits_ai_editor","mode":"form",
            "requestedSchema":{"type":"object","properties":{}},"_meta":{"codex_approval_kind":"mcp_tool_call","tool_params":{"inputRelativePath":"main.inp"}}});
        let item = json!({"type":"mcpToolCall","server":"phits_ai_editor","tool":"run_phits","arguments":{"inputRelativePath":"main.inp"}});
        assert!(is_editor_run_gate(&params, &item));
        let mut other = item.clone();
        other["tool"] = json!("other");
        assert!(!is_editor_run_gate(&params, &other));
        other = item.clone();
        other["arguments"]["inputRelativePath"] = json!("other.inp");
        assert!(!is_editor_run_gate(&params, &other));
    }
    #[test]
    fn empty_mcp_tool_confirmation_uses_actions_not_question_answers() {
        let params = json!({"threadId":"t","serverName":"s","mode":"form","message":"Allow?",
            "requestedSchema":{"type":"object","properties":{}}});
        for decision in ["accept", "decline", "cancel"] {
            let value = response("mcpServer/elicitation/request", &params, decision, None).unwrap();
            assert_eq!(value["action"], decision);
            assert_eq!(
                value["content"],
                if decision == "accept" {
                    json!({})
                } else {
                    Value::Null
                }
            );
        }
    }
    #[test]
    fn tool_approval_roundtrip_and_cancellation() {
        let params = json!({"threadId":"t","questions":[{"id":"approval","header":"Tool","question":"Run?",
            "options":[{"label":"Accept","description":"Run"},{"label":"Decline","description":"Do not run"}]}]});
        for method in ["item/tool/requestUserInput", "tool/requestUserInput"] {
            assert_eq!(questions(method, &params).unwrap()[0]["id"], "approval");
            assert_eq!(
                response(
                    method,
                    &params,
                    "accept",
                    Some(&json!({"approval":"Accept"}))
                )
                .unwrap(),
                json!({"answers":{"approval":{"answers":["Accept"]}}})
            );
            assert_eq!(
                response(method, &params, "cancel", None).unwrap(),
                json!({"answers":{}})
            );
            assert!(
                response(
                    method,
                    &params,
                    "accept",
                    Some(&json!({"approval":"Always"}))
                )
                .is_err()
            );
            assert!(response(method, &params, "acceptForSession", None).is_err());
        }
    }
    #[test]
    fn forms_validate_content_and_never_open_urls() {
        let params = json!({"threadId":"t","serverName":"s","message":"Confirm","mode":"form",
            "requestedSchema":{"type":"object","properties":{"run":{"type":"boolean"}},"required":["run"]}});
        assert_eq!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&json!({"run":"true"}))
            )
            .unwrap(),
            json!({"action":"accept","content":{"run":true}})
        );
        assert!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&json!({}))
            )
            .is_err()
        );
        let mut url = params.clone();
        url["mode"] = json!("url");
        assert!(questions("mcpServer/elicitation/request", &url).is_err());
    }
    #[test]
    fn form_constraints_and_unknown_shapes_are_not_silently_ignored() {
        let mut params = json!({"threadId":"t","serverName":"s","message":"Confirm","mode":"form",
            "requestedSchema":{"type":"object","properties":{"batches":{"type":"integer","minimum":1,"maximum":10}},"required":["batches"]}});
        for value in ["0", "11", "1.5", "null", "NaN"] {
            assert!(
                response(
                    "mcpServer/elicitation/request",
                    &params,
                    "accept",
                    Some(&json!({"batches":value}))
                )
                .is_err()
            );
        }
        assert_eq!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&json!({"batches":"2"}))
            )
            .unwrap()["content"]["batches"],
            2
        );
        params["requestedSchema"]["properties"]["batches"]["multipleOf"] = json!(2);
        assert!(questions("mcpServer/elicitation/request", &params).is_err());
        params["requestedSchema"]["properties"]["batches"] = json!({"type":"array"});
        assert!(questions("mcpServer/elicitation/request", &params).is_err());
    }
    #[test]
    fn diagnostic_is_not_a_user_decline_and_excludes_secrets() {
        let log = diagnostic(
            &json!(7),
            "unknown/method",
            &json!({"threadId":"t","secret":"TOKEN"}),
            "unknown",
        );
        assert!(log.contains("editorUnsupported"));
        assert!(log.contains("unknown/method"));
        assert!(!log.contains("TOKEN"));
    }

    #[test]
    fn populated_form_roundtrip_preserves_types_and_omits_optional_empty() {
        let params = json!({"threadId":"t","serverName":"s","message":"Form","mode":"form",
            "requestedSchema":{"type":"object","properties":{
                "label":{"type":"string","minLength":2,"maxLength":4},
                "choice":{"type":"string","enum":["one","two"]},
                "enabled":{"type":"boolean"},"count":{"type":"integer","minimum":1,"maximum":5},
                "ratio":{"type":"number","minimum":0,"maximum":1},"optional":{"type":"string"}},
                "required":["label","choice","enabled","count","ratio"]}});
        let answers = json!({"label":"検査","choice":"two","enabled":"false","count":"3","ratio":"0.5","optional":""});
        assert_eq!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&answers)
            )
            .unwrap(),
            json!({"action":"accept","content":{"label":"検査","choice":"two","enabled":false,"count":3,"ratio":0.5}})
        );
        for (field, value) in [
            ("label", "a"),
            ("label", "abcde"),
            ("choice", "three"),
            ("enabled", "yes"),
            ("ratio", "1.1"),
        ] {
            let mut invalid = answers.clone();
            invalid[field] = json!(value);
            assert!(
                response(
                    "mcpServer/elicitation/request",
                    &params,
                    "accept",
                    Some(&invalid)
                )
                .is_err()
            );
        }
        let mut extra = answers.clone();
        extra["unexpected"] = json!("value");
        assert!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&extra)
            )
            .is_err()
        );
        for decision in ["decline", "cancel"] {
            assert_eq!(
                response("mcpServer/elicitation/request", &params, decision, None).unwrap(),
                json!({"action":decision,"content":null})
            );
        }
    }

    #[test]
    fn oversized_forms_answers_and_extended_formats_are_rejected() {
        let mut properties = serde_json::Map::new();
        for i in 0..21 {
            properties.insert(format!("field{i}"), json!({"type":"string"}));
        }
        let mut params = json!({"threadId":"t","serverName":"s","message":"Form","mode":"form",
            "requestedSchema":{"type":"object","properties":properties}});
        assert!(questions("mcpServer/elicitation/request", &params).is_err());
        params["requestedSchema"]["properties"] = json!({"value":{"type":"string"}});
        assert!(
            response(
                "mcpServer/elicitation/request",
                &params,
                "accept",
                Some(&json!({"value":"a".repeat(16_385)}))
            )
            .is_err()
        );
        params["mode"] = json!("openai/form");
        assert!(questions("mcpServer/elicitation/request", &params).is_err());
    }

    #[test]
    fn additional_permissions_never_expand_access_or_become_session_grants() {
        for mode in [
            "confirmFirst",
            "onRequest",
            "autonomousWorkspace",
            "consultOnly",
        ] {
            for permissions in [
                json!({"network":{"enabled":true}}),
                json!({"fileSystem":{"write":["C:\\outside"],"read":["C:\\private"]}}),
                json!({"fileSystem":{"entries":[{"path":{"type":"path","path":"C:\\outside"},"access":"write"}]},"network":{"enabled":true}}),
                json!({}),
            ] {
                let params = json!({"threadId":"t","turnId":"u","itemId":"i","reason":"SECRET",
                    "approvalMode":mode,"permissions":permissions});
                let before = params.clone();
                assert_eq!(
                    permissions_response(&params),
                    json!({"permissions":{},"scope":"turn"})
                );
                assert_eq!(params, before);
            }
        }
        let log = permissions_diagnostic(&json!(9));
        assert!(log.contains("editorPolicyDenied"));
        assert!(log.contains("ユーザーによる拒否ではありません"));
        assert!(!log.contains("SECRET"));
    }
}
