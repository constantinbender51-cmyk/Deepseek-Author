const axios = require('axios');
const fs = require('fs/promises'); // Added for file system operations

// === Configuration ===
// IMPORTANT: Replace this with your actual DeepSeek API Key.
const DEEPSEEK_API_KEY = 'sk-ae85860567f8462b95e774393dfb5dc3';

// The API endpoint for chat completions.
const DEEPSEEK_CHAT_API = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Sends a message to the DeepSeek chat API to get an AI-generated response.
 * Implements a retry mechanism with exponential backoff for error resilience.
 *
 * @param {Array} messages - An array of message objects to send to the API.
 * Each object should have a 'role' and 'content'.
 * e.g., [{ role: "user", content: "What is the capital of France?" }]
 * @returns {Promise<string|null>} A promise that resolves with the content of the AI's response,
 * or null if an error occurs after all retries.
 */
async function callDeepSeekChat(messages) {
  if (DEEPSEEK_API_KEY === 'sk-YOUR_API_KEY_HERE' || !DEEPSEEK_API_KEY) {
    console.error('API key not configured. Please update the DEEPSEEK_API_KEY constant.');
    return null;
  }

  const maxRetries = 10;
  const initialDelayMs = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(DEEPSEEK_CHAT_API, {
        model: "deepseek-chat", // The model to use
        messages: messages,
        temperature: 0.7, // Controls the randomness of the response
        max_tokens: 1000 // The maximum number of tokens to generate
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      });

      const aiResponseContent = response.data.choices[0]?.message?.content;
      console.log(`API call succeeded on attempt ${attempt}.`);
      return aiResponseContent;

    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.response?.data?.error?.message || error.message}`);

      // If it's the last attempt, don't wait and just return null.
      if (attempt === maxRetries) {
        console.error('Max retries reached. Failed to call the DeepSeek API.');
        return null;
      }

      // Calculate the delay using exponential backoff.
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Helper function to get the ordinal string for a number.
 * @param {number} n - The number.
 * @returns {string} The ordinal string (e.g., "first", "second").
 */
function getOrdinalString(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// === Main Book Generation Logic ===
async function main() {
  // === Book Customization Parameters ===
  const keywords = "short-story, finance, philosophy, selfish";
  const numChapters = 2;
  const tenthsPerChapter = 10;

  let bookOutline = "";
  let fullBookContent = "";
  let chapterOutlines = [];

  // 1. Generate the Book Outline
  console.log("Step 1: Generating the overall book outline...");
  const outlinePrompt = [{
    role: "user",
    content: `Based on the keywords "${keywords}", generate a book outline with ${numChapters} chapters. Do not include any extra text besides the outline.`
  }];
  bookOutline = await callDeepSeekChat(outlinePrompt);
  if (!bookOutline) {
    console.error("Failed to generate outline. Exiting.");
    return;
  }
  console.log("Overall book outline generated:\n", bookOutline);
  fullBookContent += `\n\nOutline:\n${bookOutline}\n\n`;

  // 2. Generate the book chapter by chapter
  for (let chapterIndex = 0; chapterIndex < numChapters; chapterIndex++) {
    const chapterNumber = chapterIndex + 1;
    console.log(`\nStep 2: Generating outline for Chapter ${chapterNumber}...`);

    let chapterOutlinePrompt = "";
    if (chapterIndex === 0) {
      // First chapter: only use the book outline
      chapterOutlinePrompt = `Based on the book outline below, write the outline of chapter 1.\n\nOutline: ${bookOutline}`;
    } else {
      // Subsequent chapters: use the book outline and previous chapter outlines
      const previousOutlines = chapterOutlines.map((outline, index) =>
        `Outline of Chapter ${index + 1}:\n${outline}`
      ).join("\n\n");
      chapterOutlinePrompt = `Based on the book outline below and the outlines of previous chapters, write an outline of chapter ${chapterNumber}.\n\nBook Outline: ${bookOutline}\n\nPrevious Chapter Outlines:\n${previousOutlines}`;
    }

    const chapterOutline = await callDeepSeekChat([{
      role: "user",
      content: chapterOutlinePrompt
    }]);

    if (!chapterOutline) {
      console.error(`Failed to generate outline for Chapter ${chapterNumber}. Exiting.`);
      return;
    }
    chapterOutlines.push(chapterOutline);
    console.log(`Outline for Chapter ${chapterNumber} generated:\n`, chapterOutline);

    let currentChapterText = "";
    fullBookContent += `\n\n--- Chapter ${chapterNumber} ---\n\n`;

    // 3. Generate the chapter content in "tenths" using the new chapter outline
    for (let tenthIndex = 0; tenthIndex < tenthsPerChapter; tenthIndex++) {
      const tenthNumber = tenthIndex + 1;
      let userPrompt = "";
      const ordinalTenth = getOrdinalString(tenthNumber);

      // New prompt with instruction for "END OF CHAPTER"
      if (tenthNumber === 1) {
        // First tenth of a chapter
        userPrompt = `Based on the following chapter outline, write the first tenth of the chapter. That's 3-5 paragraphs.\n\nChapter Outline: ${chapterOutline}`;
      } else {
        // Subsequent tenths
        userPrompt = `Based on the following chapter outline and the existing content of the current chapter, write the ${ordinalTenth} tenth of the chapter. That's 3-5 paragraphs.\n\nChapter Outline: ${chapterOutline}\n\nExisting Chapter Content: ${currentChapterText}`;
      }

      console.log(`- Generating ${ordinalTenth} tenth of Chapter ${chapterNumber}...`);
      const messages = [{
        role: "user",
        content: userPrompt
      }];

      let newTenthContent = await callDeepSeekChat(messages);
      if (!newTenthContent) {
        console.error(`Failed to generate content for Chapter ${chapterNumber}, tenth ${tenthNumber}.`);
        break; // Exit the inner loop on failure
      }

      // Check for the "END OF CHAPTER" flag and trim the content
      if (newTenthContent.includes('END OF CHAPTER')) {
        console.log("END OF CHAPTER detected. Concluding chapter early.");
        newTenthContent = newTenthContent.replace('END OF CHAPTER', '').trim();
        currentChapterText += `\n\n${newTenthContent}`;
        fullBookContent += `\n\n${newTenthContent}`;
        break; // Break the inner loop to start the next chapter
      }

      currentChapterText += `\n\n${newTenthContent}`;
      fullBookContent += `\n\n${newTenthContent}`;
    }
  }

  // 4. Save the final book content to a file.
  console.log("\nStep 4: Book generation complete. Saving the content to 'book.txt'...");
  try {
    await fs.writeFile('book.txt', fullBookContent, 'utf8');
    console.log("Book saved successfully to 'book.txt'.");
  } catch (error) {
    console.error("Failed to write book to file:", error);
  }
}

// Run the main function
main();
