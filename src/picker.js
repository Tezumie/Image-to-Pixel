const DEFAULT_PALETTES = sortPalettesByName([
    { "name": "Sweet Canyon Extended 64", "author": "Mr Slime", "colors": ["0f0e11", "2d2c33", "40404a", "51545c", "6b7179", "7c8389", "a8b2b6", "d5d5d5", "eeebe0", "f1dbb1", "eec99f", "e1a17e", "cc9562", "ab7b49", "9a643a", "86482f", "783a29", "6a3328", "541d29", "42192c", "512240", "782349", "8b2e5d", "a93e89", "d062c8", "ec94ea", "f2bdfc", "eaebff", "a2fafa", "64e7e7", "54cfd8", "2fb6c3", "2c89af", "25739d", "2a5684", "214574", "1f2966", "101445", "3c0d3b", "66164c", "901f3d", "bb3030", "dc473c", "ec6a45", "fb9b41", "f0c04c", "f4d66e", "fffb76", "ccf17a", "97d948", "6fba3b", "229443", "1d7e45", "116548", "0c4f3f", "0a3639", "251746", "48246d", "69189c", "9f20c0", "e527d2", "ff51cf", "ff7ada", "ff9edb"] },
    { "name": "Beached Boogaloo", "author": ".tomais", "colors": ["ff0b20", "8f0434", "500037", "a0ff00", "57e71e", "0ea717", "057833", "2cdeef", "2483e7", "153ab7", "0d0a87", "ff0b88", "a60fff", "6409cf", "eaef30", "ff880b", "b75308", "802202", "000000", "231940", "514378", "ffffff", "73a3a7", "366770", "f7b771", "c77650", "974c38", "873939", "601e2c", "300c1f"] },
    { "name": "Endesga 32", "author": "ENDESGA", "colors": ["be4a2f", "d77643", "ead4aa", "e4a672", "b86f50", "733e39", "3e2731", "a22633", "e43b44", "f77622", "feae34", "fee761", "63c74d", "3e8948", "265c42", "193c3e", "124e89", "0099db", "2ce8f5", "ffffff", "c0cbdc", "8b9bb4", "5a6988", "3a4466", "262b44", "181425", "ff0044", "68386c", "b55088", "f6757a", "e8b796", "c28569"] },
    { "name": "Intacto14", "author": "Anubi", "colors": ["221529", "4b5561", "879ba3", "cbf5ef", "62b4de", "5660d6", "5b29a6", "d64562", "f2735c", "edbb8e", "ab6375", "522152", "37ada2", "8cde8c"] },
    { "name": "Batpalette", "author": "el Rojaz", "colors": ["000000", "7f7f7f", "ffffff", "681e99", "3f48cc", "88ff82", "bfa621", "cc3d18"] },
    { "name": "Hidden Library", "author": "Pixel Hoo", "colors": ["100b2a", "2a213a", "314743", "65856d", "adca9a", "ecfeca", "582d27", "974133", "d67654", "5d3441", "a3685b", "ffb379", "ffe6a9", "ffffff"] },
    { "name": "Toxic Haze", "author": "sillyTheJester", "colors": ["e5ff00", "b8d14a", "9ab06e", "708763", "4c5c52", "393e40", "242424"] },
    { "name": "Chaotic neutral", "author": "Dodecahedron ⷽ", "colors": ["e1d4cb", "c19f90", "a56457", "6d504d", "484044", "392b29", "31312f", "d8eef0", "97999f", "81a4c0", "6a7f92", "415973", "43425a", "45334b", "4b1f40", "671087", "955ab9"] },
    { "name": "Resurrect 64", "author": "Kerrie Lake", "colors": ["2e222f", "3e3546", "625565", "966c6c", "ab947a", "694f62", "7f708a", "9babb2", "c7dcd0", "ffffff", "6e2727", "b33831", "ea4f36", "f57d4a", "ae2334", "e83b3b", "fb6b1d", "f79617", "f9c22b", "7a3045", "9e4539", "cd683d", "e6904e", "fbb954", "4c3e24", "676633", "a2a947", "d5e04b", "fbff86", "165a4c", "239063", "1ebc73", "91db69", "cddf6c", "313638", "374e4a", "547e64", "92a984", "b2ba90", "0b5e65", "0b8a8f", "0eaf9b", "30e1b9", "8ff8e2", "323353", "484a77", "4d65b4", "4d9be6", "8fd3ff", "45293f", "6b3e75", "905ea9", "a884f3", "eaaded", "753c54", "a24b6f", "cf657f", "ed8099", "831c5d", "c32454", "f04f78", "f68181", "fca790", "fdcbb0"] },
    { "name": "Apollo", "author": "AdamCYounis", "colors": ["172038", "253a5e", "3c5e8b", "4f8fba", "73bed3", "a4dddb", "19332d", "25562e", "468232", "75a743", "a8ca58", "d0da91", "4d2b32", "7a4841", "ad7757", "c09473", "d7b594", "e7d5b3", "341c27", "602c2c", "884b2b", "be772b", "de9e41", "e8c170", "241527", "411d31", "752438", "a53030", "cf573c", "da863e", "1e1d39", "402751", "7a367b", "a23e8c", "c65197", "df84a5", "090a14", "10141f", "151d28", "202e37", "394a50", "577277", "819796", "a8b5b2", "c7cfcc", "ebede9"] },
    { "name": "Lospec500", "author": "", "colors": ["10121c", "2c1e31", "6b2643", "ac2847", "ec273f", "94493a", "de5d3a", "e98537", "f3a833", "4d3533", "6e4c30", "a26d3f", "ce9248", "dab163", "e8d282", "f7f3b7", "1e4044", "006554", "26854c", "5ab552", "9de64e", "008b8b", "62a477", "a6cb96", "d3eed3", "3e3b65", "3859b3", "3388de", "36c5f4", "6dead6", "5e5b8c", "8c78a5", "b0a7b8", "deceed", "9a4d76", "c878af", "cc99ff", "fa6e79", "ffa2ac", "ffd1d5", "f6e8e0", "ffffff"] },
    { "name": "CC-29", "author": "Alpha6", "colors": ["f2f0e5", "b8b5b9", "868188", "646365", "45444f", "3a3858", "212123", "352b42", "43436a", "4b80ca", "68c2d3", "a2dcc7", "ede19e", "d3a068", "b45252", "6a536e", "4b4158", "80493a", "a77b5b", "e5ceb4", "c2d368", "8ab060", "567b79", "4e584a", "7b7243", "b2b47e", "edc8c4", "cf8acb", "5f556a"] },
    { "name": "SLSO8", "author": "Luis Miguel Maldonado", "colors": ["0d2b45", "203c56", "544e68", "8d697a", "d08159", "ffaa5e", "ffd4a3", "ffecd6"] },
    { "name": "PICO-8", "author": "", "colors": ["000000", "1D2B53", "7E2553", "008751", "AB5236", "5F574F", "C2C3C7", "FFF1E8", "FF004D", "FFA300", "FFEC27", "00E436", "29ADFF", "83769C", "FF77A8", "FFCCAA"] },
    { "name": "Sweetie 16", "author": "", "colors": ["1a1c2c", "5d275d", "b13e53", "ef7d57", "ffcd75", "a7f070", "38b764", "257179", "29366f", "3b5dc9", "41a6f6", "73eff7", "f4f4f4", "94b0c2", "566c86", "333c57"] },
    { "name": "Vinik24", "author": "Vinik", "colors": ["000000", "6f6776", "9a9a97", "c5ccb8", "8b5580", "c38890", "a593a5", "666092", "9a4f50", "c28d75", "7ca1c0", "416aa3", "8d6268", "be955c", "68aca9", "387080", "6e6962", "93a167", "6eaa78", "557064", "9d9f7f", "7e9e99", "5d6872", "433455"] },
    { "name": "Fantasy 24", "author": "", "colors": ["1f240a", "39571c", "a58c27", "efac28", "efd8a1", "ab5c1c", "183f39", "ef692f", "efb775", "a56243", "773421", "724113", "2a1d0d", "392a1c", "684c3c", "927e6a", "276468", "ef3a0c", "45230d", "3c9f9c", "9b1a0a", "36170c", "550f0a", "300f0a"] },
    { "name": "Oil 6", "author": "", "colors": ["fbf5ef", "f2d3ab", "c69fa5", "8b6d9c", "494d7e", "272744"] },
    { "name": "Journey", "author": "🍍PineappleOnPizza🍍(Comissions Open)", "colors": ["050914", "110524", "3b063a", "691749", "9c3247", "d46453", "f5a15d", "ffcf8e", "ff7a7d", "ff417d", "d61a88", "94007a", "42004e", "220029", "100726", "25082c", "3d1132", "73263d", "bd4035", "ed7b39", "ffb84a", "fff540", "c6d831", "77b02a", "429058", "2c645e", "153c4a", "052137", "0e0421", "0c0b42", "032769", "144491", "488bd4", "78d7ff", "b0fff1", "faffff", "c7d4e1", "928fb8", "5b537d", "392946", "24142c", "0e0f2c", "132243", "1a466b", "10908e", "28c074", "3dff6e", "f8ffb8", "f0c297", "cf968c", "8f5765", "52294b", "0f022e", "35003b", "64004c", "9b0e3e", "d41e3c", "ed4c40", "ff9757", "d4662f", "9c341a", "691b22", "450c28", "2d002e"] },

]);
let autoPixelateEnabled = false;

