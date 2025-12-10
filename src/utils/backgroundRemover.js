// Background removal utility using rembg (local, free, open-source)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Remove background from an image using rembg
 * @param {Buffer|string} imageInput - Image buffer or URL
 * @returns {Promise<Buffer>} - PNG buffer with transparent background
 */
async function removeBackground(imageInput) {
  try {
    // Try to use rembg if available
    const rembg = await importRembg();
    if (rembg) {
      return await removeBackgroundLocal(imageInput, rembg);
    }
  } catch (err) {
    console.error('Failed to use local rembg:', err.message);
  }

  // Fallback: throw error if rembg not available
  throw new Error('Rembg is not installed. Run: npm install rembg');
}

/**
 * Try to import rembg module
 * @returns {Promise<Object|null>} - rembg module or null if not available
 */
async function importRembg() {
  try {
    return await import('rembg');
  } catch (err) {
    console.warn('Rembg module not available:', err.message);
    return null;
  }
}

/**
 * Remove background using local rembg
 * @param {Buffer|string} imageInput - Image buffer or URL
 * @param {Object} rembg - Rembg module
 * @returns {Promise<Buffer>} - PNG buffer with transparent background
 */
async function removeBackgroundLocal(imageInput, rembg) {
  try {
    let inputBuffer = imageInput;

    // If input is a URL, fetch it first
    if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
      const response = await fetch(imageInput);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      inputBuffer = Buffer.from(await response.arrayBuffer());
    }

    // Ensure we have a buffer
    if (!Buffer.isBuffer(inputBuffer)) {
      throw new Error('Invalid image input: must be Buffer or URL string');
    }

    // Use rembg to remove background
    // rembg.removeBackground() expects Buffer and returns Promise<Buffer>
    const outputBuffer = await rembg.removeBackground(inputBuffer);

    if (!Buffer.isBuffer(outputBuffer)) {
      throw new Error('Rembg did not return a valid buffer');
    }

    return outputBuffer;
  } catch (err) {
    console.error('Background removal error:', err);
    throw new Error(`Background removal failed: ${err.message}`);
  }
}

module.exports = {
  removeBackground,
};
