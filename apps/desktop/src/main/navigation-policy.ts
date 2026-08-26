export function isAllowedTopLevelNavigation(
  url: string,
  developmentUrl?: string,
  packagedUrl?: string
): boolean {
  if (developmentUrl) {
    try {
      return new URL(url).origin === new URL(developmentUrl).origin;
    } catch {
      return false;
    }
  }
  return url === packagedUrl;
}