function sortPalettesByName(palettes) {
    return palettes.slice().sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }
        return 0;
    });
}
const PALETTE_STORAGE_KEY = 'color-palettes';
let customPalettes = loadPalettes();
let activePalette = DEFAULT_PALETTES[0].colors.map(color => {
    return color.startsWith('#') ? color : `#${color}`;
});

const pickr = Pickr.create({
    el: '#hidden-picker',
    theme: 'nano',
    default: '#ffffff',
    swatches: [],
    components: {
        preview: true,
        opacity: true,
        hue: true,
        interaction: {
            hex: true,
            input: true,
        }
    }
});

function loadPalettes() {
    return JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY)) || [];
}

function savePalettes() {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(customPalettes));
}

function updateSelectors() {
    const defaultSelector = document.getElementById('default-palette-selector');
    const customSelector = document.getElementById('custom-palette-selector');
    defaultSelector.innerHTML = '<option value="none">None</option>';
    customSelector.innerHTML = '<option value="none">None</option>';

    DEFAULT_PALETTES.forEach((palette, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = palette.name;
        defaultSelector.appendChild(option);
    });

    customPalettes.forEach((palette, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = palette.name;
        customSelector.appendChild(option);
    });
}

function updateColorList() {
    const colorList = document.getElementById('selected-colors');
    colorList.innerHTML = '';
    activePalette.forEach((color, index) => {
        const colorItem = document.createElement('div');
        colorItem.className = 'color-item';
        colorItem.innerHTML = `
          <div class="color-swatch" data-index="${index}" style="background: ${color};"></div>
          <span class="color-code">${color}</span>
          <span class="remove-color" data-index="${index}">X</span>
        `;
        colorList.appendChild(colorItem);
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', function (e) {
            const index = e.target.dataset.index;
            pickr.currentIndex = index;
            pickr.currentSwatchElement = e.target;

            pickr.setColor(activePalette[index], true);
            pickr.show();
        });
    });

    document.querySelectorAll('.remove-color').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = e.target.dataset.index;
            activePalette.splice(index, 1);
            updateColorList();
        });
    });
    if (autoPixelateEnabled) applyPixelation();
}

