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

    let offscreenCanvas, offscreenCtx;

    if (originalImageObject instanceof HTMLCanvasElement) {
        // Check if the canvas needs to be resized
        if (originalImageObject.width !== pixelsWide || originalImageObject.height !== pixelsHigh) {
            // Create an offscreen canvas with the new size
            offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = pixelsWide;
            offscreenCanvas.height = pixelsHigh;
            offscreenCtx = offscreenCanvas.getContext('2d');

            // Draw the original canvas onto the resized offscreen canvas
            offscreenCtx.drawImage(originalImageObject, 0, 0, pixelsWide, pixelsHigh);
        } else {
            // No resizing needed, reuse the original canvas
            offscreenCanvas = originalImageObject;
            offscreenCtx = offscreenCanvas.getContext('2d');
        }
    } else {
        // Handle image or other input types by creating an offscreen canvas
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = pixelsWide;
        offscreenCanvas.height = pixelsHigh;
        offscreenCtx = offscreenCanvas.getContext('2d');

        // Draw the original image onto the offscreen canvas
        offscreenCtx.drawImage(
            originalImageObject,
            0, 0, originalImageObject.width, originalImageObject.height,
            0, 0, pixelsWide, pixelsHigh
        );
    }

    // Get image data for manipulation
    let pixelatedData = offscreenCtx.getImageData(0, 0, pixelsWide, pixelsHigh);

    // Apply dithering and palette
    const ditheringStrength = strength / 100; // Normalize strength to 0-1 range
    if (paletteColors && dither.toLowerCase() !== 'none') {
        if (dither.toLowerCase() === 'floyd-steinberg') {
            pixelatedData = floydSteinbergDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors);
        } else if (dither.toLowerCase() === 'ordered') {
            const bayerMatrix = getBayerMatrix('8x8');
            pixelatedData = orderedDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix);
        } else if (dither.toLowerCase() === '4x4 bayer') {
            const bayerMatrix = getBayerMatrix('4x4');
            pixelatedData = orderedDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix);
        } else if (dither.toLowerCase() === '2x2 bayer') {
            const bayerMatrix = getBayerMatrix('2x2');
            pixelatedData = orderedDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, bayerMatrix);
        } else if (dither.toLowerCase() === 'clustered 4x4') {
            const clusteredMatrix = getBayerMatrix('clustered 4x4');
            pixelatedData = orderedDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors, clusteredMatrix);
        } else if (dither.toLowerCase() === 'atkinson') {
            pixelatedData = atkinsonDithering(pixelatedData, pixelsWide, pixelsHigh, ditheringStrength, paletteColors);
        } else {
            throw new Error(`Unknown dithering method: ${dither}`);
        }
    } else if (paletteColors) {
        applyPalette(pixelatedData, paletteColors);
    }

    // Put processed image data back onto the offscreen canvas
    offscreenCtx.putImageData(pixelatedData, 0, 0);

    // If resolution is 'original', scale the image back to its original size
    if (resolution === 'original' && offscreenCanvas.width !== originalImageObject.width) {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = originalImageObject.width;
        finalCanvas.height = originalImageObject.height;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.imageSmoothingEnabled = false;
        finalCtx.drawImage(offscreenCanvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height, 0, 0, finalCanvas.width, finalCanvas.height);

        // Convert the final canvas to a p5.Image or Q5.Image if necessary
        if (isP5Available) {
            return canvasToP5Image(finalCanvas);
        } else if (isQ5Available) {
            return canvasToQ5Image(finalCanvas);
        }

        return finalCanvas;
    }

    // Return the canvas
    if (isP5Available) {
        return canvasToP5Image(offscreenCanvas);
    } else if (isQ5Available) {
        return canvasToQ5Image(offscreenCanvas);
    }

    return offscreenCanvas;
}

/**
 * Retrieve the Bayer matrix based on the specified size.
 * @param {string} type - The Bayer matrix type ('2x2', '4x4', '8x8').
 * @returns {Array<Array<number>>} - The selected Bayer matrix.
 */
