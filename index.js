const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const Tesseract = require('tesseract.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve static frontend

// Ensure screenshots directory exists
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
fs.mkdir(SCREENSHOTS_DIR, { recursive: true }).catch(console.error);

// Endpoint to take screenshot and save on server
app.post('/api/screenshot', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle2' });

    const infographicElement = await page.$('#infographic');
    let screenshotBuffer;
    if (infographicElement) {
      screenshotBuffer = await infographicElement.screenshot({ omitBackground: false });
    } else {
      screenshotBuffer = await page.screenshot({ fullPage: true });
    }

    await browser.close();

    // Save to file
    const fileName = `infographic_${Date.now()}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, fileName);
    await fs.writeFile(filePath, screenshotBuffer);

    // Send success and file path (or URL) for frontend reference
    res.json({ message: 'Screenshot saved', fileName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to take screenshot' });
  }
});

// Endpoint to extract infographic info from saved screenshot file
app.post('/api/extract-infographic', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'Screenshot fileName is required' });

  try {
    const filePath = path.join(SCREENSHOTS_DIR, fileName);

    // Read file buffer
    const imgBuffer = await fs.readFile(filePath);

    // OCR with Tesseract
    const { data: { text } } = await Tesseract.recognize(
      imgBuffer,
      'eng',
      { logger: m => console.log(m) }
    );

    // Process text to lines, filter empty
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

    // Generate infographic HTML from extracted lines
    const infographicHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Extracted Infographic</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 30px auto;
            padding: 20px;
            background: #f0f4f8;
          }
          h1 {
            color: #2c3e50;
            border-bottom: 2px solid #2980b9;
            padding-bottom: 10px;
          }
          ul {
            list-style-type: disc;
            padding-left: 20px;
          }
          li {
            margin-bottom: 10px;
            font-size: 1.1rem;
          }
        </style>
      </head>
      <body>
        <h1>Extracted Infographic</h1>
        <ul>
          ${lines.map(line => `<li>${line}</li>`).join('')}
        </ul>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(infographicHTML);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to extract infographic' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
