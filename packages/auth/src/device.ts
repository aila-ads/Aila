const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

function firstMatch(
  value: string,
  patterns: ReadonlyArray<readonly [RegExp, string]>,
): string | undefined {
  return patterns.find(([pattern]) => pattern.test(value))?.[1];
}

/**
 * A readable device name such as "Chrome on Windows" from a session's
 * user agent, or null when neither the browser nor the system is known.
 */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) {
    return null;
  }

  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);

  if (browser && system) {
    return `${browser} on ${system}`;
  }

  return browser ?? system ?? null;
}
