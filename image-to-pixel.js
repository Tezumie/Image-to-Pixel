/**
 * Pixelate and dither an image.
 * @param {Object} options - Configuration options.
 * @param {HTMLCanvasElement|HTMLImageElement|p5.Renderer|p5.Image|Q5.Image|ImageData|string} options.image - Image object, p5 canvas, q5 canvas, ImageData, or URL.
 * @param {number} options.width - Number of pixels wide for the pixelated image.
 * @param {string} [options.dither='none'] - Dithering method: 'none', 'Floyd-Steinberg', 'ordered', '2x2 Bayer', '4x4 Bayer'.
 * @param {number} [options.strength=0] - Dithering strength (0-100).
 * @param {string|Array} [options.palette=null] - Palette name from Lospec or an array of colors.
 * @param {string} [options.resolution='original'] - 'pixel' for pixelated size, 'original' for original size.
 * @returns {Promise<HTMLCanvasElement|p5.Image|Q5.Image>} - A promise that resolves to a canvas element, p5.Image, or Q5.Image object.
 */
async function pixelate(options) {
    const {
        image,
        width,
        dither = 'none',
        strength = 0,
        palette = null,
        resolution = 'original',
    } = options;

    if (!image || !width) {
        throw new Error('Image and width parameters are required.');
    }

    // Check for p5 and Q5 availability
    const isP5Available = typeof p5 !== 'undefined';
    const isQ5Available = typeof Q5 !== 'undefined';

    // Check if the input source is a p5 or Q5 type using safer type checks
    const isP5Source = isP5Available && (
        (typeof p5.Renderer !== 'undefined' && image instanceof p5.Renderer) ||
        (typeof p5.Image !== 'undefined' && image instanceof p5.Image)
    );
    const isQ5Source = isQ5Available && typeof Q5.Image !== 'undefined' && image instanceof Q5.Image;

    // Load the image with support for multiple input formats
    const originalImageObject = await loadOriginalImage(image);

    let paletteColors = null;

    // Fetch palette if provided
    if (palette) {
        if (Array.isArray(palette)) {
            paletteColors = palette.map(hexToRgb);
        } else if (typeof palette === 'string') {
            paletteColors = await fetchPalette(palette);
        }
    }

    // Calculate pixel dimensions
    const aspectRatio = originalImageObject.height / originalImageObject.width;
    const pixelsWide = width;
    const pixelsHigh = Math.round(pixelsWide * aspectRatio);

    // Create offscreen canvas for pixelation
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = pixelsWide;
    offscreenCanvas.height = pixelsHigh;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    // Draw image to offscreen canvas
    offscreenCtx.drawImage(
        originalImageObject,
        0, 0, originalImageObject.width, originalImageObject.height,
        0, 0, pixelsWide, pixelsHigh
    );

    // Get image data
    let pixelatedData = offscreenCtx.getImageData(0, 0, pixelsWide, pixelsHigh);

    // Apply dithering and palette
    const ditheringStrength = strength / 100; // Normalize strength
    if (paletteColors && dither.toLowerCase() !== 'none') {
        if (dither.toLowerCase() === 'floyd-steinberg') {
            pixelatedData = floydSteinbergDithering(
                pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors
            );
        } else if (dither.toLowerCase() === 'ordered') {
            // Use 8x8 Bayer matrix for ordered dithering
            const bayerMatrix = [
                [0, 48, 12, 60, 3, 51, 15, 63],
                [32, 16, 44, 28, 35, 19, 47, 31],
                [8, 56, 4, 52, 11, 59, 7, 55],
                [40, 24, 36, 20, 43, 27, 39, 23],
                [2, 50, 14, 62, 1, 49, 13, 61],
                [34, 18, 46, 30, 33, 17, 45, 29],
                [10, 58, 6, 54, 9, 57, 5, 53],
                [42, 26, 38, 22, 41, 25, 37, 21]
            ];
            pixelatedData = orderedDithering(
                pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix
            );
        } else if (dither.toLowerCase() === '4x4 bayer') {
            // Use 4x4 Bayer matrix
            const bayerMatrix = [
                [0, 8, 2, 10],
                [12, 4, 14, 6],
                [3, 11, 1, 9],
                [15, 7, 13, 5]
            ];
            pixelatedData = orderedDithering(
                pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix
            );
        } else if (dither.toLowerCase() === '2x2 bayer') {
            // Use 2x2 Bayer matrix
            const bayerMatrix = [
                [0, 2],
                [3, 1]
            ];
            pixelatedData = orderedDithering(
                pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix
            );
        } else {
            throw new Error(`Unknown dithering method: ${dither}`);
        }
    } else if (paletteColors) {
        applyPalette(pixelatedData, paletteColors);
    }


    // Put processed data back onto offscreen canvas
    offscreenCtx.putImageData(pixelatedData, 0, 0);

    // Create final canvas for rendering
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');

    if (resolution === 'pixel') {
        finalCanvas.width = pixelsWide;
        finalCanvas.height = pixelsHigh;
    } else {
        finalCanvas.width = originalImageObject.width;
        finalCanvas.height = originalImageObject.height;
    }

    finalCtx.imageSmoothingEnabled = false;
    finalCtx.drawImage(offscreenCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

    // Convert the final canvas to a p5.Image or Q5.Image if necessary
    if (isP5Source) {
        return canvasToP5Image(finalCanvas);
    } else if (isQ5Source) {
        return canvasToQ5Image(finalCanvas);
    }

    return finalCanvas;
}

/**
 * Convert an HTMLCanvasElement to a p5.Image if p5 is available.
 * @param {HTMLCanvasElement} canvas - The canvas to convert.
 * @returns {p5.Image|HTMLCanvasElement} - The converted p5.Image or the original canvas.
 */
function canvasToP5Image(canvas) {
    if (typeof p5 !== 'undefined') {
        const tempImage = createImage(canvas.width, canvas.height);
        tempImage.drawingContext.drawImage(canvas, 0, 0, canvas.width, canvas.height);
        return tempImage;
    }
    return canvas;
}

/**
 * Convert an HTMLCanvasElement to a Q5.Image if Q5 is available.
 * @param {HTMLCanvasElement} canvas - The canvas to convert.
 * @returns {Q5.Image|HTMLCanvasElement} - The converted Q5.Image or the original canvas.
 */
function canvasToQ5Image(canvas) {
    if (typeof Q5 !== 'undefined' && typeof Q5.Image !== 'undefined') {
        const tempImage = new Q5.Image(canvas.width, canvas.height);
        tempImage.ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
        return tempImage;
    }
    return canvas;
}

/**
 * Load the original image from various input types.
 * @param {any} src - The input image source.
 * @returns {Promise<HTMLImageElement>} - A promise that resolves to an HTMLImageElement.
 */
function loadOriginalImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        // Ensure p5 and Q5 references are checked only if they are available
        const isP5Available = typeof p5 !== 'undefined';
        const isQ5Available = typeof Q5 !== 'undefined';

        try {
            // Handle various image sources
            if (isP5Available && (
                (typeof p5.Renderer !== 'undefined' && src instanceof p5.Renderer) ||
                (typeof p5.Image !== 'undefined' && src instanceof p5.Image)
            )) {
                const canvasElement = src.elt || src.canvas;
                img.src = canvasElement.toDataURL();
            } else if (isQ5Available && typeof Q5.Image !== 'undefined' && src instanceof Q5.Image) {
                img.src = src.canvas.toDataURL();
            } else if (src instanceof HTMLCanvasElement) {
                img.src = src.toDataURL();
            } else if (src instanceof ImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = src.width;
                tempCanvas.height = src.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(src, 0, 0);
                img.src = tempCanvas.toDataURL();
            } else if (typeof src === 'string') {
                img.crossOrigin = 'Anonymous';
                img.src = src;
            } else if (src instanceof HTMLImageElement) {
                resolve(src);
                return;
            } else {
                console.warn('Unsupported or invalid image source.');
                reject(new Error('Unsupported or invalid image source.'));
                return;
            }

            img.onload = () => resolve(img);
            img.onerror = (err) => {
                console.warn(`Failed to load image from source. Error: ${err.message}`);
                reject(new Error(`Failed to load image: ${err.message}`));
            };
        } catch (error) {
            console.warn(`Unexpected error when loading image: ${error.message}`);
            reject(error);
        }

    });
}

