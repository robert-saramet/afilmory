export const isSafari =
  /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

export const isMobileDevice = (() => {
  if (typeof window === 'undefined') return false
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) ||
    // Modern detection method: supports touch and has a small screen
    'ontouchstart' in window
  )
})()
