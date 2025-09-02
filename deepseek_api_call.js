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
  const keywords = "assassination of Kermit the frog, comedy, dark humor, puppets";
  const numChapters = 1;

  let bookOutline = "";
  let fullBookContent = "";
  let chapterOutlineResponses = []; // Storing full string responses

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
      chapterOutlinePrompt = `Based on the book outline below, write the outline of chapter 1. Also include a JSON object with one key: "parts", indicating the number of parts the chapter can be divided into. You can write freely outside of the JSON object.`;
    } else {
      // Subsequent chapters: use the book outline and previous chapter outlines
      const previousOutlines = chapterOutlineResponses.map((response, index) =>
        `Outline of Chapter ${index + 1}:\n${response}`
      ).join("\n\n");
      chapterOutlinePrompt = `Based on the book outline below (and the book content so far), write the outline of chapter ${chapterNumber}. Also include a JSON object with one key: "parts", indicating the number of parts the chapter can be divided into. You can write freely outside of the JSON object.`;
    }

    const aiResponse = await callDeepSeekChat([{
      role: "user",
      content: chapterOutlinePrompt
    }]);

    if (aiResponse) {
      // Use a regex to find and extract the JSON object from the response string.
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonString = jsonMatch[0];
        try {
          const parsedJson = JSON.parse(jsonString);
          const chapterParts = parsedJson.parts;
          if (chapterParts !== undefined) {
            console.log(`Outline for Chapter ${chapterNumber} generated successfully. It will have ${chapterParts} parts.`);
          }
        } catch (e) {
          console.error(`Failed to parse JSON from response:`, e.message);
        }
      }
      chapterOutlineResponses.push(aiResponse); // Store the full response string
    } else {
      console.error(`Failed to generate outline for chapter ${chapterNumber}.`);
    }
  }

  // At this point, you would proceed with generating the content for each chapter part.
  console.log("\nFinished generating chapter outlines.");
  if (chapterOutlineResponses.length > 0) {
    console.log("Here are the generated chapter outlines:\n", chapterOutlineResponses);
  } else {
    console.log("No chapter outlines were successfully generated.");
  }
}

// Start the book generation process.
main();