let cachedPalette = { name: null, colors: null };
function fetchPalette(paletteName) {
    const paletteUrl = `https://lospec.com/palette-list/${paletteName}.json`;
    if (cachedPalette.name === paletteName) { return Promise.resolve(cachedPalette.colors); }
    return fetch(paletteUrl)
        .then(response => {
            if (!response.ok) throw new Error('Palette not found');
            return response.json();
        })
        .then(data => {
            const colors = data.colors.map(hexToRgb);
            // Cache the fetched palette
            cachedPalette.name = paletteName;
            cachedPalette.colors = colors;
            return colors;
        })
        .catch(error => {
            console.warn('Error fetching palette:', error);
            throw error;
        });

}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    return [bigint >> 16 & 255, bigint >> 8 & 255, bigint & 255];
}

function applyPalette(imageData, paletteColors) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const color = [data[i], data[i + 1], data[i + 2]];
        const [r, g, b] = findClosestPaletteColor(color, paletteColors);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
    }
}

function floydSteinbergDithering(imageData, width, height, strength, paletteColors) {
    const data = imageData.data;
    const errorBuffer = new Float32Array(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Get original color and add accumulated error
            let r = data[idx] + errorBuffer[idx];
            let g = data[idx + 1] + errorBuffer[idx + 1];
            let b = data[idx + 2] + errorBuffer[idx + 2];

            const oldColor = [r, g, b];

            // Quantize the pixel to the nearest palette color
            const newColor = findClosestPaletteColor(oldColor, paletteColors);

            // Update the image data with the new color
            data[idx] = newColor[0];
            data[idx + 1] = newColor[1];
            data[idx + 2] = newColor[2];

            // Calculate the quantization error
            const quantError = [
                (r - newColor[0]) * strength,
                (g - newColor[1]) * strength,
                (b - newColor[2]) * strength
            ];

            // Distribute the error to neighboring pixels
            distributeError(errorBuffer, x + 1, y, quantError, (7 / 16), width, height);
            distributeError(errorBuffer, x - 1, y + 1, quantError, (3 / 16), width, height);
            distributeError(errorBuffer, x, y + 1, quantError, (5 / 16), width, height);
            distributeError(errorBuffer, x + 1, y + 1, quantError, (1 / 16), width, height);
        }
    }
    return imageData;
}

