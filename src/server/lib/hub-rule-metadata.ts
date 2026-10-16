/** Archive identifiers are data, not supported runtime rules. Never relabel an old outbox. */
export function hubRuleMetadata(config: unknown) {
  const historical = config as { rulesVariant?: string; testVersion?: string };
  return { rulesVariant: historical.rulesVariant ?? "FORMAL", testVersion: historical.testVersion ?? null };
}
