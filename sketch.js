let myColors = [];
let defaultColor;
let pixelColor;
let img;
let Canvas, W, H;
let gridSize;
let pixelWidth = 64;
let currentColumn = 0;
let buffer;
let pixelBuffer;
let canPixelate = false;
let ditherAmnt = 10;
let imgAspectRatio;
let selectedPalette = 0;
let allPalettes = [];
let yIterations;
let xIterations;
let totalHeight;
let totalWidth;
let d;
let pixelHeight;
let ditherStyle = 1;
let posterizeAmnt = 0;
const ditherStyleNames = [
  "Floyd-Steinberg",
  "4x4 Bayer",
  "8x8 Bayer",
  "2x2 Bayer",
  "Jarvis-Judice-Ninke",
  "Stucki",
  "Sierra",
  "Atkinson",
  "Burkes",
  "Two-Row Sierra",
  "Sierra Lite",
];
function windowResized() {
  resizeCanvasToWindowSize();
  updateSettings();
}
function resizeCanvasToWindowSize() {
  if (img) {
    W = floor(img.width);
    H = floor(img.height);
    let scaleWidth = (windowWidth * 0.82) / W;
    let scaleHeight = (windowHeight * 0.82) / H;
    let scaleFactor = min(scaleWidth, scaleHeight);
    W *= scaleFactor;
    H *= scaleFactor;
    let imageAspect = W / H;
    gridSize = W / pixelWidth;
    xIterations = pixelWidth;
    yIterations = floor(xIterations / imageAspect);
    pixelBuffer = createGraphics(xIterations, yIterations);
  } else {
    yIterations = 1;
    xIterations = 1;
    gridSize = 500;
    gridSize = 500;
  }
  Canvas = createCanvas(floor(xIterations * gridSize), yIterations * gridSize);
  Canvas.style("position", "absolute");
  Canvas.style("object-fit", "contain");
  let canvasX = (windowWidth - width) / 2;
  let canvasY = (windowHeight - height) / 2 + 50;
  Canvas.position(canvasX, canvasY);
}
function setup() {
  d = pixelDensity();
  resizeCanvasToWindowSize();
  document.body.addEventListener("dragover", handleDragOver, false);
  document.body.addEventListener("drop", handleFileSelect, false);
  Canvas.style("border", " 1px solid black");
  Canvas.style("border-color", color(78, 174, 233));
  defaultColor = color("#FF0000");
  pixelColor = defaultColor;
  let fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", handleFile, false);
  let addButton = document.getElementById("addColorPicker");
  addButton.addEventListener("click", addColorPicker, false);
  let removeButton = document.getElementById("removeColorPicker");
  removeButton.addEventListener("click", removeColorPicker, false);
  let downloadButton = document.getElementById("downloadPalette");
  downloadButton.addEventListener("click", downloadPalette, false);
  let paletteSelector = select("#paletteSelector");
  paletteSelector.changed(swapPalettes);
  for (let i = 0; i < allPalettes.length; i++) {
    let option = createElement("option", allPalettes[i].fileName);
    option.attribute("value", i);
    paletteSelector.child(option);
    paletteSelector.value(allPalettes.length - 1);
    myColors = [];
  }
  createColorPickers(allPalettes[selectedPalette].data);
  swapPalettes();
  updateMyColors();
  let gridSizeInput = select("#gridSizeInput");
  gridSizeInput.input(updateSettings);
  let ditherInput = select("#ditherInput");
  ditherInput.input(updateSettings);

  let posterizeAmntInput = select("#posterizeAmntInput");
  posterizeAmntInput.input(updateSettings);

  let ditherStyleInput = select("#ditherStyleInput");
  ditherStyleInput.changed(updateSettings);

  for (let i = 0; i < ditherStyleNames.length; i++) {
    let option = createElement("option", ditherStyleNames[i]);
    option.attribute("value", i + 1);
    ditherStyleInput.child(option);
    ditherStyleInput.value(ditherStyleNames.length - 1);
  }
  ditherStyleInput.value(4);
  paletteSelector.value(3);
  swapPalettes();
  let downloadImageButton = document.getElementById("downloadImage-button");
  downloadImageButton.addEventListener("click", downloadImage);
  updateSettings();
}
function ditherImage(myImage, steps, ditherMatrix) {
  let errorDiffusion = false;

  if (ditherMatrix == 1) {
    // Floyd-Steinberg Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 7 / 16],
      [3 / 16, 5 / 16, 1 / 16],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 2) {
    // 4x4 Bayer Matrix (Ordered Dithering)
    ditherMatrix = [
      [1, 9, 3, 11],
      [13, 5, 15, 7],
      [4, 12, 2, 10],
      [16, 8, 14, 6],
    ];
  } else if (ditherMatrix == 3) {
    // 8x8 Bayer Matrix (Ordered Dithering)
    ditherMatrix = [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21],
    ];
  } else if (ditherMatrix == 4) {
    // 2x2 Bayer Matrix (Ordered Dithering)
    ditherMatrix = [
      [3, 7, 4],
      [6, 1, 9],
      [2, 8, 5],
    ];
  } else if (ditherMatrix == 5) {
    // Jarvis-Judice-Ninke Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 0, 7 / 48, 5 / 48],
      [3 / 48, 5 / 48, 7 / 48, 5 / 48, 3 / 48],
      [1 / 48, 3 / 48, 5 / 48, 3 / 48, 1 / 48],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 6) {
    // Stucki Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 0, 8 / 42, 4 / 42],
      [2 / 42, 4 / 42, 8 / 42, 4 / 42, 2 / 42],
      [1 / 42, 2 / 42, 4 / 42, 2 / 42, 1 / 42],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 7) {
    // Sierra Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 0, 5 / 32, 3 / 32],
      [2 / 32, 4 / 32, 5 / 32, 4 / 32, 2 / 32],
      [0, 2 / 32, 3 / 32, 2 / 32, 0],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 8) {
    // Atkinson Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 1 / 8, 1 / 8],
      [1 / 8, 1 / 8, 1 / 8, 0],
      [0, 1 / 8, 0, 0],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 9) {
    // Burkes Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 0, 8 / 32, 4 / 32],
      [2 / 32, 4 / 32, 8 / 32, 4 / 32, 2 / 32],
      [0, 0, 0, 0, 0],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 10) {
    // Two-Row Sierra Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 0, 4 / 16, 3 / 16],
      [1 / 16, 2 / 16, 3 / 16, 2 / 16, 1 / 16],
      [0, 0, 0, 0, 0],
    ];
    errorDiffusion = true;
  } else if (ditherMatrix == 11) {
    // Sierra Lite Matrix (Error Diffusion Dithering)
    ditherMatrix = [
      [0, 0, 2 / 4],
      [1 / 4, 1 / 4, 0],
      [0, 0, 0],
    ];
    errorDiffusion = true;
  } else {
    // Default to Floyd-Steinberg Matrix if an invalid ditherMatrix is specified
    ditherMatrix = [
      [0, 0, 7 / 16],
      [3 / 16, 5 / 16, 1 / 16],
    ];
    errorDiffusion = true;
  }

  let ditheredImg = createImage(myImage.width, myImage.height);
  ditheredImg.copy(
    myImage,
    0,
    0,
    myImage.width,
    myImage.height,
    0,
    0,
    myImage.width,
    myImage.height
  );
  ditheredImg.loadPixels();
  const matrixSize = ditherMatrix.length;
  for (let y = 0; y < ditheredImg.height; y++) {
    for (let x = 0; x < ditheredImg.width; x++) {
      let idx = 4 * (x + y * ditheredImg.width);
      for (let i = 0; i < 3; i++) {
        let oldValue = ditheredImg.pixels[idx + i];
        let newValue = round((steps * oldValue) / 255) * floor(255 / steps);
        if (!errorDiffusion) {
          let threshold =
            (ditherMatrix[x % matrixSize][y % matrixSize] - 1) /
            (matrixSize * matrixSize);
          if (oldValue / 255 > threshold) {
            newValue += floor(255 / steps);
          }
        }
        let error = oldValue - newValue;
        ditheredImg.pixels[idx + i] = newValue;
        if (errorDiffusion) {
          for (let yOffset = -1; yOffset <= 1; yOffset++) {
            for (let xOffset = -1; xOffset <= 1; xOffset++) {
              let xNeighbor = x + xOffset;
              let yNeighbor = y + yOffset;
              let neighborIdx = 4 * (xNeighbor + yNeighbor * ditheredImg.width);
              if (
                xNeighbor >= 0 &&
                xNeighbor < ditheredImg.width &&
                yNeighbor >= 0 &&
                yNeighbor < ditheredImg.height
              ) {
                let matrixY = yOffset + 1;
                let matrixX = xOffset + 1;
                if (
                  matrixY >= 0 &&
                  matrixY < ditherMatrix.length &&
                  matrixX >= 0 &&
                  matrixX < ditherMatrix[0].length
                ) {
                  ditheredImg.pixels[neighborIdx + i] +=
                    error * ditherMatrix[matrixY][matrixX];
                }
              }
            }
          }
        }
      }
    }
  }
  ditheredImg.updatePixels();
  if (posterizeAmnt > 0 || posterizeAmnt <= 20) {
    ditheredImg.filter(POSTERIZE, 22 - posterizeAmnt);
  }
  return ditheredImg;
}

