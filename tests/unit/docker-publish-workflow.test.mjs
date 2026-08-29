import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = ".github/workflows/docker-publish.yml";

test("docker-publish workflow is valid YAML and includes Docker Hub reliability hardening", () => {
  const content = fs.readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(content.length > 0, `${WORKFLOW_PATH} is empty`);

  const doc = yaml.load(content);
  assert.ok(doc && typeof doc === "object", "Workflow could not be parsed as a YAML object");

  const job = doc.jobs?.docker;
  assert.ok(job, "docker job missing from docker-publish.yml");

  const steps = job.steps || [];

  // 1. Verify buildx setup has concurrency limit to prevent registry upload desync
  const buildxStep = steps.find((s) => s.uses && s.uses.startsWith("docker/setup-buildx-action"));
  assert.ok(buildxStep, "docker/setup-buildx-action step missing");
  assert.ok(
    buildxStep.with?.["buildkitd-config-inline"]?.includes("maxRegistryConcurrency"),
    "setup-buildx-action must configure maxRegistryConcurrency to avoid Docker Hub push overload"
  );

  // 2. Verify all build-push-action steps disable provenance and sbom
  const pushSteps = steps.filter((s) => s.uses && s.uses.startsWith("docker/build-push-action"));
  assert.ok(pushSteps.length >= 2, "Expected at least 2 build-push-action steps (base and cli)");

  for (const step of pushSteps) {
    const withBlock = step.with || {};
    assert.equal(
      withBlock.provenance,
      false,
      `Step "${step.name || "build-push"}" must set provenance: false to avoid Docker Hub blob upload unknown errors`
    );
    assert.equal(
      withBlock.sbom,
      false,
      `Step "${step.name || "build-push"}" must set sbom: false to avoid extraneous attestation blob pushes`
    );
    assert.equal(
      step.env?.DOCKER_BUILDKIT_INLINE_CACHE,
      undefined,
      `Step "${step.name || "build-push"}" should not set DOCKER_BUILDKIT_INLINE_CACHE when type=gha is used`
    );
  }
});
