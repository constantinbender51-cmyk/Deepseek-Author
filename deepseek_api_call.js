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
  const keywords = "Winnie the Pooh, and the horror of the burning mansion, 24 people died, accident, investigation, pooh crime suspect, max pain style reconciliation";
  const numChapters = 1;

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
    let outlineGenerationSuccess = false;
    const maxOutlineRetries = 5;

    console.log(`\nStep 2: Generating outline for Chapter ${chapterNumber}...`);

    for (let attempt = 1; attempt <= maxOutlineRetries; attempt++) {
      let chapterOutlinePrompt = "";
      if (chapterIndex === 0) {
        // First chapter: only use the book outline
        chapterOutlinePrompt = `Based on the book outline below, write the outline of chapter 1. Include in your response a json object with the key "parts" indicating the number of parts the chapter can be divided in to.\n\nOutline: ${bookOutline}`;
      } else {
        // Subsequent chapters: use the book outline and previous chapter outlines
        const previousOutlines = chapterOutlines.map((outline, index) =>
          `Outline of Chapter ${index + 1}:\n${outline.outline}`
        ).join("\n\n");
        chapterOutlinePrompt = `Based on the book outline below and the outlines of previous chapters, write the outline of chapter ${chapterNumber}. Include in your response a json object with the key "parts" indicating the number of parts the chapter can be divided in to.\n\nBook Outline: ${bookOutline}\n\nPrevious Chapter Outlines:\n${previousOutlines}`;
      }

      const jsonResponse = await callDeepSeekChat([{
        role: "user",
        content: chapterOutlinePrompt
      }]);

      let parsedJson;
      let plainTextOutline;

      if (!jsonResponse) {
        console.error("API call failed, cannot attempt to parse JSON.");
        continue; // Try again
      }

      try {
        // Use a regex to find the first JSON object in the response string.
        const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON object found in the response.");
        }
        const jsonString = jsonMatch[0];

        // Added a defensive check to fix common AI formatting issues before parsing
        let cleanedJsonString = jsonString;
        if (!jsonString.includes('"')) {
          console.warn('AI response contains no double quotes. Attempting to fix by replacing single quotes.');
          cleanedJsonString = jsonString.replace(/'/g, '"');
        }
        
        parsedJson = JSON.parse(cleanedJsonString);
        
        // Extract the plain text content by removing the JSON string
        plainTextOutline = jsonResponse.replace(jsonString, '').trim();

        if (typeof parsedJson.parts !== 'number') {
          throw new Error("Invalid JSON structure.");
        }

        // If we reach here, parsing was successful.
        outlineGenerationSuccess = true;
        chapterOutlines.push({ outline: plainTextOutline, parts: parsedJson.parts });
        
        console.log(`Outline for Chapter ${chapterNumber} generated on attempt ${attempt}:\n`, plainTextOutline);
        console.log(`Chapter will be generated in ${parsedJson.parts} parts.`);
        break; // Exit the retry loop
      } catch (e) {
        console.error(`Attempt ${attempt} failed to parse JSON for Chapter ${chapterNumber}. Retrying...`, e);
        console.log('Original AI response:', jsonResponse); // Log the full response for debugging
        // Loop will continue to the next attempt
      }
    }

    // Check if outline generation failed after all retries
    if (!outlineGenerationSuccess) {
      console.error(`Failed to generate a valid chapter outline for Chapter ${chapterNumber} after all retries. Exiting.`);
      return;
    }

    let currentChapterText = "";
    let lastPartContent = ""; // Variable to store the last added part
    fullBookContent += `\n\n--- Chapter ${chapterNumber} ---\n\n`;

    // 3. Generate the chapter content in parts using the new chapter outline
    for (let partIndex = 0; partIndex < chapterOutlines[chapterIndex].parts; partIndex++) {
      const partNumber = partIndex + 1;
      let userPrompt = "";
      const ordinalPart = getOrdinalString(partNumber);

      // New prompt with instruction for "END OF CHAPTER"
      if (partNumber === 1) {
        // First part of a chapter
        userPrompt = `Based on the following chapter outline, write the first part of the chapter. That's 5-10 paragraphs. You are writing part ${partNumber} of ${chapterOutlines[chapterIndex].parts}. \n\nChapter Outline: ${chapterOutlines[chapterIndex].outline}`;
      } else {
        // Subsequent parts
        userPrompt = `Based on the following chapter outline and the existing content of the current chapter, write the ${ordinalPart} part of the chapter. That's 5-10 paragraphs. You are writing part ${partNumber} of ${chapterOutlines[chapterIndex].parts}. \n\nChapter Outline: ${chapterOutlines[chapterIndex].outline}\n\nExisting Chapter Content: ${currentChapterText}`;
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
      newPartContent = newPartContent.replace(/^Of course\.[\s\S]*?here is[\s\S]*?\.\s*/i, '').trim();
      newPartContent = newPartContent.replace(/\*/g, '').trim();

      // Check if the new part is a duplicate of the last part
      if (newPartContent === lastPartContent) {
        console.warn(`Duplicate part detected for Chapter ${chapterNumber}, part ${partNumber}. Skipping.`);
        continue; // Skip adding this part and try generating the next one
      }

      // Update the last part content
      lastPartContent = newPartContent;
      
      currentChapterText += `\n\n${newPartContent}`;
      fullBookContent += `\n\n${newPartContent}`;
    }
  }

  // 4. Generate the title page and chapter overview
  console.log("\nStep 4: Book generation complete. Generating title page and chapter overview...");
  const titleIndexPrompt = [{
    role: "user",
    content: `based on the book outline below and this book content generate a title page containing title and table of contents. Outline: ${bookOutline}\nBook content: ${fullBookContent}`
  }];

  const titlePageIndexContent = await callDeepSeekChat(titleIndexPrompt);
  if (!titlePageIndexContent) {
    console.error("Failed to generate title page and chapter overview. Exiting.");
    return;
  }

  // Clean the title page content of specific phrases and characters
  let cleanedTitlePageIndexContent = titlePageIndexContent;
  // Use a more flexible regex to handle variations of the introductory phrase
  cleanedTitlePageIndexContent = cleanedTitlePageIndexContent.replace(/^Of course\.[\s\S]*?here is[\s\S]*?\.\s*/i, '').trim();
  cleanedTitlePageIndexContent = cleanedTitlePageIndexContent.replace(/[\*#]/g, '').trim();
  
  // Output the final generated content
  await fs.writeFile('book_title_page.txt', cleanedTitlePageIndexContent);
  console.log('Title page saved to book_title_page.txt');
 
  // Prepend the new, cleaned content
  const finalBookContent = `${cleanedTitlePageIndexContent}\n\n${fullBookContent}`;

  try {
    await fs.writeFile('book.txt', finalBookContent, 'utf8');
    console.log("Book saved successfully to 'book.txt'.");
  } catch (error) {
    console.error("Failed to write book to file:", error);
  }
}

// Run the main function
main();