function draw() {
  if (canPixelate) {
    resizeCanvasToWindowSize();
    let ditheredImg = ditherImage(img, ditherAmnt, ditherStyle);
    image(ditheredImg, 0, 0, width, height);
    Pixelate(10);
  }
}
function closestStep(max, steps, value) {
  return round((steps * value) / 255) * floor(255 / steps);
}
function Pixelate(ditherSteps) {
  loadPixels();
  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      let indexX = floor(x);
      let indexY = floor(y);
      index = 4 * (indexY * d * width * d + indexX * d);
      let oldR = pixels[index];
      let oldG = pixels[index + 1];
      let oldB = pixels[index + 2];
      let newR = closestStep(255, ditherSteps, oldR);
      let newG = closestStep(255, ditherSteps, oldG);
      let newB = closestStep(255, ditherSteps, oldB);
      pixels[index] = newR;
      pixels[index + 1] = newG;
      pixels[index + 2] = newB;
      let defaultColor = color(newR, newG, newB);
      let closestColor = findClosestColor(defaultColor, myColors);
      fill(closestColor);
      stroke(closestColor);
      rect(x, y, gridSize);
    }
  }
  currentColumn = 0;
  noLoop();
  canPixelate = false;
  console.log("pixelate complete");
}
function handleFileSelect(evt) {
  evt.preventDefault();
  let files = evt.dataTransfer.files;
  if (files.length > 0) {
    let file = files[0];
    if (file.type.match("image.*")) {
      currentColumn = 0;
      clear();
      img = loadImage(URL.createObjectURL(file), function () {
        loop();
        resizeCanvasToWindowSize();
        if (!buffer) {
          buffer = createGraphics(floor(width), floor(height));
        }
        image(img, 0, 0, width, height);
        buffer.copy(
          Canvas,
          0,
          0,
          floor(width),
          floor(height),
          0,
          0,
          buffer.width,
          buffer.height
        );
        canPixelate = true;
      });
    }
  }
}
function downloadPalette() {
  let paletteContent = myColors
    .map((color) => rgbToHex(color.levels[0], color.levels[1], color.levels[2]))
    .join("\n");
  let blob = new Blob([paletteContent], { type: "text/plain" });
  let url = URL.createObjectURL(blob);
  let downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "myPalette.hex";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
function handleDragOver(evt) {
  evt.preventDefault();
}
function handleFile(e) {
  if (e) {
    let file = e.target.files[0];
    let filename = e.target.files[0].name;
    filename = filename.substring(0, filename.length - 4);
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function () {
      let contents = reader.result;
      const hexValues = contents
        .split("\n")
        .join("")
        .match(/[0-9a-f]{6}/gi);
      if (hexValues && hexValues.length > 0) {
        hexColors = hexValues;
        let colorPickersDiv = document.getElementById("colorPickers");
        colorPickersDiv.innerHTML = "";
        myColors = [];
        if (!Array.isArray(hexColors)) {
          hexColors = [];
        }
        hexColors.forEach((hexColor) => {
          let colorPicker = createColorPicker(color("#" + hexColor));
          colorPicker.input(updateColorPickerColor);
          colorPicker.elt.addEventListener("click", function () {
            let focusedColorPicker = colorPickersDiv.querySelector(".focused");
            if (focusedColorPicker) {
              focusedColorPicker.classList.remove("focused");
            }
            colorPicker.elt.classList.add("focused");
          });
          colorPickersDiv.appendChild(colorPicker.elt);
          myColors.push(hexColor);
        });
        allPalettes.push({
          data: myColors,
          fileName: filename,
        });
        let paletteSelector = select("#paletteSelector");
        selectedPalette = allPalettes.length - 1;
        let option = createElement("option", filename);
        option.attribute("value", allPalettes.length - 1);
        paletteSelector.child(option);
        paletteSelector.value(allPalettes.length - 1);
        createColorPickers(allPalettes[selectedPalette].data);
        createColorPickers(hexValues);
        updateMyColors();
      }
      console.log(hexValues);
    };
    reader.readAsText(file);
  }
}
function updateSettings() {
  pixelWidth = select("#gridSizeInput").value();
  ditherAmnt = select("#ditherInput").value();
  ditherStyleSelector = select("#ditherStyleInput");
  ditherStyle = parseInt(ditherStyleSelector.value());
  posterizeAmnt = select("#posterizeAmntInput").value();

  if (img) {
    currentColumn = 0;
    currentColumn = 0;
    clear();

    loop();
    resizeCanvasToWindowSize();
    if (!buffer) {
      buffer = createGraphics(width, height);
    }
    image(img, 0, 0, width, height);
    buffer.copy(Canvas, 0, 0, width, height, 0, 0, buffer.width, buffer.height);
    canPixelate = true;
  }
}
function createColorPickers(hexColors) {
  let colorPickersDiv = document.getElementById("colorPickers");
  colorPickersDiv.innerHTML = "";
  myColors = [];
  if (!Array.isArray(hexColors)) {
    hexColors = [];
  }
  hexColors.forEach((hexColor) => {
    let colorPicker = createColorPicker(color("#" + hexColor));
    colorPicker.input(updateColorPickerColor);
    colorPicker.elt.addEventListener("click", function () {
      let focusedColorPicker = colorPickersDiv.querySelector(".focused");
      if (focusedColorPicker) {
        focusedColorPicker.classList.remove("focused");
      }
      colorPicker.elt.classList.add("focused");
    });
    colorPickersDiv.appendChild(colorPicker.elt);
    myColors.push(color("#" + hexColor));
  });
  updateSettings();
}
function addColorPicker() {
  let colorPickersDiv = document.getElementById("colorPickers");
  let newColorPicker = createColorPicker("#FFFFFF");
  newColorPicker.input(updateColorPickerColor);
  colorPickersDiv.appendChild(newColorPicker.elt);
  myColors.push(color("#FFFFFF"));
  updateMyColors();
  updateSettings();
}
function removeColorPicker() {
  let colorPickersDiv = document.getElementById("colorPickers");
  let colorPickers = colorPickersDiv.getElementsByTagName("input");
  let focusedColorPicker = colorPickersDiv.querySelector(".focused");
  if (focusedColorPicker) {
    colorPickersDiv.removeChild(focusedColorPicker);
    let index = Array.from(colorPickers).indexOf(focusedColorPicker);
    myColors.splice(index, 1);
    updateMyColors();
  } else {
    if (colorPickers.length > 1) {
      colorPickersDiv.removeChild(colorPickers[colorPickers.length - 1]);
      myColors.pop();
      updateMyColors();
    }
  }
  updateSettings();
}
function swapPalettes() {
  let paletteSelector = select("#paletteSelector");
  selectedPalette = parseInt(paletteSelector.value());
  createColorPickers(allPalettes[selectedPalette].data);
  console.log(allPalettes[selectedPalette].data);
}
function updateColorPickerColor() {
  let index = Array.from(
    document.getElementById("colorPickers").children
  ).indexOf(this.elt);
  myColors[index] = this.color();
  updateMyColors();
  updateSettings();
}
function updateMyColors() {
  let minDistSq = Infinity;
  for (let c of myColors) {
    let distSq = colorDistanceSquared(c, defaultColor);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      pixelColor = c;
    }
  }
}
function rgbToHex(r, g, b) {
  let rHex = r.toString(16).padStart(2, "0");
  let gHex = g.toString(16).padStart(2, "0");
  let bHex = b.toString(16).padStart(2, "0");
  return rHex + gHex + bHex;
}
function colorDistanceSquared(c1, c2) {
  let dr = c1.levels[0] - c2.levels[0];
  let dg = c1.levels[1] - c2.levels[1];
  let db = c1.levels[2] - c2.levels[2];
  return dr * dr + dg * dg + db * db;
}
function findClosestColor(targetColor, colorArray) {
  let minDistSq = Infinity;
  let closestColor = colorArray[0];
  for (let c of colorArray) {
    let distSq = colorDistanceSquared(c, targetColor);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestColor = c;
    }
  }
  return closestColor;
}
function downloadImage() {
  pixelBuffer.pixelDensity(1);
  for (let y = 0; y < pixelBuffer.height; y += 1) {
    for (let x = 0; x < pixelBuffer.width; x += 1) {
      let indexX = floor(x * gridSize);
      let indexY = floor(y * gridSize);
      index = 4 * (indexY * d * width * d + indexX * d);
      let R = pixels[index];
      let G = pixels[index + 1];
      let B = pixels[index + 2];
      let defaultColor = color(R, G, B);
      let closestColor = findClosestColor(defaultColor, myColors);
      pixelBuffer.fill(closestColor);
      pixelBuffer.stroke(closestColor);
      pixelBuffer.rect(x + 0.5, y + 0.5, 1);
    }
  }
  pixelBuffer.save("pixel_buffer_image.png");
}
function checkInputValue(inputElement) {
  let enteredValue = inputElement.value;
  let minValue = inputElement.min;
  let maxValue = inputElement.max;
  let intValue = parseInt(enteredValue);
  if (intValue > maxValue) {
    inputElement.value = maxValue;
  } else if (intValue < minValue) {
    inputElement.value = minValue;
  }
}
function uploadImageFile() {
  let fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.onchange = function (evt) {
    evt.preventDefault();
    let files = evt.target.files;
    if (files.length > 0) {
      let file = files[0];
      if (file.type.match("image.*")) {
        currentColumn = 0;
        clear();
        img = loadImage(URL.createObjectURL(file), function () {
          loop();
          resizeCanvasToWindowSize();
          if (!buffer) {
            buffer = createGraphics(floor(width), floor(height));
          }
          image(img, 0, 0, width, height);
          buffer.copy(
            Canvas,
            0,
            0,
            floor(width),
            floor(height),
            0,
            0,
            buffer.width,
            buffer.height
          );
          canPixelate = true;
        });
      }
    }
  };
  fileInput.click();
}
