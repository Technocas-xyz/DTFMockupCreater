// T-Shirt size specifications based on the provided size chart
// All measurements in inches
// Print area = Body dimensions minus 1 inch from all sides

export const TSHIRT_SIZES = {
  S: {
    label: 'S',
    bodyLength: 28,
    bodyWidth: 18,
    fullBodyLength: 28,
    sleeveLength: 15.875,
    // Maximum printable area for this size
    maxPrintWidth: 12,
    maxPrintHeight: 15,
  },
  M: {
    label: 'M',
    bodyLength: 29,
    bodyWidth: 20,
    fullBodyLength: 29,
    sleeveLength: 17,
    maxPrintWidth: 13,
    maxPrintHeight: 15.5,
  },
  L: {
    label: 'L',
    bodyLength: 30,
    bodyWidth: 22,
    fullBodyLength: 30,
    sleeveLength: 18.5,
    maxPrintWidth: 14,
    maxPrintHeight: 16,
  },
  XL: {
    label: 'XL',
    bodyLength: 31,
    bodyWidth: 24,
    fullBodyLength: 31,
    sleeveLength: 20,
    maxPrintWidth: 15,
    maxPrintHeight: 17,
  },
  '2XL': {
    label: '2XL',
    bodyLength: 32,
    bodyWidth: 26,
    fullBodyLength: 32,
    sleeveLength: 21.5,
    maxPrintWidth: 16,
    maxPrintHeight: 18,
  },
  '3XL': {
    label: '3XL',
    bodyLength: 33,
    bodyWidth: 28,
    fullBodyLength: 33,
    sleeveLength: 22.875,
    maxPrintWidth: 17,
    maxPrintHeight: 19,
  },
  '4XL': {
    label: '4XL',
    bodyLength: 34,
    bodyWidth: 30,
    fullBodyLength: 34,
    sleeveLength: 24.25,
    maxPrintWidth: 18,
    maxPrintHeight: 20,
  },
  '5XL': {
    label: '5XL',
    bodyLength: 35,
    bodyWidth: 32,
    fullBodyLength: 35,
    sleeveLength: 25.375,
    maxPrintWidth: 18,
    maxPrintHeight: 20,
  },
};

export const ARTWORK_SIZES = [
  { label: '8 x 8"', width: 8, height: 8 },
  { label: '9 x 10"', width: 9, height: 10 },
  { label: '10 x 12"', width: 10, height: 12 },
  { label: '11 x 14"', width: 11, height: 14 },
  { label: '12 x 16"', width: 12, height: 16 },
  { label: '13 x 18"', width: 13, height: 18 },
  { label: '14 x 20"', width: 14, height: 20 },
  { label: 'Custom', width: 0, height: 0 },
];

export const TSHIRT_COLORS = [
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'Dark Heather', hex: '#4a4a4a' },
  { name: 'Charcoal', hex: '#3d3d3d' },
  { name: 'Dark Grey', hex: '#5a5a5a' },
  { name: 'Forest Green', hex: '#2d5a3a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Light Blue', hex: '#93c5fd' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Sand', hex: '#d4c5a9' },
  { name: 'Maroon', hex: '#6b1d2e' },
  { name: 'Cardinal Red', hex: '#8b2232' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Pink', hex: '#ec4899' },
];

export const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
