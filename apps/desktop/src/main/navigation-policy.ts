export function isAllowedTopLevelNavigation(
  url: string,
  developmentUrl?: string,
  packagedUrl?: string
): boolean {
  if (developmentUrl) return url.startsWith(developmentUrl);
  return url === packagedUrl;
}
