 const logoContainer = document.getElementById('logo-container');

    const pixelMap = [
      '010100010010001100111000011100110000011001010001011101000',
      '010110110101010000100000001001001000010101001010010001000',
      '010101010101010110110011001001001011011001000100011001000',
      '010100010111010010100000001001001000010001001010010001000',
      '010100010101001100111000001000110000010001010001011101110',
    ];

    function createPixels() {
      for (let row = 0; row < pixelMap.length; row++) {
        const rowData = pixelMap[row];
        for (let col = 0; col < rowData.length; col++) {
          const pixel = document.createElement('div');
          pixel.classList.add('pixel');
          if (rowData[col] === '1') {
            pixel.classList.add('text-pixel');
          }
          logoContainer.appendChild(pixel);
        }
      }
    }

    function animatePixelsRandomly() {
      const pixels = document.querySelectorAll('.pixel');
      pixels.forEach((pixel) => {
        const delay = Math.random() * 2000; 

        if (!pixel.classList.contains('text-pixel')) {
          setTimeout(() => {
            pixel.classList.add('off');
          }, delay);
        } else {
          setTimeout(() => {
            pixel.classList.add('text-transition');
          }, delay);
        }
      });
    }

    window.onload = () => {
      createPixels();
      setTimeout(() => {
        animatePixelsRandomly();
      }, 10);
    };