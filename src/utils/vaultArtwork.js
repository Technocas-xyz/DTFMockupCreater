// Turning a vault selection into a task attachment.
//
// The file itself is never copied: a task keeps the vault asset id, the vault's
// own file name, and a small preview. Inside Design Studio the preview is drawn
// live from the vault; the stored copy is what lets Task Management — which has
// no vault access — show the same thumbnail.

const THUMB_W = 320;
const THUMB_H = 240;

export function vaultThumbUrl(apiBase, asset, w = THUMB_W, h = THUMB_H) {
  return `${apiBase}/central-artwork.php?action=thumb&id=${encodeURIComponent(asset.id)}&w=${w}&h=${h}&v=${encodeURIComponent(asset.preview_key || '')}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Preview could not be read'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build the payload the task API stores for one vault asset. A preview that
 * cannot be produced (a PDF or .ai source, or a thumbnailer hiccup) is not a
 * reason to refuse the attachment — the name and the asset id still carry it.
 */
export async function toTaskArtwork(asset, apiBase) {
  let thumbData;
  try {
    const res = await fetch(vaultThumbUrl(apiBase, asset));
    if (res.ok) {
      const blob = await res.blob();
      // 300 KB of base64 is the API's cap; a 320px preview is far under it, but a
      // stray full-size response should drop the preview rather than the artwork.
      if (blob.size && blob.size < 220 * 1024 && /^image\//i.test(blob.type)) {
        thumbData = await blobToDataUrl(blob);
      }
    }
  } catch {
    /* keep the attachment without a stored preview */
  }

  return {
    assetId: String(asset.id),
    fileName: asset.file_name,
    artworkCode: asset.artwork_code || undefined,
    customerName: asset.entity_name || undefined,
    folder: asset.folder || undefined,
    mimeType: asset.mime_type || undefined,
    sizeBytes: Number.isFinite(asset.file_size_bytes) ? asset.file_size_bytes : undefined,
    thumbData,
    sourceApp: 'design-studio',
  };
}

/** Same shape, for a set of selected assets — previews are fetched together. */
export function toTaskArtworks(assets, apiBase) {
  return Promise.all(assets.map((asset) => toTaskArtwork(asset, apiBase)));
}
