import test from "node:test";
import assert from "node:assert/strict";

const { addSchemaPlaceholders, cleanJSONSchemaForAntigravity } =
  await import("../../open-sse/translator/helpers/geminiHelper.ts");

const PLACEHOLDER = {
  reason: {
    type: "string",
    description: "Brief explanation of why you are calling this tool",
  },
};

// --- Positive: schema positions get backfilled -------------------------------

test("a parameters schema reduced to {} is backfilled", () => {
  const schema = {};
  addSchemaPlaceholders(schema, true);
  assert.deepEqual(schema, {
    type: "object",
    properties: PLACEHOLDER,
    required: ["reason"],
  });
});

test("a bare {type:'object'} is backfilled", () => {
  const schema = { type: "object" };
  addSchemaPlaceholders(schema, true);
  assert.deepEqual(schema.properties, PLACEHOLDER);
  assert.deepEqual(schema.required, ["reason"]);
});

test("a nested property that is an empty object schema is backfilled", () => {
  const schema = {
    type: "object",
    properties: { foo: { type: "object" }, bar: { type: "string" } },
    required: ["foo"],
  };
  addSchemaPlaceholders(schema, true);
  assert.deepEqual(schema.properties.foo.properties, PLACEHOLDER);
  assert.deepEqual(schema.properties.foo.required, ["reason"]);
  assert.deepEqual(schema.properties.bar, { type: "string" });
  // Parent already had properties, so it is untouched apart from its child.
  assert.deepEqual(schema.required, ["foo"]);
});

test("items and $defs are schema positions", () => {
  const schema = {
    type: "object",
    properties: { list: { type: "array", items: {} } },
    $defs: { Empty: { type: "object" } },
  };
  addSchemaPlaceholders(schema, true);
  assert.deepEqual(schema.properties.list.items.properties, PLACEHOLDER);
  assert.deepEqual(schema.$defs.Empty.properties, PLACEHOLDER);
});

test("anyOf / oneOf / allOf members are schema positions", () => {
  const schema = {
    type: "object",
    properties: {
      choice: { anyOf: [{ type: "object" }, { type: "string" }] },
    },
  };
  addSchemaPlaceholders(schema, true);
  assert.deepEqual(schema.properties.choice.anyOf[0].properties, PLACEHOLDER);
  assert.deepEqual(schema.properties.choice.anyOf[1], { type: "string" });
});

test("{type:'string'} is untouched", () => {
  const schema = { type: "string" };
  const before = JSON.stringify(schema);
  addSchemaPlaceholders(schema, true);
  assert.equal(JSON.stringify(schema), before);
});

// --- Negative: non-schema positions must be byte-identical -------------------
// These are the silent-corruption cases. A position-blind walk injects
// {type:"object", properties:{reason:...}, required:["reason"]} into each of
// them, changing the tool contract with no error anywhere.

const NEGATIVE_CASES = [
  ["default", { type: "string", default: {} }],
  [
    "additionalProperties",
    { type: "object", properties: { a: { type: "string" } }, additionalProperties: {} },
  ],
  ["const", { type: "string", const: {} }],
  ["enum", { type: "string", enum: [{}] }],
  ["examples", { type: "string", examples: [{}] }],
  [
    "a user-declared property literally named type",
    { type: "object", properties: { type: { type: "string" } } },
  ],
];

for (const [label, schema] of NEGATIVE_CASES) {
  test(`non-schema position is byte-identical: ${label}`, () => {
    const before = JSON.stringify(schema);
    addSchemaPlaceholders(schema, true);
    assert.equal(JSON.stringify(schema), before);
  });
}

test("an unknown vendor key holding {} is not treated as a schema position", () => {
  const schema = { type: "string", "x-vendor-thing": {} };
  const before = JSON.stringify(schema);
  addSchemaPlaceholders(schema, true);
  assert.equal(JSON.stringify(schema), before);
});

test("nothing is backfilled when the root is not a schema position", () => {
  const notASchema = { anything: { type: "object" } };
  const before = JSON.stringify(notASchema);
  addSchemaPlaceholders(notASchema, false);
  assert.equal(JSON.stringify(notASchema), before);
});

// --- End to end through the public cleaner -----------------------------------

test("a $ref-only parameters schema survives cleaning as a valid object schema", () => {
  const cleaned = cleanJSONSchemaForAntigravity({ $ref: "#/$defs/Foo" });
  assert.equal(cleaned.type, "object");
  assert.deepEqual(cleaned.properties, PLACEHOLDER);
  assert.deepEqual(cleaned.required, ["reason"]);
});

test("a populated schema keeps its own properties through cleaning", () => {
  const cleaned = cleanJSONSchemaForAntigravity({
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  });
  assert.deepEqual(cleaned.properties, { path: { type: "string" } });
  assert.deepEqual(cleaned.required, ["path"]);
  assert.ok(!("reason" in cleaned.properties));
});
