const axios = require('axios');

// === Configuration ===
// IMPORTANT: Replace this with your actual DeepSeek API Key.
const DEEPSEEK_API_KEY = 'sk-ae85860567f8462b95e774393dfb5dc3';

// The API endpoint for chat completions. This is correct as per the provided code.
const DEEPSEEK_CHAT_API = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Sends a message to the DeepSeek chat API to get an AI-generated response.
 *
 * @param {Array} messages - An array of message objects to send to the API.
 * Each object should have a 'role' and 'content'.
 * e.g., [{ role: "user", content: "What is the capital of France?" }]
 * @returns {Promise<string|null>} A promise that resolves with the content of the AI's response,
 * or null if an error occurs.
 */
async function callDeepSeekChat(messages) {
  if (DEEPSEEK_API_KEY === 'sk-YOUR_API_KEY_HERE' || !DEEPSEEK_API_KEY) {
    console.error('API key not configured. Please update the DEEPSEEK_API_KEY constant.');
    return null;
  }

  try {
    const response = await axios.post(DEEPSEEK_CHAT_API, {
      model: "deepseek-chat", // The model to use
      messages: messages,
      temperature: 0.7,        // Controls the randomness of the response
      max_tokens: 1000         // The maximum number of tokens to generate
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    });

    const aiResponseContent = response.data.choices[0]?.message?.content;
    return aiResponseContent;
  } catch (error) {
    console.error(`Error calling DeepSeek API: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
}

/**
 * Prints a long string in segments with a delay between each segment.
 *
 * @param {string} text - The full text to print.
 * @param {number} segmentLength - The number of characters per segment.
 * @param {number} delayMs - The delay in milliseconds between printing segments.
 */
function printWithDelay(text, segmentLength, delayMs) {
  let index = 0;
  const interval = setInterval(() => {
    if (index < text.length) {
      console.log(text.substring(index, index + segmentLength));
      index += segmentLength;
    } else {
      clearInterval(interval);
      console.log("\n--- Book printing complete. ---");
    }
  }, delayMs);
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
  const keywords = "a futuristic world, sentient AI, philosophical journey, mystery";
  const numChapters = 5;
  const tenthsPerChapter = 10;
  const printSegmentLength = 5000;
  const printDelayMs = 1000;

  let bookOutline = "";
  let fullBookContent = "";
  let chapterSummaries = [];

  // 1. Generate the Book Outline
  console.log("Step 1: Generating book outline...");
  const outlinePrompt = [{
    role: "user",
    content: `Based on the keywords "${keywords}", generate a book outline with ${numChapters} chapters. Do not include any extra text besides the outline.`
  }];
  bookOutline = await callDeepSeekChat(outlinePrompt);
  if (!bookOutline) {
    console.error("Failed to generate outline. Exiting.");
    return;
  }
  console.log("Outline generated:\n", bookOutline);
  fullBookContent += `\n\nOutline:\n${bookOutline}\n\n`;

  // 2. Generate the book chapter by chapter
  for (let chapterIndex = 0; chapterIndex < numChapters; chapterIndex++) {
    const chapterNumber = chapterIndex + 1;
    console.log(`\nStep 2: Generating Chapter ${chapterNumber}...`);

    let currentChapterText = "";
    
    const summariesText = chapterSummaries.length > 0
      ? ` and the summaries of previous chapters, which are:\n${chapterSummaries.join("\n")}`
      : "";

    // Generate the chapter in "tenths"
    for (let tenthIndex = 0; tenthIndex < tenthsPerChapter; tenthIndex++) {
      const tenthNumber = tenthIndex + 1;
      let userPrompt = "";
      
      const ordinalTenth = getOrdinalString(tenthNumber);

      if (tenthNumber === 1) {
        // First tenth of a chapter
        userPrompt = `Based on the book outline below${summariesText}, write the first tenth of chapter ${chapterNumber}. That's 3-5 paragraphs.\n\nOutline: ${bookOutline}`;
      } else {
        // Subsequent tenths
        userPrompt = `Based on the book outline below${summariesText} and the existing content of the current chapter, write the ${ordinalTenth} tenth of chapter ${chapterNumber}. That's 3-5 paragraphs.\n\nOutline: ${bookOutline}\n\nExisting Chapter Content: ${currentChapterText}`;
      }
      
      console.log(`- Generating ${ordinalTenth} tenth of Chapter ${chapterNumber}...`);
      const messages = [{
        role: "user",
        content: userPrompt
      }];
      
      const newTenthContent = await callDeepSeekChat(messages);
      if (!newTenthContent) {
        console.error(`Failed to generate content for Chapter ${chapterNumber}, tenth ${tenthNumber}.`);
        break; // Exit the inner loop on failure
      }
      
      currentChapterText += `\n\n${newTenthContent}`;
      fullBookContent += `\n\n${newTenthContent}`;
    }

    // Summarize the completed chapter
    if (currentChapterText.length > 0) {
      console.log(`\nStep 3: Summarizing Chapter ${chapterNumber}...`);
      const summaryPrompt = [{
        role: "user",
        content: `Summarize this chapter.\n\nChapter: ${currentChapterText}`
      }];
      const chapterSummary = await callDeepSeekChat(summaryPrompt);
      if (chapterSummary) {
        chapterSummaries.push(`Chapter ${chapterNumber}: ${chapterSummary}`);
        console.log(`Summary of Chapter ${chapterNumber}:\n`, chapterSummary);
      } else {
        console.error(`Failed to summarize Chapter ${chapterNumber}.`);
      }
    }
  }

  // 3. Print the final book with delay
  console.log("\nStep 4: Book generation complete. Printing the entire book with a delay...");
  printWithDelay(fullBookContent, printSegmentLength, printDelayMs);
}

// Run the main function
main();