pickr.on('change', (color) => {
    if (color && pickr.currentIndex !== undefined) {
        const newColor = color.toHEXA().toString();
        const index = pickr.currentIndex;
        const swatchElement = pickr.currentSwatchElement;

        activePalette[index] = newColor;
        swatchElement.style.backgroundColor = newColor;
        swatchElement.parentElement.querySelector('.color-code').textContent = newColor;
    }
    if (autoPixelateEnabled) applyPixelation();
});

document.getElementById('default-palette-selector').addEventListener('change', (e) => {
    const selectedIndex = e.target.value;

    if (selectedIndex === 'none') {
        activePalette = ['#ffffff'];
        document.getElementById('palette-name-input').value = '';
        document.getElementById('custom-palette-selector').value = 'none';
    } else {
        activePalette = DEFAULT_PALETTES[selectedIndex].colors.map(color => {
            return color.startsWith('#') ? color : `#${color}`;
        });
        document.getElementById('palette-name-input').value = '';
        document.getElementById('custom-palette-selector').value = 'none';
    }
    updateColorList();
});

document.getElementById('custom-palette-selector').addEventListener('change', (e) => {
    const selectedIndex = e.target.value;

    if (selectedIndex === 'none') {
        activePalette = ['#ffffff'];
        document.getElementById('palette-name-input').value = '';
        document.getElementById('default-palette-selector').value = 'none';
    } else {
        activePalette = [...customPalettes[selectedIndex].colors];
        document.getElementById('palette-name-input').value = customPalettes[selectedIndex].name;
        document.getElementById('default-palette-selector').value = 'none';
    }
    updateColorList();
});

