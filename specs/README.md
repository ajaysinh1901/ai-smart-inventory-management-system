# Specs

Design specifications produced by `architect-gst` and consumed by `backend-coder`.

## Files

- `01-schema-changes.md` — Mongoose schema additions / changes
- `02-gst-engine.md` — CGST / SGST / IGST split rules, HSN handling, edge cases
- `03-invoice-numbering.md` — Atomic, gap-free, FY-aware invoice number generator
- `04-pdf-template.md` — GST-compliant tax invoice PDF layout

## Spec Lifecycle

1. **Draft** — `architect-gst` produces the spec
2. **Approved** — orchestrator signs off
3. **Implemented** — `backend-coder` ships code matching the spec; appends `✅ Implemented in commit <sha>` line
4. **Frozen** — spec is locked unless requirement changes

## Spec Template

```markdown
# Spec: <title>
**Status:** Draft | Approved | Implemented
**Owner:** architect-gst
**Implements:** <task ID from PLAN.md>

## Problem

## Proposed Design

## Field Table (for schemas)
| Field | Type | Required | Default | Validator | Index | Notes |

## Example Payload

## Edge Cases

## Tests to Write

## ✅ Implemented in commit <sha>
```
