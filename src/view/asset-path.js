export const ASSET_VERSION = "0.1.3";

export function assetPath(path) {
  return `${path}?v=${encodeURIComponent(ASSET_VERSION)}`;
}
