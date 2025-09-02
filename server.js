const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  try {
    const bookContent = await fs.readFile(path.join(__dirname, 'book.txt'), 'utf8');
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Book</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap');
          body {
            font-family: 'Merriweather', serif;
            line-height: 1.6;
            margin: 0;
            padding: 2rem;
            background-color: #f8f8f8;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #fff;
            padding: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-radius: 8px;
          }
          h1, h2, h3 {
            color: #222;
            font-weight: 700;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <pre>${bookContent}</pre>
        </div>
      </body>
      </html>
    `;
    res.send(htmlContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).send('Book content not found. Please run `node book_generator.js` first to create the book file.');
    } else {
      res.status(500).send('An error occurred while reading the book file.');
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
