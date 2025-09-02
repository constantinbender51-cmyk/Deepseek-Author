const axios = require('axios');
const fs = require('fs/promises');

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
  const keywords = "horror, empty planet, expilicit content, mindbreak";
  const numChapters = 2;

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

  // 2. Generate the book chapter by chapter
  for (let chapterIndex = 0; chapterIndex < numChapters; chapterIndex++) {
    const chapterNumber = chapterIndex + 1;
    console.log(`\nStep 2: Generating outline for Chapter ${chapterNumber}...`);

    let chapterOutlinePrompt = "";
    if (chapterIndex === 0) {
      // First chapter: only use the book outline
      chapterOutlinePrompt = `Based on the book outline below, write the outline of chapter 1. Your response must be a single JSON object with two keys: "outline" (the chapter outline as a string) and "parts" (a number between 5 and 10 representing the number of parts the chapter should be split into). Do not include any text outside of the JSON object.\n\nOutline: ${bookOutline}`;
    } else {
      // Subsequent chapters: use the book outline and previous chapter outlines
      const previousOutlines = chapterOutlines.map((outline, index) =>
        `Outline of Chapter ${index + 1}:\n${outline.outline}`
      ).join("\n\n");
      chapterOutlinePrompt = `Based on the book outline below and the outlines of previous chapters, write an outline of chapter ${chapterNumber}. Your response must be a single JSON object with two keys: "outline" (the chapter outline as a string) and "parts" (a number between 5 and 10 representing the number of parts the chapter should be split into). Do not include any text outside of the JSON object.\n\nBook Outline: ${bookOutline}\n\nPrevious Chapter Outlines:\n${previousOutlines}`;
    }

    const jsonResponse = await callDeepSeekChat([{
      role: "user",
      content: chapterOutlinePrompt
    }]);

    let chapterOutline;
    try {
      // Use a regex to find the first JSON object in the response string.
      // This makes the parsing more robust to conversational filler from the AI.
      const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in the response.");
      }
      const jsonString = jsonMatch[0];
      
      chapterOutline = JSON.parse(jsonString);
      
      if (!chapterOutline.outline || typeof chapterOutline.parts !== 'number') {
        throw new Error("Invalid JSON structure.");
      }
    } catch (e) {
      console.error(`Failed to parse JSON response for Chapter ${chapterNumber}. Exiting.`, e);
      console.log('Original AI response:', jsonResponse); // Log the full response for debugging
      return;
    }
    chapterOutlines.push(chapterOutline);
    console.log(`Outline for Chapter ${chapterNumber} generated:\n`, chapterOutline.outline);
    console.log(`Chapter will be generated in ${chapterOutline.parts} parts.`);

    let currentChapterText = "";
    fullBookContent += `\n\n--- Chapter ${chapterNumber} ---\n\n`;

    // 3. Generate the chapter content in parts using the new chapter outline
    for (let partIndex = 0; partIndex < chapterOutline.parts; partIndex++) {
      const partNumber = partIndex + 1;
      let userPrompt = "";
      const ordinalPart = getOrdinalString(partNumber);

      // New prompt with instruction for "END OF CHAPTER"
      if (partNumber === 1) {
        // First part of a chapter
        userPrompt = `Based on the following chapter outline, write the first part of the chapter. That's 5-10 paragraphs. You are writing part ${partNumber} of ${chapterOutline.parts}. \n\nChapter Outline: ${chapterOutline.outline}`;
      } else {
        // Subsequent parts
        userPrompt = `Based on the following chapter outline and the existing content of the current chapter, write the ${ordinalPart} part of the chapter. That's 5-10 paragraphs. You are writing part ${partNumber} of ${chapterOutline.parts}. \n\nChapter Outline: ${chapterOutline.outline}\n\nExisting Chapter Content: ${currentChapterText}`;
      }

      console.log(`- Generating ${ordinalPart} part of Chapter ${chapterNumber}...`);
      const messages = [{
        role: "user",
        content: userPrompt
      }];

      let newPartContent = await callDeepSeekChat(messages);
      if (!newPartContent) {
        console.error(`Failed to generate content for Chapter ${chapterNumber}, part ${partNumber}.`);
        break; // Exit the inner loop on failure
      }

      // Filter out the introductory sentences and asterisks
      newPartContent = newPartContent.replace(/^Of course\. Here is the [a-zA-Z\s,]+part of the chapter[^.]*\./, '').trim();
      newPartContent = newPartContent.replace(/\*/g, '').trim();
      
      // Check for the "END OF CHAPTER" flag and trim the content
      if (newPartContent.includes('END OF CHAPTER')) {
        console.log("END OF CHAPTER detected. Concluding chapter early.");
        newPartContent = newPartContent.replace('END OF CHAPTER', '').trim();
        currentChapterText += `\n\n${newPartContent}`;
        fullBookContent += `\n\n${newPartContent}`;
        break; // Break the inner loop to start the next chapter
      }

      currentChapterText += `\n\n${newPartContent}`;
      fullBookContent += `\n\n${newPartContent}`;
    }
  }
  
  // 4. Generate the title page and chapter overview
  console.log("\nStep 4: Book generation complete. Generating title page and chapter overview...");
  const titleIndexPrompt = [{
    role: "user",
    content: `based on the book outline below and this book content generate a title page containing title and chapters of the book, akin a digital index. Outline: ${bookOutline}\nBook content: ${fullBookContent}`
  }];

  const titlePageIndexContent = await callDeepSeekChat(titleIndexPrompt);
  if (!titlePageIndexContent) {
    console.error("Failed to generate title page and chapter overview. Exiting.");
    return;
  }
  
  // 5. Assemble and save the final book to a file.
  console.log("\nStep 5: Assembling and saving the final book to 'book.txt'...");
  
  // Prepend the new content
  const finalBookContent = `${titlePageIndexContent}\n\n${fullBookContent}`;
  
  try {
    await fs.writeFile('book.txt', finalBookContent, 'utf8');
    console.log("Book saved successfully to 'book.txt'.");
  } catch (error) {
    console.error("Failed to write book to file:", error);
  }
}

// Run the main function
main();