document.getElementById('add-color-button').addEventListener('click', () => {
    activePalette.push('#ffffff');
    updateColorList();
});

document.getElementById('save-palette-button').addEventListener('click', () => {
    const paletteName = document.getElementById('palette-name-input').value.trim();
    if (paletteName === '') {
        alert('Select a custom palette or enter a palette name to download.');
        return;
    }
    const existingIndex = customPalettes.findIndex(palette => palette.name === paletteName);
    if (existingIndex !== -1) {
        customPalettes[existingIndex] = { name: paletteName, colors: [...activePalette] };
    } else {
        customPalettes.push({ name: paletteName, colors: [...activePalette] });
    }
    savePalettes();
    updateSelectors();

    const newIndex = customPalettes.findIndex(palette => palette.name === paletteName);
    document.getElementById('custom-palette-selector').value = newIndex;
    document.getElementById('default-palette-selector').value = 'none';
});

document.getElementById('delete-palette-button').addEventListener('click', () => {
    const selector = document.getElementById('custom-palette-selector');
    const index = selector.value;
    if (index !== '' && index !== 'none') {
        customPalettes.splice(index, 1);
        savePalettes();
        updateSelectors();
        document.getElementById('palette-name-input').value = '';
        document.getElementById('custom-palette-selector').value = 'none';
    }
});

const uploadPaletteButton = document.getElementById('upload-palette-button');
const paletteFileInput = document.getElementById('palette-file-input');

uploadPaletteButton.addEventListener('click', () => paletteFileInput.click());

paletteFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const uploadedPalette = JSON.parse(e.target.result);

                uploadedPalette.colors = uploadedPalette.colors.map(color =>
                    color.startsWith('#') ? color : `#${color}`
                );

                const addedIndex = addUploadedPalette(uploadedPalette);

                updateSelectors();

                document.getElementById('custom-palette-selector').value = addedIndex;
                document.getElementById('default-palette-selector').value = 'none';
                activePalette = [...customPalettes[addedIndex].colors];
                document.getElementById('palette-name-input').value = customPalettes[addedIndex].name;
                updateColorList();

                alert(`Palette "${uploadedPalette.name}" successfully uploaded and selected!`);
            } catch (error) {
                console.warn("Failed to parse uploaded palette file. Ensure it is in the correct format.");
                alert('Invalid palette file. Please upload a properly formatted JSON file.');
            }
        };
        reader.readAsText(file);
    }
});

function addUploadedPalette(palette) {
    if (!palette || !palette.name || !Array.isArray(palette.colors)) {
        console.warn("Invalid palette format. Ensure the palette has a name and a list of colors.");
        alert('Invalid palette format. Please make sure your palette has a name and a list of colors.');
        return;
    }

    let baseName = palette.name;
    let paletteName = baseName;
    let counter = 1;

    while (customPalettes.some(p => p.name === paletteName)) {
        paletteName = `${baseName}-${counter}`;
        counter++;
    }

    customPalettes.push({
        name: paletteName,
        author: palette.author || 'Unknown',
        colors: palette.colors.map(color => color.startsWith('#') ? color : `#${color}`)
    });

    savePalettes();

    return customPalettes.length - 1;
}

const downloadPaletteButton = document.getElementById('download-palette-button');

downloadPaletteButton.addEventListener('click', () => {
    const paletteName = document.getElementById('palette-name-input').value.trim();
    if (paletteName === '') {
        alert('Please enter a palette name before downloading.');
        return;
    }

    const selectedPalette = customPalettes.find(palette => palette.name === paletteName);
    if (!selectedPalette) {
        alert('No custom palette found with the specified name, save first.');
        return;
    }

    const paletteJson = JSON.stringify(selectedPalette, null, 2);
    const blob = new Blob([paletteJson], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${paletteName}.json`;
    link.click();
});

function updateSelectors() {
    const defaultSelector = document.getElementById('default-palette-selector');
    const customSelector = document.getElementById('custom-palette-selector');
    defaultSelector.innerHTML = '<option value="none">None</option>';
    customSelector.innerHTML = '<option value="none">None</option>';

    DEFAULT_PALETTES.forEach((palette, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = palette.name;
        defaultSelector.appendChild(option);
    });

    customPalettes.forEach((palette, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = palette.name;
        customSelector.appendChild(option);
    });
}

function savePalettes() {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(customPalettes));
}

function loadPalettes() {
    return JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY)) || [];
}

updateSelectors();
document.getElementById('default-palette-selector').value = 0;
updateColorList();