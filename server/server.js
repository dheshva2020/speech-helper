require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ========================================
// PERSONAL SPEECH CONTEXT
// ========================================

// We can expand this later with your son's
// common words and corrected phrases.

const commonSpeechContext = `
The speaker is a child/young person who may have
atypical or unclear pronunciation.

The purpose of this application is to help him
communicate what HE is actually trying to say.

Listen carefully to the actual audio.

Important rules:

1. Preserve the speaker's intended words and meaning.
2. Do NOT invent a different sentence merely because
   it sounds more grammatically natural.
3. The speaker may pronounce individual words
   differently from typical speech.
4. Use the complete utterance and surrounding words
   to interpret unclear words.
5. Pay special attention to everyday requests,
   activities, people, places, food, school,
   sports and family-related vocabulary.
6. A partially unclear word may be an ordinary
   familiar word pronounced atypically.
7. Prefer an interpretation that fits the actual
   sounds and the rest of the sentence.
8. Do not change an activity into an emotion,
   intention, or unrelated action without strong
   evidence from the audio.

Examples of vocabulary that may occur:

basketball
outside
inside
play
go
home
school
water
food
eat
drink
mom
dad
brother
help
please
want
need

Example sentence patterns:

I want to play basketball outside.
I want to go outside.
I want to go home.
I want some water.
I want to eat.
I need help.

These examples are CONTEXT ONLY.
Never force the audio to match one of these examples.
`;

// ========================================
// UPLOAD FOLDER
// ========================================

const uploadFolder = path.join(
  __dirname,
  "uploads"
);

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, {
    recursive: true,
  });
}

// Save recording as a real .m4a file
const storage = multer.diskStorage({
  destination: function (
    req,
    file,
    cb
  ) {
    cb(null, uploadFolder);
  },

  filename: function (
    req,
    file,
    cb
  ) {
    cb(
      null,
      `speech-${Date.now()}.m4a`
    );
  },
});

const upload = multer({
  storage: storage,
});

// ========================================
// AI AUDIO TRANSCRIPTION
// ========================================

app.post(
  "/transcribe",
  upload.single("audio"),

  async (req, res) => {
    let filePath;

    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "No audio recording received.",
        });
      }

      filePath = req.file.path;

      console.log("Audio received:");
      console.log(filePath);

      console.log(
        "Audio size:",
        req.file.size
      );

      const transcription =
        await openai.audio.transcriptions.create({
          file:
            fs.createReadStream(
              filePath
            ),

          model:
            "gpt-4o-mini-transcribe",

          language: "en",

          prompt: commonSpeechContext,
        });

      const heardText =
        transcription.text?.trim();

      console.log(
        "AI heard:",
        heardText
      );

      if (!heardText) {
        return res.status(400).json({
          error:
            "No speech could be recognized.",
        });
      }

      res.json({
        heardText: heardText,
      });
    } catch (error) {
      console.error(
        "OpenAI transcription error:",
        error
      );

      res.status(500).json({
        error:
          error?.message ||
          "Could not understand the recording.",
      });
    } finally {
      if (
        filePath &&
        fs.existsSync(filePath)
      ) {
        try {
          fs.unlinkSync(filePath);
        } catch (deleteError) {
          console.log(
            "Could not delete temporary audio:",
            deleteError
          );
        }
      }
    }
  }
);

// ========================================
// CREATE CLEAR SENTENCE / TRANSLATE
// ========================================

app.post(
  "/clarify",
  async (req, res) => {
    try {
      const {
        text,
        language = "English",
      } = req.body;

      if (!text) {
        return res.status(400).json({
          error:
            "No speech text received.",
        });
      }

      const response =
        await openai.responses.create({
          model: "gpt-4o-mini",

          instructions: `
You are the communication assistant inside
Speech Helper.

The speaker may have atypical pronunciation
and may communicate using incomplete or
unclear phrases.

Your highest priority is preserving the
speaker's intended meaning.

The speech recognizer produced this text:

"${text}"

Turn it into ONE clear, natural sentence.

IMPORTANT:

- Preserve the words and meaning whenever possible.
- Do not invent a different activity, object,
  emotion, person or intention.
- Do not make large semantic changes simply
  to produce better grammar.
- Correct grammar and sentence structure only
  when necessary.
- If the sentence is already understandable,
  keep its meaning very close to the original.
- Never add details that were not supported
  by the recognized speech.
- Output only the final sentence.
- Do not explain your reasoning.

Output language: ${language}
          `,

          input: text,
        });

      const clearSentence =
        response.output_text?.trim();

      if (!clearSentence) {
        throw new Error(
          "AI returned no clear sentence."
        );
      }

      console.log(
        "Clear sentence:",
        clearSentence
      );

      res.json({
        original: text,
        clearSentence:
          clearSentence,
        language: language,
      });
    } catch (error) {
      console.error(
        "OpenAI clarify error:",
        error
      );

      res.status(500).json({
        error:
          error?.message ||
          "Could not create the clear sentence.",
      });
    }
  }
);

// ========================================
// OPENAI VOICE
// ========================================

app.get(
  "/speak",
  async (req, res) => {
    try {
      const { text } = req.query;

      if (
        !text ||
        typeof text !== "string"
      ) {
        return res.status(400).json({
          error:
            "No text received.",
        });
      }

      console.log(
        "Creating AI voice:",
        text
      );

      const audio =
        await openai.audio.speech.create({
          model:
            "gpt-4o-mini-tts",

          voice: "alloy",

          input: text,

          response_format: "mp3",
        });

      const buffer =
        Buffer.from(
          await audio.arrayBuffer()
        );

      res.setHeader(
        "Content-Type",
        "audio/mpeg"
      );

      res.setHeader(
        "Content-Length",
        buffer.length
      );

      res.send(buffer);
    } catch (error) {
      console.error(
        "OpenAI speech error:",
        error
      );

      res.status(500).json({
        error:
          error?.message ||
          "Could not create speech.",
      });
    }
  }
);

// ========================================
// SERVER TEST
// ========================================

app.get("/", (req, res) => {
  res.send(
    "Speech Helper AI server is running."
  );
});

// ========================================
// START SERVER
// ========================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Speech Helper AI server running on port ${PORT}`
    );
  }
);