function getBayerMatrix(type) {
    switch (type) {
        case '2x2':
            return [
                [0, 2],
                [3, 1]
            ];
        case '4x4':
            return [
                [0, 8, 2, 10],
                [12, 4, 14, 6],
                [3, 11, 1, 9],
                [15, 7, 13, 5]
            ];
        case '8x8':
            return [
                [0, 48, 12, 60, 3, 51, 15, 63],
                [32, 16, 44, 28, 35, 19, 47, 31],
                [8, 56, 4, 52, 11, 59, 7, 55],
                [40, 24, 36, 20, 43, 27, 39, 23],
                [2, 50, 14, 62, 1, 49, 13, 61],
                [34, 18, 46, 30, 33, 17, 45, 29],
                [10, 58, 6, 54, 9, 57, 5, 53],
                [42, 26, 38, 22, 41, 25, 37, 21]
            ];
        case 'clustered 4x4':
            return [
                [7, 13, 11, 4],
                [12, 16, 14, 8],
                [10, 15, 6, 2],
                [5, 9, 3, 1]
            ];
        default:
            throw new Error(`Invalid Bayer matrix type: ${type}`);
    }
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
 * Convert a p5.Graphics object to a standard HTMLCanvasElement.
 * @param {p5.Graphics} p5Graphics - The p5.Graphics object.
 * @returns {Promise<HTMLCanvasElement>} - A promise that resolves to an HTMLCanvasElement.
 */
function convertP5GraphicsToCanvas(p5Graphics) {
    return new Promise((resolve) => {
        const canvasElement = document.createElement('canvas');
        canvasElement.width = p5Graphics.width;
        canvasElement.height = p5Graphics.height;

        const ctx = canvasElement.getContext('2d');
        ctx.drawImage(p5Graphics.elt, 0, 0);

        resolve(canvasElement);
    });
}
/**
 * Load the original image from various input types.
 * @param {any} src - The input image source.
 * @returns {Promise<HTMLImageElement>} - A promise that resolves to an HTMLImageElement.
 */

function loadOriginalImage(src) {
    return new Promise((resolve, reject) => {
        try {
            // Directly resolve if the source is an HTMLImageElement
            if (src instanceof HTMLImageElement) {
                resolve(src);
                return;
            }

            // Handle HTMLCanvasElement, return the canvas directly
            if (src instanceof HTMLCanvasElement) {
                resolve(src); // return the canvas directly
                return;
            }

            // Handle ImageData by converting it to a canvas
            if (src instanceof ImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = src.width;
                tempCanvas.height = src.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(src, 0, 0);
                resolve(tempCanvas); // return the created canvas
                return;
            }

            // Handle p5.Graphics or p5.Renderer, return the canvas directly
            if (src.elt && src.elt instanceof HTMLCanvasElement) {
                resolve(src.elt); // p5.Graphics or p5.Renderer object, return canvas
                return;
            }

            // Handle Q5.Image or Q5.Graphics, return the canvas directly
            if (src.canvas && src.canvas instanceof HTMLCanvasElement) {
                resolve(src.canvas); // Q5.Graphics or Q5.Image object, return canvas
                return;
            }

            // Handle OffscreenCanvas, convert it to an HTMLCanvasElement
            if (src.canvas instanceof OffscreenCanvas) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = src.canvas.width;
                tempCanvas.height = src.canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(src.canvas, 0, 0);
                resolve(tempCanvas); // return the converted canvas
                return;
            }
            //Handle T5js
            if (src.element) {
                resolve(src.element);
                return;
            }
            // Handle URL strings by loading an image
            if (typeof src === 'string') {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = src;

                img.onload = () => resolve(img);
                img.onerror = (err) => {
                    reject(new Error(`Failed to load image: ${err.message}`));
                };
                return;
            }

            // Handle unexpected sources
            console.warn('Unsupported or invalid image source.');
            reject(new Error('Unsupported or invalid image source.'));
        } catch (error) {
            console.warn(`Error when loading image: ${error.message}`);
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
function atkinsonDithering(imageData, width, height, strength, paletteColors) {
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
            distributeError(errorBuffer, x + 1, y, quantError, (1 / 8), width, height);
            distributeError(errorBuffer, x + 2, y, quantError, (1 / 8), width, height);
            distributeError(errorBuffer, x - 1, y + 1, quantError, (1 / 8), width, height);
            distributeError(errorBuffer, x, y + 1, quantError, (1 / 8), width, height);
            distributeError(errorBuffer, x + 1, y + 1, quantError, (1 / 8), width, height);
            distributeError(errorBuffer, x, y + 2, quantError, (1 / 8), width, height);
        }
    }
    return imageData;
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
