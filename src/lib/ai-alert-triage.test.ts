import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTriageDecision } from "./ai-alert-triage";

// The whole feature rests on one invariant: parseTriageDecision only reports
// `suppress: true` for a clean, explicit positive decision. Everything else —
// malformed output, wrong types, missing fields, empty input — must fail open
// (surface the alert), because suppression withholds a notification.

test("explicit suppress:true is honored and reason is kept", () => {
  const d = parseTriageDecision('{"suppress": true, "reason": "cookie banner"}');
  assert.equal(d.suppress, true);
  assert.equal(d.reason, "cookie banner");
});

test("explicit suppress:false surfaces the alert", () => {
  const d = parseTriageDecision('{"suppress": false, "reason": "price changed"}');
  assert.equal(d.suppress, false);
});

test("JSON wrapped in prose or code fences is still parsed", () => {
  const d = parseTriageDecision('Here is my decision:\n```json\n{"suppress": true, "reason": "timestamp only"}\n```');
  assert.equal(d.suppress, true);
  assert.equal(d.reason, "timestamp only");
});

test("suppress:true with no reason gets a default reason", () => {
  const d = parseTriageDecision('{"suppress": true}');
  assert.equal(d.suppress, true);
  assert.ok(d.reason.length > 0);
});

test("malformed JSON fails open", () => {
  const d = parseTriageDecision('{"suppress": true, ');
  assert.equal(d.suppress, false);
});

test("no JSON object at all fails open", () => {
  const d = parseTriageDecision("I think this is probably noise, honestly.");
  assert.equal(d.suppress, false);
});

test("empty, null, and undefined all fail open", () => {
  assert.equal(parseTriageDecision("").suppress, false);
  assert.equal(parseTriageDecision(null).suppress, false);
  assert.equal(parseTriageDecision(undefined).suppress, false);
});

test("stringified 'true' is not a boolean and must not suppress", () => {
  const d = parseTriageDecision('{"suppress": "true", "reason": "x"}');
  assert.equal(d.suppress, false);
});

test("truthy non-boolean (1) must not suppress", () => {
  const d = parseTriageDecision('{"suppress": 1, "reason": "x"}');
  assert.equal(d.suppress, false);
});

test("missing suppress key fails open", () => {
  const d = parseTriageDecision('{"reason": "looks minor"}');
  assert.equal(d.suppress, false);
});

test("a JSON array (not an object) fails open", () => {
  const d = parseTriageDecision('[{"suppress": true}]');
  assert.equal(d.suppress, false);
});

test("an over-long reason is truncated", () => {
  const long = "x".repeat(500);
  const d = parseTriageDecision(`{"suppress": true, "reason": "${long}"}`);
  assert.equal(d.suppress, true);
  assert.ok(d.reason.length <= 200);
});
