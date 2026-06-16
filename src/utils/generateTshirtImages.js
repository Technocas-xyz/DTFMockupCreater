// This utility generates t-shirt placeholder images as data URLs
// Replace these with actual t-shirt photos by placing PNG files in /public/tshirts/
// Naming convention: {color-name}-{front|back}.png
// Example: black-front.png, navy-back.png, white-front.png

export function generateTshirtDataUrl(color, side, width = 700, height = 850) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background (transparent)
  ctx.clearRect(0, 0, width, height);

  // Draw realistic t-shirt shape
  const cx = width / 2;
  const shirtTop = height * 0.04;
  const bodyBottom = height * 0.95;
  const bodyLeft = width * 0.18;
  const bodyRight = width * 0.82;
  const sleeveOuterLeft = width * 0.02;
  const sleeveOuterRight = width * 0.98;
  const sleeveBottom = height * 0.35;
  const shoulderY = height * 0.08;
  const collarWidth = width * 0.1;
  const collarDepth = side === 'front' ? height * 0.08 : height * 0.03;

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;

  ctx.fillStyle = color;
  ctx.beginPath();

  // Left sleeve outer
  ctx.moveTo(bodyLeft, sleeveBottom);
  ctx.lineTo(sleeveOuterLeft, sleeveBottom * 0.75);
  ctx.lineTo(sleeveOuterLeft + width * 0.06, shoulderY);
  ctx.lineTo(bodyLeft, shirtTop);

  // Left shoulder to collar
  ctx.lineTo(cx - collarWidth, shirtTop);

  // Collar
  if (side === 'front') {
    ctx.quadraticCurveTo(cx, shirtTop + collarDepth, cx + collarWidth, shirtTop);
  } else {
    ctx.quadraticCurveTo(cx, shirtTop + collarDepth, cx + collarWidth, shirtTop);
  }

  // Right shoulder
  ctx.lineTo(bodyRight, shirtTop);
  ctx.lineTo(sleeveOuterRight - width * 0.06, shoulderY);
  ctx.lineTo(sleeveOuterRight, sleeveBottom * 0.75);

  // Right sleeve inner
  ctx.lineTo(bodyRight, sleeveBottom);

  // Right body
  ctx.lineTo(bodyRight, bodyBottom);

  // Bottom hem (slight curve)
  ctx.quadraticCurveTo(cx, bodyBottom + height * 0.01, bodyLeft, bodyBottom);

  // Left body
  ctx.lineTo(bodyLeft, sleeveBottom);

  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Add fabric texture/shading
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  // Side shading
  ctx.fillRect(bodyLeft, sleeveBottom, width * 0.08, bodyBottom - sleeveBottom);
  ctx.fillRect(bodyRight - width * 0.08, sleeveBottom, width * 0.08, bodyBottom - sleeveBottom);
  ctx.restore();

  // Highlight on center
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const gradient = ctx.createRadialGradient(cx, height * 0.4, 0, cx, height * 0.4, width * 0.3);
  gradient.addColorStop(0, 'rgba(255,255,255,0.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(bodyLeft, shirtTop, bodyRight - bodyLeft, bodyBottom - shirtTop);
  ctx.restore();

  // Collar ring
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - collarWidth, shirtTop);
  ctx.quadraticCurveTo(cx, shirtTop + collarDepth, cx + collarWidth, shirtTop);
  ctx.stroke();

  // Inner collar line
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - collarWidth + 3, shirtTop + 3);
  ctx.quadraticCurveTo(cx, shirtTop + collarDepth - 2, cx + collarWidth - 3, shirtTop + 3);
  ctx.stroke();

  // Shoulder seams
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyLeft, shirtTop);
  ctx.lineTo(bodyLeft, sleeveBottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyRight, shirtTop);
  ctx.lineTo(bodyRight, sleeveBottom);
  ctx.stroke();

  // Sleeve hems
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sleeveOuterLeft, sleeveBottom * 0.75);
  ctx.lineTo(bodyLeft, sleeveBottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sleeveOuterRight, sleeveBottom * 0.75);
  ctx.lineTo(bodyRight, sleeveBottom);
  ctx.stroke();

  // Bottom hem
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bodyLeft, bodyBottom);
  ctx.quadraticCurveTo(cx, bodyBottom + height * 0.01, bodyRight, bodyBottom);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}
