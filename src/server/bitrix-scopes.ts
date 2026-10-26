export function hasBitrixScope(scopes: string[], requested: string): boolean {
  if (requested === "sonet") {
    return scopes.includes("sonet") || scopes.includes("sonet_group");
  }
  if (requested === "user_brief") {
    return scopes.includes("user_brief") || scopes.includes("user");
  }
  return scopes.includes(requested);
}
