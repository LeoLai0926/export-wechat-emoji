export function getStodownloadCandidates(url: string): Array<string> {
  // WeChat sticker URLs are often `.../stodownload?...`. Some resources require a correct
  // suffix (jpg/gif/png/webp) to be served/rendered, so we try multiple variants.
  const exts = ['gif', 'jpg', 'png', 'webp'] as const

  if (!url.includes('/stodownload')) {
    return [url]
  }

  const replaceExt = (ext: (typeof exts)[number]) =>
    url.replace(/\/stodownload(?:\.[a-z0-9]+)?\?/i, `/stodownload.${ext}?`)

  const candidates = [url, ...exts.map(replaceExt)]
  return Array.from(new Set(candidates))
}

export function extFromContentType(
  contentType: string | undefined
): string | null {
  if (!contentType) {
    return null
  }
  const ct = contentType.toLowerCase()
  if (ct.includes('image/gif')) {
    return 'gif'
  }
  if (ct.includes('image/png')) {
    return 'png'
  }
  if (ct.includes('image/webp')) {
    return 'webp'
  }
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) {
    return 'jpg'
  }
  return null
}

export function extFromBytes(
  raw: ArrayBuffer | Uint8Array | ArrayLike<number> | undefined
): string | null {
  if (!raw) {
    return null
  }
  const bytes =
    raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : new Uint8Array(Array.from(raw))

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x39 || bytes[4] === 0x37) &&
    bytes[5] === 0x61
  ) {
    return 'gif'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpg'
  }
  return null
}

export function extFromUrl(url: string): string | null {
  const m = url.match(/\/stodownload\.([a-z0-9]+)\?/i)
  return m?.[1]?.toLowerCase() || null
}
