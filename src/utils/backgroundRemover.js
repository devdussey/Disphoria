// Background removal utility using @tugrul/rembg (local, free, open-source)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Remove background from an image using @tugrul/rembg
 * @param {Buffer|string} imageInput - Image buffer or URL
 * @returns {Promise<Buffer>} - PNG buffer with transparent background
 */
async function removeBackground(imageInput) {
  try {
    // Import rembg
    const { detectAndRemove } = await import('@tugrul/rembg');

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

    console.log('[backgroundRemover] Processing image buffer...');

    // Use rembg to remove background
    const outputBuffer = await detectAndRemove(inputBuffer);

    if (!Buffer.isBuffer(outputBuffer)) {
      throw new Error('Background removal did not return a valid buffer');
    }

    console.log('[backgroundRemover] Successfully removed background');
    return outputBuffer;
  } catch (err) {
    console.error('[backgroundRemover] Error:', err.message);

    // Provide helpful error message
    if (err.message.includes('Cannot find module')) {
      throw new Error('Rembg is not installed. Run: npm install @tugrul/rembg');
    }

    throw new Error(`Background removal failed: ${err.message}`);
  }
}

module.exports = {
  removeBackground,
};
