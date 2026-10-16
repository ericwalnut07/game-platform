/** Archive identifiers are data, not supported runtime rules. Never relabel an old outbox. */
export function hubRuleMetadata(state: { config: unknown; rulesVersion: string; rulesVariant?: string; testVersion?: string | null }) {
  const historical = state.config as { rulesVariant?: string; testVersion?: string };
  return {
    rulesVariant: state.rulesVariant ?? historical.rulesVariant ?? (state.rulesVersion === "1.0" ? "FORMAL" : state.rulesVersion.startsWith("next-") ? "NEXT" : "V05"),
    testVersion: state.testVersion ?? historical.testVersion ?? null
  };
}
