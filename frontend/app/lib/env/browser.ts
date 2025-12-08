export function getBrowserInfo() {
  if (typeof navigator === "undefined") {
    return { isFirefox: false, isSafari: false, isChrome: false };
  }

  const ua = navigator.userAgent;
  const isFirefox = /Firefox\/\d+/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome =
    /Chrome\/\d+/.test(ua) && !isFirefox && !isSafari && !/Edg\//.test(ua);

  return { isFirefox, isSafari, isChrome };
}

export function isSafeGpuDefault(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const forced = params.get("safeGpu");
  if (forced === "0") return false;
  if (forced === "1") return true;

  const { isChrome } = getBrowserInfo();
  // Default: Chrome gets safe mode ON, others OFF.
  return isChrome;
}









