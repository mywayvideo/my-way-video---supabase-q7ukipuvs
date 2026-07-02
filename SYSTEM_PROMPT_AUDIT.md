# AI Prompt Logic Audit

## Summary

This document clarifies the behavior of `system_prompt` from `ai_agent_settings` versus prompt fields in `ai_settings` across both edge functions.

## Table Fields

| Table               | Field                    | Purpose                                         |
| ------------------- | ------------------------ | ----------------------------------------------- |
| `ai_agent_settings` | `system_prompt`          | General agent identity/behavior prompt (global) |
| `ai_settings`       | `system_prompt_template` | Operational template with rules (global)        |
| `ai_settings`       | `product_page_prompt`    | Product-specific prompt (Product Page only)     |
| `ai_settings`       | `logistics_rules_prompt` | Logistics/shipping rules (global)               |
| `ai_settings`       | `technical_bridge`       | Technical product bridge mappings (global)      |

## Behavior Before Fix

### `call-ai-agent` (Homepage Chat Agent)

- `system_prompt` from `ai_agent_settings` was used as the base prompt.
- On the **Product Page**, `product_page_prompt` from `ai_settings` would **REPLACE** `system_prompt` entirely.
- On the **Homepage**, `system_prompt_template` from `ai_settings` would **REPLACE** `system_prompt`.
- **Problem:** The global `system_prompt` was being lost on both the Product Page and when `system_prompt_template` existed.

### `ai-search` (AI Search with Tool Calls)

- `system_prompt` from `ai_agent_settings` was **always included** in the system prompt.
- `product_page_prompt` was conditionally appended when on a Product Page.
- `system_prompt_template` was always included.
- **This was already correct** — `system_prompt` was never replaced.

## Behavior After Fix

### `call-ai-agent` (Fixed)

- `system_prompt` from `ai_agent_settings` is **always used as the base** (global).
- `system_prompt_template` from `ai_settings` is **appended** (not replacing).
- `product_page_prompt` from `ai_settings` is **appended** on Product Pages (not replacing).
- **Result:** `system_prompt` is now globally applied across ALL pages, consistent with `ai-search`.

### `ai-search` (No changes needed)

- Already correctly includes `system_prompt` globally and appends `product_page_prompt` conditionally.

## Conclusion

The `ai_agent_settings.system_prompt` is now **globally applied** across both the Homepage and Product Page in both edge functions. The `product_page_prompt` and `system_prompt_template` from `ai_settings` are **supplementary** prompts that are appended, not replacements.
