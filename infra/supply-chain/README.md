# Supply-chain stubs (SDD §22.4)

## Container signing (cosign keyless)

CI should sign every image after build:

```bash
# STUB — enable when Artifact Registry + workload identity exist
cosign sign --yes \
  "$IMAGE@$(cosign triangulate --type digest "$IMAGE" 2>/dev/null || echo digest-replace)"
```

Admission: reject unsigned images in `prod` (Kyverno / Binary Authorization stub — not wired).

## SBOM

Generate CycloneDX on every build and attach to the image:

```bash
# STUB
npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json
```

## Provenance

Record SLSA provenance attestation alongside the SBOM. Until the GCP workload identity pool exists, this remains documentation only.
