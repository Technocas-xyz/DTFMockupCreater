// Shared layout for custom (Garment Manager) garments.
//
// The garment image is never stretched: its saved width in inches sets the
// scale, and its height follows the image's own aspect ratio. Saved height
// inches are ignored for drawing, because a mismatch between them and the
// image ratio is what used to stretch garments such as tank tops.
//
// Uses the same reference scale as the default t-shirts (5XL = 32" x 35"
// filling 52% x 68% of the canvas) so sizes stay comparable, and only scales
// down further if the garment would not otherwise fit on the canvas.
export function customGarmentLayout({ imgW, imgH, shirtWidthInches, canvasW, canvasH }) {
  const refPxPerInch = Math.min((canvasW * 0.52) / 32, (canvasH * 0.68) / 35);
  const aspect = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
  const widthIn = shirtWidthInches > 0 ? shirtWidthInches : 20;
  const heightIn = widthIn / aspect;

  const pxPerInch = Math.min(
    refPxPerInch,
    (canvasW * 0.92) / widthIn,
    (canvasH * 0.92) / heightIn,
  );

  const tshirtW = widthIn * pxPerInch;
  const tshirtH = heightIn * pxPerInch;
  return {
    pxPerInch,
    tshirtW,
    tshirtH,
    tshirtX: (canvasW - tshirtW) / 2,
    tshirtY: (canvasH - tshirtH) / 2,
  };
}