function orderedDithering(imageData, width, height, strength, paletteColors, bayerMatrix) {
    const data = imageData.data;
    const matrixSize = bayerMatrix.length;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const oldColor = [data[idx], data[idx + 1], data[idx + 2]];

            const threshold = ((bayerMatrix[y % matrixSize][x % matrixSize] + 0.5) / (matrixSize * matrixSize)) * 255;

            let adjustedColor = [
                oldColor[0] + (threshold - 127.5) * strength,
                oldColor[1] + (threshold - 127.5) * strength,
                oldColor[2] + (threshold - 127.5) * strength
            ];

            // Quantize the adjusted color
            const newColor = findClosestPaletteColor(adjustedColor, paletteColors);

            data[idx] = newColor[0];
            data[idx + 1] = newColor[1];
            data[idx + 2] = newColor[2];
        }
    }
    return imageData;
}

function distributeError(buffer, x, y, quantError, factor, width, height) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    buffer[idx] += quantError[0] * factor;
    buffer[idx + 1] += quantError[1] * factor;
    buffer[idx + 2] += quantError[2] * factor;
}

function findClosestPaletteColor(color, palette) {
    let closestColor = palette[0];
    let closestDistance = colorDistance(color, closestColor);

    for (let i = 1; i < palette.length; i++) {
        const currentDistance = colorDistance(color, palette[i]);
        if (currentDistance < closestDistance) {
            closestDistance = currentDistance;
            closestColor = palette[i];
        }
    }

    return closestColor;
}

function colorDistance(color1, color2) {
    // Use Euclidean distance
    const rDiff = color1[0] - color2[0];
    const gDiff = color1[1] - color2[1];
    const bDiff = color1[2] - color2[2];
    return rDiff * rDiff + gDiff * gDiff + bDiff * bDiff;
}
